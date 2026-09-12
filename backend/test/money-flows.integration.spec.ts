/**
 * Money-flow integration spec — the ledger portion of docs/testnet-e2e-runbook.md
 * executed against real services with an in-memory Prisma store.
 *
 * Drives the actual NestJS services (WalletsService, ConversionsService,
 * ReferralsService, WebhooksService, BillsService) through every money path and
 * asserts the two invariants that matter for the rollout:
 *
 *   1. DOUBLE-ENTRY: sum(LedgerEntry.amountMinor) === 0 per currency.
 *   2. LEDGER == FLOAT: per user per currency, ledger balance equals the legacy
 *      float at display precision (after the backfill baseline this is exactly
 *      what `npm run ledger:report` checks in production).
 *
 * Chain legs (Arc burn, Circle webhook delivery, Smartspeed, Flutterwave) are
 * mocked at the axios boundary; the journaling logic under test is the real one.
 */
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(0),
  })),
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
// WalletsService imports CctpService, which pulls the Circle/Solana SDK chain
// (ESM-only, untransformable in Jest). The chain calls are irrelevant to the
// journaling under test, so stub the SDK boundary.
jest.mock('@circle-fin/bridge-kit', () => ({
  BridgeChain: {
    Arc_Testnet: 'ARC-TESTNET', Ethereum_Sepolia: 'ETH-SEPOLIA',
    Polygon_Amoy_Testnet: 'POLYGON-AMOY', Avalanche_Fuji: 'AVAX-FUJI',
    Arbitrum_Sepolia: 'ARB-SEPOLIA', Base_Sepolia: 'BASE-SEPOLIA',
    Optimism_Sepolia: 'OP-SEPOLIA', Solana_Devnet: 'SOL-DEVNET', Monad_Testnet: 'MONAD-TESTNET',
  },
  BridgeKit: jest.fn(),
}));
jest.mock('@circle-fin/adapter-circle-wallets', () => ({ createCircleWalletsAdapter: jest.fn() }));
jest.mock('@solana/web3.js', () => ({}));

import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { LedgerService } from '../src/common/ledger.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { WalletsService } from '../src/wallets/wallets.service';
import { ConversionsService } from '../src/conversions/conversions.service';
import { ReferralsService } from '../src/referrals/referrals.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { BillsService } from '../src/bills/bills.service';
import { fromMinor, decimalsFor, roundTo } from '../src/common/money';

const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Prisma fake: supports exactly the surface these services use.
// ─────────────────────────────────────────────────────────────────────────────
let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

class FakePrisma {
  wallets = new Map<string, any>();
  users = new Map<string, any>();
  walletAddresses: any[] = [];
  virtualAccounts: any[] = [];
  conversions: any[] = [];
  billPayments: any[] = [];
  referrals: any[] = [];
  ledgerRows: any[] = [];
  transactionRows: any[] = [];
  servicePricingRows: any[] = [];
  private transactionQueue: Promise<void> = Promise.resolve();

  wallet = {
    findUnique: async (args: any) => {
      const w = args?.where?.userId != null
        ? [...this.wallets.values()].find(x => x.userId === args.where.userId)
        : this.wallets.get(args?.where?.id);
      if (!w) return null;
      const out = { ...w };
      if (args?.include?.user || args?.select?.user) out.user = this.users.get(w.userId);
      return out;
    },
    findMany: async (args: any) => {
      let rows = [...this.wallets.values()];
      if (args?.where?.userId?.in) rows = rows.filter(w => args.where.userId.in.includes(w.userId));
      if (args?.where?.id?.in) rows = rows.filter(w => args.where.id.in.includes(w.id));
      return rows.map(w => ({ ...w }));
    },
    update: async (args: any) => {
      const w = args?.where?.userId != null
        ? [...this.wallets.values()].find(x => x.userId === args.where.userId)
        : this.wallets.get(args?.where?.id);
      if (!w) throw new Error('Wallet not found');
      for (const [key, rawVal] of Object.entries(args.data || {})) {
        const val: any = rawVal;
        if (val && typeof val === 'object' && ('increment' in val || 'decrement' in val)) {
          const delta = val.increment != null ? val.increment : -val.decrement;
          w[key] = (w[key] || 0) + delta;
        } else {
          w[key] = val;
        }
      }
      return { ...w };
    },
  };

  user = {
    findUnique: async (args: any) => this.users.get(args?.where?.id) || null,
    findFirst: async (args: any) => {
      const cond = args?.where?.surexTag;
      if (cond) {
        const tag = String(cond.equals ?? cond).toLowerCase();
        return [...this.users.values()].find(u =>
          String(u.surexTag || '').toLowerCase() === tag) || null;
      }
      return null;
    },
    updateMany: async () => ({ count: 0 }),
  };

  walletAddress = {
    findFirst: async (args: any) => {
      const addr = String(args?.where?.address?.equals ?? '').toLowerCase();
      const row = this.walletAddresses.find(r => r.address.toLowerCase() === addr) || null;
      if (row && (args?.include?.wallet)) {
        const wallet = this.wallets.get(row.walletId);
        return { ...row, wallet: { ...wallet, user: wallet ? this.users.get(wallet.userId) : undefined } };
      }
      return row;
    },
  };

  virtualAccount = {
    findFirst: async (args: any) => {
      const refs = (args?.where?.OR || []).map((o: any) => o.reference);
      return this.virtualAccounts.find(v => args?.where?.isActive && refs.includes(v.reference)) || null;
    },
  };

  transaction = {
    findUnique: async (args: any) =>
      this.transactionRows.find(t => t.reference === args?.where?.reference) || null,
    findFirst: async (args: any) => {
      let row = this.transactionRows.find((t: any) =>
        (args?.where?.userId == null || t.userId === args.where.userId) &&
        (args?.where?.type == null || t.type === args.where.type) &&
        (args?.where?.status == null || t.status === args.where.status) &&
        (args?.where?.amount == null || t.amount === args.where.amount));
      if (row && args?.where?.metadata?.path?.equals) {
        const val = row.metadata?.[args.where.metadata.path[0]];
        if (String(val || '') !== String(args.where.metadata.path.equals)) row = undefined;
      }
      return row || null;
    },
    findMany: async (args: any) => {
      let rows = this.transactionRows.filter((t: any) =>
        (args?.where?.userId == null || t.userId === args.where.userId) &&
        (args?.where?.type == null || t.type === args.where.type) &&
        (args?.where?.status == null || t.status === args.where.status));
      if (args?.orderBy?.createdAt === 'desc') rows = [...rows].reverse();
      return rows.slice(0, args?.take ?? rows.length);
    },
    count: async (args: any) => this.transactionRows.filter((t: any) =>
      (args?.where?.userId == null || t.userId === args.where.userId) &&
      (args?.where?.type == null || t.type === args.where.type) &&
      (args?.where?.status == null || t.status === args.where.status)).length,
    create: async (args: any) => {
      const row = {
        id: nextId('tx'),
        ...args.data,
        metadata: args.data.metadata || {},
        createdAt: args.data.createdAt || new Date(),
        status: args.data.status || 'PENDING',
      };
      this.transactionRows.push(row);
      return row;
    },
    update: async (args: any) => {
      const row = this.transactionRows.find(t => t.id === args?.where?.id);
      if (!row) throw new Error('Transaction not found');
      Object.assign(row, args.data);
      return row;
    },
    updateMany: async (args: any) => {
      const row = this.transactionRows.find(t =>
        t.id === args?.where?.id &&
        (args?.where?.status == null || t.status === args.where.status));
      if (!row) return { count: 0 };
      Object.assign(row, args.data);
      return { count: 1 };
    },
  };

  ledgerEntry = {
    createMany: async (args: any) => {
      let count = 0;
      const seen = new Set<string>();
      for (const e of args.data) {
        const key = `${e.transferId}|${e.account}|${e.currency}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.ledgerRows.some(r => `${r.transferId}|${r.account}|${r.currency}` === key)) continue;
        this.ledgerRows.push({ id: nextId('le'), ...e, createdAt: new Date() });
        count++;
      }
      return { count };
    },
    findMany: async (args: any) => this.ledgerRows.filter(r => r.transferId === args?.where?.transferId),
    aggregate: async (args: any) => {
      let sum = 0n;
      for (const r of this.ledgerRows) {
        if (args.where.account === r.account && args.where.currency === r.currency) sum += BigInt(r.amountMinor);
      }
      return { _sum: { amountMinor: sum } };
    },
    groupBy: async (args: any) => {
      const matches = this.ledgerRows.filter(r => {
        const w = args.where;
        if (w.account && typeof w.account === 'string') return r.account === w.account;
        if (w.account?.startsWith) return r.account.startsWith(w.account.startsWith);
        return true;
      });
      const by = new Map<string, bigint>();
      for (const r of matches) by.set(r.currency, (by.get(r.currency) || 0n) + BigInt(r.amountMinor));
      return [...by.entries()].map(([currency, total]) => ({ currency, _sum: { amountMinor: total } }));
    },
  };

  conversion = {
    create: async (args: any) => {
      const row = { id: nextId('conv'), ...args.data, createdAt: new Date() };
      this.conversions.push(row);
      return row;
    },
    update: async (args: any) => {
      const row = this.conversions.find(c => c.id === args?.where?.id);
      if (row) Object.assign(row, args.data);
      return row;
    },
  };

  billPayment = {
    create: async (args: any) => {
      const row = { id: nextId('bill'), ...args.data, createdAt: new Date() };
      this.billPayments.push(row);
      return row;
    },
    update: async (args: any) => {
      const row = this.billPayments.find(b => b.id === args?.where?.id);
      if (row) Object.assign(row, args.data);
      return row;
    },
    updateMany: async (args: any) => {
      const row = this.billPayments.find(b =>
        b.id === args?.where?.id &&
        (args?.where?.status == null || b.status === args.where.status));
      if (!row) return { count: 0 };
      Object.assign(row, args.data);
      return { count: 1 };
    },
    findFirst: async (args: any) => this.billPayments.find(b => {
      const where = args?.where || {};
      return Object.entries(where).every(([key, value]: [string, any]) => b[key] === value);
    }) || null,
    findMany: async (args: any) => this.billPayments.filter(b =>
      (args?.where?.status == null || b.status === args.where.status)),
  };

  referral = { count: async (args: any) => this.referrals.filter(r => r.referrerId === args?.where?.referrerId).length };

  servicePricing = {
    findFirst: async () => null,
    findMany: async () => [],
  };

  auditLog = { findFirst: async () => null, create: async (args: any) => ({ id: nextId('audit'), ...args.data }) };

  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    // Model PostgreSQL's row-lock serialization for the money-flow tests. The
    // real query uses SELECT ... FOR UPDATE; the fake queue makes concurrent
    // NGN-send coverage exercise the same repeat-check behavior.
    let release!: () => void;
    const previous = this.transactionQueue;
    this.transactionQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await fn(this as any);
    } finally {
      release();
    }
  }

  $queryRaw(parts: TemplateStringsArray, ...values: any[]): Promise<any[]> {
    const sql = Array.isArray(parts) ? parts.join('?') : String(parts);
    let rows = [...this.wallets.values()];
    if (sql.includes('"userId"')) rows = rows.filter(w => w.userId === values[0]);
    else if (values.every((v: any) => typeof v === 'string')) rows = rows.filter(w => values.includes(w.id));
    return Promise.resolve(rows.map(w => ({
      id: w.id, userId: w.userId,
      usdcBalance: w.usdcBalance, usdtBalance: w.usdtBalance,
      lockedBalance: w.lockedBalance, localBalances: w.localBalances,
      localBalance: w.localBalance, realLocalBalance: w.realLocalBalance,
    })));
  }

  $queryRawUnsafe(sql: string, ...values: any[]): Promise<any[]> {
    return this.$queryRaw(sql as any, ...values);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment factory (fresh store + real services per test)
// ─────────────────────────────────────────────────────────────────────────────
class TestEnv {
  prisma = new FakePrisma();
  ledger = new LedgerService(this.prisma as any);
  transactions = new TransactionsService(this.prisma as any);
  referrals: ReferralsService;
  conversions: ConversionsService;
  wallets: WalletsService;
  webhooks: WebhooksService;
  bills: BillsService;
  configValues: Record<string, any> = {};

  constructor(reads: boolean) {
    const config = {
      get: (path: string) => {
        if (path === 'app.ledger.reads') return reads;
        if (path in this.configValues) return this.configValues[path];
        return undefined;
      },
    } as unknown as ConfigService;

    this.configValues['app.smartspeed.apiKey'] = 'test';
    this.configValues['app.smartspeed.baseUrl'] = 'https://smartspeed.test/api';
    this.configValues['app.bills.requireFunding'] = true;
    // Money-moving service tests must opt in explicitly, matching production
    // configuration behavior; undefined is fail-closed in the services.
    this.configValues['app.moneyMovement.enabled'] = true;

    const verify = jest.fn().mockResolvedValue(undefined);
    const notifications: any = {
      createNotification: jest.fn().mockResolvedValue(undefined),
      sendPushNotification: jest.fn().mockResolvedValue(undefined),
      sendTransactionEmail: jest.fn().mockResolvedValue(undefined),
    };

    this.referrals = new ReferralsService(this.prisma as any, this.transactions, this.ledger);
    this.conversions = new ConversionsService(
      this.prisma as any, config, this.transactions, notifications,
      { verify } as any, this.ledger,
    );
    this.wallets = new WalletsService(
      this.prisma as any, config, this.transactions,
      {} as any, { reconcileWallet: jest.fn().mockResolvedValue(undefined) } as any,
      notifications, this.ledger,
    );
    this.webhooks = new WebhooksService(
      this.prisma as any, this.transactions, notifications, this.referrals, this.ledger, config,
    );
    this.bills = new BillsService(
      this.prisma as any, config, this.transactions, this.conversions,
      { verify } as any, this.ledger,
    );
  }

  seedUser(id: string, tag: string, email = `${id}@test.com`) {
    this.prisma.users.set(id, { id, firstName: id[0].toUpperCase() + id.slice(1), lastName: 'X', surexTag: tag, email });
  }
  /**
   * Seed a wallet. By default ALSO seeds the ledger baseline for every currency
   * with a non-zero float — exactly what scripts/backfill-ledger-baseline.js
   * writes against a pre-rollout database, so tests model the state the
   * rollout actually runs in. Pass { baseline: false } to simulate a wallet
   * with no ledger history yet.
   */
  async seedWallet(userId: string, overrides: Partial<any> = {}, opts: { baseline?: boolean } = {}) {
    const id = nextId('w');
    const w = {
      id, userId,
      usdtBalance: 0, usdcBalance: 0, lockedBalance: 0,
      localBalances: {}, localBalance: 0, realLocalBalance: 0, pendingBalance: 0,
      ...overrides,
    };
    this.prisma.wallets.set(id, w);
    if (opts.baseline !== false) {
      const byCcy = new Map<string, Array<{ account: string; currency: string; amountMinor: bigint }>>();
      const add = (ccy: string, amount: number) => {
        if (!Number.isFinite(amount) || amount === 0) return;
        const minor = BigInt(Math.round(amount * 10 ** decimalsFor(ccy)));
        byCcy.set(ccy, [
          { account: `external:legacy-baseline:${ccy}`, currency: ccy, amountMinor: -minor },
          { account: `user:${userId}:${ccy}`, currency: ccy, amountMinor: minor },
        ]);
      };
      add('USDC', w.usdcBalance);
      add('USDT', w.usdtBalance);
      for (const [ccy, amount] of Object.entries(w.localBalances || {})) add(ccy, Number(amount));
      for (const [ccy, pair] of byCcy) {
        await this.ledger.record(pair.map(e => ({
          transferId: `BASELINE-${userId}-${ccy}`,
          ...e, reference: `ledger-baseline:${userId}`, kind: 'LEGACY_BASELINE',
        })));
      }
    }
    return id;
  }
  wallet(userId: string) {
    return [...this.prisma.wallets.values()].find(w => w.userId === userId);
  }
  ledgerOf(account: string, ccy: string) {
    return this.prisma.ledgerEntry.aggregate({ where: { account, currency: ccy }, _sum: { amountMinor: true } })
      .then(r => r._sum.amountMinor || 0n);
  }
  async expectDoubleEntry() {
    const by = new Map<string, bigint>();
    for (const r of this.prisma.ledgerRows) by.set(r.currency, (by.get(r.currency) || 0n) + BigInt(r.amountMinor));
    const bad = [...by.entries()].filter(([, s]) => s !== 0n);
    expect(bad).toEqual([]);
  }
  async expectLedgerMatchesFloat(userId: string, ccys: string[]) {
    for (const ccy of ccys) {
      const w = this.wallet(userId);
      const float = ccy === 'USDC' ? w.usdcBalance : ccy === 'USDT' ? w.usdtBalance : (w.localBalances?.[ccy] ?? 0);
      const minor = await this.ledgerOf(`user:${userId}:${ccy}`, ccy);
      const ledger = fromMinor(minor, ccy);
      expect(roundTo(ledger, ccy)).toBe(roundTo(Number(float) || 0, ccy));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const USD_COINS = ['USDC', 'USDT'];

describe.each([[false], [true]])('money flows (ledgerReads=%s)', (reads) => {
  let env: TestEnv;
  beforeEach(() => {
    env = new TestEnv(reads);
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: {} });
    // An HTTP rejection is a known provider outcome and is safe to refund.
    mockedAxios.post.mockRejectedValue({ response: { status: 400 }, message: 'provider rejected' });
  });

  it('Row 1 — Circle inbound deposit credits float AND ledger', async () => {
    env.seedUser('u1', 'alice.sx');
    const wId = await env.seedWallet('u1', { usdcBalance: 0 });
    env.prisma.walletAddresses.push({ id: 'wa1', walletId: wId, network: 'ETHEREUM', address: '0xAAA111' });

    await env.webhooks.processCircle({
      notificationType: 'transactions.inbound',
      notification: {
        state: 'COMPLETED', blockchain: 'ETH-SEPOLIA', txHash: '0xdep1', id: 'circ1',
        amount: '3.123456', destinationAddress: '0xaaa111', tokenSymbol: 'USDC',
      },
    });

    const w = env.wallet('u1');
    expect(w.usdcBalance).toBeCloseTo(3.123456, 6);
    expect(await env.ledgerOf('external:circle:ETH-SEPOLIA:USDC', 'USDC')).toBe(-3123456n);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(3123456n);
    expect(env.prisma.transactionRows.some(t => t.reference === 'RECV-0xdep1' && t.status === 'COMPLETED')).toBe(true);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 1b — Circle inbound without tokenSymbol books USDC, never the USDT bucket', async () => {
    env.seedUser('u1', 'alice.sx');
    const wId = await env.seedWallet('u1', { usdcBalance: 0 });
    env.prisma.walletAddresses.push({ id: 'wa1', walletId: wId, network: 'ETHEREUM', address: '0xAAA111' });

    await env.webhooks.processCircle({
      notificationType: 'transactions.inbound',
      notification: {
        state: 'COMPLETED', blockchain: 'ETH-SEPOLIA', txHash: '0xdep1b', id: 'circ1b',
        amount: '2.5', destinationAddress: '0xaaa111', // no tokenSymbol
      },
    });

    const w = env.wallet('u1');
    expect(w.usdcBalance).toBeCloseTo(2.5, 6);
    expect(w.usdtBalance).toBeCloseTo(0, 8);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(2500000n);
    expect(await env.ledgerOf('user:u1:USDT', 'USDT')).toBe(0n);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 1c — Circle inbound USDT stays USDT in the wallet and ledger', async () => {
    env.seedUser('u1', 'alice.sx');
    const wId = await env.seedWallet('u1', { usdcBalance: 0 });
    env.prisma.walletAddresses.push({ id: 'wa1', walletId: wId, network: 'ETHEREUM', address: '0xAAA111' });

    await env.webhooks.processCircle({
      notificationType: 'transactions.inbound',
      notification: {
        state: 'COMPLETED', blockchain: 'ETH-SEPOLIA', txHash: '0xdep1c', id: 'circ1c',
        amount: '1.25', destinationAddress: '0xaaa111', tokenSymbol: 'USDT',
      },
    });

    const w = env.wallet('u1');
    expect(w.usdcBalance).toBeCloseTo(0, 8);
    expect(w.usdtBalance).toBeCloseTo(1.25, 6);
    expect(await env.ledgerOf('external:circle:ETH-SEPOLIA:USDT', 'USDT')).toBe(-1250000n);
    expect(await env.ledgerOf('user:u1:USDT', 'USDT')).toBe(1250000n);
    expect(env.prisma.transactionRows.some(t => t.reference === 'RECV-0xdep1c' && t.currency === 'USDT')).toBe(true);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 2 — Flutterwave bank credit updates NGN float, real pool AND ledger', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1');
    env.prisma.virtualAccounts.push({ id: 'va1', userId: 'u1', reference: 'VA-1', bankName: 'GTBank', isActive: true });

    await env.webhooks.processFlutterwave({
      event: 'charge.completed',
      data: {
        id: 'flw1', tx_ref: 'VA-1', flw_ref: 'FLW-X', amount: '5000', currency: 'NGN', status: 'successful',
        payment_type: 'account transfer', meta: { product_id: 'VA-1' },
      },
    });

    const w = env.wallet('u1');
    expect(w.localBalances.NGN).toBe(5000);
    expect(w.realLocalBalance).toBe(5000);
    expect(await env.ledgerOf('external:FLUTTERWAVE:NGN', 'NGN')).toBe(-500000n);
    expect(await env.ledgerOf('user:u1:NGN', 'NGN')).toBe(500000n);
    expect(env.prisma.transactionRows.some(t => t.reference === 'DEP-FLW-flw1')).toBe(true);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['NGN']);
  });

  it('Row 3 — Referral commission credits USDC (not USDT) AND ledger from treasury', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1');

    await env.referrals.processReferralEarning('u1', 10, 'CONV-source-1'); // 0.3% = 0.03 USDC

    const w = env.wallet('u1');
    expect(w.usdcBalance).toBeCloseTo(0.03, 8);
    expect(w.usdtBalance).toBeCloseTo(0, 8); // USDT bucket stays empty — USDC-only product
    expect(await env.ledgerOf('platform:treasury:USDC', 'USDC')).toBe(-30000n);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(30000n);
    const earning = env.prisma.transactionRows.find(t => t.type === 'REFERRAL_EARNING');
    expect(earning?.status).toBe('COMPLETED');
    expect(earning?.currency).toBe('USDC');
    // Replayed settlement processing must not mint a second commission.
    await env.referrals.processReferralEarning('u1', 10, 'CONV-source-1');
    expect(w.usdcBalance).toBeCloseTo(0.03, 8);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 4 — Internal tag send debits sender, credits recipient, ledger mirrors both', async () => {
    env.seedUser('u1', 'alice.sx');
    env.seedUser('u2', 'bob.sx');
    await env.seedWallet('u1', { usdcBalance: 50 });
    await env.seedWallet('u2', { usdcBalance: 0 });

    const result = await env.wallets.sendCrypto('u1', '@bob.sx', 10, 'SUREX_TAG') as { success: boolean };

    expect(result.success).toBe(true);
    expect(env.wallet('u1').usdcBalance).toBe(40);
    expect(env.wallet('u2').usdcBalance).toBe(10);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(40000000n); // baseline 50 - 10
    expect(await env.ledgerOf('user:u2:USDC', 'USDC')).toBe(10000000n);
    expect(env.prisma.transactionRows.some(t => t.type === 'SEND' && t.status === 'COMPLETED')).toBe(true);
    expect(env.prisma.transactionRows.some(t => t.type === 'RECEIVE' && t.status === 'COMPLETED')).toBe(true);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
    await env.expectLedgerMatchesFloat('u2', USD_COINS);
  });

  it('Row 5 — Conversion USD->NGN splits USDT/USDC exactly as the float moves', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { usdtBalance: 30, usdcBalance: 5, localBalances: {}, realLocalBalance: 0 });

    await env.conversions.execute('u1', 'USD', 'NGN', 20);

    const w = env.wallet('u1');
    const received = w.localBalances?.NGN || 0;
    expect(w.usdtBalance).toBeCloseTo(10, 6);   // USDT consumed first
    expect(w.usdcBalance).toBeCloseTo(5, 6);
    expect(received).toBeGreaterThan(0);
    expect(await env.ledgerOf('user:u1:USDT', 'USDT')).toBe(10000000n); // baseline 30 - 20
    expect(await env.ledgerOf('platform:treasury:USDT', 'USDT')).toBe(20000000n);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(5000000n); // baseline 5 untouched
    expect(await env.ledgerOf('user:u1:NGN', 'NGN')).toBe(BigInt(Math.round(received * 100)));
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['USDT', 'USDC', 'NGN']);
  });

  it('Row 6 — Conversion NGN->USD credits USDC (not USDT) and debits NGN with matching ledger', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { usdtBalance: 0, localBalances: { NGN: 100 }, realLocalBalance: 0 });

    await env.conversions.execute('u1', 'NGN', 'USD', 25);

    const w = env.wallet('u1');
    const received = w.usdcBalance || 0;
    expect(w.localBalances.NGN).toBe(75);
    expect(w.usdtBalance).toBeCloseTo(0, 8); // USD credits land in USDC only
    expect(received).toBeGreaterThan(0);
    expect(await env.ledgerOf('user:u1:NGN', 'NGN')).toBe(7500n); // baseline 100 - 25
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(BigInt(Math.round(received * 1e6)));
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['USDC', 'NGN']);
  });

  it('Row 6b — USD->local conversion still drains legacy USDT first, then USDC', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { usdtBalance: 28.43, usdcBalance: 0.69, localBalances: {}, realLocalBalance: 0 });

    await env.conversions.execute('u1', 'USD', 'NGN', 3);

    const w = env.wallet('u1');
    expect(w.usdtBalance).toBeCloseTo(25.43, 6);
    expect(w.usdcBalance).toBeCloseTo(0.69, 6);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['USDT', 'USDC', 'NGN']);
  });

  it('Row 6c — tag send spends legacy USDT first; recipient always receives USDC', async () => {
    // The exact production bug: dashboard showed $29.12 (28.43 USDT + 0.69
    // USDC) but a $1 send was rejected because the gate only saw 0.69 USDC.
    env.seedUser('u1', 'alice.sx');
    env.seedUser('u2', 'bob.sx');
    await env.seedWallet('u1', { usdtBalance: 28.43, usdcBalance: 0.69 });
    await env.seedWallet('u2', { usdcBalance: 0 });

    const result = await env.wallets.sendCrypto('u1', '@bob.sx', 1, 'SUREX_TAG') as { success: boolean };

    expect(result.success).toBe(true);
    const s = env.wallet('u1');
    const r = env.wallet('u2');
    expect(s.usdtBalance).toBeCloseTo(27.43, 6); // USDT drained first
    expect(s.usdcBalance).toBeCloseTo(0.69, 6);  // USDC untouched
    expect(r.usdcBalance).toBeCloseTo(1, 6);     // recipient gets USDC
    expect(r.usdtBalance).toBeCloseTo(0, 6);
    // Ledger mirrors both legs + the treasury swap, per currency.
    expect(await env.ledgerOf('user:u1:USDT', 'USDT')).toBe(27430000n);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(690000n);
    expect(await env.ledgerOf('platform:treasury:USDT', 'USDT')).toBe(1000000n);
    expect(await env.ledgerOf('user:u2:USDC', 'USDC')).toBe(1000000n);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
    await env.expectLedgerMatchesFloat('u2', USD_COINS);
  });

  it('Row 7 — Circle outbound FAILED refunds float and reverses the ledger exactly', async () => {
    env.seedUser('u1', 'alice.sx');
    // Baseline state: 50 USDC on the float AND the ledger (post-backfill).
    await env.seedWallet('u1', { usdcBalance: 50 });
    const ref = 'SEND-ARC-1';
    // Simulate the cross-chain reserve exactly as sendCrossChainFromArc does:
    // float debit + lock, journal debit, PENDING row.
    await env.prisma.wallet.update({
      where: { userId: 'u1' },
      data: { usdcBalance: { decrement: 5.01 }, lockedBalance: { increment: 5.01 } },
    });
    await env.ledger.record([
      { transferId: ref, account: 'user:u1:USDC', currency: 'USDC', amountMinor: -5010000n, reference: ref, kind: 'SEND' },
      { transferId: ref, account: 'external:ETHEREUM:USDC', currency: 'USDC', amountMinor: 5000000n, reference: ref, kind: 'EXTERNAL_SEND' },
      { transferId: ref, account: 'platform:fees:USDC', currency: 'USDC', amountMinor: 10000n, reference: ref, kind: 'FEE' },
    ]);
    env.prisma.transactionRows.push({
      id: 'tx-send', userId: 'u1', type: 'SEND', status: 'PENDING', amount: 5, fee: 0.01,
      currency: 'USDC', reference: ref, metadata: {}, createdAt: new Date(),
    });

    await env.webhooks.processCircle({
      notificationType: 'transactions.outbound',
      notification: {
        state: 'FAILED', refId: ref, blockchain: 'ARC-TESTNET', txHash: '0xburn',
        id: 'circ-o1', amount: '0', errorMessage: 'Reverted on chain',
      },
    });

    const w = env.wallet('u1');
    expect(w.usdcBalance).toBeCloseTo(50, 6);
    expect(w.lockedBalance).toBe(0);
    // Reversed exactly: ledger returns to the original 50 baseline.
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(50000000n);
    const refunds = env.prisma.ledgerRows.filter(r => r.transferId === `${ref}-REFUND`);
    expect(refunds).toHaveLength(3);
    expect(refunds.map(r => r.kind).sort()).toEqual(['EXTERNAL_SEND_REFUND', 'FEE_REFUND', 'SEND_REFUND']);
    expect(env.prisma.transactionRows.find(t => t.reference === ref)?.status).toBe('FAILED');
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 7b — Circle outbound FAILED refunds a split reservation to its exact buckets', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { usdtBalance: 28.43, usdcBalance: 5 });
    const ref = 'SEND-ARC-SPLIT';
    // Reserve exactly as sendCrossChainFromArc does for a USDT-heavy wallet:
    // 1 USDT + 0.01 USDC = 1.01 total locked, split recorded on the row.
    await env.prisma.wallet.update({
      where: { userId: 'u1' },
      data: { usdtBalance: { decrement: 1 }, usdcBalance: { decrement: 0.01 }, lockedBalance: { increment: 1.01 } },
    });
    // Netted treasury form: one row per (transferId, account, currency).
    // Treasury USDC net = (in 0.01) - (out 1.00 + 0.01 fee) = -1.00.
    await env.ledger.record([
      { transferId: ref, account: 'user:u1:USDT', currency: 'USDT', amountMinor: -1000000n, reference: ref, kind: 'SEND_SOURCE' },
      { transferId: ref, account: 'platform:treasury:USDT', currency: 'USDT', amountMinor: 1000000n, reference: ref, kind: 'SEND_SWAP' },
      { transferId: ref, account: 'user:u1:USDC', currency: 'USDC', amountMinor: -10000n, reference: ref, kind: 'SEND_SOURCE' },
      { transferId: ref, account: 'platform:treasury:USDC', currency: 'USDC', amountMinor: -1000000n, reference: ref, kind: 'SEND_SWAP_SETTLEMENT' },
      { transferId: ref, account: 'external:ETHEREUM:USDC', currency: 'USDC', amountMinor: 1000000n, reference: ref, kind: 'EXTERNAL_SEND' },
      { transferId: ref, account: 'platform:fees:USDC', currency: 'USDC', amountMinor: 10000n, reference: ref, kind: 'FEE' },
    ]);
    env.prisma.transactionRows.push({
      id: 'tx-send-split', userId: 'u1', type: 'SEND', status: 'PENDING', amount: 1, fee: 0.01,
      currency: 'USDC', reference: ref, metadata: { reserveSplit: { usdt: 1, usdc: 0.01 } }, createdAt: new Date(),
    });

    await env.webhooks.processCircle({
      notificationType: 'transactions.outbound',
      notification: {
        state: 'FAILED', refId: ref, blockchain: 'ARC-TESTNET', txHash: '0xburn2',
        id: 'circ-o2', amount: '0', errorMessage: 'Reverted on chain',
      },
    });

    const w = env.wallet('u1');
    expect(w.usdtBalance).toBeCloseTo(28.43, 6);   // USDT bucket restored exactly
    expect(w.usdcBalance).toBeCloseTo(5, 6);       // USDC bucket restored exactly
    expect(w.lockedBalance).toBe(0);
    expect(await env.ledgerOf('user:u1:USDT', 'USDT')).toBe(28430000n);
    expect(await env.ledgerOf('user:u1:USDC', 'USDC')).toBe(5000000n);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', USD_COINS);
  });

  it('Row 8 — Bill failure refund restores real naira and reverses the ledger', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { localBalances: { NGN: 1000 }, localBalance: 1000, realLocalBalance: 1000 });
    env.prisma.transactionRows.push({
      id: 'tx-fund', userId: 'u1', type: 'RECEIVE', status: 'COMPLETED', amount: 5000,
      fee: 0, currency: 'NGN', reference: 'DEP-FLW-FUND', metadata: {}, createdAt: new Date(),
    });

    await expect(env.bills.purchaseBill('u1', 'airtime', 'MTN', '08012345678', 100, '0000'))
      .rejects.toThrow(/Purchase failed/);

    const w = env.wallet('u1');
    expect(w.localBalances.NGN).toBe(1000);
    expect(w.realLocalBalance).toBe(1000);
    expect(await env.ledgerOf('user:u1:NGN', 'NGN')).toBe(100000n); // baseline 1000 - 100 + 100
    const ref = env.prisma.billPayments[0]?.reference;
    const refunds = env.prisma.ledgerRows.filter(r => r.transferId === `${ref}-REFUND`);
    expect(refunds.length).toBeGreaterThan(0);
    expect(env.prisma.billPayments[0]?.status).toBe('FAILED');
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['NGN']);
  });

  it('Bill transport timeout keeps the reservation pending instead of refunding an unknown provider outcome', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { localBalances: { NGN: 1000 }, localBalance: 1000, realLocalBalance: 1000 });
    env.prisma.transactionRows.push({
      id: 'tx-fund-timeout', userId: 'u1', type: 'RECEIVE', status: 'COMPLETED', amount: 5000,
      fee: 0, currency: 'NGN', reference: 'DEP-FLW-FUND-TIMEOUT', metadata: {}, createdAt: new Date(),
    });
    mockedAxios.post.mockRejectedValue(new Error('socket timeout'));

    await expect(env.bills.purchaseBill('u1', 'airtime', 'MTN', '08012345678', 100, '0000'))
      .rejects.toThrow(/held while support reconciles/i);

    const w = env.wallet('u1');
    expect(w.realLocalBalance).toBe(900);
    expect(env.prisma.billPayments[0]?.status).toBe('PENDING');
    expect(env.prisma.billPayments[0]?.metadata?.reconciliationRequired).toBe(true);
    expect(env.prisma.transactionRows.find(t => t.type === 'BILL_PAYMENT')?.status).toBe('PENDING');
    expect(await env.ledgerOf('user:u1:NGN', 'NGN')).toBe(90000n);
    await env.expectDoubleEntry();
  });

  it('Bill provider 5xx keeps the reservation pending, while a confirmed success settles it', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { localBalances: { NGN: 1000 }, localBalance: 1000, realLocalBalance: 1000 });
    env.prisma.transactionRows.push({
      id: 'tx-fund-5xx', userId: 'u1', type: 'RECEIVE', status: 'COMPLETED', amount: 5000,
      fee: 0, currency: 'NGN', reference: 'DEP-FLW-FUND-5XX', metadata: {}, createdAt: new Date(),
    });
    mockedAxios.post.mockRejectedValueOnce({ response: { status: 503 }, message: 'provider unavailable' });

    await expect(env.bills.purchaseBill('u1', 'airtime', 'MTN', '08012345678', 100, '0000'))
      .rejects.toThrow(/held while support reconciles/i);
    expect(env.prisma.billPayments[0]?.status).toBe('PENDING');
    expect(env.prisma.billPayments[0]?.metadata?.providerState).toBe('UNKNOWN_REQUIRES_RECONCILIATION');

    // A provider response is only accepted when it carries an explicit final
    // success status; this is the contract evidence the live integration still
    // needs to establish with Smartspeed.
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'success', transaction_id: 'ss-ok-1' } });
    await expect(env.bills.purchaseBill('u1', 'airtime', 'MTN', '08012345679', 100, '0000'))
      .resolves.toMatchObject({ status: 'COMPLETED' });
    expect(env.prisma.billPayments[1]?.status).toBe('COMPLETED');
    expect(env.wallet('u1').realLocalBalance).toBe(800);
    await env.expectDoubleEntry();
  });

  it('Bill 2xx pending response is not mistaken for delivery', async () => {
    env.seedUser('u1', 'alice.sx');
    await env.seedWallet('u1', { localBalances: { NGN: 1000 }, localBalance: 1000, realLocalBalance: 1000 });
    env.prisma.transactionRows.push({
      id: 'tx-fund-pending', userId: 'u1', type: 'RECEIVE', status: 'COMPLETED', amount: 5000,
      fee: 0, currency: 'NGN', reference: 'DEP-FLW-FUND-PENDING', metadata: {}, createdAt: new Date(),
    });
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'pending', transaction_id: 'ss-pending-1' } });

    await expect(env.bills.purchaseBill('u1', 'airtime', 'MTN', '08012345678', 100, '0000'))
      .rejects.toThrow(/held while support reconciles/i);
    expect(env.prisma.billPayments[0]?.status).toBe('PENDING');
    expect(env.wallet('u1').realLocalBalance).toBe(900);
  });

  it('Concurrent NGN tag sends serialize and only one can spend the real balance', async () => {
    env.seedUser('u1', 'alice.sx');
    env.seedUser('u2', 'bob.sx');
    await env.seedWallet('u1', { localBalances: { NGN: 100 }, localBalance: 100, realLocalBalance: 100 });
    await env.seedWallet('u2', { localBalances: { NGN: 0 }, localBalance: 0, realLocalBalance: 0 });

    const results = await Promise.allSettled([
      env.wallets.sendCrypto('u1', '@bob.sx', 75, 'SUREX_TAG', undefined, 'NGN'),
      env.wallets.sendCrypto('u1', '@bob.sx', 75, 'SUREX_TAG', undefined, 'NGN'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(env.wallet('u1').realLocalBalance).toBe(25);
    expect(env.wallet('u1').localBalances.NGN).toBe(25);
    expect(env.wallet('u2').realLocalBalance).toBe(75);
    expect(env.wallet('u2').localBalances.NGN).toBe(75);
    await env.expectDoubleEntry();
    await env.expectLedgerMatchesFloat('u1', ['NGN']);
    await env.expectLedgerMatchesFloat('u2', ['NGN']);
  });

  it('Late check — ledger read flag gates spendable checks (backfill-complete state)', async () => {
    // "Backfill complete": ledger is truth (50 USDC), float is stale (40).
    env.seedUser('u1', 'alice.sx');
    env.seedUser('u2', 'bob.sx');
    // Deliberately NO baseline here: the ledger is seeded manually to 50 while
    // the float is 40 — a "backfill completed for this currency" scenario where
    // the ledger is the source of truth.
    await env.seedWallet('u1', { usdcBalance: 40 }, { baseline: false });
    await env.seedWallet('u2', { usdcBalance: 0 });
    await env.ledger.record([
      { transferId: 'BASELINE-u1-USDC', account: 'external:legacy-baseline:USDC', currency: 'USDC', amountMinor: -50000000n, reference: 'ledger-baseline', kind: 'LEGACY_BASELINE_SOURCE' },
      { transferId: 'BASELINE-u1-USDC', account: 'user:u1:USDC', currency: 'USDC', amountMinor: 50000000n, reference: 'ledger-baseline', kind: 'LEGACY_BASELINE' },
    ]);

    if (reads) {
      // 45 > float(40) but <= ledger(50): a ledger-backed spendable check must pass.
      await expect(env.wallets.sendCrypto('u1', '@bob.sx', 45, 'SUREX_TAG')).resolves.toMatchObject({ success: true });
      expect(env.wallet('u2').usdcBalance).toBe(45);
    } else {
      // Reads-off verifies the OLD behavior: the float gate rejects.
      await expect(env.wallets.sendCrypto('u1', '@bob.sx', 45, 'SUREX_TAG')).rejects.toThrow(/Insufficient balance/);
    }
  });
});

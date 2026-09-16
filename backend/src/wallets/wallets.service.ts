import { Injectable, BadRequestException, ConflictException, Logger, NotFoundException, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CctpService } from './cctp.service';
import { DepositMonitorService } from './deposit-monitor.service';
import { getLocalRate, SUPPORTED_LOCAL_CURRENCIES } from '../common/currency.constants';
import { LedgerService } from '../common/ledger.service';
import { toMinor, fromMinor, roundMinor } from '../common/money';
import { FinancialSafetyService } from '../common/financial-safety.service';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WalletsService implements OnModuleInit {
  private readonly logger = new Logger(WalletsService.name);
  private apiKey: string;
  private entitySecret: string;
  private walletSetId: string;
  private baseUrl: string;
  private defaultWalletSetInit?: Promise<string>;
  // Per-wallet timestamp of the last full Circle history sync (see
  // syncCircleHistory) so background refreshes don't re-sweep on every page load.
  private lastCircleSyncAt: Map<string, number> = new Map();

  /** True when balance READS should come from the ledger instead of floats. */
  private ledgerReads(): boolean {
    return this.configService.get<boolean>('app.ledger.reads') === true;
  }

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
    private cctpService: CctpService,
    private depositMonitor: DepositMonitorService,
    private notifications: NotificationsService,
    private ledger: LedgerService,
    @Optional() private financialSafety?: FinancialSafetyService,
  ) {
    this.apiKey = this.configService.get<string>('app.circle.apiKey') || '';
    this.entitySecret = this.configService.get<string>('app.circle.entitySecret');
    this.walletSetId = this.configService.get<string>('app.circle.walletSetId');
    this.baseUrl = 'https://api.circle.com';
    this.logger.log(`Circle API initialized: ${this.baseUrl}`);
  }

  private stableProviderIdempotencyKey(seed: string): string {
    const digest = crypto.createHash('sha256').update(seed).digest('hex');
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  }

  private walletCreationIdempotencyKey(userId: string, network: string, blockchain: string): string {
    return this.stableProviderIdempotencyKey(
      `surexend:wallet:${userId}:${network.toUpperCase()}:${blockchain.toUpperCase()}`,
    );
  }

  private async saveWalletAddress(walletId: string, network: string, address: string) {
    try {
      return await this.prisma.walletAddress.create({
        data: { walletId, network: network.toUpperCase(), address },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const existing = await this.prisma.walletAddress.findUnique({
          where: { walletId_network: { walletId, network: network.toUpperCase() } },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  // Resolve the standard Circle wallet set lazily. Existing installations can
  // keep CIRCLE_WALLET_SET_ID; a new installation creates one exactly once and
  // stores it in the database, so no operator has to copy a set ID from Circle.
  private async getOrCreateDefaultWalletSetId(): Promise<string> {
    if (this.walletSetId) return this.walletSetId;
    if (this.defaultWalletSetInit) return this.defaultWalletSetInit;

    this.defaultWalletSetInit = (async () => {
      if (!this.apiKey || !this.entitySecret) {
        throw new BadRequestException('Circle is not configured. Add CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET before creating a wallet.');
      }
      if (this.configService.get<string>('app.network.environment') === 'mainnet') {
        throw new BadRequestException('Mainnet requires a pre-created, custody-reviewed CIRCLE_WALLET_SET_ID; automatic wallet-set creation is disabled.');
      }

      const existing = await this.prisma.platformWallet.findUnique({ where: { key: 'APPLICATION_WALLET_SET' } });
      if (existing?.walletSetId) {
        this.walletSetId = existing.walletSetId;
        return existing.walletSetId;
      }

      const record = existing || await this.prisma.platformWallet.create({
        data: {
          key: 'APPLICATION_WALLET_SET',
          label: 'SureXend application wallet set',
          blockchain: this.getBlockchainName('ARC'),
          currency: 'USDC',
          status: 'WALLET_SET_CREATING',
        },
      });

      try {
        const publicKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
          headers: { Authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
          timeout: 15_000,
        });
        const publicKey = publicKeyResponse.data?.data?.publicKey;
        if (!publicKey) throw new Error('Circle did not return the entity public key.');
        const response = await axios.post(
          `${this.baseUrl}/v1/w3s/developer/walletSets`,
          {
            idempotencyKey: this.stableProviderIdempotencyKey('surexend:wallet-set:application'),
            entitySecretCiphertext: this.encryptSecret(this.entitySecret, publicKey),
            name: 'SureXend Application Wallets',
          },
          {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
            timeout: 30_000,
          },
        );
        const walletSetId = response.data?.data?.walletSet?.id;
        if (!walletSetId) throw new Error('Circle did not return a wallet set id.');
        await this.prisma.platformWallet.update({
          where: { id: record.id },
          data: { walletSetId, status: 'WALLET_SET_ACTIVE' },
        });
        this.walletSetId = walletSetId;
        this.logger.log(`Created Circle application wallet set ${walletSetId}`);
        return walletSetId;
      } catch (error) {
        await this.prisma.platformWallet.update({ where: { id: record.id }, data: { status: 'WALLET_SET_ERROR' } }).catch(() => undefined);
        throw error;
      }
    })();

    try {
      return await this.defaultWalletSetInit;
    } catch (error) {
      this.defaultWalletSetInit = undefined;
      throw error;
    }
  }

  // On boot, ensure EVERY EVM address this app displays (any network, any user)
  // also exists in Circle as an ARC-TESTNET wallet. Circle only indexes deposits
  // on chains where it holds a wallet at that exact address, so without this a
  // base/Polygon deposit that lands on Arc stays invisible to the Circle console
  // and to wallet feeds. Uses the `derive by address` endpoint, which creates an
  // ARC wallet at a pre-existing address (unlike create, which only ever yields
  // freshly-derived addresses).
  async onModuleInit() {
    if (this.configService.get<boolean>('app.moneyMovement.enabled') !== true) return;
    try {
      const result = await this.ensureAllAddressesHaveArcWallets();
      if (this.configService.get<string>('app.network.environment') === 'mainnet' && result.failed.length) {
        throw new Error(`mainnet Circle address coverage failed for ${result.failed.length} address(es)`);
      }
    } catch (err: any) {
      this.logger.error(`automatic ARC wallet registration failed: ${err.message}`);
      if (this.configService.get<string>('app.network.environment') === 'mainnet') throw err;
    }
  }

  async ensureAllAddressesHaveArcWallets(): Promise<{ registered: number; skipped: number; failed: string[] }> {
    const records = await this.prisma.walletAddress.findMany({
      include: { wallet: { select: { userId: true } } },
    });
    const seen = new Set<string>();
    let registered = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const record of records) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(record.address)) continue;
      const key = record.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const outcome = await this.ensureArcWalletAtAddress(record.address, record.wallet?.userId);
        if (outcome === 'registered') registered++;
        else if (outcome === 'skipped') skipped++;
      } catch (err: any) {
        failed.push(`${record.address}: ${err.response?.data?.message || err.message}`);
      }
    }
    this.logger.log(`ARC wallet coverage: ${registered} registered, ${skipped} already present, ${failed.length} failed`);
    return { registered, skipped, failed };
  }

  // Make sure Circle holds an ARC-TESTNET wallet at `address`. Returns
  // 'registered' if it was missing and we derived it, 'skipped' if it already
  // existed. Throws if Circle rejects the derivation.
  private async ensureArcWalletAtAddress(address: string, userId?: string): Promise<'registered' | 'skipped'> {
    const arcBlockchain = this.arcBlockchainName();
    const existing = await this.getCircleWalletByAddress(address, arcBlockchain);
    if (existing) return 'skipped';

    // Find a source EVM chain where Circle already has a wallet at this address.
    // The address is always registered on at least one mapped chain (ETH/BASE/etc.)
    // because it was originally created via Circle's create-wallet flow.
    const source = await this.getCircleWalletByAddress(address);
    if (!source) {
      throw new Error(`no Circle wallet exists at ${address} on any chain; cannot derive ARC wallet`);
    }
    const sourceBlockchain = (source.blockchains || [source.blockchain] || [])[0] as string;

    const res = await axios.put(
      `${this.baseUrl}/v1/w3s/developer/wallets/derive`,
      {
        sourceBlockchain,
        walletAddress: address,
        targetBlockchain: this.getBlockchainName('ARC'),
        metadata: {
          name: `User ${String(userId || 'unknown').substring(0, 8)} - ARC`,
          refId: userId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
          'Idempotency-Key': this.stableProviderIdempotencyKey(`surexend:arc-derive:${userId}:${address.toLowerCase()}`),
        },
      }
    );
    const w = res.data.data.wallet;
    this.logger.log(`Derived ${arcBlockchain} wallet at ${w.address} (${w.id})`);
    return 'registered';
  }

  // Spendable USD is the wallet's combined stablecoin pool minus reservations.
  // Conversion execution already debits/credits these wallet columns, so
  // subtracting completed CONVERT rows here would double-count the same move
  // (and adding conversion-in rows could mint phantom spendable balance).
  private async computeSpendableUsd(userId: string, wallet: any, amount: number): Promise<number> {
    let usdc = Number(wallet.usdcBalance || 0);
    let usdt = Number(wallet.usdtBalance || 0);

    // During the ledger cutover, use the ledger when a currency has a balance
    // account. The transaction below still re-checks under a wallet row lock.
    if (this.ledgerReads()) {
      try {
        const balances = await this.ledger.balancesOfUser(userId);
        if (balances.USDC !== undefined) usdc = fromMinor(balances.USDC, 'USDC');
        if (balances.USDT !== undefined) usdt = fromMinor(balances.USDT, 'USDT');
        // Ledger balances already include committed SEND reservations, so do
        // not subtract the legacy lock a second time after cutover.
        return Math.max(0, usdc + usdt);
      } catch (err: any) {
        this.logger.error(`Ledger spendable read failed for ${userId}: ${err.message}`);
      }
    }

    return Math.max(0, usdc + usdt - Number(wallet.lockedBalance || 0));
  }

  private encryptSecret(secretHex: string, publicKeyPem: string): string {    const buffer = Buffer.from(secretHex, 'hex');
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return encrypted.toString('base64');
  }

  private getBlockchainName(network: string): string {
    const net = network.toUpperCase();
    const environment = this.configService.get<string>('app.network.environment');
    if (environment === 'mainnet') {
      const reviewed = this.configService.get<Record<string, { circleBlockchain: string }>>('app.network.matrix') || {};
      const value = reviewed[net]?.circleBlockchain;
      if (!value) {
        throw new BadRequestException(`No reviewed Circle mainnet blockchain mapping exists for ${net}.`);
      }
      return value;
    }

    const testnetMap: Record<string, string> = {
      POLYGON: 'MATIC-AMOY',
      AVALANCHE: 'AVAX-FUJI',
      ARBITRUM: 'ARB-SEPOLIA',
      ETHEREUM: 'ETH-SEPOLIA',
      BASE: 'BASE-SEPOLIA',
      OPTIMISM: 'OP-SEPOLIA',
      SOLANA: 'SOL-DEVNET',
      BSC: 'EVM-TESTNET',
      BEP20: 'EVM-TESTNET',
      ARC: 'ARC-TESTNET',
      MONAD: 'MONAD-TESTNET',
    };
    return testnetMap[net] || net;
  }

  private arcBlockchainName(): string {
    return this.getBlockchainName('ARC');
  }

  private arcUsdcTokenAddress(): string {
    const address = this.configService.get<string>('app.arc.usdcContractAddress');
    if (!address) throw new BadRequestException('Arc USDC contract is not configured for this environment.');
    return address;
  }

  // Reverse of getBlockchainName(): map a Circle blockchain value from the tx
  // feed (e.g. "ARC-TESTNET", "ETH-SEPOLIA") back to the app's network label so
  // history/explorer links point at the right chain regardless of which address
  // record is being iterated. Returns undefined for unknown values.
  private getNetworkFromBlockchain(blockchain: string): string | undefined {
    const reviewed = this.configService.get<Record<string, { circleBlockchain: string }>>('app.network.matrix') || {};
    const normalizedBlockchain = (blockchain || '').toUpperCase();
    const reviewedMatch = Object.entries(reviewed).find(([, entry]) => String(entry.circleBlockchain).toUpperCase() === normalizedBlockchain);
    if (reviewedMatch) return reviewedMatch[0];
    const map: Record<string, string> = {
      'ARC-TESTNET': 'ARC',
      'ETH-SEPOLIA': 'ETHEREUM',
      'MATIC-AMOY': 'POLYGON',
      'AVAX-FUJI': 'AVALANCHE',
      'ARB-SEPOLIA': 'ARBITRUM',
      'BASE-SEPOLIA': 'BASE',
      'OP-SEPOLIA': 'OPTIMISM',
      'SOL-DEVNET': 'SOLANA',
      'MONAD-TESTNET': 'MONAD',
      'EVM-TESTNET': 'BSC',
    };
    return map[(blockchain || '').toUpperCase()];
  }

  async getBalance(userId: string) {
    // Use an explicit select so this endpoint never fails if the DB schema is
    // not yet migrated (e.g. the new localBalances column). Reading only the
    // columns that always exist keeps the balance screen resilient.
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        usdtBalance: true,
        usdcBalance: true,
        lockedBalance: true,
        localBalance: true,
        realLocalBalance: true,
        pendingBalance: true,
      }
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({ data: { userId } });
    }

    // Balance must respond instantly on mobile. The on-chain reconcile and the
    // Circle history mirror both fan out over many RPC/API calls (every address
    // x every chain), so they are refreshed in the background here and by the
    // DepositMonitor's scheduled scan rather than blocking this endpoint. The DB
    // figures are at most ~60s stale, which only ever lags, never 500s.
    let usdcBalance = wallet.usdcBalance || 0;
    let usdtBalance = wallet.usdtBalance || 0;
    let ledgerBalances: Record<string, bigint> | null = null;

    this.depositMonitor.reconcileWallet(userId, wallet.id).catch((err: any) => {
      this.logger.error(`Background balance reconcile failed for ${userId}: ${err.message}`);
    });
    this.syncCircleHistory(userId, wallet.id).catch((err: any) => {
      this.logger.error(`Background Circle history sync failed for ${userId}: ${err.message}`);
    });

    // LEDGER READS (gradual cutover): the double-entry ledger is the source of
    // truth for USDC/USDT and all local currencies. A currency that has NO
    // ledger rows yet (pre-rollout history not backfilled) falls back to the
    // float, so enabling LEDGER_READS_ENABLED is safe before the baseline
    // script runs — per-currency, not all-or-nothing.
    if (this.ledgerReads()) {
      try {
        ledgerBalances = await this.ledger.balancesOfUser(userId);
        if (ledgerBalances.USDC !== undefined) usdcBalance = fromMinor(ledgerBalances.USDC, 'USDC');
        if (ledgerBalances.USDT !== undefined) usdtBalance = fromMinor(ledgerBalances.USDT, 'USDT');
      } catch (err: any) {
        this.logger.error(`Ledger read failed for ${userId}; continuing with floats: ${err.message}`);
      }
    }

    // The float columns are already updated by conversion execution and send
    // reservations. Do not net CONVERT transaction rows a second time. When
    // ledger reads are enabled, the ledger branch above is authoritative.

    // Sync real deposit/withdrawal history from Circle is backgrounded above so
    // this endpoint stays fast; no synchronous Circle calls here.

    const usdVal = usdtBalance + usdcBalance;
    const lockedVal = wallet.lockedBalance || 0;
    const pendingVal = wallet.pendingBalance || 0;
    const localVal = wallet.localBalance || 0;

    // Parse per-currency local balances; fall back to the legacy single
    // localBalance field as NGN so existing accounts still show their funds.
    let localBalances: Record<string, number> = {};
    try {
      const fullWallet = await this.prisma.wallet.findUnique({
        where: { userId },
        select: { localBalances: true }
      });
      const parsed = fullWallet?.localBalances as any;
      if (parsed && typeof parsed === 'object') {
        localBalances = { ...parsed };
      }
    } catch {
      // Column may not exist in the DB yet (pre-migration); fall through to legacy field
      localBalances = {};
    }
    if (!localBalances['NGN'] && localVal > 0) {
      localBalances['NGN'] = localVal;
    }

    // Overlay ledger-backed local balances (per currency, legacy fallback for
    // any currency the ledger has no rows for yet).
    if (ledgerBalances) {
      for (const [ccy, minor] of Object.entries(ledgerBalances)) {
        // Skip stablecoin denominations; 'USD' is a legacy ledger pseudo-currency
        // from pre-cutover conversion rows and is not a local balance.
        if (ccy === 'USDC' || ccy === 'USDT' || ccy === 'USD') continue;
        localBalances[ccy] = fromMinor(minor, ccy);
      }
    }

    const ngnBalance = localBalances['NGN'] || 0;
    const realNgn = wallet.realLocalBalance || 0;
    const testnetNgn = Math.max(0, ngnBalance - realNgn);

    return {
      usdBalance: usdVal,
      usdcBalance,
      usdtBalance,
      ngnBalance,
      realNgn,
      testnetNgn,
      localBalances,
      lockedBalance: lockedVal,
      usdt: usdVal,
      fiat: ngnBalance,
      rate: getLocalRate('NGN'),
      locked: lockedVal,
      pending: pendingVal
    };
  }

  // Circle W3S can hold MULTIPLE wallet entries that share the same EVM address
  // across chains (e.g. this project stores one Circle wallet per network, but
  // BSC/BASE and POLYGON/OPTIMISM have proven to resolve to the same address).
  // Listing only by address then guessing `wallets[0]` picks the wrong entry, so
  // the deposit on the other chain never surfaces. Filter by blockchain too so we
  // always read the wallet that actually received funds on the requested network.
  private async getCircleWalletByAddress(address: string, blockchain?: string) {
    let url = `${this.baseUrl}/v1/w3s/wallets?address=${encodeURIComponent(address)}`;
    if (blockchain) url += `&blockchains=${encodeURIComponent(blockchain)}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      }
    });
    const wallets = response.data.data.wallets || [];
    if (wallets.length === 0) return null;
    if (blockchain) {
      const requested = blockchain.toUpperCase();
      const exact = wallets.find(
        (w: any) => (w.blockchains || []).map((b: string) => b.toUpperCase()).includes(requested)
      );
      if (exact) return exact;
    }
    return wallets[0];
  }

  // Mirror real Circle deposit/withdrawal history into the local DB so the
  // transactions page reflects actual on-chain activity (including deposits
  // that predate the Arc listener). Idempotent: deduped by on-chain txHash.
  private async syncCircleHistory(userId: string, walletId: string) {
    // Throttle: a full Circle history sync fans out one wallet lookup + balances
    // call + transactions call per address. getBalance fires this in the
    // background on every load, so without a window it would re-run the whole
    // sweep on each page view. 30s keeps history fresh without the churn.
    const now = Date.now();
    const lastSync = this.lastCircleSyncAt.get(walletId) || 0;
    if (now - lastSync < 30_000) return;
    this.lastCircleSyncAt.set(walletId, now);

    try {
      // Remove legacy synthetic/duplicate records from earlier schemes so the
      // same on-chain tx is never listed twice in history.
      await this.prisma.transaction.deleteMany({
        where: {
          userId,
          OR: [
            { reference: { startsWith: 'RECV-BACKFILL-' } },
            { reference: { startsWith: 'ARC-INBOUND-' } },
            { reference: { startsWith: 'ARC-OUTBOUND-' } },
          ]
        }
      });

      const addressRecords = await this.prisma.walletAddress.findMany({
        where: { walletId }
      });

      const seenCircleWallets = new Set<string>();
      for (const addressRecord of addressRecords) {
        try {
        const circleWallet = await this.getCircleWalletByAddress(addressRecord.address, this.getBlockchainName(addressRecord.network));
        if (!circleWallet || seenCircleWallets.has(circleWallet.id)) continue;
        seenCircleWallets.add(circleWallet.id);

        // Resolve tokenId -> symbol from the wallet's token balances
        const balancesResponse = await axios.get(
          `${this.baseUrl}/v1/w3s/wallets/${circleWallet.id}/balances`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            }
          }
        );
        const symbolByTokenId = new Map<string, string>();
        const tokenBalances = balancesResponse.data.data.tokenBalances || [];
        for (const bal of tokenBalances) {
          symbolByTokenId.set(bal.token.id, bal.token.symbol.toUpperCase());
        }

        const txResponse = await axios.get(
          `${this.baseUrl}/v1/w3s/transactions?walletId=${circleWallet.id}&pageSize=50`,
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            }
          }
        );

        const circleTxs = txResponse.data.data.transactions || [];
        for (const tx of circleTxs) {
          const amount = parseFloat((tx.amounts || [])[0]) || 0;
          const isCctpStep = tx.transactionType === 'OUTBOUND' && (!amount || amount <= 0);

          // CCTP bridges split into two on-chain steps from the sender's wallet:
          // an ERC20 approval ("Contract Execution Outbound", 0 USDC) then a burn.
          // Those steps carry no amount on the Circle feed, but they are the
          // on-chain completion of a pending cross-chain send, so we must not
          // skip them like plain amount-less noise. Inbound rows without an
          // amount genuinely have nothing to reconcile though.
          if (!isCctpStep && (!amount || amount <= 0)) continue;

          // The feed can surface activity for other addresses in the entity, so
          // scope both directions to THIS address: inbound must land on this
          // record's address, outbound must originate from it.
          const srcLower = (tx.sourceAddress || '').toLowerCase();
          const dstLower = (tx.destinationAddress || '').toLowerCase();
          const recAddr = addressRecord.address.toLowerCase();
          if (tx.transactionType === 'INBOUND' && dstLower !== recAddr) continue;
          if (tx.transactionType === 'OUTBOUND' && srcLower !== recAddr) continue;

          // Attribute the tx to the blockchain it actually happened on (from the
          // Circle feed), not to whichever address record happens to be iterated
          // first — shared-EVM addresses would otherwise label Arc burns as
          // ETHEREUM/POLYGON and break the explorer deep-link.
          const chainLabel = this.getNetworkFromBlockchain(tx.blockchain) || addressRecord.network;

          const symbol = symbolByTokenId.get(tx.tokenId) || 'USDC';
          const type = tx.transactionType === 'OUTBOUND' ? 'SEND' : 'RECEIVE';

          const state = (tx.state || '').toUpperCase();
          if (state !== 'COMPLETE' && state !== 'COMPLETED' && state !== 'FAILED') continue;

          const isFailed = state === 'FAILED';
          const status = isFailed ? 'FAILED' : 'COMPLETED';
          // Dedupe by txHash across every network record (on-chain monitor uses
          // RECV-ONCHAIN-<chain>-<txHash>; this uses the network label) so the
          // same on-chain tx is never listed twice in history.
          const reference = `${type === 'RECEIVE' ? 'RECV' : 'SEND'}-${chainLabel}-${tx.txHash}`;

          const existing = await this.prisma.transaction.findUnique({
            where: { reference }
          });
          if (existing) {
            if (tx.createDate && Math.abs(existing.createdAt.getTime() - new Date(tx.createDate).getTime()) > 60_000) {
              await this.prisma.transaction.update({
                where: { id: existing.id },
                data: { createdAt: new Date(tx.createDate) }
              });
            }
            continue;
          }

          const alreadyByHash = await this.prisma.transaction.findFirst({
            where: { userId, metadata: { path: ['txHash'], equals: tx.txHash } }
          });
          if (alreadyByHash) {
            if (tx.createDate && Math.abs(alreadyByHash.createdAt.getTime() - new Date(tx.createDate).getTime()) > 60_000) {
              await this.prisma.transaction.update({
                where: { id: alreadyByHash.id },
                data: { createdAt: new Date(tx.createDate) }
              });
            }
            continue;
          }

          // Check if an unanchored balance fallback record was created for this address
          const fallbackRec = await this.prisma.transaction.findFirst({
            where: {
              AND: [
                { userId },
                { type: 'RECEIVE' },
                { metadata: { path: ['detectedBy'], equals: 'onchain-balance-reconciler' } },
                // Never attach another address's fallback balance record to this
                // history row; shared-EVM accounts may have several networks.
                { metadata: { path: ['destinationAddress'], equals: addressRecord.address } },
              ],
            }
          });
          if (fallbackRec) {
            await this.prisma.transaction.update({
              where: { id: fallbackRec.id },
              data: {
                createdAt: new Date(tx.createDate || tx.updateDate || Date.now()),
                reference,
                metadata: {
                  ...((fallbackRec.metadata as Record<string, unknown>) || {}),
                  network: chainLabel,
                  txHash: tx.txHash,
                  circleTransactionId: tx.id,
                  destinationAddress: tx.destinationAddress,
                  sourceAddress: tx.sourceAddress,
                  settledAt: tx.createDate || new Date().toISOString(),
                }
              }
            });
            continue;
          }

          const txMeta = {
            network: chainLabel,
            txHash: tx.txHash,
            circleTransactionId: tx.id,
            destinationAddress: tx.destinationAddress,
            sourceAddress: tx.sourceAddress,
            ...(isFailed ? { errorReason: tx.errorCode || tx.errorMessage || 'Transaction failed on Circle.', failedAt: 'circle-sync' } : {})
          };

          // An OUTBOUND SEND is first recorded locally (PENDING, no txHash yet)
          // when the user initiates it. If a Circle tx is the completion of that
          // local send, UPDATE the pending row instead of creating a duplicate
          // (the user had seen the same send listed twice: one PENDING with no
          // details and one COMPLETED). Prefer an exact recipient match; for
          // CCTP the burn's destination is the bridge contract, so use only the
          // txHash the pending row already recorded (from bridge steps). Never
          // merge solely by amount: that can settle the wrong concurrent send.
          if (type === 'SEND') {
            const pendingWhere: any = {
              userId,
              type: 'SEND',
              status: 'PENDING',
              createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
            };
            // Do not filter by amount here: CCTP burn amounts include the
            // relay fee while the local row stores the requested amount. The
            // guarded recipient/hash match below is the identity check.

            const candidates = await this.prisma.transaction.findMany({
              where: pendingWhere,
              orderBy: { createdAt: 'desc' },
              take: 10,
            });

            const hashLower = (tx.txHash || '').toLowerCase();
            let pendingMatch = candidates.find((c) => {
              // Native same-chain transfer: destination is the real recipient.
              const to = (c.metadata as any)?.toAddress;
              if (typeof to === 'string' && to.toLowerCase() === dstLower) return true;
              // CCTP: match by the bridge txHash the local row already recorded.
              const recorded = (c.metadata as any)?.txHashes;
              if (Array.isArray(recorded) && recorded.some((h: any) => typeof h?.txHash === 'string' && h.txHash.toLowerCase() === hashLower)) return true;
              return false;
            });

            if (pendingMatch) {
              // For CCTP, prefer the burn hash over the approve hash as the
              // canonical on-chain reference so the explorer shows the transfer.
              const recorded = (pendingMatch.metadata as any)?.txHashes;
              const burnHash = Array.isArray(recorded)
                ? recorded.find((h: any) => (h?.step || '').toLowerCase() === 'burn')?.txHash
                : undefined;

              const preservedFee =
                (parseFloat(tx.networkFee || '0') || 0) || (pendingMatch.fee || 0);
              // The send initiation debited amount + fee from the wallet and
              // locked the same total. Release it here: on completion the funds
              // are spent (lock released), on failure they must be refunded to
              // the active balance. The outbound webhook cannot cover this —
              // Circle sends carry no refId — so this merge is the de-facto
              // settlement point; it flips status once so it runs exactly once.
              const totalLocked = (pendingMatch.amount || 0) + (preservedFee || 0);
              await this.prisma.$transaction(async (prisma) => {
                // SECURITY: claim the settlement with a guarded conditional
                // flip FIRST. A plain update by id let two concurrent
                // settlements both pass and double-release the locked funds.
                const claimed = await prisma.transaction.updateMany({
                  where: { id: pendingMatch.id, status: 'PENDING' },
                  data: {
                    status,
                    // Circle's feed reports networkFee in the native fee token
                    // (often 0 for amount-less CCTP burn/approve steps). Keep the
                    // relay fee we charged and recorded on the pending row so the
                    // user still sees the full amount + fee they were debited.
                    fee: preservedFee,
                    metadata: {
                      ...((pendingMatch.metadata as Record<string, unknown>) || {}),
                      ...txMeta,
                      // CCTP merge keeps the destination/delivery hints from the
                      // local row; the canonical hash should be the burn step.
                      ...(burnHash ? { txHash: burnHash } : {}),
                    }
                  },
                });
                if (claimed.count === 0) {
                  this.logger.log(`Settlement race lost for ${pendingMatch.reference} — already settled, skipping wallet release`);
                  return;
                }

                // A reservation taken from legacy USDT ($) must be refunded to
                // the same bucket the send was debited from. Rows predating the
                // split (no reserveSplit metadata) were 100% USDC — refund
                // those as before.
                const reserveSplit = (pendingMatch.metadata as any)?.reserveSplit;
                const refundUsdt = reserveSplit
                  ? Math.min(Math.max(0, Number(reserveSplit.usdt) || 0), totalLocked)
                  : 0;
                const refundUsdc = Math.max(0, totalLocked - refundUsdt);
                await prisma.wallet.update({
                  where: { userId: pendingMatch.userId },
                  data:
                    status === 'FAILED'
                      ? {
                          usdcBalance: { increment: refundUsdc },
                          usdtBalance: { increment: refundUsdt },
                          lockedBalance: { decrement: totalLocked },
                        }
                      : { lockedBalance: { decrement: totalLocked } },
                });

                if (status === 'FAILED') {
                  // Undo the initiation debit in the double-entry ledger too:
                  // the ledger must not keep the send debit after the funds
                  // were refunded, or reconciliation reports permanent drift.
                  await this.ledger.reverse(pendingMatch.reference, prisma);
                }
              });
              this.logger.log(`Merged Circle ${type} history into PENDING tx ${pendingMatch.reference}: ${amount || 0} ${symbol} on ${chainLabel} status=${status}`);
              continue;
            }

            // CCTP contract-execution steps (approve/burn) carry no amount and are
            // only meaningful as the completion of a pending cross-chain send. If
            // there is no pending row to merge into (e.g. the burn hash was already
            // merged by the approve step), never create a standalone 0-USDC row.
            if (isCctpStep) continue;
          }

          await this.prisma.transaction.create({
            data: {
              userId,
              type,
              status,
              amount,
              fee: parseFloat(tx.networkFee || '0') || 0,
              currency: symbol,
              reference,
              metadata: txMeta,
              createdAt: new Date(tx.createDate)
            }
          });
          this.logger.log(`Synced Circle ${type} history: ${amount || 0} ${symbol} on ${chainLabel} (${tx.txHash}) status=${status}`);
          }
        } catch (err: any) {
          this.logger.error(`syncCircleHistory failed for ${addressRecord.address}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error('Error syncing Circle transaction history:', err.message);
    }
  }

  async getDepositAddress(userId: string, network: string, walletSetIdOverride?: string) {
    await this.financialSafety?.assertEnabled('crypto', userId);
    if (this.configService.get<boolean>('app.moneyMovement.enabled') !== true) {
      throw new BadRequestException('Deposit address provisioning is disabled while this environment is in testnet or maintenance mode.');
    }
    const validNetworks = ['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20', 'ARC', 'MONAD'];
    if (!validNetworks.includes(network.toUpperCase())) {
      throw new BadRequestException('Invalid network. Supported: POLYGON, AVALANCHE, ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, BSC, BEP20, ARC, MONAD');
    }
    // Campaign payouts may use their dedicated set. General deposit addresses
    // reuse a configured set or bootstrap one automatically on first use.
    const walletSetId = walletSetIdOverride || await this.getOrCreateDefaultWalletSetId();

    // Explicit select so a not-yet-migrated localBalances column can't 500 this endpoint
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId },
        select: { id: true }
      });
    }

    let walletAddress = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: network.toUpperCase() }
    });

    if (!walletAddress) {
      if (network.toUpperCase() === 'ARC') {
        try {
          // Circle natively supports ARC (ARC-TESTNET) and tracks native USDC on
          // it, so register a REAL Circle wallet instead of aliasing an EVM
          // address. Unified EVM addressing returns the same address the user
          // already has on other EVM chains, so previously-received Arc USDC
          // becomes visible to Circle and the console.
          const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            },
          });
          const publicKeyPem = pubKeyResponse.data.data.publicKey;
          const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

          const createResponse = await axios.post(
            `${this.baseUrl}/v1/w3s/developer/wallets`,
            {
              idempotencyKey: this.walletCreationIdempotencyKey(userId, 'ARC', this.arcBlockchainName()),
              blockchains: [this.arcBlockchainName()],
              entitySecretCiphertext: ciphertext,
              walletSetId,
              metadata: [
                {
                  name: `User ${userId.substring(0, 8)} - ARC`,
                  refId: userId
                }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                accept: 'application/json',
              }
            }
          );

          const circleWallet = createResponse.data.data.wallets[0];
          walletAddress = await this.saveWalletAddress(wallet.id, 'ARC', circleWallet.address);
        } catch (err: any) {
          // Never alias an unregistered EVM address as an Arc deposit address.
          // If Circle accepted a request but the response was lost, retrying the
          // deterministic provider key is safe; displaying a fallback address is
          // not, because deposits could become unobservable.
          this.logger.error(`ARC wallet creation failed for ${userId}: ${err.response?.data?.message || err.message}`);
          throw new BadRequestException('Arc deposit address is temporarily unavailable. Please retry.');
        }
      } else {
        try {
          const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              accept: 'application/json',
            },
          });
          const publicKeyPem = pubKeyResponse.data.data.publicKey;
          const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

          const blockchain = this.getBlockchainName(network);

          const createResponse = await axios.post(
            `${this.baseUrl}/v1/w3s/developer/wallets`,
            {
              idempotencyKey: this.walletCreationIdempotencyKey(userId, network, blockchain),
              blockchains: [blockchain],
              entitySecretCiphertext: ciphertext,
              walletSetId,
              metadata: [
                {
                  name: `User ${userId.substring(0, 8)} - ${network}`,
                  refId: userId
                }
              ]
            },
            {
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                accept: 'application/json',
              }
            }
          );

          const circleWallet = createResponse.data.data.wallets[0];
          
          walletAddress = await this.saveWalletAddress(wallet.id, network, circleWallet.address);
        } catch (err: any) {
          this.logger.error('Error generating Circle wallet:', err.response?.data || err.message);
          const details = err.response?.data?.errors
            ? err.response.data.errors.map((e: any) => e.message || e.location).join('; ')
            : '';
          throw new BadRequestException(
            `${err.response?.data?.message || 'Failed to generate deposit address via Circle'}${details ? `: ${details}` : ''}`
          );
        }
      }
    }

    // Newly-created Circle address: ensure Circle also holds the configured Arc
    // wallet at this exact address. Mainnet waits for this coverage so an
    // address is never shown to a customer while its provider observability is
    // uncertain; testnet keeps the historical asynchronous refresh behavior.
    if (this.configService.get<string>('app.network.environment') === 'mainnet') {
      await this.ensureArcWalletAtAddress(walletAddress.address, userId);
    } else {
      this.ensureArcWalletAtAddress(walletAddress.address, userId).catch((err: any) => {
        this.logger.warn(`ARC coverage for new address ${walletAddress.address} failed: ${err.message}`);
      });
    }

    return { network: walletAddress.network, address: walletAddress.address };
  }

  async sendCrypto(userId: string, toAddress: string, amount: number, network: string, destinationNetwork?: string, currency?: string) {
    const requestedNetwork = String(network || '').toUpperCase();
    const safetyOperation = requestedNetwork === 'SUREX_TAG' && String(currency || 'USDC').toUpperCase() !== 'USDC' ? 'bills' : 'crypto';
    await this.financialSafety?.assertEnabled(safetyOperation, userId);
    this.financialSafety?.assertRecipientAllowed(toAddress);
    if (this.configService.get<boolean>('app.moneyMovement.enabled') !== true) {
      throw new BadRequestException('Money movement is disabled while this environment is in testnet or maintenance mode.');
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const net = network.toUpperCase();
    this.financialSafety?.assertRecipientShape(destinationNetwork?.toUpperCase() || net, toAddress);
    // Tag transfers are internal ledger movements. They may carry USDC or a
    // supported local currency; on-chain sends remain USDC-only by design.
    if (net === 'SUREX_TAG') {
      try {
        return await this.sendToSurexTag(userId, toAddress, amount, currency || 'USDC');
      } catch (error: any) {
        this.logger.error(`Internal tag transfer failed for ${userId}: ${error?.stack || error?.message || error}`);
        throw error;
      }
    }

    // Explicit select so a not-yet-migrated localBalances column can't 500 this endpoint
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, lockedBalance: true, usdcBalance: true, usdtBalance: true }
    });
    if (!wallet) throw new BadRequestException('Wallet not found.');

    // All funds sit on Arc (native USDC), regardless of where the recipient's
    // wallet is. The picked network is the DESTINATION chain; CCTP bridges
    // automatically — no separate destination step needed.
    return this.sendCrossChainFromArc(userId, wallet, toAddress, amount, net);
  }

  // Zero-fee in-app transfer by SureX tag (@username → @username).
  // Debits the sender's USDC, credits the recipient's USDC, and writes a SEND
  // row for the sender + a RECEIVE row for the recipient so both histories and
  // cash-flow charts reflect real money movement. No chain hops, no fees.
  private async sendToSurexTag(senderUserId: string, tagInput: string, amount: number, currencyInput = 'USDC') {
    const currency = (currencyInput || 'USDC').toUpperCase();
    if (currency !== 'USDC') {
      return this.sendLocalCurrencyToSurexTag(senderUserId, tagInput, amount, currency);
    }
    const tag = tagInput.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(tag)) {
      throw new BadRequestException('Enter a valid SureX tag like @first.last.');
    }

    const recipient = await this.prisma.user.findFirst({
      where: { surexTag: { equals: tag, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, surexTag: true },
    });
    if (!recipient) {
      throw new BadRequestException(`No SureXend user found with the tag @${tag}.`);
    }
    if (recipient.id === senderUserId) {
      throw new BadRequestException('You cannot send to your own SureX tag. Choose a different user.');
    }

    const [senderWallet, recipientWallet] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { userId: senderUserId },
        select: {
          id: true,
          usdcBalance: true,
          usdtBalance: true,
          lockedBalance: true,
          user: { select: { firstName: true, lastName: true, surexTag: true } },
        },
      }),
      this.prisma.wallet.findUnique({ where: { userId: recipient.id } }),
    ]);
    if (!senderWallet) throw new BadRequestException('Wallet not found.');
    if (!recipientWallet) throw new BadRequestException('Recipient wallet not found.');

    const senderName = `${senderWallet.user?.firstName || ''} ${senderWallet.user?.lastName || ''}`.trim();
    const recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();

    const sendAmount = Number(amount);
    // Internal transfers use the wallet ledger directly. Do not run the
    // conversion reconciliation SQL here: a malformed legacy conversion row
    // must never prevent a peer-to-peer balance transfer.
    // USDC-only product: the sender's legacy USDT is spendable too (drained
    // first) and the recipient always receives USDC.
    let spendable = Math.max(0, (Number(senderWallet.usdcBalance || 0) + Number(senderWallet.usdtBalance || 0)) - Number(senderWallet.lockedBalance || 0));
    // LEDGER READS: the pre-transaction sanity check must use the same source
    // of truth as the locked in-transaction check below, or the gate rejects
    // with stale floats before the ledger-aware check is ever reached.
    if (this.ledgerReads()) {
      const [ledgerUsdc, ledgerUsdt] = await Promise.all([
        this.ledger.balanceOf(this.ledger.userAccount(senderUserId, 'USDC'), 'USDC'),
        this.ledger.balanceOf(this.ledger.userAccount(senderUserId, 'USDT'), 'USDT'),
      ]);
        // The ledger already contains the debit for every committed pending
        // reservation, so subtracting lockedBalance again would double-count
        // prior sends after the ledger cutover.
        spendable = Math.max(0, fromMinor(ledgerUsdc, 'USDC') + fromMinor(ledgerUsdt, 'USDT'));
    }
    if (spendable < sendAmount) {
      const reason = `Insufficient balance. You can send up to ${spendable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.`;
      throw new BadRequestException(reason);
    }

    const reference = `TAG-${crypto.randomUUID()}`;
    await this.financialSafety?.reserveDailyLimit({
      userId: senderUserId,
      reference,
      amount: sendAmount,
      currency: 'USDC',
      limit: this.configService.get<number>('app.transactionLimits.cryptoUsdDaily') || 1000,
    });
    const receiveReference = `${reference}-R`;
    const result = await this.prisma.$transaction(async (prisma) => {
      // SECURITY: lock both wallet rows FOR UPDATE and re-derive spendable
      // INSIDE the transaction. Checking against the unlocked pre-read allowed
      // concurrent sends to all pass validation and drive the balance negative.
      // Ordered by id to keep a deterministic lock order (deadlock-safe).
      const locked = await prisma.$queryRaw<Array<{ id: string; usdcBalance: number; usdtBalance: number; lockedBalance: number }>>`
        SELECT "id", "usdcBalance", "usdtBalance", "lockedBalance"
        FROM "Wallet"
        WHERE "id" IN (${senderWallet.id}, ${recipientWallet.id})
        ORDER BY "id"
        FOR UPDATE`;
      const lockedSender = locked.find((w) => w.id === senderWallet.id);
      if (!lockedSender) throw new BadRequestException('Wallet not found.');
      let lockedSpendable = Math.max(0, (Number(lockedSender.usdcBalance || 0) + Number(lockedSender.usdtBalance || 0)) - Number(lockedSender.lockedBalance || 0));
      if (this.ledgerReads()) {
        const [ledgerUsdc, ledgerUsdt] = await Promise.all([
          this.ledger.balanceOf(this.ledger.userAccount(senderUserId, 'USDC'), 'USDC', prisma),
          this.ledger.balanceOf(this.ledger.userAccount(senderUserId, 'USDT'), 'USDT', prisma),
        ]);
        // The ledger already includes committed on-chain reservations; do not
        // subtract lockedBalance a second time after ledger cutover.
        lockedSpendable = Math.max(0, fromMinor(ledgerUsdc, 'USDC') + fromMinor(ledgerUsdt, 'USDT'));
      }
      if (lockedSpendable < sendAmount) {
        throw new BadRequestException(`Insufficient balance. You can send up to ${lockedSpendable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.`);
      }
      // Recipient always receives USDC. If the sender holds legacy USDT, drain
      // it first and swap it through the treasury so the ledger per-currency
      // books reflect exactly what moved (same pattern conversions use).
      const sendTotal = roundMinor(sendAmount, 'USDC');
      const debitUsdt = Math.min(sendTotal, Number(lockedSender.usdtBalance || 0));
      const debitUsdc = sendTotal - debitUsdt;
      await prisma.wallet.update({
        where: { id: senderWallet.id },
        data: {
          usdcBalance: { decrement: debitUsdc },
          usdtBalance: { decrement: debitUsdt },
        },
      });
      await prisma.wallet.update({
        where: { id: recipientWallet.id },
        data: { usdcBalance: { increment: sendTotal } },
      });
      await this.transactionsService.createTransaction(prisma, {
        userId: senderUserId,
        type: 'SEND',
        status: 'COMPLETED',
        amount: sendAmount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          fromTag: senderWallet.user?.surexTag || null,
          toTag: tag,
          recipientUserId: recipient.id,
          recipientName,
          delivery: 'internal',
          method: 'surex-tag',
          sourceSplit: { usdt: debitUsdt, usdc: debitUsdc },
        },
      });
      // One row per (transferId, account, currency) — the ledger's unique key.
      // The treasury legs are NETTED to a single USDC row: it receives
      // debitUsdc and pays sendTotal, so its net is -debitUsdt (the swapped
      // amount); when the sender pays purely in USDC the treasury nets zero and
      // drops out, giving the classic 2-row transfer.
      const ledgerEntries: any[] = [];
      if (debitUsdt > 0) {
        ledgerEntries.push(
          { transferId: reference, account: this.ledger.userAccount(senderUserId, 'USDT'), currency: 'USDT', amountMinor: -toMinor(debitUsdt, 'USDT'), reference, kind: 'SEND_SOURCE' },
          { transferId: reference, account: this.ledger.treasuryAccount('USDT'), currency: 'USDT', amountMinor: toMinor(debitUsdt, 'USDT'), reference, kind: 'SEND_SWAP' },
        );
      }
      if (debitUsdc > 0) {
        ledgerEntries.push(
          { transferId: reference, account: this.ledger.userAccount(senderUserId, 'USDC'), currency: 'USDC', amountMinor: -toMinor(debitUsdc, 'USDC'), reference, kind: 'SEND_SOURCE' },
        );
      }
      if (debitUsdt > 0) {
        ledgerEntries.push(
          { transferId: reference, account: this.ledger.treasuryAccount('USDC'), currency: 'USDC', amountMinor: -toMinor(debitUsdt, 'USDC'), reference, kind: 'SEND_SWAP_SETTLEMENT' },
        );
      }
      ledgerEntries.push(
        { transferId: reference, account: this.ledger.userAccount(recipient.id, 'USDC'), currency: 'USDC', amountMinor: toMinor(sendTotal, 'USDC'), reference, kind: 'RECEIVE' },
      );
      await this.ledger.record(ledgerEntries, prisma);
      await this.transactionsService.createTransaction(prisma, {
        userId: recipient.id,
        type: 'RECEIVE',
        status: 'COMPLETED',
        amount: sendAmount,
        fee: 0,
        currency: 'USDC',
        reference: receiveReference,
        metadata: {
          fromTag: senderWallet.user?.surexTag || null,
          senderUserId,
          senderName,
          delivery: 'internal',
          method: 'surex-tag',
        },
      });
      return { senderUserId, recipientUserId: recipient.id };
    });

    // In-app notifications so both users see the movement in the bell drawer.
    await this.notifications.createNotification(senderUserId, {
      title: 'Send Successful',
      body: `You sent ${sendAmount} USDC to @${tag}.`,
      type: 'SEND',
      data: { amount, currency: 'USDC', toTag: tag, reference },
    });
    await this.notifications.createNotification(recipient.id, {
      title: 'Payment Received',
      body: `You received +${sendAmount} USDC from ${senderName || `@${senderWallet.user?.surexTag || 'a SureXend user'}`}.`,
      type: 'DEPOSIT',
      data: { amount, currency: 'USDC', fromTag: senderWallet.user?.surexTag || null, reference },
    });

    return {
      success: true,
      reference,
      amount: sendAmount,
      currency: 'USDC',
      recipient: `@${tag}`,
      network: 'SUREX_TAG',
      method: 'internal',
      fee: 0,
    };
  }

  // Zero-fee internal local-currency transfer. The balance is moved in the
  // same currency without an FX conversion, so a Naira, Cedi, or CFA transfer
  // can never be displayed or settled as a dollar amount.
  private async sendLocalCurrencyToSurexTag(senderUserId: string, tagInput: string, amount: number, currency: string) {
    const supportedCurrencies = new Set<string>(SUPPORTED_LOCAL_CURRENCIES.map((entry) => entry.code));
    if (!supportedCurrencies.has(currency)) {
      throw new BadRequestException(`${currency} is not available for SureX Tag transfers.`);
    }
    const tag = tagInput.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(tag)) {
      throw new BadRequestException('Enter a valid SureX tag like @first.last.');
    }
    const recipient = await this.prisma.user.findFirst({
      where: { surexTag: { equals: tag, mode: 'insensitive' } },
      select: { id: true, firstName: true, lastName: true, surexTag: true },
    });
    if (!recipient) throw new BadRequestException(`No SureXend user found with the tag @${tag}.`);
    if (recipient.id === senderUserId) throw new BadRequestException('You cannot send to your own SureX tag. Choose a different user.');

    const [senderWallet, recipientWallet] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { userId: senderUserId },
        select: { id: true, localBalance: true, localBalances: true, realLocalBalance: true, user: { select: { firstName: true, lastName: true, surexTag: true } } },
      }),
      this.prisma.wallet.findUnique({ where: { userId: recipient.id }, select: { id: true } }),
    ]);
    if (!senderWallet || !recipientWallet) throw new BadRequestException('Wallet not found.');

    const parseLocalBalances = (balances: unknown, fallbackNgn: number) => {
      const parsed = typeof balances === 'string'
        ? (() => { try { return JSON.parse(balances); } catch { return {}; } })()
        : balances;
      const next = parsed && typeof parsed === 'object' ? { ...(parsed as Record<string, number>) } : {} as Record<string, number>;
      if (currency === 'NGN' && !next.NGN && fallbackNgn > 0) next.NGN = fallbackNgn;
      return next;
    };

    const sendAmount = roundMinor(Number(amount), currency);
    if (sendAmount <= 0) throw new BadRequestException('Amount must be greater than 0.');
    const previewBalances = parseLocalBalances(senderWallet.localBalances, senderWallet.localBalance || 0);
    let previewAvailable = Number(previewBalances[currency] || 0);
    if (this.ledgerReads()) {
      const ledgerBalances = await this.ledger.balancesOfUser(senderUserId);
      if (ledgerBalances[currency] !== undefined) previewAvailable = fromMinor(ledgerBalances[currency], currency);
    }
    // NGN carries a real-funds subledger. Never let test/demo local balance
    // pay another user's real balance or a later bill; an internal NGN send is
    // spendable only up to the sender's realLocalBalance.
    if (currency === 'NGN') {
      previewAvailable = Math.min(previewAvailable, Math.max(0, Number(senderWallet.realLocalBalance || 0)));
    }
    if (previewAvailable < sendAmount) {
      throw new BadRequestException(`Insufficient ${currency} balance. You can send up to ${previewAvailable.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}.`);
    }

    const reference = `TAG-${crypto.randomUUID()}`;
    await this.financialSafety?.reserveDailyLimit({
      userId: senderUserId,
      reference,
      amount: sendAmount,
      currency,
      limit: currency === 'NGN'
        ? (this.configService.get<number>('app.transactionLimits.billsNgnDaily') || 500000)
        : (this.configService.get<number>('app.transactionLimits.cryptoUsdDaily') || 1000),
    });
    const receiveReference = `${reference}-R`;
    const senderName = `${senderWallet.user?.firstName || ''} ${senderWallet.user?.lastName || ''}`.trim();
    const recipientName = `${recipient.firstName} ${recipient.lastName}`.trim();

    await this.prisma.$transaction(async (prisma) => {
      // Lock both records in a stable order and repeat the balance check. This
      // is the same concurrency guarantee as USDC tag sends.
      const locked = await prisma.$queryRaw<Array<{
        id: string; localBalance: number; localBalances: unknown; realLocalBalance: number;
      }>>`
        SELECT "id", "localBalance", "localBalances", "realLocalBalance"
        FROM "Wallet"
        WHERE "id" IN (${senderWallet.id}, ${recipientWallet.id})
        ORDER BY "id"
        FOR UPDATE`;
      const lockedSender = locked.find((wallet) => wallet.id === senderWallet.id);
      const lockedRecipient = locked.find((wallet) => wallet.id === recipientWallet.id);
      if (!lockedSender || !lockedRecipient) throw new BadRequestException('Wallet not found.');

      const sourceBalances = parseLocalBalances(lockedSender.localBalances, lockedSender.localBalance || 0);
      const destinationBalances = parseLocalBalances(lockedRecipient.localBalances, lockedRecipient.localBalance || 0);
      let available = Number(sourceBalances[currency] || 0);
      let recipientAvailable = Number(destinationBalances[currency] || 0);
      if (this.ledgerReads()) {
        const [senderLedgerBalances, recipientLedgerBalances] = await Promise.all([
          this.ledger.balancesOfUser(senderUserId, prisma),
          this.ledger.balancesOfUser(recipient.id, prisma),
        ]);
        if (senderLedgerBalances[currency] !== undefined) available = fromMinor(senderLedgerBalances[currency], currency);
        if (recipientLedgerBalances[currency] !== undefined) recipientAvailable = fromMinor(recipientLedgerBalances[currency], currency);
        // Bring the snapshots to the ledger baseline before applying this
        // movement. Without this, an older snapshot could be decremented from
        // zero after a ledger-backed check and manufacture a display drift.
        sourceBalances[currency] = available;
        destinationBalances[currency] = recipientAvailable;
      }
      const totalSourceBalance = Number(sourceBalances[currency] || 0);
      if (currency === 'NGN') {
        available = Math.min(available, Math.max(0, Number(lockedSender.realLocalBalance || 0)));
      }
      if (available < sendAmount) {
        throw new BadRequestException(`Insufficient ${currency} balance. You can send up to ${available.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}.`);
      }

      // Decrease the displayed total by the transfer amount, while the
      // spendability check above is restricted to real NGN for NGN sends.
      sourceBalances[currency] = roundMinor(Math.max(0, totalSourceBalance - sendAmount), currency);
      destinationBalances[currency] = roundMinor(recipientAvailable + sendAmount, currency);
      const realNgnMoved = currency === 'NGN' ? sendAmount : 0;

      await prisma.wallet.update({
        where: { id: senderWallet.id },
        data: {
          localBalances: sourceBalances,
          ...(currency === 'NGN' ? { localBalance: sourceBalances.NGN || 0, realLocalBalance: { decrement: realNgnMoved } } : {}),
        },
      });
      await prisma.wallet.update({
        where: { id: recipientWallet.id },
        data: {
          localBalances: destinationBalances,
          ...(currency === 'NGN' ? { localBalance: destinationBalances.NGN || 0, realLocalBalance: { increment: realNgnMoved } } : {}),
        },
      });

      await this.transactionsService.createTransaction(prisma, {
        userId: senderUserId,
        type: 'SEND',
        status: 'COMPLETED',
        amount: sendAmount,
        fee: 0,
        currency,
        reference,
        metadata: {
          fromTag: senderWallet.user?.surexTag || null,
          toTag: tag,
          recipientUserId: recipient.id,
          recipientName,
          delivery: 'internal',
          method: 'surex-tag',
          source: 'local-wallet',
        },
      });
      await this.transactionsService.createTransaction(prisma, {
        userId: recipient.id,
        type: 'RECEIVE',
        status: 'COMPLETED',
        amount: sendAmount,
        fee: 0,
        currency,
        reference: receiveReference,
        metadata: {
          fromTag: senderWallet.user?.surexTag || null,
          senderUserId,
          senderName,
          delivery: 'internal',
          method: 'surex-tag',
          source: 'local-wallet',
        },
      });
      await this.ledger.record([
        { transferId: reference, account: this.ledger.userAccount(senderUserId, currency), currency, amountMinor: -toMinor(sendAmount, currency), reference, kind: 'TAG_SEND_SOURCE' },
        { transferId: reference, account: this.ledger.userAccount(recipient.id, currency), currency, amountMinor: toMinor(sendAmount, currency), reference, kind: 'TAG_RECEIVE' },
      ], prisma);
    });

    await Promise.all([
      this.notifications.createNotification(senderUserId, {
        title: 'Send successful',
        body: `You sent ${sendAmount.toLocaleString()} ${currency} to @${tag}.`,
        type: 'SEND',
        data: { amount: sendAmount, currency, toTag: tag, reference },
      }),
      this.notifications.createNotification(recipient.id, {
        title: 'Payment received',
        body: `You received ${sendAmount.toLocaleString()} ${currency} from ${senderName || `@${senderWallet.user?.surexTag || 'a SureXend user'}`}.`,
        type: 'DEPOSIT',
        data: { amount: sendAmount, currency, fromTag: senderWallet.user?.surexTag || null, reference },
      }),
    ]);

    return {
      success: true,
      reference,
      amount: sendAmount,
      currency,
      recipient: `@${tag}`,
      network: 'SUREX_TAG',
      method: 'internal',
      fee: 0,
    };
  }

  async getNetworks() {
    return [
      { id: 'POLYGON', name: 'Polygon', fee: 0.0 },
      { id: 'AVALANCHE', name: 'Avalanche', fee: 0.0 },
      { id: 'ARBITRUM', name: 'Arbitrum', fee: 0.0 },
      { id: 'ETHEREUM', name: 'Ethereum', fee: 0.0 },
      { id: 'BASE', name: 'Base', fee: 0.0 },
      { id: 'OPTIMISM', name: 'Optimism', fee: 0.0 },
      { id: 'SOLANA', name: 'Solana', fee: 0.0 },
      { id: 'MONAD', name: 'Monad', fee: 0.0 },
      { id: 'ARC', name: 'Arc', fee: 0.0 },
    ];
  }

  // CCTP forwarder fee for a planned send (Arc -> destination). Native Arc
  // sends have no fee. Surfaces the relay fee Circle deducts from the mint so
  // the UI can show it and charge it from the sender's balance.
  async estimateSendFee(userId: string, destinationNetwork: string, amount: number) {
    if (!destinationNetwork) {
      return { fee: 0, total: amount || 0, currency: 'USDC' };
    }
    const destNet = destinationNetwork.toUpperCase();
    if (destNet === 'ARC') {
      return { fee: 0, total: amount || 0, currency: 'USDC' };
    }
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) {
      return { fee: 0, total: amount || 0, currency: 'USDC' };
    }
    const sourceAddressRecord = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: 'ARC' },
    });
    if (!sourceAddressRecord) {
      return { fee: 0, total: amount || 0, currency: 'USDC' };
    }
    try {
      const fee = await this.cctpService.estimateFee({
        sourceNetwork: 'ARC',
        sourceAddress: sourceAddressRecord.address,
        destNetwork: destNet,
        recipientAddress: sourceAddressRecord.address,
        amount: amount > 0 ? amount : 1,
      });
      return { fee, total: (amount || 0) + fee, currency: 'USDC' };
    } catch (err: any) {
      this.logger.warn(`CCTP fee estimate failed for ${destNet}: ${err?.message || err}`);
      return { fee: 0, total: amount || 0, currency: 'USDC' };
    }
  }

  private async sendCrossChainFromArc(
    userId: string,
    wallet: any,
    toAddress: string,
    amount: number,
    destinationNetwork?: string,
  ) {
    if (!destinationNetwork) {
      throw new BadRequestException('Destination network is required when sending from Arc.');
    }
    const destNet = destinationNetwork.toUpperCase();
    const delivery = destNet === 'ARC' ? 'native' : 'cctp';

    // Same spendable figure the app shows: the combined USD pool (USDC + legacy
    // USDT), net of the CONVERT ledger (conversions out of USD reduce spendable
    // without any chain movement). Fail fast with a clear message instead of a
    // Circle rejection.
    const spendable = await this.computeSpendableUsd(userId, wallet, amount);
    if (spendable < amount) {
      const reason = `Insufficient balance. You can send up to ${spendable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.`;
      await this.recordRejectedSend({ userId, amount, fee: 0, toAddress, destNet, delivery, errorReason: reason, failedAt: 'send-initiation' });
      throw new BadRequestException(reason);
    }

    const sourceAddressRecord = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: 'ARC' }
    });
    if (!sourceAddressRecord) {
      throw new BadRequestException('Please generate an Arc deposit address first.');
    }

    // Circle's CCTP forwarder deducts a dynamic relay fee from the minted USDC,
    // so the recipient would otherwise receive amount - fee. Burn amount + fee
    // so the recipient nets the full amount, and debit the fee from the
    // sender's balance so it is transparent.
    let fee = 0;
    if (delivery === 'cctp') {
      fee = await this.cctpService.estimateFee({
        sourceNetwork: 'ARC',
        sourceAddress: sourceAddressRecord.address,
        destNetwork: destNet,
        recipientAddress: toAddress,
        amount,
      });
      if (spendable < amount + fee) {
        const reason = `Insufficient balance. This send needs ${(amount + fee).toFixed(2)} USDC including a ${fee.toFixed(2)} USDC cross-chain network fee.`;
        await this.recordRejectedSend({ userId, amount, fee, toAddress, destNet, delivery, errorReason: reason, failedAt: 'send-initiation' });
        throw new BadRequestException(reason);
      }
    }

    const reference = `TX-${crypto.randomUUID()}`;
    const totalDebit = amount + fee;
    await this.financialSafety?.reserveDailyLimit({
      userId,
      reference,
      amount: totalDebit,
      currency: 'USDC',
      limit: this.configService.get<number>('app.transactionLimits.cryptoUsdDaily') || 1000,
    });

    // ── 1. Reserve the funds BEFORE the chain leg ───────────────────────────
    // An on-chain transfer cannot be undone, so the ledger must already hold
    // the debit at the moment it is submitted. The chain used to be called
    // first and the balance re-checked afterwards, which let real USDC leave a
    // wallet while the ledger recorded nothing.
    await this.prisma.$transaction(async (prisma) => {
      const lockedRows = await prisma.$queryRawUnsafe<Array<{ id: string; usdcBalance: number; usdtBalance: number; lockedBalance: number }>>(
        `SELECT "id", "usdcBalance", "usdtBalance", "lockedBalance" FROM "Wallet" WHERE "id" = $1 FOR UPDATE`,
        wallet.id
      );
      const lw = lockedRows[0];
      if (!lw) throw new BadRequestException('Wallet not found.');

      // Conversion execution already updates these buckets. Read the locked
      // wallet directly; applying completed CONVERT rows here would double-count
      // the same debit/credit and could permit phantom sends.
      let lockedSpendable = Math.max(
        0,
        Number(lw.usdcBalance || 0) + Number(lw.usdtBalance || 0) - Number(lw.lockedBalance || 0),
      );

      // LEDGER READS: the ledger is authoritative for spendable USD (it already
      // includes conversions), read inside the same locked transaction so a
      // concurrent conversion cannot interleave. Falls back to the float balance
      // if the ledger has no rows for this account yet.
      if (this.ledgerReads()) {
        const [ledgerUsdc, ledgerUsdt] = await Promise.all([
          this.ledger.balanceOf(this.ledger.userAccount(userId, 'USDC'), 'USDC', prisma),
          this.ledger.balanceOf(this.ledger.userAccount(userId, 'USDT'), 'USDT', prisma),
        ]);
        // Ledger balances already include prior committed reservations.
        lockedSpendable = Math.max(0, fromMinor(ledgerUsdc, 'USDC') + fromMinor(ledgerUsdt, 'USDT'));
      }

      if (lockedSpendable < totalDebit) {
        throw new BadRequestException(`Insufficient balance for this send. Spendable: ${lockedSpendable.toFixed(2)} USDC.`);
      }

      // USDC-only product: legacy USDT is reserved too, drained first, swapped
      // through the treasury. The split is stored on the PENDING row so every
      // refund path (chain rejection, Circle FAILED settlement) restores the
      // exact currencies that were taken.
      const reserveUsdt = Math.min(roundMinor(totalDebit, 'USDC'), Number(lw.usdtBalance || 0));
      const reserveUsdc = roundMinor(totalDebit, 'USDC') - reserveUsdt;
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          usdcBalance: { decrement: reserveUsdc },
          usdtBalance: { decrement: reserveUsdt },
          lockedBalance: { increment: totalDebit }
        }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'SEND',
        status: 'PENDING',
        amount,
        fee,
        currency: 'USDC',
        reference,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: delivery === 'cctp',
          delivery,
          txState: 'INITIATED',
          reserveSplit: { usdt: reserveUsdt, usdc: reserveUsdc },
        }
      });
      // The external destination is represented as a control account. The fee
      // is retained by the platform so every currency remains balanced. USDT
      // drained from the sender is swapped into the treasury's USDC pool.
      // One row per (transferId, account, currency): the treasury's USDC legs
      // are NETTED into a single row ((reserveUsdc in) - (amount + fee out) =
      // -reserveUsdt); zero when the sender paid purely in USDC.
      const reserveEntries: any[] = [];
      if (reserveUsdt > 0) {
        reserveEntries.push(
          { transferId: reference, account: this.ledger.userAccount(userId, 'USDT'), currency: 'USDT', amountMinor: -toMinor(reserveUsdt, 'USDT'), reference, kind: 'SEND_SOURCE' },
          { transferId: reference, account: this.ledger.treasuryAccount('USDT'), currency: 'USDT', amountMinor: toMinor(reserveUsdt, 'USDT'), reference, kind: 'SEND_SWAP' },
        );
      }
      if (reserveUsdc > 0) {
        reserveEntries.push(
          { transferId: reference, account: this.ledger.userAccount(userId, 'USDC'), currency: 'USDC', amountMinor: -toMinor(reserveUsdc, 'USDC'), reference, kind: 'SEND_SOURCE' },
        );
      }
      if (reserveUsdt > 0) {
        reserveEntries.push(
          { transferId: reference, account: this.ledger.treasuryAccount('USDC'), currency: 'USDC', amountMinor: -toMinor(reserveUsdt, 'USDC'), reference, kind: 'SEND_SWAP_SETTLEMENT' },
        );
      }
      reserveEntries.push(
        { transferId: reference, account: this.ledger.externalAccount(destNet, 'USDC'), currency: 'USDC', amountMinor: toMinor(amount, 'USDC'), reference, kind: 'EXTERNAL_SEND' },
        ...(fee > 0 ? [{ transferId: reference, account: this.ledger.feesAccount('USDC'), currency: 'USDC', amountMinor: toMinor(fee, 'USDC'), reference, kind: 'FEE' }] : []),
      );
      await this.ledger.record(reserveEntries, prisma);
    });

    // ── 2. Submit to the chain ──────────────────────────────────────────────
    try {
      const result = delivery === 'cctp'
        ? await this.cctpService.bridge({
            sourceNetwork: 'ARC',
            sourceAddress: sourceAddressRecord.address,
            destNetwork: destNet,
            recipientAddress: toAddress,
            amount: totalDebit,
          })
        : await this.sendNativeArcTransfer(userId, sourceAddressRecord.address, toAddress, amount, reference);

      const providerState = String(result?.state || '').toLowerCase();
      if (providerState && /failed|rejected|cancelled|canceled/.test(providerState)) {
        throw new BadRequestException(`Transfer was rejected by the provider (${result.state}).`);
      }

      await this.mergeTransactionMetadata(reference, {
        txState: result?.state,
        txId: result?.txId,
        txHashes: result?.txHashes || [],
      });
    } catch (err: any) {
      const reason = err?.response?.data?.message
        || err?.message
        || 'Transfer failed on Arc.';

      // A provider timeout, connection reset, SDK ambiguity, or process crash
      // can occur after Circle has accepted the operation. Releasing the
      // reservation here would let a retry spend the same funds twice. Keep the
      // PENDING row and locked balance until Circle history/webhook evidence or
      // an operator-approved reconciliation resolves it.
      const providerHttpStatus = Number(err?.response?.status || 0);
      if (
        err?.providerOutcomeUnknown ||
        (!err?.response && !(err instanceof BadRequestException)) ||
        providerHttpStatus >= 500 ||
        [408, 409, 429].includes(providerHttpStatus)
      ) {
        await this.markSendForReconciliation(reference, {
          providerState: 'UNKNOWN_REQUIRES_RECONCILIATION',
          reconciliationRequired: true,
          errorReason: reason,
          failedAt: 'provider-outcome-unknown',
        });
        this.logger.error(`Transfer outcome unknown ${reference} (${delivery}): ${reason}`);
        throw new ServiceUnavailableException(
          'The transfer provider did not confirm the result. Your funds remain reserved while support reconciles the transfer; do not retry yet.',
        );
      }

      // An explicit provider HTTP rejection means nothing was accepted, so the
      // committed reservation can be refunded in a guarded transaction.
      await this.releaseReservedSend(wallet.id, reference, totalDebit, {
        errorReason: reason,
        failedAt: 'chain-rejection',
        providerState: 'FAILED',
      });
      this.logger.error(`Transfer rejected ${reference} (${delivery}): ${reason}`);
      throw new BadRequestException(reason);
    }

    // In-app SEND notification so the bell drawer reflects real money movement.
    try {
      await this.notifications.createNotification(userId, {
        title: 'Transfer Initiated',
        body: `Sending ${amount} USDC to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)} on ${destNet}${fee > 0 ? ` (${fee.toFixed(2)} USDC fee)` : ''}.`,
        type: 'SEND',
        data: { amount, currency: 'USDC', toAddress, network: destNet, fee, reference },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record SEND notification: ${err.message}`);
    }

    return { message: destNet === 'ARC'
      ? 'Arc transfer initiated successfully'
      : 'Cross-chain transfer initiated successfully via CCTP' };
  }

  // A send that never reached the chain. No reservation exists yet, so all
  // this does is leave an honest FAILED row in the user's history.
  private async recordRejectedSend(params: {
    userId: string;
    amount: number;
    fee: number;
    toAddress: string;
    destNet: string;
    delivery: string;
    errorReason: string;
    failedAt: string;
  }) {
    try {
      await this.transactionsService.createTransaction(this.prisma, {
        userId: params.userId,
        type: 'SEND',
        status: 'FAILED',
        amount: params.amount,
        fee: params.fee,
        currency: 'USDC',
        reference: `TX-${crypto.randomUUID()}`,
        metadata: {
          toAddress: params.toAddress,
          network: 'ARC',
          destinationNetwork: params.destNet,
          cctp: params.delivery === 'cctp',
          delivery: params.delivery,
          errorReason: params.errorReason,
          failedAt: params.failedAt,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to record rejected send: ${err.message}`);
    }
  }

  private async mergeTransactionMetadata(reference: string, patch: Record<string, unknown>) {
    try {
      const existing = await this.prisma.transaction.findUnique({
        where: { reference },
        select: { metadata: true },
      });
      const current = (existing?.metadata as Record<string, unknown>) || {};
      await this.prisma.transaction.update({
        where: { reference },
        data: { metadata: { ...current, ...patch } as any },
      });
    } catch (err: any) {
      this.logger.error(`Failed to update metadata for ${reference}: ${err.message}`);
    }
  }

  private async markSendForReconciliation(reference: string, patch: Record<string, unknown>) {
    try {
      const tx = await this.prisma.transaction.findUnique({
        where: { reference },
        select: { metadata: true, status: true },
      });
      if (!tx || tx.status !== 'PENDING') return;
      await this.prisma.transaction.update({
        where: { reference },
        data: {
          metadata: {
            ...((tx.metadata as Record<string, unknown>) || {}),
            ...patch,
          } as any,
        },
      });
    } catch (error: any) {
      this.logger.error(`Could not mark send ${reference} for reconciliation: ${error?.message || error}`);
    }
  }

  /**
   * Return outbound sends that still require exact provider evidence. Pending
   * age or amount is never used to infer a result.
   */
  async listPendingReconciliation(limit = 100) {
    const take = Math.min(200, Math.max(1, Number(limit) || 100));
    const rows = await this.prisma.transaction.findMany({
      where: { type: 'SEND', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take,
      select: { id: true, userId: true, reference: true, amount: true, fee: true, currency: true, status: true, metadata: true, createdAt: true },
    });
    return rows
      .filter((row) => Boolean((row.metadata as any)?.reconciliationRequired) || Date.now() - new Date(row.createdAt).getTime() >= 5 * 60 * 1000)
      .map((row) => ({
        ...row,
        ageSeconds: Math.max(0, Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 1000)),
        reconciliationRequired: Boolean((row.metadata as any)?.reconciliationRequired),
      }));
  }

  private normalizeReconciliationEvidence(evidence: unknown) {
    const value = evidence && typeof evidence === 'object' ? evidence as Record<string, unknown> : {};
    const providerReference = String(value.providerReference || value.providerTransactionId || value.txHash || '').trim().slice(0, 300);
    const providerStatus = String(value.providerStatus || '').trim().toUpperCase().slice(0, 100);
    const note = String(value.note || '').trim().slice(0, 1000);
    if (!providerReference || !providerStatus) {
      throw new BadRequestException('Provider transaction reference and provider status are required reconciliation evidence.');
    }
    return { providerReference, providerStatus, ...(note ? { note } : {}), checkedAt: new Date().toISOString() };
  }

  /**
   * Resolve a pending outbound send only from explicit provider evidence. A
   * confirmed failure releases the exact reservation; a confirmed completion
   * releases only lockedBalance because the ledger debit already represents
   * the external spend.
   */
  async resolvePendingSend(reference: string, outcome: string, evidence: unknown) {
    const normalizedOutcome = String(outcome || '').toUpperCase();
    if (!['COMPLETED', 'FAILED'].includes(normalizedOutcome)) {
      throw new BadRequestException('Reconciliation outcome must be COMPLETED or FAILED.');
    }
    const resolutionEvidence = this.normalizeReconciliationEvidence(evidence);
    const tx = await this.prisma.transaction.findUnique({ where: { reference } });
    if (!tx) throw new NotFoundException('Send transaction not found.');
    if (tx.type !== 'SEND' || tx.status !== 'PENDING') {
      throw new ConflictException('This send is already in a terminal state; no reconciliation mutation was made.');
    }
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: tx.userId }, select: { id: true } });
    if (!wallet) throw new NotFoundException('Wallet for send reservation not found.');
    const totalDebit = Number(tx.amount || 0) + Number(tx.fee || 0);
    if (!Number.isFinite(totalDebit) || totalDebit <= 0) throw new ConflictException('Pending send has an invalid reservation amount.');

    if (normalizedOutcome === 'COMPLETED') {
      const metadata = {
        ...((tx.metadata as Record<string, unknown>) || {}),
        providerState: 'COMPLETED_CONFIRMED_BY_OPERATOR',
        reconciliationRequired: false,
        reconciliationEvidence: resolutionEvidence,
        settledAt: new Date().toISOString(),
      };
      const claimed = await this.prisma.$transaction(async (prisma) => {
        const walletRows = await prisma.$queryRaw<Array<{ lockedBalance: number }>>`
          SELECT "lockedBalance" FROM "Wallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
        const locked = Number(walletRows[0]?.lockedBalance || 0);
        if (locked < totalDebit) throw new ConflictException('Send reservation is smaller than the pending debit; manual ledger review is required.');
        const txClaim = await prisma.transaction.updateMany({
          where: { id: tx.id, status: 'PENDING' },
          data: { status: 'COMPLETED', metadata },
        });
        if (txClaim.count !== 1) return false;
        await prisma.wallet.update({ where: { id: wallet.id }, data: { lockedBalance: { decrement: totalDebit } } });
        return true;
      });
      if (!claimed) throw new ConflictException('Another reconciliation worker already claimed this send.');
      return { reference, status: 'COMPLETED', resolutionEvidence };
    }

    await this.releaseReservedSend(wallet.id, reference, totalDebit, {
      providerState: 'FAILED_CONFIRMED_BY_OPERATOR',
      reconciliationRequired: false,
      reconciliationEvidence: resolutionEvidence,
      resolvedByOperator: true,
    });
    const final = await this.prisma.transaction.findUnique({ where: { reference } });
    if (final?.status !== 'FAILED') {
      throw new ConflictException('The send could not be atomically refunded; it remains pending for reconciliation.');
    }
    return { reference, status: 'FAILED', resolutionEvidence };
  }

  /**
   * Release funds reserved for a send the chain rejected. Safe to call twice:
   * if the webhook or history sync already settled this row the status is no
   * longer PENDING and nothing is released — releasing twice would create
   * balance out of nothing.
   */
  private async releaseReservedSend(
    walletId: string,
    reference: string,
    totalDebit: number,
    meta: Record<string, unknown>,
  ) {
    try {
      await this.prisma.$transaction(async (prisma) => {
        const tx = await prisma.transaction.findUnique({
          where: { reference },
          select: { id: true, status: true, metadata: true },
        });
        if (!tx || tx.status !== 'PENDING') return;

        // Claim the pending row before touching the wallet. A webhook/history
        // settlement racing this operation must observe a terminal row and
        // skip its own release; any later error rolls this claim back with the
        // wallet and ledger changes.
        const claimed = await prisma.transaction.updateMany({
          where: { id: tx.id, status: 'PENDING' },
          data: { status: 'FAILED', metadata: { ...((tx.metadata as Record<string, unknown>) || {}), ...meta } as any },
        });
        if (claimed.count !== 1) return;

        const walletRow = await prisma.wallet.findUnique({
          where: { id: walletId },
          select: { lockedBalance: true },
        });
        const lockedBalance = Number(walletRow?.lockedBalance || 0);
        // Never turn a partial reservation into a terminal failure. A missing
        // or undersized lock means the wallet and ledger need operator review;
        // throwing here rolls back the whole transaction and leaves the send
        // pending for reconciliation.
        if (!walletRow || !Number.isFinite(lockedBalance) || lockedBalance < totalDebit) {
          throw new Error(`Reservation mismatch for ${reference}: locked=${lockedBalance}, required=${totalDebit}`);
        }
        const release = totalDebit;
        if (release > 0) {
          // Restore the exact currencies the reservation took (legacy rows have
          // no reserveSplit — they were 100% USDC).
          const reserveSplit = (tx.metadata as any)?.reserveSplit;
          const refundUsdt = reserveSplit
            ? Math.min(Math.max(0, Number(reserveSplit.usdt) || 0), release)
            : 0;
          await prisma.wallet.update({
            where: { id: walletId },
            data: {
              lockedBalance: { decrement: release },
              usdcBalance: { increment: release - refundUsdt },
              usdtBalance: { increment: refundUsdt },
            },
          });
        }

        // Undo the initiation debit in the double-entry ledger. The guarded
        // conditional claim above means a refund that was already settled here
        // can never reverse the ledger twice. If the float could only be
        // partially refunded (anomalous lockedBalance), do NOT reverse the full
        // ledger — that would fabricate a bigger refund than the wallet actually
        // received; reconciliation will flag the anomaly.
        if (release > 0 && release >= totalDebit) {
          await this.ledger.reverse(reference, prisma);
        } else if (release < totalDebit) {
          this.logger.warn(`Partial release for ${reference}: ${release}/${totalDebit} — ledger reversal skipped`);
        }

        const current = (tx.metadata as Record<string, unknown>) || {};
        await prisma.transaction.update({
          where: { reference },
          data: { status: 'FAILED', metadata: { ...current, ...meta, releasedAmount: release } as any },
        });
      });
    } catch (err: any) {
      // A stuck reservation is recoverable by reconciliation, but it must never
      // turn into a second attempt at the same send. The guarded transaction
      // rolled back, so leave the row pending and make the manual action
      // explicit rather than pretending the refund succeeded.
      this.logger.error(`Failed to release reserved send ${reference}: ${err.message}`);
      await this.markSendForReconciliation(reference, {
        providerState: 'REFUND_FAILED_REQUIRES_RECONCILIATION',
        reconciliationRequired: true,
        reconciliationMessage: String(err.message || err).slice(0, 500),
      });
    }
  }

  // Native same-chain USDC transfer on Arc (no bridge required). Uses Circle's
  // developer transfer endpoint. The transaction is initiated and then finalized
  // on-chain by Circle; we surface the Circle transaction id + initialState.
  private async sendNativeArcTransfer(
    userId: string,
    sourceAddress: string,
    destAddress: string,
    amount: number,
    reference: string,
  ) {
    const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
    });
    const publicKeyPem = pubKeyResponse.data.data.publicKey;
    const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

    const digest = crypto.createHash('sha256').update(`surexend:send:${reference}`).digest('hex');
    const providerIdempotencyKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const body = {
      // Stable for this committed send reference. If the HTTP response is lost,
      // an operator can safely query/replay the exact Circle request rather than
      // creating a second transfer with a fresh UUID.
      idempotencyKey: providerIdempotencyKey,
      entitySecretCiphertext: ciphertext,
      walletAddress: sourceAddress,
      blockchain: this.arcBlockchainName(),
      tokenAddress: this.arcUsdcTokenAddress(),
      destinationAddress: destAddress,
      // Circle exposes refId in transaction/webhook payloads. Keep the local
      // send reference attached to the provider object in addition to the
      // UUIDv4 idempotency key so a lost response can be reconciled without
      // matching only by amount or address.
      refId: reference,
      amounts: [amount.toFixed(6).replace(/\.?0+$/, '')],
      feeLevel: 'MEDIUM',
    };

    this.logger.log(`Initiating native Arc transfer: ${amount} USDC ${sourceAddress} -> ${destAddress}`);

    try {
      const res = await axios.post(
        `${this.baseUrl}/v1/w3s/developer/transactions/transfer`,
        body,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
        }
      );
      const tx = res.data?.data;
      this.logger.log(`Native Arc transfer tx ${tx?.id} state ${tx?.state}`);
      return { state: tx?.state, txId: tx?.id, txHashes: [] };
    } catch (err: any) {
      this.logger.error(`Native Arc transfer rejected for ${userId}: ${err?.response?.data?.message || err?.message}`);
      throw err;
    }
  }
}

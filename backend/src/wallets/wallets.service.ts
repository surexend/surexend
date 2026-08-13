import { Injectable, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CctpService } from './cctp.service';
import { DepositMonitorService } from './deposit-monitor.service';
import { getLocalRate } from '../common/currency.constants';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WalletsService implements OnModuleInit {
  private readonly logger = new Logger(WalletsService.name);
  private apiKey: string;
  private entitySecret: string;
  private walletSetId: string;
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private transactionsService: TransactionsService,
    private cctpService: CctpService,
    private depositMonitor: DepositMonitorService,
  ) {
    this.apiKey = this.configService.get<string>('app.circle.apiKey') || '';
    this.entitySecret = this.configService.get<string>('app.circle.entitySecret');
    this.walletSetId = this.configService.get<string>('app.circle.walletSetId');
    this.baseUrl = 'https://api.circle.com';
    this.logger.log(`Circle API initialized: ${this.baseUrl}`);
  }

  // On boot, ensure EVERY EVM address this app displays (any network, any user)
  // also exists in Circle as an ARC-TESTNET wallet. Circle only indexes deposits
  // on chains where it holds a wallet at that exact address, so without this a
  // base/Polygon deposit that lands on Arc stays invisible to the Circle console
  // and to wallet feeds. Uses the `derive by address` endpoint, which creates an
  // ARC wallet at a pre-existing address (unlike create, which only ever yields
  // freshly-derived addresses).
  async onModuleInit() {
    try {
      await this.ensureAllAddressesHaveArcWallets();
    } catch (err: any) {
      this.logger.error(`automatic ARC wallet registration failed: ${err.message}`);
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
    const existing = await this.getCircleWalletByAddress(address, 'ARC-TESTNET');
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
          'Idempotency-Key': crypto.randomUUID(),
        },
      }
    );
    const w = res.data.data.wallet;
    this.logger.log(`Derived ARC-TESTNET wallet at ${w.address} (${w.id})`);
    return 'registered';
  }

  // Spendable USDC = gross on-chain USDC minus the CONVERT ledger (conversions
  // out of USD are bookkeeping with no chain movement, so they reduce what is
  // actually spendable). Mirrors the netting done in getBalance so sends and
  // the balance screen always agree.
  private async computeSpendableUsdc(userId: string, wallet: any, amount: number): Promise<number> {
    let spendable = wallet.usdcBalance || 0;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ kind: string; total: number }>>(
        `SELECT kind, COALESCE(SUM(total), 0)::float8 AS total FROM (
           SELECT 'out' AS kind, amount::float8 AS total
             FROM "Transaction"
            WHERE "userId" = $1 AND type = 'CONVERT' AND status = 'COMPLETED'
              AND (metadata->>'from' = 'USD')
           UNION ALL
           SELECT 'in', COALESCE((metadata->>'toAmount')::float8, 0)
             FROM "Transaction"
            WHERE "userId" = $1 AND type = 'CONVERT' AND status = 'COMPLETED'
              AND (metadata->>'to' = 'USD')
         ) t GROUP BY kind`,
        userId
      );
      const convertedOut = rows.find((r) => r.kind === 'out')?.total || 0;
      const convertedIn = rows.find((r) => r.kind === 'in')?.total || 0;
      if (convertedOut > 0 || convertedIn > 0) {
        spendable = Math.max(0, spendable - convertedOut + convertedIn);
      }
    } catch (err: any) {
      this.logger.error(`Spendable USDC net failed for ${userId}: ${err.message}`);
    }
    return Math.max(0, spendable - (wallet.lockedBalance || 0));
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
    const isTestKey = this.apiKey.startsWith('TEST_');
    const net = network.toUpperCase();
    if (isTestKey) {
      if (net === 'POLYGON') return 'MATIC-AMOY';
      if (net === 'AVALANCHE') return 'AVAX-FUJI';
      if (net === 'ARBITRUM') return 'ARB-SEPOLIA';
      if (net === 'ETHEREUM') return 'ETH-SEPOLIA';
      if (net === 'BASE') return 'BASE-SEPOLIA';
      if (net === 'OPTIMISM') return 'OP-SEPOLIA';
      if (net === 'SOLANA') return 'SOL-DEVNET';
      if (net === 'BSC' || net === 'BEP20') return 'EVM-TESTNET';
      if (net === 'ARC') return 'ARC-TESTNET';
    } else {
      if (net === 'POLYGON') return 'POLYGON';
      if (net === 'AVALANCHE') return 'AVAX';
      if (net === 'ARBITRUM') return 'ARB';
      if (net === 'ETHEREUM') return 'ETH';
      if (net === 'BASE') return 'BASE';
      if (net === 'OPTIMISM') return 'OP';
      if (net === 'SOLANA') return 'SOL';
      if (net === 'BSC' || net === 'BEP20') return 'EVM';
      if (net === 'ARC') return 'ARC';
    }
    return net;
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
    const usdtBalance = wallet.usdtBalance || 0;

    this.depositMonitor.reconcileWallet(userId, wallet.id).catch((err: any) => {
      this.logger.error(`Background balance reconcile failed for ${userId}: ${err.message}`);
    });
    this.syncCircleHistory(userId, wallet.id).catch((err: any) => {
      this.logger.error(`Background Circle history sync failed for ${userId}: ${err.message}`);
    });

    // Wallet balances reflect on-chain deposits/sends; conversions out of USD
    // (USDC â†' local currency) are bookkeeping with no chain movement, so the
    // reconciled on-chain total must be net of the CONVERT ledger to show only
    // spendable USD.
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ kind: string; total: number }>>(
        `SELECT kind, COALESCE(SUM(total), 0)::float8 AS total FROM (
           SELECT 'out' AS kind, amount::float8 AS total
             FROM "Transaction"
            WHERE "userId" = $1 AND type = 'CONVERT' AND status = 'COMPLETED'
              AND (metadata->>'from' = 'USD')
           UNION ALL
           SELECT 'in', COALESCE((metadata->>'toAmount')::float8, 0)
             FROM "Transaction"
            WHERE "userId" = $1 AND type = 'CONVERT' AND status = 'COMPLETED'
              AND (metadata->>'to' = 'USD')
         ) t GROUP BY kind`,
        userId
      );
      const convertedOut = rows.find((r) => r.kind === 'out')?.total || 0;
      const convertedIn = rows.find((r) => r.kind === 'in')?.total || 0;
      if (convertedOut > 0 || convertedIn > 0) {
        const ledgerNet = Math.max(0, usdcBalance - convertedOut + convertedIn);
        this.logger.log(`USD ledger for ${userId}: gross=${usdcBalance} out=${convertedOut} in=${convertedIn} spendable=${ledgerNet}`);
        usdcBalance = ledgerNet;
      }
    } catch (err: any) {
      this.logger.error(`USD ledger net failed: ${err.message}`);
    }

    // Sync real deposit/withdrawal history from Circle so the transactions page
    // also reflects the activity Circle tracks natively. Idempotent and scoped
    // to each address, so it never duplicates on-chain-synced records.
    try {
      await this.syncCircleHistory(userId, wallet.id);
    } catch (err: any) {
      this.logger.error('Error syncing Circle history:', err.message);
    }

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

    const ngnBalance = localBalances['NGN'] || 0;

    return {
      usdBalance: usdVal,
      ngnBalance,
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
          const amount = parseFloat((tx.amounts || [])[0]);
          if (!amount || amount <= 0) continue;

          // Scope to THIS address: the wallet feed can surface activity for other
          // addresses in the entity, and without this check the same inbound tx
          // would be recorded once per shared-EVM-address record.
          if (
            tx.transactionType === 'INBOUND' &&
            tx.destinationAddress &&
            tx.destinationAddress.toLowerCase() !== addressRecord.address.toLowerCase()
          ) continue;

          const symbol = symbolByTokenId.get(tx.tokenId) || 'USDC';
          const type = tx.transactionType === 'OUTBOUND' ? 'SEND' : 'RECEIVE';

          const state = (tx.state || '').toUpperCase();
          if (state !== 'COMPLETE' && state !== 'COMPLETED' && state !== 'FAILED') continue;

          const isFailed = state === 'FAILED';
          const status = isFailed ? 'FAILED' : 'COMPLETED';
          // Dedupe by txHash across every network record (on-chain monitor uses
          // RECV-ONCHAIN-<chain>-<txHash>; this uses the network label) so the
          // same on-chain tx is never listed twice in history.
          const reference = `${type === 'RECEIVE' ? 'RECV' : 'SEND'}-${addressRecord.network}-${tx.txHash}`;

          const existing = await this.prisma.transaction.findUnique({
            where: { reference }
          });
          if (existing) continue;

          const alreadyByHash = await this.prisma.transaction.findFirst({
            where: { userId, metadata: { path: ['txHash'], equals: tx.txHash } }
          });
          if (alreadyByHash) continue;

          await this.prisma.transaction.create({
            data: {
              userId,
              type,
              status,
              amount,
              fee: parseFloat(tx.networkFee || '0') || 0,
              currency: symbol,
              reference,
              metadata: {
                network: addressRecord.network,
                txHash: tx.txHash,
                circleTransactionId: tx.id,
                destinationAddress: tx.destinationAddress,
                sourceAddress: tx.sourceAddress,
                ...(isFailed ? { errorReason: tx.errorCode || tx.errorMessage || 'Transaction failed on Circle.', failedAt: 'circle-sync' } : {})
              },
              createdAt: new Date(tx.createDate)
            }
          });
          this.logger.log(`Synced Circle ${type} history: ${amount} ${symbol} on ${addressRecord.network} (${tx.txHash}) status=${status}`);
          }
        } catch (err: any) {
          this.logger.error(`syncCircleHistory failed for ${addressRecord.address}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error('Error syncing Circle transaction history:', err.message);
    }
  }

  async getDepositAddress(userId: string, network: string) {
    const validNetworks = ['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20', 'ARC'];
    if (!validNetworks.includes(network.toUpperCase())) {
      throw new BadRequestException('Invalid network. Supported: POLYGON, AVALANCHE, ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, BSC, BEP20, ARC');
    }

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
              idempotencyKey: crypto.randomUUID(),
              blockchains: ['ARC-TESTNET'],
              entitySecretCiphertext: ciphertext,
              walletSetId: this.walletSetId,
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
          walletAddress = await this.prisma.walletAddress.create({
            data: {
              walletId: wallet.id,
              network: 'ARC',
              address: circleWallet.address,
            }
          });
        } catch (err: any) {
          // Fallback: Circle API rejected ARC-TESTNET (e.g. not available on this
          // key). Reuse the existing EVM address so deposit addresses keep working.
          this.logger.warn(`ARC-TESTNET wallet creation failed; reusing EVM address: ${err.message}`);
          const evmAddressRecord = await this.prisma.walletAddress.findFirst({
            where: {
              walletId: wallet.id,
              network: { in: ['ETHEREUM', 'POLYGON', 'ARBITRUM', 'BASE', 'OPTIMISM', 'BSC', 'BEP20', 'AVALANCHE'] }
            }
          });

          let address = '';
          if (evmAddressRecord) {
            address = evmAddressRecord.address;
          } else {
            const ethWalletRecord = await this.getDepositAddress(userId, 'ETHEREUM');
            address = ethWalletRecord.address;
          }

          walletAddress = await this.prisma.walletAddress.create({
            data: {
              walletId: wallet.id,
              network: 'ARC',
              address
            }
          });
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
              idempotencyKey: crypto.randomUUID(),
              blockchains: [blockchain],
              entitySecretCiphertext: ciphertext,
              walletSetId: this.walletSetId,
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
          
          walletAddress = await this.prisma.walletAddress.create({
            data: {
              walletId: wallet.id,
              network: network.toUpperCase(),
              address: circleWallet.address,
            }
          });
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

    // Newly-created Circle address: make sure Circle also holds an ARC-TESTNET
    // wallet at this exact address so Arc-side deposits stay visible on console.
    // Fire-and-forget; a failure here must not block address generation.
    this.ensureArcWalletAtAddress(walletAddress.address, userId).catch((err: any) => {
      this.logger.warn(`ARC coverage for new address ${walletAddress.address} failed: ${err.message}`);
    });

    return { network: walletAddress.network, address: walletAddress.address };
  }

  async sendCrypto(userId: string, toAddress: string, amount: number, network: string, destinationNetwork?: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    // Explicit select so a not-yet-migrated localBalances column can't 500 this endpoint
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, lockedBalance: true, usdcBalance: true }
    });

    // All funds sit on Arc (native USDC), regardless of where the recipient's
    // wallet is. The picked network is the DESTINATION chain; CCTP bridges
    // automatically — no separate destination step needed.
    return this.sendCrossChainFromArc(userId, wallet, toAddress, amount, network.toUpperCase());
  }

  async getNetworks() {
    return [
      { id: 'POLYGON', name: 'Polygon', fee: 0.0 },
      { id: 'AVALANCHE', name: 'Avalanche', fee: 0.0 },
      { id: 'ARBITRUM', name: 'Arbitrum', fee: 0.0 },
      { id: 'ETHEREUM', name: 'Ethereum', fee: 0.0 }
    ];
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
    if (destNet === 'ARC') {
      throw new BadRequestException('Same-chain Arc transfers are not supported. Choose a destination network such as POLYGON, BASE, OPTIMISM, SOLANA.');
    }

    const destChain = this.cctpService.getDestinationChain(destNet);

    // Same spendable figure the app shows: gross on-chain USDC, net of the
    // CONVERT ledger (conversions out of USD reduce spendable without any chain
    // movement). Fail fast with a clear message instead of a Circle rejection.
    const spendable = await this.computeSpendableUsdc(userId, wallet, amount);
    if (spendable < amount) {
      const reason = `Insufficient balance. You can send up to ${spendable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC.`;
      await this.transactionsService.createTransaction(this.prisma, {
        userId,
        type: 'SEND',
        status: 'FAILED',
        amount,
        fee: 0,
        currency: 'USDC',
        reference: `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: true,
          errorReason: reason,
          failedAt: 'send-initiation'
        }
      });
      throw new BadRequestException(reason);
    }

    const sourceAddressRecord = await this.prisma.walletAddress.findFirst({
      where: { walletId: wallet.id, network: 'ARC' }
    });
    if (!sourceAddressRecord) {
      throw new BadRequestException('Please generate an Arc deposit address first.');
    }

    const reference = `TX-${Date.now()}-${Math.floor(Math.random()*1000)}`;

    let result: any;
    try {
      result = await this.cctpService.bridge({
        sourceNetwork: 'ARC',
        sourceAddress: sourceAddressRecord.address,
        destNetwork: destNet,
        recipientAddress: toAddress,
        amount,
      });
    } catch (err: any) {
      const reason = err?.response?.data?.message
        || err?.message
        || 'Cross-chain transfer failed on Arc.';
      await this.transactionsService.createTransaction(this.prisma, {
        userId,
        type: 'SEND',
        status: 'FAILED',
        amount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: true,
          errorReason: reason,
          failedAt: 'cctp-rejection'
        }
      });
      this.logger.error(`CCTP rejected transfer ${reference}: ${reason}`);
      throw new BadRequestException(reason);
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          usdcBalance: { decrement: amount },
          lockedBalance: { increment: amount }
        }
      });

      await this.transactionsService.createTransaction(prisma, {
        userId,
        type: 'SEND',
        status: 'PENDING',
        amount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          toAddress,
          network: 'ARC',
          destinationNetwork: destNet,
          cctp: true,
          cctpState: result.state,
          cctpTxHashes: result.txHashes || [],
        }
      });
    });

    return { message: 'Cross-chain transfer initiated successfully via CCTP' };
  }
}

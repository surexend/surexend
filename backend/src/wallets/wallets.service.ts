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
  // Per-wallet timestamp of the last full Circle history sync (see
  // syncCircleHistory) so background refreshes don't re-sweep on every page load.
  private lastCircleSyncAt: Map<string, number> = new Map();

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
      if (net === 'MONAD') return 'MONAD-TESTNET';
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
      if (net === 'MONAD') return 'MONAD';
    }
    return net;
  }

  // Reverse of getBlockchainName(): map a Circle blockchain value from the tx
  // feed (e.g. "ARC-TESTNET", "ETH-SEPOLIA") back to the app's network label so
  // history/explorer links point at the right chain regardless of which address
  // record is being iterated. Returns undefined for unknown values.
  private getNetworkFromBlockchain(blockchain: string): string | undefined {
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
          if (existing) continue;

          const alreadyByHash = await this.prisma.transaction.findFirst({
            where: { userId, metadata: { path: ['txHash'], equals: tx.txHash } }
          });
          if (alreadyByHash) continue;

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
          // CCTP the burn's destination is the bridge contract, so fall back to
          // the txHash the pending row already recorded (from bridge steps) or a
          // recent PENDING send of the same amount. Fail open if nothing matches.
          if (type === 'SEND') {
            const pendingWhere: any = {
              userId,
              type: 'SEND',
              status: 'PENDING',
              createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
            };
            if (!isCctpStep && amount > 0) pendingWhere.amount = amount;

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
            }) || candidates[0];

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
                await prisma.wallet.update({
                  where: { userId: pendingMatch.userId },
                  data:
                    status === 'FAILED'
                      ? {
                          usdcBalance: { increment: totalLocked },
                          lockedBalance: { decrement: totalLocked },
                        }
                      : { lockedBalance: { decrement: totalLocked } },
                });

                await prisma.transaction.update({
                  where: { id: pendingMatch.id },
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

  async getDepositAddress(userId: string, network: string) {
    const validNetworks = ['POLYGON', 'AVALANCHE', 'ARBITRUM', 'ETHEREUM', 'BASE', 'OPTIMISM', 'SOLANA', 'BSC', 'BEP20', 'ARC', 'MONAD'];
    if (!validNetworks.includes(network.toUpperCase())) {
      throw new BadRequestException('Invalid network. Supported: POLYGON, AVALANCHE, ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, BSC, BEP20, ARC, MONAD');
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
          delivery: destNet === 'ARC' ? 'native' : 'cctp',
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
    let fee = 0;
    try {
      if (destNet === 'ARC') {
        result = await this.sendNativeArcTransfer(
          userId,
          sourceAddressRecord.address,
          toAddress,
          amount,
        );
      } else {
        // Circle's CCTP forwarder deducts a dynamic relay fee from the minted
        // USDC, so the recipient would otherwise receive amount - fee. Burn
        // amount + fee so the recipient nets the full amount, and debit the
        // fee from the sender's balance so it is transparent.
        fee = await this.cctpService.estimateFee({
          sourceNetwork: 'ARC',
          sourceAddress: sourceAddressRecord.address,
          destNetwork: destNet,
          recipientAddress: toAddress,
          amount,
        });
        if (spendable < amount + fee) {
          const reason = `Insufficient balance. This send needs ${(amount + fee).toFixed(2)} USDC including a ${fee.toFixed(2)} USDC cross-chain network fee.`;
          throw new BadRequestException(reason);
        }
        result = await this.cctpService.bridge({
          sourceNetwork: 'ARC',
          sourceAddress: sourceAddressRecord.address,
          destNetwork: destNet,
          recipientAddress: toAddress,
          amount: amount + fee,
        });
      }
    } catch (err: any) {
      const reason = err?.response?.data?.message
        || err?.message
        || 'Transfer failed on Arc.';
      const delivery = destNet === 'ARC' ? 'native' : 'cctp';
      await this.transactionsService.createTransaction(this.prisma, {
        userId,
        type: 'SEND',
        status: 'FAILED',
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
          errorReason: reason,
          failedAt: 'circle-rejection'
        }
      });
      this.logger.error(`Transfer rejected ${reference} (${delivery}): ${reason}`);
      throw new BadRequestException(reason);
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          usdcBalance: { decrement: amount + fee },
          lockedBalance: { increment: amount + fee }
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
          cctp: destNet !== 'ARC',
          delivery: destNet === 'ARC' ? 'native' : 'cctp',
          txState: result.state,
          txId: result.txId,
          txHashes: result.txHashes || [],
        }
      });
    });

    return { message: destNet === 'ARC'
      ? 'Arc transfer initiated successfully'
      : 'Cross-chain transfer initiated successfully via CCTP' };
  }

  // Native same-chain USDC transfer on Arc (no bridge required). Uses Circle's
  // developer transfer endpoint. The transaction is initiated and then finalized
  // on-chain by Circle; we surface the Circle transaction id + initialState.
  private async sendNativeArcTransfer(
    userId: string,
    sourceAddress: string,
    destAddress: string,
    amount: number,
  ) {
    const pubKeyResponse = await axios.get(`${this.baseUrl}/v1/w3s/config/entity/publicKey`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
    });
    const publicKeyPem = pubKeyResponse.data.data.publicKey;
    const ciphertext = this.encryptSecret(this.entitySecret, publicKeyPem);

    const body = {
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext: ciphertext,
      walletAddress: sourceAddress,
      blockchain: 'ARC-TESTNET',
      tokenAddress: '0x3600000000000000000000000000000000000000',
      destinationAddress: destAddress,
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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OnchainService, OnChainTransfer, EVM_CHAINS } from './onchain.service';

// Rolling log-scan window (in blocks) used to detect deposits. Scans run every
// 60s, so any deposit necessarily falls inside a window covering the recent
// history. 150k blocks comfortably spans the gap between scans on every chain.
const SCAN_WINDOW_BLOCKS = 150_000;
// Log scanning is throttled per wallet (60s) so frequent balance refreshes
// don't hammer public RPC endpoints. Balances are always read live.
const LOG_SCAN_COOLDOWN_MS = 60_000;
// Individual wallet reconciles are expensive (every address x every monitored
// chain), so a background reconcile kicked from getBalance is skipped if one
// already ran within this window. The scheduled scan runs every 60s regardless,
// so the DB figures never go stale; this only prevents page-loads from
// re-fanning out dozens of RPC calls back-to-back.
const RECONCILE_COOLDOWN_MS = 30_000;

@Injectable()
export class DepositMonitorService implements OnModuleInit {
  private readonly logger = new Logger(DepositMonitorService.name);
  private isScanning = false;
  private lastSeenBlockByChain: Map<string, number> = new Map();
  private lastLogScanAt: Map<string, number> = new Map();
  // Tracks the last time each wallet was fully reconciled, so a getBalance
  // background refresh within the cooldown window short-circuits instead of
  // re-fanning out every address x every chain RPC call again.
  private lastReconcileAt: Map<string, number> = new Map();
  // In-flight guard per wallet so the background reconcile kicked from
  // getBalance and the scheduled scan never run concurrently for the same
  // wallet (they'd both fan out the same RPC calls and double-write balance).
  private reconciling = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private onchain: OnchainService,
    private notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    // Warm the last-seen block per chain so the first scheduled scan only looks
    // at the recent window instead of an enormous range.
    await Promise.all(
      EVM_CHAINS.map(async (chain) => {
        try {
          const latest = await this.onchain.getLatestBlock(chain);
          this.lastSeenBlockByChain.set(chain.key, latest);
        } catch (err: any) {
          this.logger.warn(`onModuleInit: cannot reach ${chain.key}: ${err.message}`);
        }
      }),
    );
    this.logger.log('DepositMonitorService initialized');
  }

  // Reconcile every wallet against live on-chain balances on a schedule so the
  // DB figures (and therefore the app) are fresh even without a page refresh.
  @Interval(60000)
  async scheduledScan() {
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      const wallets = await this.prisma.wallet.findMany({ select: { id: true, userId: true } });
      for (const wallet of wallets) {
        try {
          await this.reconcileWallet(wallet.userId, wallet.id);
        } catch (err: any) {
          this.logger.error(`scheduled reconcile failed for ${wallet.userId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`scheduled scan failed: ${err.message}`);
    } finally {
      this.isScanning = false;
    }
  }

  // Reconcile one wallet against live on-chain state:
  //   1. gross USDC balance = sum of USDC held at every EVM address on every
  //      monitored chain (Arc + EVM testnets)
  //   2. detect + record deposits (RECEIVE transaction + in-app notification)
  //   3. backfill notifications for earlier deposits that predate this service
  // Callers: the scheduled scan and getBalance (for an immediate, no-delay view).
  async reconcileWallet(userId: string, walletId: string) {
    if (this.reconciling.has(walletId)) return;
    const last = this.lastReconcileAt.get(walletId) || 0;
    if (Date.now() - last < RECONCILE_COOLDOWN_MS) return;
    this.reconciling.add(walletId);
    try {
      const addressRecords = await this.prisma.walletAddress.findMany({
        where: { walletId },
      });

      const uniqueEthereum = new Set<string>();
      for (const a of addressRecords) {
        if (/^0x[a-fA-F0-9]{40}$/.test(a.address)) uniqueEthereum.add(a.address.toLowerCase());
      }
      if (uniqueEthereum.size === 0) return;

      const addresses = Array.from(uniqueEthereum);
      let grossUsdc = 0;

      // Deposit-log scanning is throttled per wallet; balances are always fresh.
      const scanLogs = this.shouldScanLogs(walletId);
      const chains = [...EVM_CHAINS];
      const results = await Promise.all(
        addresses.flatMap((addr) =>
          chains.map(async (chain): Promise<{ addr: string; chainKey: string; balance: number; transfers: OnChainTransfer[] }> => {
            let balance = 0;
            let transfers: OnChainTransfer[] = [];
            try {
              balance = await this.onchain.getUsdcBalance(chain, addr);
              if (scanLogs) transfers = await this.scanTransfers(chain.key, addr);
            } catch (err: any) {
              this.logger.warn(`reconcile ${chain.key} ${addr} failed: ${err.message}`);
            }
            return { addr, chainKey: chain.key, balance, transfers };
          }),
        ),
      );

      for (const r of results) grossUsdc += r.balance;

      // Persist deposits discovered in the log window (idempotent, deduped by hash).
      for (const r of results) {
        for (const tx of r.transfers) {
          await this.recordDeposit(userId, tx);
        }
      }

      // Update the gross USDC balance from live on-chain state. getBalance()
      // layers the CONVERT ledger on top to compute spendable USD.
      await this.prisma.wallet.update({
        where: { id: walletId },
        data: { usdcBalance: grossUsdc },
      });

      await this.backfillDepositNotifications(userId);

      this.lastReconcileAt.set(walletId, Date.now());
      return grossUsdc;
    } finally {
      this.reconciling.delete(walletId);
    }
  }

  // Scan the recent log window on a chain for transfers to any of the user's
  // addresses, keeping track of the furthest block we've examined so repeated
  // scans never miss a deposit and don't re-read ancient history every time.
  private shouldScanLogs(walletId: string): boolean {
    const now = Date.now();
    const last = this.lastLogScanAt.get(walletId) || 0;
    if (now - last >= LOG_SCAN_COOLDOWN_MS) {
      this.lastLogScanAt.set(walletId, now);
      return true;
    }
    return false;
  }

  private async scanTransfers(chainKey: string, address: string) {
    const chain = this.onchain.getChainByKey(chainKey);
    if (!chain) return [];

    let toBlock: number;
    let fromBlock: number;
    try {
      toBlock = await this.onchain.getLatestBlock(chain);
    } catch {
      return [];
    }
    const last = this.lastSeenBlockByChain.get(chainKey);
    if (last === undefined || toBlock < last) {
      // First scan for this chain: look at a generous window so recent deposits
      // that predate the service's start are still caught.
      fromBlock = Math.max(0, toBlock - SCAN_WINDOW_BLOCKS);
    } else {
      fromBlock = last + 1;
    }

    if (toBlock < fromBlock) return [];
    const transfers = await this.onchain.getTransfersTo(chain, address, fromBlock, toBlock);
    if (toBlock > last) this.lastSeenBlockByChain.set(chainKey, toBlock);
    return transfers;
  }

  private async recordDeposit(userId: string, tx: OnChainTransfer) {
    const reference = `RECV-ONCHAIN-${tx.chainKey}-${tx.txHash}`;
    let existing = await this.prisma.transaction.findUnique({
      where: { reference },
    });
    // The same on-chain tx may already be recorded under an earlier scheme
    // (e.g. RECV-ARC-<hash> from the legacy listener or a Circle sync). Never
    // create a second row for the same txHash; notifications for it are handled
    // by the backfill pass, which keys off txHash/reference.
    if (!existing) {
      existing = await this.prisma.transaction.findFirst({
        where: { userId, metadata: { path: ['txHash'], equals: tx.txHash } },
      });
    }
    if (existing) return;

    await this.prisma.transaction.create({
      data: {
        userId,
        type: 'RECEIVE',
        status: 'COMPLETED',
        amount: tx.amount,
        fee: 0,
        currency: 'USDC',
        reference,
        metadata: {
          network: tx.network,
          chainKey: tx.chainKey,
          txHash: tx.txHash,
          sourceAddress: tx.from,
          destinationAddress: tx.to,
          blockNumber: tx.blockNumber,
          detectedBy: 'onchain-monitor',
        },
        createdAt: new Date(tx.timestamp * 1000),
      },
    });
    this.logger.log(`Detected deposit: ${tx.amount} USDC on ${tx.network} (${tx.txHash})`);
  }

  // Ensure every completed RECEIVE transaction has a matching in-app DEPOSIT
  // notification. Existing deposits created before this service shipped (and
  // Circle-synced ones) currently have history but no bell-drawer notification.
  private async backfillDepositNotifications(userId: string) {
    const receives = await this.prisma.transaction.findMany({
      where: { userId, type: 'RECEIVE', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    for (const t of receives) {
      const meta = (t.metadata || {}) as Record<string, any>;
      const txHash = meta.txHash;
      const network = meta.network || 'ARC';
      const refOrHash: any[] = [{ data: { path: ['reference'], equals: t.reference } }];
      if (txHash) refOrHash.push({ data: { path: ['txHash'], equals: txHash } });
      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: 'DEPOSIT',
          OR: refOrHash,
        },
      });
      if (alreadyNotified) continue;

      try {
        await this.notifications.createNotification(userId, {
          title: 'Deposit Received',
          body: `Successfully received +${t.amount} USDC on ${network}.`,
          type: 'DEPOSIT',
          data: { amount: t.amount, currency: t.currency, network, txHash, reference: t.reference },
        });
        this.logger.log(`Backfilled deposit notification for ${t.reference}`);
      } catch (err: any) {
        this.logger.error(`Notification backfill failed for ${t.reference}: ${err.message}`);
      }
    }
  }
}

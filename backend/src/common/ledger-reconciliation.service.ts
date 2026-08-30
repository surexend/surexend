import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { roundTo, decimalsFor } from './money';

interface DriftRow {
  account: string;
  currency: string;
  ledgerMinor: string;
  ledger: number;
  legacy: number;
}

@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  @Cron('0 * * * *')
  async reconcile() {
    const accounts = await this.prisma.ledgerEntry.findMany({
      distinct: ['account', 'currency'],
      select: { account: true, currency: true },
    });
    const drift: DriftRow[] = [];
    for (const { account, currency } of accounts) {
      const balance = await this.ledger.balanceOf(account, currency);
      const match = account.match(/^user:([^:]+):(.+)$/);
      if (!match) continue;
      const wallet = await this.prisma.wallet.findUnique({
        where: { userId: match[1] },
        select: { usdcBalance: true, usdtBalance: true, localBalances: true, localBalance: true },
      });
      let legacy: number | undefined;
      if (wallet) {
        if (currency === 'USDC') legacy = wallet.usdcBalance;
        else if (currency === 'USDT') legacy = wallet.usdtBalance;
        else {
          const parsed = wallet.localBalances as any;
          const locals = parsed && typeof parsed === 'object' ? parsed : {};
          legacy = locals[currency] ?? (currency === 'NGN' ? wallet.localBalance : undefined);
        }
      }
      if (legacy === undefined) {
        this.logger.warn(`Ledger account ${account} has no matching legacy balance (orphan or new currency)`);
        continue;
      }
      const ledgerFloat = Number(balance) / 10 ** decimalsFor(currency);
      if (Number.isFinite(ledgerFloat) && roundTo(ledgerFloat, currency) !== roundTo(legacy, currency)) {
        drift.push({ account, currency, ledgerMinor: balance.toString(), ledger: ledgerFloat, legacy });
      }
    }
    if (drift.length) {
      const signal = drift.map(d => `${d.account}=${d.ledgerMinor} (legacy ${d.legacy})`).join('; ');
      this.logger.warn(`Ledger drift: ${drift.length} account(s) — ${signal}`);
      await this.persistDrift(drift);
    } else {
      this.logger.log('Ledger reconciliation clean: no drift');
    }
  }

  /**
   * Persist drift to AuditLog (append-only, queryable, alertable) instead of
   * relying on logs alone. A row is only written when the mismatch CHANGES, so
   * a persistent drift does not spam a new row every hour — monitoring sees
   * the first occurrence and any re-drift.
   */
  private async persistDrift(drift: DriftRow[]) {
    for (const d of drift) {
      const metadata = { account: d.account, currency: d.currency, ledgerMinor: d.ledgerMinor, legacy: d.legacy };
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const existing = await this.prisma.auditLog.findFirst({
        where: { action: 'LEDGER_DRIFT', metadata: { equals: metadata }, createdAt: { gte: since } },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.auditLog.create({
        data: { action: 'LEDGER_DRIFT', metadata },
      });
    }
  }
}

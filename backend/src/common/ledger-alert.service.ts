import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

type LedgerAlertConfig = {
  enabled: boolean;
  webhookUrl?: string;
  email?: string;
};

type DriftAlertRow = {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
};

/**
 * Delivers persisted LEDGER_DRIFT alerts. AuditLog is the durable source of
 * drift events, while LedgerAlertDelivery is the durable per-channel outbox:
 * a timeout or process restart leaves a PENDING/RETRY row that a later cron
 * tick can deliver. Alert failure is intentionally isolated from money paths.
 */
@Injectable()
export class LedgerAlertService {
  private readonly logger = new Logger(LedgerAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/15 * * * *')
  async checkForDrift() {
    const cfg = this.config.get('app.ledger.alerts') as LedgerAlertConfig;
    if (!cfg?.enabled) return;

    let rows: DriftAlertRow[] = [];
    try {
      rows = await this.prisma.auditLog.findMany({
        where: { action: 'LEDGER_DRIFT' },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, action: true, metadata: true, createdAt: true },
      });
    } catch (err: any) {
      this.logger.error(`Ledger drift watcher query failed: ${err?.message || err}`);
      return;
    }
    if (!rows.length) return;

    const channels = [
      ...(cfg.webhookUrl ? ['WEBHOOK'] : []),
      ...(cfg.email ? ['EMAIL'] : []),
    ];
    if (!channels.length) {
      // Keep the no-destination behavior explicit. The audit rows remain the
      // durable record and platform log shipping can still page on this line.
      this.logger.error(`SureXend LEDGER_DRIFT: ${rows.length} row(s) require operator review; no alert destination is configured.`);
      return;
    }

    for (const row of rows) {
      for (const channel of channels) {
        try {
          await this.prisma.ledgerAlertDelivery.upsert({
            where: { auditLogId_channel: { auditLogId: row.id, channel } },
            create: { auditLogId: row.id, channel },
            // Never reset RETRY or DELIVERED state when the watcher rediscovers
            // an old AuditLog row.
            update: {},
          });
        } catch (err: any) {
          this.logger.error(`Could not enqueue ledger drift alert ${row.id}/${channel}: ${err?.message || err}`);
        }
      }
    }

    let deliveries: Array<{
      id: string;
      channel: string;
      attempts: number;
      auditLog: DriftAlertRow;
    }> = [];
    try {
      deliveries = await this.prisma.ledgerAlertDelivery.findMany({
        where: {
          status: { in: ['PENDING', 'RETRY'] },
          nextAttemptAt: { lte: new Date() },
          auditLog: { action: 'LEDGER_DRIFT' },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 100,
        include: { auditLog: { select: { id: true, action: true, metadata: true, createdAt: true } } },
      });
    } catch (err: any) {
      this.logger.error(`Ledger drift delivery queue query failed: ${err?.message || err}`);
      return;
    }

    if (deliveries.length) {
      const pendingRows = new Map(deliveries.map((delivery) => [delivery.auditLog.id, delivery.auditLog]));
      const details = [...pendingRows.values()].map((row) => this.formatDetails(row)).join('\n');
      this.logger.error(`SureXend LEDGER_DRIFT delivery pending: ${pendingRows.size} row(s)\n${details}`);
    }

    for (const delivery of deliveries) {
      await this.deliver(delivery, cfg);
    }
  }

  private formatDetails(row: DriftAlertRow) {
    const metadata = (row.metadata || {}) as { account?: string; currency?: string; ledgerMinor?: string; legacy?: number };
    return `${metadata.account || '?'}:${metadata.currency || '?'} ledger=${metadata.ledgerMinor ?? '?'} legacy=${metadata.legacy ?? '?'}`;
  }

  private async deliver(
    delivery: { id: string; channel: string; attempts: number; auditLog: DriftAlertRow },
    cfg: LedgerAlertConfig,
  ) {
    const subject = 'SureXend LEDGER_DRIFT requires operator review';
    const row = delivery.auditLog;
    const details = this.formatDetails(row);
    const payload = {
      event: 'LEDGER_DRIFT',
      count: 1,
      rows: [{ id: row.id, createdAt: row.createdAt, metadata: row.metadata }],
    };

    try {
      if (delivery.channel === 'WEBHOOK') {
        if (!cfg.webhookUrl) throw new Error('webhook destination is not configured');
        await axios.post(cfg.webhookUrl, payload, { timeout: 10_000 });
      } else if (delivery.channel === 'EMAIL') {
        if (!cfg.email) throw new Error('email destination is not configured');
        const key = this.config.get('app.resend.apiKey') as string | undefined;
        const fromEmail = (this.config.get('app.resend.fromEmail') as string) || 'noreply@surexend.com';
        if (!key) throw new Error('RESEND_API_KEY is not configured');
        const { Resend } = await import('resend');
        const resend = new Resend(key);
        const response = await resend.emails.send({
          from: fromEmail,
          to: cfg.email,
          subject,
          text: `${subject}\n\n${details}\n\nInvestigate before any further ledger rollout step.`,
        });
        if ((response as any)?.error) throw new Error(String((response as any).error.message || (response as any).error));
      } else {
        throw new Error(`unsupported alert channel ${delivery.channel}`);
      }

      await this.prisma.ledgerAlertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DELIVERED',
          attempts: { increment: 1 },
          deliveredAt: new Date(),
          lastError: null,
        },
      });
    } catch (err: any) {
      const attempts = Number(delivery.attempts || 0) + 1;
      // Retry at 1, 2, 4, ... minutes, capped at one hour. State is durable,
      // so retries continue after a process restart without an in-memory
      // high-water mark that could silently lose an alert.
      const delayMs = Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.min(attempts - 1, 6));
      const message = String(err?.message || err).slice(0, 1000);
      this.logger.error(`Ledger drift ${delivery.channel} delivery failed for ${row.id}: ${message}`);
      try {
        await this.prisma.ledgerAlertDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'RETRY',
            attempts,
            nextAttemptAt: new Date(Date.now() + delayMs),
            lastError: message,
          },
        });
      } catch (updateError: any) {
        this.logger.error(`Could not persist ledger drift retry ${delivery.id}: ${updateError?.message || updateError}`);
      }
    }
  }
}

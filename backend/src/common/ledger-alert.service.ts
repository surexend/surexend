import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Watches AuditLog for NEW `LEDGER_DRIFT` rows (written by the hourly
 * LedgerReconciliationService, already deduped per account/currency) and
 * raises alerts. Purely additive: with no webhook/email configured the only
 * effect is an error-level log line — no money path is touched, and a failing
 * alert delivery can never break reconciliation.
 *
 * Dedupe is a DB-level AlertLog-free design: we alert the newest unalerted
 * rows each run and mark the high-water point; rows already older than that
 * point are never re-alerted (in-memory per process, plus an idempotent guard
 * by AuditLog id via in-process set).
 */
@Injectable()
export class LedgerAlertService {
  private readonly logger = new Logger(LedgerAlertService.name);
  private lastAlertedAt = new Date(0);
  private alertedIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/15 * * * *')
  async checkForDrift() {
    const cfg = this.config.get('app.ledger.alerts') as {
      enabled: boolean;
      webhookUrl?: string;
      email?: string;
    };
    if (!cfg?.enabled) return;

    let rows: Array<{ id: string; action: string; metadata: unknown; createdAt: Date }> = [];
    try {
      rows = await this.prisma.auditLog.findMany({
        where: { action: 'LEDGER_DRIFT', createdAt: { gt: this.lastAlertedAt } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true, action: true, metadata: true, createdAt: true },
      });
    } catch (err: any) {
      // DB unreachable etc. — never throw out of a cron tick.
      this.logger.error(`Ledger drift watcher query failed: ${err?.message || err}`);
      return;
    }

    const fresh = rows.filter((r) => !this.alertedIds.has(r.id));
    if (!fresh.length) return;

    const details = fresh.map((r) => {
      const m = (r.metadata || {}) as { account?: string; currency?: string; ledgerMinor?: string; legacy?: number };
      return `${m.account || '?'}:${m.currency || '?'} ledger=${m.ledgerMinor ?? '?'} legacy=${m.legacy ?? '?'}`;
    });
    const subject = `SureXend LEDGER_DRIFT: ${fresh.length} new account(s)`;
    const body = details.join('\n');

    this.logger.error(`${subject}\n${body}`);

    if (cfg.webhookUrl) {
      try {
        await axios.post(
          cfg.webhookUrl,
          {
            event: 'LEDGER_DRIFT',
            count: fresh.length,
            rows: fresh.map((r) => ({ id: r.id, createdAt: r.createdAt, metadata: r.metadata })),
          },
          { timeout: 10_000 },
        );
      } catch (err: any) {
        this.logger.error(`Ledger drift webhook delivery failed: ${err?.message || err}`);
      }
    }

    if (cfg.email) {
      try {
        const key = this.config.get('app.resend.apiKey') as string | undefined;
        const fromEmail = (this.config.get('app.resend.fromEmail') as string) || 'noreply@surexend.com';
        if (key) {
          const { Resend } = await import('resend');
          const resend = new Resend(key);
          await resend.emails.send({
            from: fromEmail,
            to: cfg.email,
            subject,
            text: `${subject}\n\n${body}\n\nInvestigate before any further ledger rollout step.`,
          });
        } else {
          this.logger.error(`Ledger drift email to ${cfg.email} skipped: RESEND_API_KEY not configured`);
        }
      } catch (err: any) {
        this.logger.error(`Ledger drift email delivery failed: ${err?.message || err}`);
      }
    }

    // Mark everything delivered (or attempted) so a transient channel failure
    // does not spam the same rows every 15 minutes; the error log + AuditLog
    // row remain as the durable record.
    for (const r of fresh) this.alertedIds.add(r.id);
    this.lastAlertedAt = fresh[fresh.length - 1].createdAt;
    if (this.alertedIds.size > 1000) {
      // Keep the in-memory guard bounded on long-lived processes.
      this.alertedIds = new Set([...this.alertedIds].slice(-500));
    }
  }
}

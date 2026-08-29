import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface IdempotencyContext {
  /** Authenticated user the key belongs to. */
  userId: string;
  /** Logical operation, e.g. 'wallets.send' — keys are scoped per operation. */
  scope: string;
  /** Client-supplied Idempotency-Key header. */
  key?: string;
}

const MAX_KEY_LENGTH = 128;
/** Replays are only meaningful for a short window; prune older records. */
const RETENTION_HOURS = 24;

/**
 * At-most-once execution for money-moving endpoints.
 *
 * A retried request (double tap, flaky network, client retry) that reaches the
 * server twice must move money once. The client generates a UUID per attempt
 * and sends it as `Idempotency-Key`; we store the first response and replay it
 * for any later request carrying the same key, so the caller always sees the
 * outcome of the original attempt instead of a second charge.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run `fn` at most once per (userId, scope, key). Returns the stored response
   * when the key has been seen before.
   */
  async run<T>(ctx: IdempotencyContext, fn: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
    const key = this.normalize(ctx.key);
    if (!key) {
      // No usable key supplied — execute without dedupe rather than rejecting a
      // legitimate older client.
      return { result: await fn(), replayed: false };
    }

    const where = { userId_scope_key: { userId: ctx.userId, scope: ctx.scope, key } };

    const existing = await this.prisma.idempotencyRecord.findUnique({ where });
    if (existing) {
      return { result: existing.response as unknown as T, replayed: true };
    }

    const result = await fn();

    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId: ctx.userId,
          scope: ctx.scope,
          key,
          response: result as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // A concurrent request with the same key committed first — return its
        // result so both callers agree on what happened.
        const winner = await this.prisma.idempotencyRecord.findUnique({ where });
        if (winner) {
          return { result: winner.response as unknown as T, replayed: true };
        }
      }
      // Failing to persist the record must not fail the request; the worst case
      // is a lost dedupe window, not a lost transaction.
      this.logger.warn(`idempotency record not persisted for ${ctx.scope}: ${err?.message}`);
    }

    return { result, replayed: false };
  }

  /** Old records only waste space — the replay window is 24h. */
  @Cron('17 * * * *')
  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.idempotencyRecord.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return count;
    } catch (err: any) {
      this.logger.warn(`idempotency prune failed: ${err?.message}`);
      return 0;
    }
  }

  private normalize(key?: string): string | null {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;
    return trimmed;
  }
}

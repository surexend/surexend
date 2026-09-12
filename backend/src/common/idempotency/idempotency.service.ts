import { Injectable, Logger, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface IdempotencyContext {
  /** Authenticated user the key belongs to. */
  userId: string;
  /** Logical operation, e.g. 'wallets.send' — keys are scoped per operation. */
  scope: string;
  /** Client-supplied Idempotency-Key header. */
  key?: string;
  /** Canonical operation parameters, excluding credentials. */
  fingerprint?: string;
}

const MAX_KEY_LENGTH = 128;
const MAX_FINGERPRINT_LENGTH = 2048;
const RETENTION_HOURS = 24;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 100;

/**
 * Durable at-most-once execution for money-moving endpoints.
 *
 * The record is claimed BEFORE the side effect runs. The unique database
 * constraint decides the winner when requests race; losing requests wait for
 * the winner's terminal result instead of running the callback themselves.
 *
 * A PROCESSING record is deliberately not reclaimed automatically. Re-running
 * an operation after a crashed process can duplicate an upstream provider call,
 * so an abandoned record must be reconciled by operations rather than guessed
 * safe by the API.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(ctx: IdempotencyContext, fn: () => Promise<T>): Promise<{ result: T; replayed: boolean }> {
    const key = this.normalizeKey(ctx.key);
    if (!key) {
      throw new BadRequestException('Idempotency-Key is required for money-moving requests and must be 1–128 characters.');
    }

    const fingerprint = this.normalizeFingerprint(ctx.fingerprint);
    const where = { userId_scope_key: { userId: ctx.userId, scope: ctx.scope, key } };

    let claimed = false;
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId: ctx.userId,
          scope: ctx.scope,
          key,
          requestHash: fingerprint,
          status: 'PROCESSING',
        },
      });
      claimed = true;
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
    }

    if (!claimed) {
      return this.waitForExisting(where, fingerprint);
    }

    let result: T;
    try {
      result = await fn();
    } catch (err: any) {
      try {
        await this.prisma.idempotencyRecord.update({
          where,
          data: {
            status: 'FAILED',
            error: this.safeErrorMessage(err),
            response: null as any,
          },
        });
      } catch (persistErr: any) {
        // Leave PROCESSING if the failure state could not be persisted. This
        // prevents a retry from silently executing an operation whose outcome
        // is unknown and alerts operations to reconcile the record.
        this.logger.error(`Could not persist failed idempotent operation ${ctx.scope}/${key}: ${persistErr?.message || persistErr}`);
      }
      throw err;
    }

    try {
      await this.prisma.idempotencyRecord.update({
        where,
        data: {
          status: 'COMPLETED',
          response: this.toJson(result),
          error: null,
        },
      });
    } catch (err: any) {
      // The side effect has already happened. Do not return a response that
      // encourages a client retry while the replay record is missing.
      this.logger.error(`Could not persist completed idempotent operation ${ctx.scope}/${key}: ${err?.message || err}`);
      throw new ServiceUnavailableException('The operation completed but its replay record could not be saved. Contact support before retrying.');
    }

    return { result, replayed: false };
  }

  private async waitForExisting<T>(where: any, fingerprint: string | null): Promise<{ result: T; replayed: boolean }> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const existing = await this.prisma.idempotencyRecord.findUnique({ where });
      if (!existing) {
        // A database failover could make a just-created row briefly invisible.
        // Never execute the callback here; failing closed is safer than a second
        // provider call.
        throw new ConflictException('The idempotency record is temporarily unavailable. Retry with the same key.');
      }

      this.assertSameRequest(existing.requestHash, fingerprint);

      const status = existing.status || (existing.response != null ? 'COMPLETED' : 'PROCESSING');
      if (status === 'COMPLETED') {
        return { result: existing.response as unknown as T, replayed: true };
      }
      if (status === 'FAILED') {
        throw new ConflictException(existing.error || 'This idempotent operation already failed. Start a new operation if appropriate.');
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    }

    throw new ConflictException('This operation is already being processed. Retry with the same Idempotency-Key after checking its status.');
  }

  private assertSameRequest(existing: string | null | undefined, requested: string | null) {
    if (existing && requested && existing !== requested) {
      throw new ConflictException('The Idempotency-Key was already used for different operation parameters.');
    }
  }

  @Cron('17 * * * *')
  async prune(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.idempotencyRecord.deleteMany({
        where: { createdAt: { lt: cutoff }, status: { in: ['COMPLETED', 'FAILED'] } },
      });
      return count;
    } catch (err: any) {
      this.logger.warn(`idempotency prune failed: ${err?.message}`);
      return 0;
    }
  }

  private normalizeKey(key?: string): string | null {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;
    return trimmed;
  }

  private normalizeFingerprint(fingerprint?: string): string | null {
    if (fingerprint === undefined || fingerprint === null) return null;
    if (typeof fingerprint !== 'string' || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
      throw new BadRequestException('Invalid idempotency request fingerprint.');
    }
    return createHash('sha256').update(fingerprint).digest('hex');
  }

  private toJson(value: unknown): any {
    return value === null || value === undefined ? null : value;
  }

  private safeErrorMessage(error: any): string {
    const message = error?.message || 'The operation failed.';
    return String(message).slice(0, 500);
  }
}

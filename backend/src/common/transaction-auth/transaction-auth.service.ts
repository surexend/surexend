import { Injectable, BadRequestException, ForbiddenException, Logger, ServiceUnavailableException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { transactionIntentHash } from './transaction-intent';

const MAX_PIN_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const LOCKOUT_SECONDS = 15 * 60;

/**
 * Single source of truth for "how do we authorize a money-moving action".
 *
 * Accepts either the user's 4-digit PIN or a short-lived biometric approval
 * token issued by the passkeys module after a successful WebAuthn assertion.
 *
 * A 4-digit PIN is only 10,000 combinations, so brute force is the primary
 * threat against it — failed attempts are counted in Redis (shared across
 * instances) and the account is locked for 15 minutes after 5 failures. If
 * Redis is unreachable we fall back to a per-instance counter and log loudly
 * rather than letting transactions through unmetered.
 *
 * There is deliberately NO default/test PIN bypass here — every user must set
 * a real PIN (or enroll a passkey) before they can transact.
 */
@Injectable()
export class TransactionAuthService implements OnModuleDestroy {
  private readonly production = process.env.NODE_ENV === 'production';
  private readonly logger = new Logger(TransactionAuthService.name);
  private readonly redis: Redis;
  private readonly memory = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.redis = new Redis(this.configService.get<string>('app.redisUrl') || 'redis://localhost:6379');
    this.redis.on('error', (err: Error) => {
      this.logger.error(`redis unavailable for PIN attempt tracking: ${err.message}`);
    });
  }

  onModuleDestroy() {
    void this.redis.quit().catch(() => undefined);
  }

  private attemptKey(userId: string) {
    return `pin:attempts:${userId}`;
  }

  private lockKey(userId: string) {
    return `pin:lock:${userId}`;
  }

  /** Seconds left on an active lockout, or 0 when the user may transact. */
  private async lockoutRemaining(userId: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(this.lockKey(userId));
      if (ttl > 0) return ttl;
      if (ttl === -1) {
        // Lock set without an expiry (shouldn't happen) — fail closed but don't
        // lock the user out forever.
        await this.redis.expire(this.lockKey(userId), LOCKOUT_SECONDS);
        return LOCKOUT_SECONDS;
      }
      return 0;
    } catch {
      if (this.production) {
        throw new ServiceUnavailableException('Transaction authorization is temporarily unavailable. Please try again.');
      }
      const mem = this.memory.get(userId);
      if (!mem || mem.until <= Date.now()) return 0;
      return Math.ceil((mem.until - Date.now()) / 1000);
    }
  }

  private async registerFailure(userId: string): Promise<void> {
    try {
      const attempts = await this.redis.incr(this.attemptKey(userId));
      if (attempts === 1) {
        await this.redis.expire(this.attemptKey(userId), ATTEMPT_WINDOW_SECONDS);
      }
      if (attempts >= MAX_PIN_ATTEMPTS) {
        await this.redis.set(this.lockKey(userId), '1', 'EX', LOCKOUT_SECONDS);
        await this.redis.del(this.attemptKey(userId));
        this.logger.warn(`transaction auth locked for user ${userId} after ${attempts} failed attempts`);
      }
      return;
    } catch {
      // A production transaction must never fall back to a per-instance
      // counter: another instance could accept the next PIN guess. Fail closed
      // until the shared lockout store is healthy again.
      if (this.production) {
        throw new ServiceUnavailableException('Transaction authorization is temporarily unavailable. Please try again.');
      }
      this.logger.warn('redis unavailable; using in-memory PIN attempt counter');
    }

    const now = Date.now();
    const existing = this.memory.get(userId);
    const count = existing && existing.until > now ? existing.count + 1 : 1;
    const entry = { count, until: now + ATTEMPT_WINDOW_SECONDS * 1000 };
    this.memory.set(userId, entry);
    if (count >= MAX_PIN_ATTEMPTS) {
      entry.until = now + LOCKOUT_SECONDS * 1000;
      this.logger.warn(`transaction auth locked (in-memory) for user ${userId}`);
    }
  }

  private async clearFailures(userId: string): Promise<void> {
    this.memory.delete(userId);
    try {
      await this.redis.del(this.attemptKey(userId), this.lockKey(userId));
    } catch {
      /* nothing to clear if redis is down */
    }
  }

  async verify(
    user: { id: string; pin: string | null },
    body: { pin?: string; passkeyToken?: string },
    intent?: Record<string, unknown>,
  ) {
    const pin = body?.pin;
    const passkeyToken = body?.passkeyToken;

    if (!user?.id) {
      throw new ForbiddenException('User not authenticated');
    }

    const lockedFor = await this.lockoutRemaining(user.id);
    if (lockedFor > 0) {
      throw new ForbiddenException(
        `Too many incorrect PIN attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).`,
      );
    }

    if (!pin && !passkeyToken) {
      throw new BadRequestException('Transaction PIN or biometric approval is required');
    }

    if (passkeyToken) {
      let payload: any;
      try {
        payload = this.jwtService.verify(passkeyToken);
      } catch {
        throw new ForbiddenException('Invalid or expired biometric approval');
      }
      if (
        payload?.purpose !== 'transaction' ||
        payload.sub !== user.id ||
        typeof payload.jti !== 'string' ||
        typeof payload.intentHash !== 'string' ||
        !intent ||
        payload.intentHash !== transactionIntentHash(intent)
      ) {
        throw new ForbiddenException('This biometric approval does not match the requested action');
      }

      // A JWT expiry is not enough: consume the approval in the database so a
      // captured token cannot authorize a second action or another instance.
      const consumed = await this.prisma.passkeyApproval.updateMany({
        where: {
          jti: payload.jti,
          userId: user.id,
          intentHash: payload.intentHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new ForbiddenException('This biometric approval has already been used or expired');
      }
      await this.clearFailures(user.id);
      return;
    }

    if (!user?.pin) {
      throw new ForbiddenException('Transaction PIN is not set up');
    }

    const isValid = await bcrypt.compare(String(pin), user.pin);
    if (!isValid) {
      await this.registerFailure(user.id);

      // Re-check the lock: the counter is cleared once the lock is set, so
      // reading it here would otherwise report a full set of attempts left.
      const lockedFor = await this.lockoutRemaining(user.id);
      if (lockedFor > 0) {
        throw new ForbiddenException(
          `Too many incorrect PIN attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).`,
        );
      }

      const remaining = Math.max(0, MAX_PIN_ATTEMPTS - (await this.currentAttempts(user.id)));
      throw new ForbiddenException(
        remaining > 0
          ? `Invalid Transaction PIN. ${remaining} attempt(s) left before a temporary lock.`
          : 'Invalid Transaction PIN. Your account is temporarily locked.',
      );
    }

    await this.clearFailures(user.id);
  }

  private async currentAttempts(userId: string): Promise<number> {
    try {
      const raw = await this.redis.get(this.attemptKey(userId));
      if (raw) return parseInt(raw, 10) || 0;
    } catch {
      /* fall through to memory */
    }
    const mem = this.memory.get(userId);
    return mem && mem.until > Date.now() ? mem.count : 0;
  }
}

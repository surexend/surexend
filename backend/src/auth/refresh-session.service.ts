import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class RefreshSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(RefreshSessionService.name);
  private redis: Redis | null = null;
  private readonly memSessions = new Map<string, { userId: string; tokenHash: string; expiresAt: number }>();
  private readonly memUserIndex = new Map<string, Set<string>>();

  constructor(private readonly configService: ConfigService) {}

  onModuleDestroy() {
    if (this.redis) {
      void this.redis.quit().catch(() => {});
      this.redis = null;
    }
  }

  ttlSeconds() {
    return REFRESH_TTL_SECONDS;
  }

  private sessionKey(jti: string) {
    return `auth:refresh:${jti}`;
  }

  private userIndexKey(userId: string) {
    return `auth:refresh-user:${userId}`;
  }

  private hash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getRedis(): Redis | null {
    if (this.redis) return this.redis;
    const url = this.configService.get<string>('app.redisUrl');
    if (!url) return null;
    try {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.redis.on('error', (error) => {
        this.logger.warn(`Refresh-session Redis error: ${error.message}`);
      });
      void this.redis.connect().catch(() => {
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
    return this.redis;
  }

  async create(userId: string, jti: string, refreshToken: string, ttlSeconds = REFRESH_TTL_SECONDS) {
    const tokenHash = this.hash(refreshToken);
    const redis = this.getRedis();

    if (redis) {
      try {
        const sessionKey = this.sessionKey(jti);
        const userIndexKey = this.userIndexKey(userId);
        await redis
          .multi()
          .hset(sessionKey, { userId, tokenHash })
          .expire(sessionKey, ttlSeconds)
          .sadd(userIndexKey, jti)
          .expire(userIndexKey, ttlSeconds)
          .exec();
        return;
      } catch (error: any) {
        this.logger.warn(`Falling back to in-memory refresh sessions: ${error?.message || 'unknown error'}`);
        this.redis = null;
      }
    }

    this.memSessions.set(jti, {
      userId,
      tokenHash,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    const indexed = this.memUserIndex.get(userId) || new Set<string>();
    indexed.add(jti);
    this.memUserIndex.set(userId, indexed);
  }

  async validate(userId: string, jti: string, refreshToken: string): Promise<boolean> {
    const expectedHash = this.hash(refreshToken);
    const redis = this.getRedis();

    if (redis) {
      try {
        const data = await redis.hgetall(this.sessionKey(jti));
        return data.userId === userId && data.tokenHash === expectedHash;
      } catch (error: any) {
        this.logger.warn(`Refresh-session validation fallback: ${error?.message || 'unknown error'}`);
        this.redis = null;
      }
    }

    const entry = this.memSessions.get(jti);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      await this.revoke(jti, entry.userId);
      return false;
    }
    return entry.userId === userId && entry.tokenHash === expectedHash;
  }

  async revoke(jti: string, userIdHint?: string) {
    const redis = this.getRedis();
    if (redis) {
      try {
        const sessionKey = this.sessionKey(jti);
        const session = await redis.hgetall(sessionKey);
        const userId = session.userId || userIdHint;
        const multi = redis.multi().del(sessionKey);
        if (userId) multi.srem(this.userIndexKey(userId), jti);
        await multi.exec();
        return;
      } catch (error: any) {
        this.logger.warn(`Refresh-session revoke fallback: ${error?.message || 'unknown error'}`);
        this.redis = null;
      }
    }

    const session = this.memSessions.get(jti);
    const userId = session?.userId || userIdHint;
    this.memSessions.delete(jti);
    if (userId) {
      const indexed = this.memUserIndex.get(userId);
      indexed?.delete(jti);
      if (indexed && indexed.size === 0) {
        this.memUserIndex.delete(userId);
      }
    }
  }

  async revokeAllForUser(userId: string) {
    const redis = this.getRedis();
    if (redis) {
      try {
        const userIndexKey = this.userIndexKey(userId);
        const jtis = await redis.smembers(userIndexKey);
        if (jtis.length) {
          const multi = redis.multi();
          jtis.forEach((jti) => multi.del(this.sessionKey(jti)));
          multi.del(userIndexKey);
          await multi.exec();
        }
        return;
      } catch (error: any) {
        this.logger.warn(`Refresh-session revokeAll fallback: ${error?.message || 'unknown error'}`);
        this.redis = null;
      }
    }

    const indexed = this.memUserIndex.get(userId);
    if (!indexed) return;
    indexed.forEach((jti) => this.memSessions.delete(jti));
    this.memUserIndex.delete(userId);
  }
}

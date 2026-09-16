import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageRecord, ThrottlerStorageService } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Shared rate-limit buckets for horizontally scaled API instances. A local
 * in-memory bucket lets an attacker rotate between instances and bypass the
 * login/webhook protection, so production fails closed when Redis is down.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly production = process.env.NODE_ENV === 'production';
  private readonly fallback = new ThrottlerStorageService();
  private readonly redis: Redis | null;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('app.redisUrl');
    this.redis = url ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
    this.redis?.on('error', (error) => this.logger.warn(`rate-limit Redis error: ${error.message}`));
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      if (this.production) throw new Error('Rate-limit storage is unavailable');
      return this.fallback.increment(key, ttl);
    }

    try {
      const totalHits = await this.redis.incr(`throttle:${key}`);
      if (totalHits === 1) await this.redis.pexpire(`throttle:${key}`, ttl);
      const remainingMs = await this.redis.pttl(`throttle:${key}`);
      return {
        totalHits,
        timeToExpire: Math.max(1, Math.ceil(Math.max(remainingMs, ttl) / 1000)),
      };
    } catch (error: any) {
      if (this.production) {
        this.logger.error(`Rate-limit storage unavailable; rejecting request: ${error?.message || error}`);
        throw new Error('Rate-limit storage is unavailable');
      }
      this.logger.warn(`Rate-limit Redis unavailable; using development fallback: ${error?.message || error}`);
      return this.fallback.increment(key, ttl);
    }
  }

  async onApplicationShutdown() {
    if (this.redis) await this.redis.quit().catch(() => undefined);
  }
}

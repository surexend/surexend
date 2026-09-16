import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * IP-keyed throttling that understands it runs behind a proxy.
 *
 * The frontend reaches this API through a Next.js rewrite, so the socket address
 * is the proxy's, not the visitor's. `trust proxy` is enabled in main.ts and we
 * take the left-most `X-Forwarded-For` entry (the real client) — without that,
 * every user would share one bucket and the app would start returning 429s
 * under normal traffic.
 *
 * Storage is Redis-backed through RedisThrottlerStorage, so all API instances
 * share the same buckets. Production rejects requests if that shared store is
 * unavailable rather than silently falling back to per-instance limits.
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.ips?.length ? req.ips[0] : req.ip;
    return forwarded || 'unknown';
  }
}

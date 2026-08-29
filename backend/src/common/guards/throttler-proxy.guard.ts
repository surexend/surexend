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
 * Note: storage is in-memory, so the counter is per-instance. Tighten the
 * abusive endpoints further with @Throttle, and rely on the Redis-backed PIN
 * lockout (TransactionAuthService) for credential attacks.
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.ips?.length ? req.ips[0] : req.ip;
    return forwarded || 'unknown';
  }
}

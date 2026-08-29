import * as crypto from 'crypto';
import axios from 'axios';

/**
 * Webhook signature helpers.
 *
 * Every inbound webhook must be authenticated before it can move money. These
 * helpers are deliberately strict: a missing secret or a missing signature is a
 * rejection, never a pass. Two of the three providers we accept webhooks from
 * (Circle, Flutterwave, VtPass) had no working verification at all before this
 * existed, which meant anyone who discovered the URL could credit themselves.
 */

export interface WebhookVerificationResult {
  ok: boolean;
  /** Why it failed — logged, never returned to the caller. */
  reason?: string;
}

/**
 * Constant-time string comparison. Lengths are hashed before comparing so the
 * result leaks nothing about the expected value.
 */
export function safeCompare(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Circle signs every v2 notification with ECDSA-SHA256.
 *
 * - `X-Circle-Signature` — the base64 signature of the **raw** body.
 * - `X-Circle-Key-Id` — the UUID of the key that signed it; the matching public
 *   key is fetched from `/v2/notifications/publicKey/{keyId}` and cached (it is
 *   static per key id).
 *
 * The raw bytes matter: re-serialising parsed JSON changes key order and the
 * signature stops matching, which is why `main.ts` enables `rawBody`.
 */
export class CircleSignatureVerifier {
  private readonly cache = new Map<string, crypto.KeyObject>();

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://api.circle.com',
  ) {}

  private async getPublicKey(keyId: string): Promise<crypto.KeyObject> {
    const cached = this.cache.get(keyId);
    if (cached) return cached;

    const res = await axios.get(`${this.baseUrl}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, accept: 'application/json' },
      timeout: 10_000,
    });

    const encoded = res.data?.data?.publicKey;
    if (typeof encoded !== 'string' || !encoded.length) {
      throw new Error('public key endpoint returned no key');
    }

    const publicKey = crypto.createPublicKey({
      key: Buffer.from(encoded, 'base64'),
      format: 'der',
      type: 'spki',
    });
    this.cache.set(keyId, publicKey);
    return publicKey;
  }

  async verify(rawBody: Buffer | string | undefined, signature: string | undefined, keyId: string | undefined): Promise<WebhookVerificationResult> {
    if (!rawBody || !signature || !keyId) {
      return { ok: false, reason: 'missing signature headers or body' };
    }
    if (!this.apiKey) {
      return { ok: false, reason: 'CIRCLE_API_KEY is not configured' };
    }

    try {
      const publicKey = await this.getPublicKey(keyId);
      const verifier = crypto.createVerify('SHA256');
      verifier.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody);
      verifier.end();
      const ok = verifier.verify(publicKey, signature, 'base64');
      return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
    } catch (err: any) {
      return { ok: false, reason: err?.message || 'verification failed' };
    }
  }
}

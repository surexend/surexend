import * as crypto from 'crypto';

/**
 * Canonicalize the small, non-secret transaction description that a user
 * approves with WebAuthn. Credentials are intentionally never part of this
 * object.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  return value;
}

export function transactionIntentHash(intent: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(intent))).digest('hex');
}

/**
 * Circle API-key environment classification.
 *
 * Source: https://developers.circle.com/api-reference/keys
 *   - Keys are formatted `PREFIX:ID:SECRET`; all three parts are required.
 *   - Testnet keys are prefixed `TEST_API_KEY`, mainnet keys `LIVE_API_KEY`.
 *   - "API keys are specific to one environment. Create one API key for
 *     testnet and another for mainnet."
 *
 * The classification is deliberately strict. A key that is not recognisably a
 * testnet or a mainnet key is `invalid`, never "probably mainnet": the old
 * rule "anything without TEST_ is mainnet" would let a typo or a truncated
 * paste satisfy the mainnet boot guard.
 */
export type CircleKeyEnvironment = 'testnet' | 'mainnet' | 'invalid' | 'missing';

export const CIRCLE_TESTNET_KEY_PREFIX = 'TEST_API_KEY';
export const CIRCLE_MAINNET_KEY_PREFIX = 'LIVE_API_KEY';

export function classifyCircleApiKey(rawKey: string | undefined | null): CircleKeyEnvironment {
  const key = String(rawKey || '').trim();
  if (!key) return 'missing';
  const parts = key.split(':');
  if (parts.length !== 3 || parts.some((part) => !part.trim() || /\s/.test(part))) return 'invalid';
  const [prefix] = parts;
  if (prefix === CIRCLE_TESTNET_KEY_PREFIX) return 'testnet';
  if (prefix === CIRCLE_MAINNET_KEY_PREFIX) return 'mainnet';
  return 'invalid';
}

/** Entity secret: 32 random bytes, hex encoded (64 hex chars). */
export function isValidCircleEntitySecret(rawSecret: string | undefined | null): boolean {
  return /^[0-9a-fA-F]{64}$/.test(String(rawSecret || '').trim());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Wallet-set IDs returned by Circle are UUIDs. */
export function isValidCircleWalletSetId(rawId: string | undefined | null): boolean {
  return UUID.test(String(rawId || '').trim());
}

/** Redact a Circle API key for logs/evidence: keep only the environment prefix. */
export function redactCircleApiKey(rawKey: string | undefined | null): string {
  const env = classifyCircleApiKey(rawKey);
  if (env === 'missing') return '(missing)';
  if (env === 'invalid') return '(invalid-shape)';
  return `${String(rawKey).split(':')[0]}:…`;
}

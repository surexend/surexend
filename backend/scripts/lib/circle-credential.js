'use strict';
/**
 * CommonJS mirror of src/config/circle-credential.ts for the operator scripts
 * (they run without the TypeScript build). Keep both in sync.
 *
 * Source: https://developers.circle.com/api-reference/keys
 *   Keys are PREFIX:ID:SECRET. TEST_API_KEY = testnet, LIVE_API_KEY = mainnet.
 *   One key per environment.
 */
const CIRCLE_TESTNET_KEY_PREFIX = 'TEST_API_KEY';
const CIRCLE_MAINNET_KEY_PREFIX = 'LIVE_API_KEY';

function classifyCircleApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return 'missing';
  const parts = key.split(':');
  if (parts.length !== 3 || parts.some((part) => !part.trim() || /\s/.test(part))) return 'invalid';
  if (parts[0] === CIRCLE_TESTNET_KEY_PREFIX) return 'testnet';
  if (parts[0] === CIRCLE_MAINNET_KEY_PREFIX) return 'mainnet';
  return 'invalid';
}

function isValidCircleEntitySecret(rawSecret) {
  return /^[0-9a-fA-F]{64}$/.test(String(rawSecret || '').trim());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidCircleWalletSetId(rawId) {
  return UUID.test(String(rawId || '').trim());
}

function redactCircleApiKey(rawKey) {
  const env = classifyCircleApiKey(rawKey);
  if (env === 'missing') return '(missing)';
  if (env === 'invalid') return '(invalid-shape)';
  return `${String(rawKey).split(':')[0]}:…`;
}

module.exports = {
  CIRCLE_TESTNET_KEY_PREFIX,
  CIRCLE_MAINNET_KEY_PREFIX,
  classifyCircleApiKey,
  isValidCircleEntitySecret,
  isValidCircleWalletSetId,
  redactCircleApiKey,
};

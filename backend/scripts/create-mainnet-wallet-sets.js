#!/usr/bin/env node

/**
 * One-time operator step: create the Production (mainnet) Circle wallet sets.
 *
 * The backend refuses to create a wallet set on mainnet at runtime; the IDs
 * must be created deliberately, recorded in the release packet, and supplied
 * as CIRCLE_WALLET_SET_ID / CIRCLE_REFERRAL_REWARD_WALLET_SET_ID. This script:
 *
 *   1. requires a LIVE_API_KEY (https://developers.circle.com/api-reference/keys)
 *      and the registered 64-hex entity secret, read from the environment only
 *      (never from a file, never written back to one);
 *   2. proves the key/secret pair works read-only first (wallet list + entity
 *      public key);
 *   3. creates TWO separate developer-controlled wallet sets with stable
 *      idempotency keys, so re-running never creates duplicates:
 *        - "SureXend Application Wallets (mainnet)"
 *        - "SureXend Referral Rewards (mainnet)"
 *   4. prints the two IDs and nothing else secret.
 *
 * Nothing here creates wallets or moves funds.
 *
 * Usage (from backend/, with the two variables exported in the shell only):
 *   CIRCLE_API_KEY='LIVE_API_KEY:…' CIRCLE_ENTITY_SECRET='…' \
 *     node scripts/create-mainnet-wallet-sets.js
 *
 * Endpoints (Circle Developer-Controlled Wallets API):
 *   GET  /v1/w3s/wallets?pageSize=1
 *   GET  /v1/w3s/config/entity/publicKey
 *   POST /v1/w3s/developer/walletSets  { idempotencyKey, entitySecretCiphertext, name }
 */
const crypto = require('node:crypto');
const axios = require('axios');
const { classifyCircleApiKey, isValidCircleEntitySecret, redactCircleApiKey } = require('./lib/circle-credential');

const BASE = 'https://api.circle.com';
const apiKey = String(process.env.CIRCLE_API_KEY || '').trim();
const entitySecret = String(process.env.CIRCLE_ENTITY_SECRET || '').trim();
const allowTestnet = process.argv.includes('--allow-testnet');

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const keyEnv = classifyCircleApiKey(apiKey);
if (keyEnv === 'missing') die('CIRCLE_API_KEY is not set in the environment.');
if (keyEnv === 'invalid') die('CIRCLE_API_KEY is not a valid Circle key (expected LIVE_API_KEY:<id>:<secret>).');
if (keyEnv !== 'mainnet' && !allowTestnet) die(`CIRCLE_API_KEY is a ${keyEnv} key; this script creates MAINNET wallet sets. Pass --allow-testnet only for a rehearsal.`);
if (!isValidCircleEntitySecret(entitySecret)) die('CIRCLE_ENTITY_SECRET must be the registered 32-byte hex entity secret (64 hex characters).');

const headers = { Authorization: `Bearer ${apiKey}`, accept: 'application/json', 'Content-Type': 'application/json' };

function encryptEntitySecret(publicKeyPem) {
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(entitySecret, 'hex'),
  ).toString('base64');
}

// Stable per-account idempotency keys: re-running returns the same sets.
function idempotencyKeyFor(label) {
  const keyId = apiKey.split(':')[1];
  const hash = crypto.createHash('sha256').update(`surexend:${keyEnv}:wallet-set:${label}:${keyId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function createSet(label, name, publicKeyPem) {
  const response = await axios.post(
    `${BASE}/v1/w3s/developer/walletSets`,
    { idempotencyKey: idempotencyKeyFor(label), entitySecretCiphertext: encryptEntitySecret(publicKeyPem), name },
    { headers, timeout: 30_000, validateStatus: () => true },
  );
  const id = response.data?.data?.walletSet?.id;
  if (response.status < 200 || response.status >= 300 || !id) {
    throw new Error(`creating "${name}" failed: HTTP ${response.status} ${String(response.data?.message || '').slice(0, 200)}`);
  }
  return id;
}

(async () => {
  console.log(`Circle key: ${redactCircleApiKey(apiKey)} (${keyEnv})`);

  const wallets = await axios.get(`${BASE}/v1/w3s/wallets?pageSize=1`, { headers, timeout: 15_000, validateStatus: () => true });
  if (wallets.status !== 200) die(`read-only wallet list failed: HTTP ${wallets.status} ${String(wallets.data?.message || '').slice(0, 200)}`);
  console.log('Read-only authentication: OK');

  const pk = await axios.get(`${BASE}/v1/w3s/config/entity/publicKey`, { headers, timeout: 15_000, validateStatus: () => true });
  const publicKeyPem = pk.data?.data?.publicKey;
  if (pk.status !== 200 || !publicKeyPem) die(`entity public key unavailable (HTTP ${pk.status}); register the entity secret for this ${keyEnv} account in the Circle Console first.`);
  console.log('Entity secret registered: OK');

  const applicationSetId = await createSet('application', `SureXend Application Wallets (${keyEnv})`, publicKeyPem);
  const referralSetId = await createSet('referral-rewards', `SureXend Referral Rewards (${keyEnv})`, publicKeyPem);
  if (applicationSetId === referralSetId) die('Circle returned the same wallet set for both roles; stop and investigate before configuring Production.');

  console.log('');
  console.log('Add these to the Production service variables (and to the release packet):');
  console.log(`CIRCLE_WALLET_SET_ID=${applicationSetId}`);
  console.log(`CIRCLE_REFERRAL_REWARD_WALLET_SET_ID=${referralSetId}`);
})().catch((error) => {
  console.error(`ERROR: ${error?.message || error}`);
  process.exit(1);
});

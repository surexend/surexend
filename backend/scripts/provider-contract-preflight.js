#!/usr/bin/env node

/**
 * Read-only provider contract preflight.
 *
 * This script never creates a wallet, sends money, purchases a bill, or
 * retries an ambiguous provider request. A provider whose authenticated
 * contract cannot be established is reported as PENDING_UNVERIFIED rather
 * than being treated as healthy.
 *
 * Usage (from backend/):
 *   node scripts/provider-contract-preflight.js --provider circle --network
 *   node scripts/provider-contract-preflight.js --provider flutterwave --network
 *   node scripts/provider-contract-preflight.js --provider smartspeed
 *   node scripts/provider-contract-preflight.js --all --network
 *
 * Exit codes:
 *   0 = every requested provider passed
 *   1 = a provider failed a deterministic check or its read-only request
 *   2 = usage/configuration error
 *   3 = at least one provider remains pending/unverified
 *
 * Set PROVIDER_PREFLIGHT_EVIDENCE_FILE to write a redacted JSON result for the
 * release packet. The file contains no API keys or webhook secrets.
 */
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { classifyCircleApiKey, isValidCircleEntitySecret, isValidCircleWalletSetId } = require('./lib/circle-credential');

const argv = process.argv.slice(2);
const wantsNetwork = argv.includes('--network');
const all = argv.includes('--all');
const providerArg = argv.find((arg) => !arg.startsWith('--'));
const requested = all
  ? ['circle', 'flutterwave', 'smartspeed', 'paymentpoint']
  : providerArg
    ? [providerArg.toLowerCase()]
    : [];
const known = new Set(['circle', 'flutterwave', 'smartspeed', 'paymentpoint']);

if (!requested.length || requested.some((provider) => !known.has(provider))) {
  console.error('Usage: --provider <circle|flutterwave|smartspeed|paymentpoint> [--network], or --all [--network]');
  process.exit(2);
}

const result = {
  checkedAt: new Date().toISOString(),
  networkProbeRequested: wantsNetwork,
  results: [],
};

function add(provider, status, reason, details = {}) {
  result.results.push({ provider, status, reason, ...details });
}

function has(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function redactedUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

async function readOnlyGet(provider, url, headers) {
  try {
    const response = await axios.get(url, {
      headers,
      timeout: 15_000,
      // A 401/403/404 is useful contract evidence, not an exception that
      // hides the provider's response body.
      validateStatus: () => true,
    });
    const status = Number(response.status || 0);
    if (status >= 200 && status < 300) {
      const body = response.data;
      const bodySignalsFailure = body && typeof body === 'object'
        && (body.error || body.detail || body.success === false || /^(error|failed|failure)$/i.test(String(body.status || '')));
      if (bodySignalsFailure) {
        add(provider, 'FAIL', 'Read-only endpoint returned an explicit provider error body.', {
          httpStatus: status,
          endpoint: redactedUrl(url),
          providerError: String(body.message || body.error || body.detail || body.status).slice(0, 240),
        });
        return;
      }
      add(provider, 'PASS', 'Authenticated read-only endpoint responded successfully.', {
        httpStatus: status,
        endpoint: redactedUrl(url),
      });
      return;
    }
    add(provider, 'FAIL', `Read-only endpoint returned HTTP ${status}.`, {
      httpStatus: status,
      endpoint: redactedUrl(url),
      providerError: String(response.data?.message || response.data?.error || '').slice(0, 240) || undefined,
    });
  } catch (error) {
    add(provider, 'PENDING_UNVERIFIED', `Read-only request outcome is ambiguous: ${error.message || error}. No money operation was attempted.`, {
      endpoint: redactedUrl(url),
    });
  }
}

async function circleGet(url, key) {
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
    timeout: 15_000,
    validateStatus: () => true,
  });
  return { status: Number(response.status || 0), body: response.data };
}

async function checkCircle() {
  const key = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const chainEnv = (process.env.CHAIN_ENV || 'testnet').toLowerCase();
  const keyEnv = classifyCircleApiKey(key);
  if (!has(key) || !has(entitySecret)) {
    add('circle', 'PENDING_UNVERIFIED', 'CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are both required; authenticated Circle contract was not tested.');
    return;
  }
  // https://developers.circle.com/api-reference/keys — PREFIX:ID:SECRET,
  // TEST_API_KEY for testnet, LIVE_API_KEY for mainnet, one key per environment.
  if (keyEnv === 'invalid') {
    add('circle', 'FAIL', 'CIRCLE_API_KEY is not a valid Circle key (expected TEST_API_KEY:<id>:<secret> or LIVE_API_KEY:<id>:<secret>).');
    return;
  }
  if (chainEnv === 'testnet' && keyEnv !== 'testnet') {
    add('circle', 'FAIL', 'Testnet configuration requires a Circle TEST_API_KEY; refusing a mixed network configuration.');
    return;
  }
  if (chainEnv === 'mainnet' && keyEnv !== 'mainnet') {
    add('circle', 'FAIL', 'Mainnet configuration requires a Circle LIVE_API_KEY; refusing a mixed network configuration.');
    return;
  }
  if (!isValidCircleEntitySecret(entitySecret)) {
    add('circle', 'FAIL', 'CIRCLE_ENTITY_SECRET must be the registered 32-byte hex entity secret (64 hex characters).');
    return;
  }
  if (!wantsNetwork) {
    add('circle', 'PENDING_UNVERIFIED', 'Credentials have shape, but no network probe was requested. Re-run with --network.', { keyEnvironment: keyEnv });
    return;
  }

  // Everything below is GET-only: it proves authentication, that the entity
  // secret is registered, and that the configured wallet sets exist for this
  // key's environment. Nothing is created, signed, or transferred.
  try {
    const wallets = await circleGet('https://api.circle.com/v1/w3s/wallets?pageSize=1', key);
    if (wallets.status < 200 || wallets.status >= 300) {
      add('circle', 'FAIL', `Read-only wallet list returned HTTP ${wallets.status}.`, {
        httpStatus: wallets.status,
        endpoint: 'https://api.circle.com/v1/w3s/wallets',
        providerError: String(wallets.body?.message || '').slice(0, 240) || undefined,
        keyEnvironment: keyEnv,
      });
      return;
    }

    // The entity public key is only served once an entity secret has been
    // registered for the account; a 404/4xx here means signing can't work.
    const entityKey = await circleGet('https://api.circle.com/v1/w3s/config/entity/publicKey', key);
    if (entityKey.status < 200 || entityKey.status >= 300 || !entityKey.body?.data?.publicKey) {
      add('circle', 'FAIL', `Entity public key is unavailable (HTTP ${entityKey.status}); register the entity secret in the Circle Console for this environment.`, {
        httpStatus: entityKey.status,
        endpoint: 'https://api.circle.com/v1/w3s/config/entity/publicKey',
        keyEnvironment: keyEnv,
      });
      return;
    }

    const details = { httpStatus: wallets.status, endpoint: 'https://api.circle.com/v1/w3s/wallets', keyEnvironment: keyEnv, entitySecretRegistered: true };

    const walletSetId = String(process.env.CIRCLE_WALLET_SET_ID || '').trim();
    const rewardSetId = String(process.env.CIRCLE_REFERRAL_REWARD_WALLET_SET_ID || '').trim();
    if (chainEnv === 'mainnet') {
      if (!walletSetId) {
        add('circle', 'FAIL', 'Mainnet requires a pre-created CIRCLE_WALLET_SET_ID; the application will not create one.', details);
        return;
      }
      if (rewardSetId && rewardSetId === walletSetId) {
        add('circle', 'FAIL', 'CIRCLE_REFERRAL_REWARD_WALLET_SET_ID must differ from CIRCLE_WALLET_SET_ID on mainnet.', details);
        return;
      }
    }
    for (const [label, id] of [['CIRCLE_WALLET_SET_ID', walletSetId], ['CIRCLE_REFERRAL_REWARD_WALLET_SET_ID', rewardSetId]]) {
      if (!id) continue;
      if (!isValidCircleWalletSetId(id)) {
        add('circle', 'FAIL', `${label} is not a wallet-set UUID.`, details);
        return;
      }
      const set = await circleGet(`https://api.circle.com/v1/w3s/walletSets/${encodeURIComponent(id)}`, key);
      if (set.status !== 200 || !set.body?.data?.walletSet?.id) {
        add('circle', 'FAIL', `${label} was not found under this ${keyEnv} API key (HTTP ${set.status}). Wallet sets are environment-specific; use a set created with the ${keyEnv} key.`, {
          ...details,
          endpoint: 'https://api.circle.com/v1/w3s/walletSets/{id}',
          httpStatus: set.status,
        });
        return;
      }
      if (String(set.body.data.walletSet.custodyType || '').toUpperCase() !== 'DEVELOPER') {
        add('circle', 'FAIL', `${label} is not a developer-controlled wallet set (custodyType=${set.body.data.walletSet.custodyType}).`, details);
        return;
      }
      details[`${label === 'CIRCLE_WALLET_SET_ID' ? 'applicationWalletSet' : 'referralRewardWalletSet'}Verified`] = true;
    }

    add('circle', 'PASS', chainEnv === 'mainnet'
      ? 'Authenticated LIVE_API_KEY: read-only wallet list, entity public key, and configured wallet set(s) verified. No money operation was attempted.'
      : 'Authenticated read-only endpoint responded successfully.', details);
  } catch (error) {
    add('circle', 'PENDING_UNVERIFIED', `Read-only request outcome is ambiguous: ${error.message || error}. No money operation was attempted.`, { keyEnvironment: keyEnv });
  }
}

async function checkFlutterwave() {
  if (process.env.FLUTTERWAVE_ENABLED !== 'true') {
    add('flutterwave', 'DISABLED', 'Flutterwave is explicitly disabled; PaymentPoint is the selected local-funding provider.');
    return;
  }
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!has(key)) {
    add('flutterwave', 'PENDING_UNVERIFIED', 'FLUTTERWAVE_SECRET_KEY is not configured; authenticated Flutterwave contract was not tested.');
    return;
  }
  if (!has(process.env.FLUTTERWAVE_WEBHOOK_HASH)) {
    add('flutterwave', 'FAIL', 'FLUTTERWAVE_WEBHOOK_HASH is missing; signed inbound settlement cannot be enabled safely.');
    return;
  }
  if (!wantsNetwork) {
    add('flutterwave', 'PENDING_UNVERIFIED', 'Credentials and webhook secret are present, but no network probe was requested. Re-run with --network.');
    return;
  }
  // Bank catalogue is a read-only, authenticated endpoint. It is not a
  // payment, account creation, transfer, or bill request.
  await readOnlyGet('flutterwave', 'https://api.flutterwave.com/v3/banks/NG', {
    Authorization: `Bearer ${key}`,
    accept: 'application/json',
  });
}

async function checkSmartspeed() {
  const token = process.env.SMARTSPEED_API_TOKEN;
  if (!has(token)) {
    add('smartspeed', 'PENDING_UNVERIFIED', 'SMARTSPEED_API_TOKEN is not configured; provider status/idempotency contract remains unverified.');
    return;
  }
  if (!wantsNetwork) {
    add('smartspeed', 'PENDING_UNVERIFIED', 'Credentials have shape, but no network probe was requested. Re-run with --network.');
    return;
  }
  // This is the same documented, read-only catalog endpoint used by the
  // application for bill product discovery. It proves authentication and
  // reachability without creating a bill or retrying a money operation.
  await readOnlyGet('smartspeed', `${process.env.SMARTSPEED_BASE_URL || 'https://www.smartspeedtelecom.com/api'}/user/`, {
    Authorization: `Token ${token}`,
    accept: 'application/json',
  });
}

async function checkPaymentPoint() {
  const apiKey = process.env.PAYMENTPOINT_API_KEY || process.env.PAYMENT_POINT_API_KEY;
  const secretKey = process.env.PAYMENTPOINT_SECRET_KEY || process.env.PAYMENT_POINT_SECRET_KEY;
  const businessId = process.env.PAYMENTPOINT_BUSINESS_ID || process.env.PAYMENT_POINT_BUSINESS_ID;
  if (!has(apiKey) || !has(secretKey) || !has(businessId)) {
    add('paymentpoint', 'PENDING_UNVERIFIED', 'PAYMENTPOINT_API_KEY, PAYMENTPOINT_SECRET_KEY, and PAYMENTPOINT_BUSINESS_ID are all required; callback authentication/status contract remains unverified.');
    return;
  }
  if (process.env.PAYMENTPOINT_WEBHOOK_ENABLED === 'true') {
    const modes = new Set(['static-secret-legacy', 'hmac-sha256-raw-base64', 'hmac-sha256-raw-hex']);
    const headers = new Set(['paymentpoint-signature', 'x-paymentpoint-signature', 'verif-hash']);
    if (!has(process.env.PAYMENTPOINT_WEBHOOK_CONTRACT_EVIDENCE_ID)
      || !has(process.env.PAYMENTPOINT_WEBHOOK_SECRET)
      || !modes.has(String(process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_MODE || ''))
      || !headers.has(String(process.env.PAYMENTPOINT_WEBHOOK_SIGNATURE_HEADER || ''))) {
      add('paymentpoint', 'FAIL', 'PaymentPoint webhook is enabled without an operator-recorded provider contract/captured-webhook evidence ID and explicit signature mode/header.');
      return;
    }
  }
  const readOnlyUrl = process.env.PAYMENTPOINT_READ_ONLY_PREFLIGHT_URL;
  if (wantsNetwork && has(readOnlyUrl)) {
    await readOnlyGet('paymentpoint', readOnlyUrl, {
      Authorization: `Bearer ${secretKey}`,
      'api-key': apiKey,
      accept: 'application/json',
    });
    return;
  }
  add('paymentpoint', 'PENDING_UNVERIFIED', 'Credentials exist and the documented webhook syntax is not enough by itself: no explicitly configured read-only status endpoint and complete idempotency/reconciliation contract are recorded. Money-crediting webhook remains disabled.', {
    baseUrl: redactedUrl(process.env.PAYMENTPOINT_BASE_URL || 'https://api.paymentpoint.co/api/v1'),
  });
}

async function main() {
  for (const provider of requested) {
    if (provider === 'circle') await checkCircle();
    if (provider === 'flutterwave') await checkFlutterwave();
    if (provider === 'smartspeed') await checkSmartspeed();
    if (provider === 'paymentpoint') await checkPaymentPoint();
  }

  const evidenceFile = process.env.PROVIDER_PREFLIGHT_EVIDENCE_FILE;
  if (evidenceFile) {
    const absolute = path.resolve(evidenceFile);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote redacted provider preflight evidence to ${absolute}`);
  }

  for (const row of result.results) {
    console.log(`[${row.status}] ${row.provider}: ${row.reason}`);
  }

  if (result.results.some((row) => row.status === 'FAIL')) process.exitCode = 1;
  else if (result.results.some((row) => row.status === 'PENDING_UNVERIFIED')) process.exitCode = 3;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

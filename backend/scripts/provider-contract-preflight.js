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

async function checkCircle() {
  const key = process.env.CIRCLE_API_KEY;
  if (!has(key)) {
    add('circle', 'PENDING_UNVERIFIED', 'CIRCLE_API_KEY is not configured; authenticated Circle contract was not tested.');
    return;
  }
  if ((process.env.CHAIN_ENV || 'testnet').toLowerCase() === 'testnet' && !key.startsWith('TEST_')) {
    add('circle', 'FAIL', 'Testnet configuration requires a Circle TEST_ API key; refusing a mixed network configuration.');
    return;
  }
  if (!wantsNetwork) {
    add('circle', 'PENDING_UNVERIFIED', 'Credentials have shape, but no network probe was requested. Re-run with --network.');
    return;
  }
  // Listing wallets is read-only. It proves authentication and API reachability
  // without submitting a transfer or creating a wallet.
  await readOnlyGet('circle', 'https://api.circle.com/v1/w3s/wallets?pageSize=1', {
    Authorization: `Bearer ${key}`,
    accept: 'application/json',
  });
}

async function checkFlutterwave() {
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
  if (!has(process.env.SMARTSPEED_API_TOKEN)) {
    add('smartspeed', 'PENDING_UNVERIFIED', 'SMARTSPEED_API_TOKEN is not configured; provider status/idempotency contract remains unverified.');
    return;
  }
  add('smartspeed', 'PENDING_UNVERIFIED', 'No authoritative read-only status/idempotency contract is recorded. Do not probe a guessed endpoint or retry bill requests automatically.', {
    baseUrl: redactedUrl(process.env.SMARTSPEED_BASE_URL || 'https://www.smartspeedtelecom.com/api'),
  });
}

async function checkPaymentPoint() {
  if (!has(process.env.PAYMENTPOINT_API_KEY) && !has(process.env.PAYMENTPOINT_SECRET_KEY)) {
    add('paymentpoint', 'PENDING_UNVERIFIED', 'PaymentPoint credentials are not configured; callback authentication/status contract remains unverified.');
    return;
  }
  if (process.env.PAYMENTPOINT_WEBHOOK_ENABLED === 'true') {
    add('paymentpoint', 'FAIL', 'PaymentPoint webhook is enabled even though the callback signature contract is not established. Keep PAYMENTPOINT_WEBHOOK_ENABLED=false.');
    return;
  }
  add('paymentpoint', 'PENDING_UNVERIFIED', 'Credentials exist, but no authoritative callback signature/status contract is recorded. Money-crediting webhook remains disabled.', {
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

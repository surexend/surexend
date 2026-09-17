#!/usr/bin/env node

/**
 * Fail-closed financial release verification.
 *
 * This is an evidence gate, not a deployment switch. It does not enable money
 * movement and it does not manufacture provider, PostgreSQL, or operator
 * evidence. Missing services and ambiguous states fail the requested gate.
 *
 * Usage (from backend/):
 *   node scripts/financial-launch-gate.js --scope=testnet-demo
 *   node scripts/financial-launch-gate.js --scope=limited-real-money
 *   node scripts/financial-launch-gate.js --scope=mainnet-preflight
 *   node scripts/financial-launch-gate.js --scope=mainnet
 *
 * `--scope=testnet-demo` verifies that a public demo is read-only and testnet
 * bound. `limited-real-money` verifies the stronger production gates for
 * testnet-backed money movement and bills. `mainnet-preflight` verifies a
 * Production deployment that runs on mainnet credentials with money movement
 * still PAUSED (LIVE_API_KEY, reviewed matrix, separate wallet set, and a
 * clean, isolated database). `mainnet` validates the same plus the stronger
 * external release evidence required before any customer money moves.
 *
 * Set LAUNCH_GATE_EVIDENCE_FILE to write a redacted JSON release artifact.
 * KYC/AML, custody, licensing, provider contracts, and independent review are
 * release evidence requirements; this script never fabricates them.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { classifyCircleApiKey, isValidCircleEntitySecret, isValidCircleWalletSetId, redactCircleApiKey } = require('./lib/circle-credential');

const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='));
const scope = (scopeArg ? scopeArg.slice('--scope='.length) : 'testnet-demo').toLowerCase();
const validScopes = new Set(['testnet-demo', 'limited-real-money', 'mainnet-preflight', 'mainnet']);
if (!validScopes.has(scope)) {
  console.error('Scope must be testnet-demo, limited-real-money, mainnet-preflight, or mainnet.');
  process.exit(2);
}

const checks = [];
const evidence = {
  checkedAt: new Date().toISOString(),
  scope,
  kyc: 'INTENTIONALLY_EXCLUDED_FROM_THIS_REMEDIATION',
  checks,
};

function check(name, ok, detail, severity = 'BLOCKER') {
  checks.push({ name, status: ok ? 'PASS' : severity, detail });
  if (!ok) console.error(`[${severity}] ${name}: ${detail}`);
  else console.log(`[PASS] ${name}: ${detail}`);
}

function pending(name, detail) {
  checks.push({ name, status: 'PENDING_EVIDENCE', detail });
  console.error(`[PENDING_EVIDENCE] ${name}: ${detail}`);
}

function env(name) {
  return String(process.env[name] || '').trim();
}

function anyEnv(...names) {
  return names.map((name) => env(name)).find(Boolean) || '';
}

function databaseIdentity(raw) {
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return raw;
  }
}

function isPlaceholderSecret(value) {
  return !value || /super-secret|change[-_ ]?me|example|password/i.test(value);
}

function fileContainsPass(file, provider) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed.results?.some((row) => row.provider === provider && row.status === 'PASS');
  } catch {
    return false;
  }
}

function providerEvidence(provider) {
  const file = env('PROVIDER_PREFLIGHT_EVIDENCE_FILE');
  if (!file) return false;
  return fileContainsPass(file, provider);
}

function enabledProviderNames() {
  const configured = (env('ENABLED_PROVIDERS') || 'circle,paymentpoint,smartspeed')
    .split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
  const providers = new Set(configured);
  providers.add('circle');
  if (env('FLUTTERWAVE_ENABLED') === 'true') providers.add('flutterwave');
  else providers.delete('flutterwave');
  return [...providers];
}

function enabledProviderPreflights() {
  return enabledProviderNames().filter((provider) => ['circle', 'flutterwave', 'smartspeed', 'paymentpoint'].includes(provider));
}

function mainnetMatrixIsValid() {
  try {
    const matrix = JSON.parse(env('MAINNET_CHAIN_MATRIX_JSON'));
    const enabled = (env('MAINNET_ENABLED_NETWORKS') || 'ARC').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
    const allowed = new Set(['ARC', 'ETHEREUM', 'POLYGON', 'AVALANCHE', 'ARBITRUM', 'BASE', 'OPTIMISM', 'SOLANA', 'MONAD']);
    if (!matrix || typeof matrix !== 'object' || !enabled.length || Object.keys(matrix).some((network) => !allowed.has(network))) return false;
    return enabled.every((network) => {
      const entry = matrix[network];
      return entry && typeof entry.circleBlockchain === 'string' && entry.circleBlockchain.trim()
        && typeof entry.cctpChain === 'string' && entry.cctpChain.trim()
        && !/(testnet|sepolia|amoy|fuji|devnet|sandbox)/i.test(`${entry.circleBlockchain} ${entry.cctpChain}`)
        && Array.isArray(entry.rpcUrls) && entry.rpcUrls.length > 0
        && entry.rpcUrls.every((url) => /^https:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url) && !/(testnet|sepolia|amoy|fuji|devnet|sandbox)/i.test(url))
        && Number.isSafeInteger(Number(entry.chainId)) && Number(entry.chainId) > 0
        && (/^0x[a-fA-F0-9]{40}$/.test(String(entry.usdcContract)) || /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(String(entry.usdcContract)))
        && Number.isInteger(Number(entry.usdcDecimals))
        && /^https:\/\//i.test(String(entry.explorerUrl || ''))
        && !/(testnet|sepolia|amoy|fuji|devnet|sandbox)/i.test(String(entry.explorerUrl || ''));
    });
  } catch {
    return false;
  }
}

function assertConfiguration() {
  const production = env('NODE_ENV') === 'production';
  const testing = env('TESTING_ENABLED') === 'true';
  const webhooksSigned = env('WEBHOOK_REQUIRE_SIGNATURE') !== 'false';
  const fundingGuard = env('BILLS_REQUIRE_FUNDING') !== 'false';
  const chainEnv = (env('CHAIN_ENV') || 'testnet').toLowerCase();
  const mainnet = env('MAINNET_ENABLED') === 'true';
  const movement = env('MONEY_MOVEMENT_ENABLED') === 'true';
  const ledgerReads = env('LEDGER_READS_ENABLED') === 'true';
  const enabledProviders = enabledProviderNames();
  const smartspeedEnabled = enabledProviders.includes('smartspeed');
  const paymentpointEnabled = enabledProviders.includes('paymentpoint');
  const flutterwaveEnabled = env('FLUTTERWAVE_ENABLED') === 'true' && enabledProviders.includes('flutterwave');
  const flutterwaveConfigured = Boolean(env('FLUTTERWAVE_SECRET_KEY') && env('FLUTTERWAVE_WEBHOOK_HASH'));

  const mainnetScope = scope === 'mainnet' || scope === 'mainnet-preflight';
  check('network-scope-is-explicit', mainnetScope ? chainEnv === 'mainnet' : chainEnv === 'testnet', `scope=${scope}; CHAIN_ENV=${chainEnv}.`);
  check('mainnet-scope-flag', mainnetScope ? mainnet : !mainnet, `scope=${scope}; MAINNET_ENABLED=${mainnet}.`);
  check('webhook-signatures-required', webhooksSigned, `WEBHOOK_REQUIRE_SIGNATURE=${webhooksSigned}.`);
  check('bill-funding-guard', fundingGuard, `BILLS_REQUIRE_FUNDING=${fundingGuard}.`);
  check('enabled-providers-known', enabledProviderNames().every((provider) => ['circle', 'flutterwave', 'smartspeed', 'paymentpoint'].includes(provider)), `ENABLED_PROVIDERS=${enabledProviderNames().join(',')}.`);
  check('jwt-secrets-are-non-placeholder', !isPlaceholderSecret(env('JWT_SECRET')) && !isPlaceholderSecret(env('JWT_REFRESH_SECRET')), 'JWT secrets are present and are not example values.');

  if (scope === 'testnet-demo') {
    check('demo-money-movement-disabled', !movement, 'MONEY_MOVEMENT_ENABLED=false keeps bills, conversions, sends, and withdrawals closed.');
    check('demo-is-not-production-financial-mode', !production || !movement, 'A read-only demo cannot have live money movement enabled.');
    check('demo-testing-mode-not-production', !production || !testing, 'TESTING_ENABLED is not allowed in production.');
    return;
  }

  if (mainnetScope) {
    // Shared by mainnet-preflight (money paused) and mainnet (money enabled).
    const circleKeyEnv = classifyCircleApiKey(env('CIRCLE_API_KEY'));
    check('production-runtime', production, `NODE_ENV=${env('NODE_ENV') || '(missing)'}; mainnet must run as production.`);
    check('testing-mode-disabled', !testing, 'TESTING_ENABLED must be false/unset in mainnet.');
    check('kyc-enforcement-enabled', env('REQUIRE_KYC_FOR_MONEY_MOVEMENT') !== 'false', 'Mainnet KYC enforcement cannot be disabled.');
    check('mainnet-config-approved', env('MAINNET_CONFIG_APPROVED') === 'true', 'MAINNET_CONFIG_APPROVED=true identifies the separately reviewed matrix packet.');
    check('mainnet-circle-live-key', circleKeyEnv === 'mainnet', `CIRCLE_API_KEY is ${redactCircleApiKey(env('CIRCLE_API_KEY'))}; mainnet requires LIVE_API_KEY:<id>:<secret> (https://developers.circle.com/api-reference/keys).`);
    check('mainnet-circle-entity-secret', isValidCircleEntitySecret(env('CIRCLE_ENTITY_SECRET')), 'CIRCLE_ENTITY_SECRET is the registered 32-byte hex entity secret.');
    check('mainnet-custody-wallet-set', isValidCircleWalletSetId(env('CIRCLE_WALLET_SET_ID')), 'A pre-created, custody-reviewed CIRCLE_WALLET_SET_ID (UUID) is configured; the app cannot create one on mainnet.');
    check('mainnet-referral-wallet-set-separate', !env('CIRCLE_REFERRAL_REWARD_WALLET_SET_ID') || (isValidCircleWalletSetId(env('CIRCLE_REFERRAL_REWARD_WALLET_SET_ID')) && env('CIRCLE_REFERRAL_REWARD_WALLET_SET_ID') !== env('CIRCLE_WALLET_SET_ID')), 'The referral reward wallet set, if configured, is a different wallet set from the application set.');
    check('mainnet-reviewed-chain-matrix', mainnetMatrixIsValid(), 'MAINNET_CHAIN_MATRIX_JSON contains complete, HTTPS, non-local, syntactically valid entries for every enabled network.');
    check('mainnet-db-isolation-confirmed', env('MAINNET_DB_ISOLATION_CONFIRMED') === 'true', 'MAINNET_DB_ISOLATION_CONFIRMED=true records that Production uses its own clean database, not the Staging/testnet or rehearsal database.');
    check('mainnet-db-not-staging', !env('STAGING_DATABASE_URL') || databaseIdentity(env('DATABASE_URL')) !== databaseIdentity(env('STAGING_DATABASE_URL')), 'DATABASE_URL does not point at the Staging database (compared against STAGING_DATABASE_URL when provided).');
    check('mainnet-db-not-rehearsal', !env('POSTGRES_TEST_DATABASE_URL') || databaseIdentity(env('DATABASE_URL')) !== databaseIdentity(env('POSTGRES_TEST_DATABASE_URL')), 'DATABASE_URL does not point at the rehearsal database.');
    check('mainnet-frontend-chain-env', !env('NEXT_PUBLIC_CHAIN_ENV') || env('NEXT_PUBLIC_CHAIN_ENV') === 'mainnet', 'NEXT_PUBLIC_CHAIN_ENV, when present in this environment, is mainnet.');
    const providerFile = env('PROVIDER_PREFLIGHT_EVIDENCE_FILE');
    for (const provider of enabledProviderPreflights()) {
      check(`${provider}-preflight-evidence`, providerEvidence(provider), `${provider} read-only preflight PASS is recorded in ${providerFile || '(PROVIDER_PREFLIGHT_EVIDENCE_FILE missing)'}.`);
    }
    check('smartspeed-credential', !smartspeedEnabled || Boolean(env('SMARTSPEED_API_TOKEN')), smartspeedEnabled
      ? 'Smartspeed credential is present for the configured bill provider.'
      : 'Smartspeed is not enabled for this deployment.');
    check('flutterwave-disabled-or-configured', !flutterwaveEnabled || flutterwaveConfigured, flutterwaveEnabled
      ? 'Flutterwave is enabled and its secret and webhook hash are present.'
      : 'Flutterwave is disabled; PaymentPoint is the selected local-funding provider.');
  }

  if (scope === 'mainnet-preflight') {
    check('preflight-money-movement-paused', !movement, 'MONEY_MOVEMENT_ENABLED must stay false for the read-only mainnet preflight.');
    check('preflight-no-release-approval-flag', env('FINANCIAL_RELEASE_APPROVED') !== 'true', 'FINANCIAL_RELEASE_APPROVED must not be set until the release packet is signed.');
    check('preflight-canary-staged', env('CANARY_MODE') === 'true', 'CANARY_MODE=true is staged so the first movement release is allowlist-only.');
    return;
  }

  if (scope === 'mainnet') {
    check('money-movement-explicitly-enabled', movement, 'MONEY_MOVEMENT_ENABLED=true is required for an approved mainnet release.');
    check('ledger-reads-cut-over', ledgerReads, 'LEDGER_READS_ENABLED=true is required before mainnet money movement.');
    check('mainnet-release-approval', env('FINANCIAL_RELEASE_APPROVED') === 'true' && Boolean(env('FINANCIAL_RELEASE_APPROVED_BY') && env('FINANCIAL_RELEASE_TICKET') && env('FINANCIAL_RELEASE_EVIDENCE_ID')), 'FINANCIAL_RELEASE_APPROVED=true plus the approver, ticket, and immutable evidence packet are present.');
    check('kyc-aml-evidence', Boolean(env('KYC_AML_EVIDENCE_ID')), 'KYC_AML_EVIDENCE_ID identifies the approved KYC/AML program and operating evidence.');
    check('sanctions-evidence', Boolean(env('SANCTIONS_PROVIDER_EVIDENCE_ID')), 'SANCTIONS_PROVIDER_EVIDENCE_ID identifies the production screening provider and test evidence.');
    check('custody-dual-control-evidence', Boolean(env('CUSTODY_DUAL_CONTROL_EVIDENCE_ID')), 'CUSTODY_DUAL_CONTROL_EVIDENCE_ID identifies segregated custody, key management, allowlists, and recovery evidence.');
    check('independent-security-review-evidence', Boolean(env('INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID')), 'INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID identifies the external security review and remediation sign-off.');
    check('disaster-recovery-evidence', Boolean(env('DISASTER_RECOVERY_EVIDENCE_ID')), 'DISASTER_RECOVERY_EVIDENCE_ID identifies backup restore, failover, and rollback evidence.');
    const canaryUsers = env('CANARY_USER_IDS').split(',').map((value) => value.trim()).filter(Boolean);
    check('staged-canary-control', env('CANARY_MODE') === 'true' ? canaryUsers.length > 0 : Boolean(env('STAGED_CANARY_EVIDENCE_ID')), env('CANARY_MODE') === 'true'
      ? 'CANARY_MODE=true has a non-empty approved user allowlist.'
      : 'Unrestricted mode has a staged-canary evidence packet.');
    check('ledger-alerts-enabled', env('LEDGER_DRIFT_ALERTS_ENABLED') !== 'false', 'Ledger drift alert watcher is enabled.');
    check('ledger-alert-destination', Boolean(env('LEDGER_DRIFT_WEBHOOK_URL') || (env('LEDGER_DRIFT_ALERT_EMAIL') && env('RESEND_API_KEY'))), 'A durable ledger-drift alert has a configured webhook or email destination.');
    check('circle-cctp-contract-evidence', Boolean(env('CIRCLE_CCTP_CONTRACT_EVIDENCE_ID')), 'CIRCLE_CCTP_CONTRACT_EVIDENCE_ID points to the reviewed backend CCTP/BridgeKit contract and replay/status evidence.');
    check('postgres-rehearsal-evidence', Boolean(env('POSTGRES_REHEARSAL_EVIDENCE_ID')), 'POSTGRES_REHEARSAL_EVIDENCE_ID points to the real PostgreSQL migration/locking/restart rehearsal.');
    check('testnet-e2e-evidence', Boolean(env('TESTNET_E2E_EVIDENCE_ID')), 'TESTNET_E2E_EVIDENCE_ID points to the completed sandbox receipt table.');
    check('alert-restart-evidence', Boolean(env('ALERT_RESTART_EVIDENCE_ID')), 'ALERT_RESTART_EVIDENCE_ID points to the durable alert failure/restart drill.');
    const paymentpointConfigured = Boolean(anyEnv('PAYMENTPOINT_API_KEY', 'PAYMENT_POINT_API_KEY')
      && anyEnv('PAYMENTPOINT_SECRET_KEY', 'PAYMENT_POINT_SECRET_KEY')
      && anyEnv('PAYMENTPOINT_BUSINESS_ID', 'PAYMENT_POINT_BUSINESS_ID'));
    const localFundingConfigured = (paymentpointEnabled && paymentpointConfigured) || (flutterwaveEnabled && flutterwaveConfigured);
    check('local-funding-provider-configured', localFundingConfigured, 'An enabled local-funding provider has complete credentials.');
    const paymentpointWebhookEnabled = env('PAYMENTPOINT_WEBHOOK_ENABLED') === 'true';
    const paymentpointWebhookContractConfigured = !paymentpointWebhookEnabled
      || Boolean(env('PAYMENTPOINT_WEBHOOK_CONTRACT_EVIDENCE_ID')
        && env('PAYMENTPOINT_WEBHOOK_SECRET')
        && env('PAYMENTPOINT_WEBHOOK_SIGNATURE_MODE')
        && env('PAYMENTPOINT_WEBHOOK_SIGNATURE_HEADER'));
    check('paymentpoint-webhook-contract-evidence', paymentpointWebhookContractConfigured, 'PaymentPoint callback crediting requires provider contract/captured-webhook evidence plus explicit signature configuration.');
    check('smartspeed-contract-evidence', !smartspeedEnabled || Boolean(env('SMARTSPEED_CONTRACT_EVIDENCE_ID')), smartspeedEnabled
      ? 'SMARTSPEED_CONTRACT_EVIDENCE_ID points to the provider contract and sandbox receipt packet.'
      : 'Smartspeed contract evidence is not required because the provider is disabled.');
    return;
  }

  check('production-runtime', production, `NODE_ENV=${env('NODE_ENV') || '(missing)'}; real-money mode must run as production.`);
  check('money-movement-explicitly-enabled', movement, 'MONEY_MOVEMENT_ENABLED=true is an operator decision, not a default.');
  check('ledger-reads-cut-over', ledgerReads, 'LEDGER_READS_ENABLED=true is required before production money movement.');
  check('testing-mode-disabled', !testing, 'TESTING_ENABLED must be false/unset in production.');
  check('operator-approved-release', env('FINANCIAL_RELEASE_APPROVED') === 'true' && Boolean(env('FINANCIAL_RELEASE_APPROVED_BY') && env('FINANCIAL_RELEASE_TICKET') && env('FINANCIAL_RELEASE_EVIDENCE_ID')), 'FINANCIAL_RELEASE_APPROVED=true plus the approver, ticket, and immutable evidence packet identify a reviewed release packet.');
  check('kyc-aml-evidence', Boolean(env('KYC_AML_EVIDENCE_ID')), 'KYC_AML_EVIDENCE_ID identifies the operating KYC/AML program; code status alone is not compliance approval.');
  check('sanctions-evidence', Boolean(env('SANCTIONS_PROVIDER_EVIDENCE_ID')), 'SANCTIONS_PROVIDER_EVIDENCE_ID identifies sanctions screening and test evidence.');
  check('custody-dual-control-evidence', Boolean(env('CUSTODY_DUAL_CONTROL_EVIDENCE_ID')), 'CUSTODY_DUAL_CONTROL_EVIDENCE_ID identifies segregated custody and recovery evidence.');
  check('independent-security-review-evidence', Boolean(env('INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID')), 'INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID identifies external security review and remediation sign-off.');
  check('disaster-recovery-evidence', Boolean(env('DISASTER_RECOVERY_EVIDENCE_ID')), 'DISASTER_RECOVERY_EVIDENCE_ID identifies backup restore, failover, and rollback evidence.');
  check('circle-testnet-credentials', classifyCircleApiKey(env('CIRCLE_API_KEY')) === 'testnet' && isValidCircleEntitySecret(env('CIRCLE_ENTITY_SECRET')), 'Circle TEST_API_KEY and registered entity secret are present; no LIVE_API_KEY may be mixed into this release.');
  check('smartspeed-credential', !smartspeedEnabled || Boolean(env('SMARTSPEED_API_TOKEN')), smartspeedEnabled
    ? 'Smartspeed credential is present for the configured bill provider.'
    : 'Smartspeed is not enabled for this deployment.');
  const paymentpointConfigured = Boolean(anyEnv('PAYMENTPOINT_API_KEY', 'PAYMENT_POINT_API_KEY')
    && anyEnv('PAYMENTPOINT_SECRET_KEY', 'PAYMENT_POINT_SECRET_KEY')
    && anyEnv('PAYMENTPOINT_BUSINESS_ID', 'PAYMENT_POINT_BUSINESS_ID'));
  const localFundingConfigured = (paymentpointEnabled && paymentpointConfigured) || (flutterwaveEnabled && flutterwaveConfigured);
  check('local-funding-provider-configured', localFundingConfigured, 'An enabled local-funding provider has complete credentials.');
  check('flutterwave-disabled-or-configured', !flutterwaveEnabled || flutterwaveConfigured, flutterwaveEnabled
    ? 'Flutterwave is enabled and its secret and webhook hash are present.'
    : 'Flutterwave is disabled; PaymentPoint is the selected local-funding provider.');
  const paymentpointWebhookEnabled = env('PAYMENTPOINT_WEBHOOK_ENABLED') === 'true';
  const paymentpointWebhookContractConfigured = !paymentpointWebhookEnabled
    || Boolean(env('PAYMENTPOINT_WEBHOOK_CONTRACT_EVIDENCE_ID')
      && env('PAYMENTPOINT_WEBHOOK_SECRET')
      && env('PAYMENTPOINT_WEBHOOK_SIGNATURE_MODE')
      && env('PAYMENTPOINT_WEBHOOK_SIGNATURE_HEADER'));
  check('paymentpoint-webhook-contract-evidence', paymentpointWebhookContractConfigured, 'PaymentPoint callback crediting requires provider contract/captured-webhook evidence plus explicit signature configuration.');
  check('ledger-alerts-enabled', env('LEDGER_DRIFT_ALERTS_ENABLED') !== 'false', 'Ledger drift alert watcher is enabled.');
  check('ledger-alert-destination', Boolean(env('LEDGER_DRIFT_WEBHOOK_URL') || (env('LEDGER_DRIFT_ALERT_EMAIL') && env('RESEND_API_KEY'))), 'A durable ledger-drift alert has a configured webhook or email destination.');
  check('circle-cctp-contract-evidence', Boolean(env('CIRCLE_CCTP_CONTRACT_EVIDENCE_ID')), 'CIRCLE_CCTP_CONTRACT_EVIDENCE_ID points to the reviewed backend CCTP/BridgeKit contract and replay/status evidence.');
  check('postgres-rehearsal-evidence', Boolean(env('POSTGRES_REHEARSAL_EVIDENCE_ID')), 'POSTGRES_REHEARSAL_EVIDENCE_ID points to the real PostgreSQL migration/locking/restart rehearsal.');
  check('testnet-e2e-evidence', Boolean(env('TESTNET_E2E_EVIDENCE_ID')), 'TESTNET_E2E_EVIDENCE_ID points to the completed sandbox receipt table.');
  check('alert-restart-evidence', Boolean(env('ALERT_RESTART_EVIDENCE_ID')), 'ALERT_RESTART_EVIDENCE_ID points to the durable alert failure/restart drill.');

  const providerFile = env('PROVIDER_PREFLIGHT_EVIDENCE_FILE');
  for (const provider of enabledProviderPreflights()) {
    check(`${provider}-preflight-evidence`, providerEvidence(provider), `${provider} read-only preflight PASS is recorded in ${providerFile || '(PROVIDER_PREFLIGHT_EVIDENCE_FILE missing)'}.`);
  }
  // The read-only catalog probe proves reachability only. Keep the separate
  // contract evidence gate until status, idempotency, and reconciliation
  // semantics are captured from the provider.
  check('smartspeed-contract-evidence', !smartspeedEnabled || Boolean(env('SMARTSPEED_CONTRACT_EVIDENCE_ID')), smartspeedEnabled
    ? 'SMARTSPEED_CONTRACT_EVIDENCE_ID points to the provider contract and sandbox receipt packet.'
    : 'Smartspeed contract evidence is not required because the provider is disabled.');
}

async function databaseChecks() {
  const url = env('DATABASE_URL') || env('SXDB_URL');
  if (!url) {
    pending('postgres-connection', 'DATABASE_URL/SXDB_URL is unavailable; migration, ledger, pending-row, and durable-alert checks could not run.');
    return;
  }

  const client = new Client({
    connectionString: url,
    // Managed hosts require TLS; a local rehearsal server can opt out with
    // sslmode=disable in the URL.
    ssl: /sslmode=disable/i.test(url) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    query_timeout: 120_000,
  });
  try {
    await client.connect();
    check('postgres-connection', true, 'Connected to PostgreSQL.');

    const tableRows = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])
    `, [['User', 'Wallet', 'Transaction', 'BillPayment', 'LedgerEntry', 'AuditLog', 'LedgerAlertDelivery', 'IdempotencyRecord', 'FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation', 'DeploymentEnvironment']]);
    const found = new Set(tableRows.rows.map((row) => row.table_name));
    const required = ['User', 'Wallet', 'Transaction', 'BillPayment', 'LedgerEntry', 'AuditLog', 'LedgerAlertDelivery', 'IdempotencyRecord', 'FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation', 'DeploymentEnvironment'];
    check('financial-schema-present', required.every((table) => found.has(table)), `Required tables present: ${required.filter((table) => found.has(table)).join(', ')}.`);
    if (found.has('FinancialControl')) {
      const controls = await client.query(`SELECT "moneyMovementEnabled", "cryptoEnabled", "billPaymentsEnabled", "inboundCreditsEnabled" FROM "FinancialControl" WHERE "id"='global'`);
      const control = controls.rows[0];
      const enabled = Boolean(control && control.moneyMovementEnabled);
      check('database-financial-control-present', Boolean(control), 'The global database circuit-breaker row exists.');
      const pausedScope = scope === 'testnet-demo' || scope === 'mainnet-preflight';
      check('database-financial-control-scope', pausedScope ? !enabled : enabled, pausedScope
        ? 'Paused scope: database control remains paused.'
        : 'Real-money scope has explicitly enabled the database control plane after two-person approval.');
      if (!pausedScope && control) {
        check('database-crypto-control', Boolean(control.cryptoEnabled), 'Crypto control is enabled for the requested real-money scope.');
        check('database-bill-control', Boolean(control.billPaymentsEnabled), 'Bill-payment control is enabled for the requested real-money scope.');
        check('database-inbound-control', Boolean(control.inboundCreditsEnabled), 'Inbound-credit control is enabled for the requested real-money scope.');
      }
    }

    if (found.has('DeploymentEnvironment')) {
      const chainEnv = (env('CHAIN_ENV') || 'testnet').toLowerCase();
      const stamps = await client.query(`SELECT "chainEnvironment", "circleKeyPrefix", "stampedAt" FROM "DeploymentEnvironment" WHERE "id"='global'`);
      const stamp = stamps.rows[0];
      if (stamp) {
        check('database-environment-stamp', stamp.chainEnvironment === chainEnv, `Database is stamped ${stamp.chainEnvironment} (Circle ${stamp.circleKeyPrefix}, ${new Date(stamp.stampedAt).toISOString()}); CHAIN_ENV=${chainEnv}.`);
      } else if (chainEnv === 'mainnet') {
        const usage = await client.query(`
          SELECT
            (SELECT COUNT(*)::int FROM "Wallet") AS wallets,
            (SELECT COUNT(*)::int FROM "WalletAddress") AS addresses,
            (SELECT COUNT(*)::int FROM "LedgerEntry") AS ledger,
            (SELECT COUNT(*)::int FROM "Transaction") AS transactions,
            (SELECT COUNT(*)::int FROM "Wallet"
              WHERE COALESCE("usdcBalance",0)<>0 OR COALESCE("usdtBalance",0)<>0 OR COALESCE("localBalance",0)<>0
                 OR COALESCE("realLocalBalance",0)<>0 OR COALESCE("pendingBalance",0)<>0
                 OR COALESCE("localBalances",'{}'::jsonb)<>'{}'::jsonb) AS funded
        `);
        const u = usage.rows[0];
        const clean = Number(u.addresses) === 0 && Number(u.ledger) === 0 && Number(u.funded) === 0 && Number(u.transactions) === 0;
        check('database-clean-for-mainnet-stamp', clean, `Unstamped database has ${u.wallets} wallets (${u.funded} funded), ${u.addresses} deposit addresses, ${u.ledger} ledger entries, ${u.transactions} transactions; it must be empty of financial history before its first mainnet boot.`);
      } else {
        check('database-environment-stamp', true, 'Database is not yet stamped; the first testnet boot will stamp it testnet.');
      }
    }

    const migrationDirs = fs.readdirSync(path.join(__dirname, '..', 'prisma', 'migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const appliedRows = await client.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`);
    const applied = new Set(appliedRows.rows.map((row) => row.migration_name));
    const missingMigrations = migrationDirs.filter((migration) => !applied.has(migration));
    check('all-checked-in-migrations-applied', missingMigrations.length === 0, missingMigrations.length ? `Not applied: ${missingMigrations.join(', ')}.` : `${migrationDirs.length} checked-in migrations are finished.`);

    const pendingRows = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "Transaction"
      WHERE status = 'PENDING'
        AND type IN ('SEND', 'BILL_PAYMENT')
        AND ("createdAt" < NOW() - INTERVAL '5 minutes' OR COALESCE(metadata->>'reconciliationRequired', 'false') = 'true')
    `);
    check('no-stale-provider-pending-rows', Number(pendingRows.rows[0].count) === 0, `${pendingRows.rows[0].count} send/bill row(s) require provider reconciliation.`);

    const inboundRows = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "Transaction"
      WHERE status = 'PENDING' AND type = 'RECEIVE'
        AND COALESCE(metadata->>'reconciliationRequired', 'false') = 'true'
    `);
    check('no-unresolved-inbound-credits', Number(inboundRows.rows[0].count) === 0, `${inboundRows.rows[0].count} inbound credit(s) require chain/provider evidence.`);

    const billRows = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "BillPayment"
      WHERE status = 'PENDING'
        AND ("createdAt" < NOW() - INTERVAL '5 minutes' OR COALESCE(metadata->>'reconciliationRequired', 'false') = 'true')
    `);
    check('no-stale-bill-reservations', Number(billRows.rows[0].count) === 0, `${billRows.rows[0].count} bill reservation(s) remain pending/stale.`);

    const alertRows = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'RETRY')::int AS retries,
        COUNT(*) FILTER (WHERE status = 'PENDING' AND "nextAttemptAt" <= NOW())::int AS due
      FROM "LedgerAlertDelivery"
    `);
    check('durable-alert-outbox-clear', Number(alertRows.rows[0].retries) === 0 && Number(alertRows.rows[0].due) === 0, `${alertRows.rows[0].retries} retrying and ${alertRows.rows[0].due} due alert deliveries remain.`);

    const driftRows = await client.query(`SELECT COUNT(*)::int AS count FROM "AuditLog" WHERE action = 'LEDGER_DRIFT'`);
    check('no-persisted-ledger-drift', Number(driftRows.rows[0].count) === 0, `${driftRows.rows[0].count} LEDGER_DRIFT audit row(s) require operator review.`);

    const processingRows = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM "IdempotencyRecord"
      WHERE status = 'PROCESSING' AND "updatedAt" < NOW() - INTERVAL '15 minutes'
    `);
    check('no-stale-idempotency-claims', Number(processingRows.rows[0].count) === 0, `${processingRows.rows[0].count} idempotency claim(s) are stale.`);

    // Use the pg-only report so this gate does not depend on a locally
    // generated Prisma engine. A non-zero report is a blocker, and an execution
    // failure is pending evidence rather than an invented clean result.
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'db-ledger-ops.js'), 'report'], {
        cwd: __dirname,
        env: { ...process.env, SXDB_URL: url },
        stdio: 'pipe',
        encoding: 'utf8',
      });
      check('ledger-report-clean', true, 'PostgreSQL double-entry and ledger/float report is clean.');
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`.slice(-1200).replace(/\s+/g, ' ').trim();
      if (error.status === 1 && /DRIFT|VIOLATION|REAL DRIFT|USER ACCOUNT DRIFT/i.test(output)) {
        check('ledger-report-clean', false, `Ledger report found drift: ${output}`);
      } else {
        pending('ledger-report-clean', `Ledger report could not be completed: ${output || error.message}.`);
      }
    }
  } catch (error) {
    pending('postgres-validation', `PostgreSQL validation failed before evidence could be recorded: ${error.message || error}.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  assertConfiguration();
  await databaseChecks();

  const output = process.env.LAUNCH_GATE_EVIDENCE_FILE;
  if (output) {
    const absolute = path.resolve(output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(`Wrote redacted launch-gate evidence to ${absolute}`);
  }

  const blockers = checks.filter((row) => row.status !== 'PASS');
  console.log(`\nLaunch gate ${scope}: ${blockers.length ? 'BLOCKED' : 'PASS'}`);
  for (const row of blockers) console.log(`- ${row.status}: ${row.name} — ${row.detail}`);
  process.exitCode = blockers.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});

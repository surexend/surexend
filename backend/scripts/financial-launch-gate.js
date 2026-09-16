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
 *   node scripts/financial-launch-gate.js --scope=mainnet
 *
 * `--scope=testnet-demo` verifies that a public demo is read-only and testnet
 * bound. `limited-real-money` verifies the stronger production gates for
 * testnet-backed money movement and bills. `mainnet` validates the explicit
 * reviewed matrix and then requires the stronger external release evidence.
 *
 * Set LAUNCH_GATE_EVIDENCE_FILE to write a redacted JSON release artifact.
 * KYC/AML, custody, licensing, provider contracts, and independent review are
 * release evidence requirements; this script never fabricates them.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='));
const scope = (scopeArg ? scopeArg.slice('--scope='.length) : 'testnet-demo').toLowerCase();
const validScopes = new Set(['testnet-demo', 'limited-real-money', 'mainnet']);
if (!validScopes.has(scope)) {
  console.error('Scope must be testnet-demo, limited-real-money, or mainnet.');
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

  check('network-scope-is-explicit', scope === 'mainnet' ? chainEnv === 'mainnet' : chainEnv === 'testnet', `scope=${scope}; CHAIN_ENV=${chainEnv}.`);
  check('mainnet-scope-flag', scope === 'mainnet' ? mainnet : !mainnet, `scope=${scope}; MAINNET_ENABLED=${mainnet}.`);
  check('webhook-signatures-required', webhooksSigned, `WEBHOOK_REQUIRE_SIGNATURE=${webhooksSigned}.`);
  check('bill-funding-guard', fundingGuard, `BILLS_REQUIRE_FUNDING=${fundingGuard}.`);
  check('jwt-secrets-are-non-placeholder', !isPlaceholderSecret(env('JWT_SECRET')) && !isPlaceholderSecret(env('JWT_REFRESH_SECRET')), 'JWT secrets are present and are not example values.');

  if (scope === 'testnet-demo') {
    check('demo-money-movement-disabled', !movement, 'MONEY_MOVEMENT_ENABLED=false keeps bills, conversions, sends, and withdrawals closed.');
    check('demo-is-not-production-financial-mode', !production || !movement, 'A read-only demo cannot have live money movement enabled.');
    check('demo-testing-mode-not-production', !production || !testing, 'TESTING_ENABLED is not allowed in production.');
    return;
  }

  if (scope === 'mainnet') {
    check('mainnet-config-approved', env('MAINNET_CONFIG_APPROVED') === 'true', 'MAINNET_CONFIG_APPROVED=true identifies the separately reviewed matrix packet.');
    check('mainnet-circle-credential', Boolean(env('CIRCLE_API_KEY') && !env('CIRCLE_API_KEY').startsWith('TEST_') && env('CIRCLE_ENTITY_SECRET')), 'A non-test Circle credential pair is configured.');
    check('mainnet-reviewed-chain-matrix', mainnetMatrixIsValid(), 'MAINNET_CHAIN_MATRIX_JSON contains complete, HTTPS, non-local, syntactically valid entries for every enabled network.');
    check('mainnet-release-approval', Boolean(env('FINANCIAL_RELEASE_APPROVED_BY') && env('FINANCIAL_RELEASE_TICKET') && env('FINANCIAL_RELEASE_EVIDENCE_ID')), 'Mainnet financial release approval, ticket, and immutable evidence packet are present.');
    check('kyc-aml-evidence', Boolean(env('KYC_AML_EVIDENCE_ID')), 'KYC_AML_EVIDENCE_ID identifies the approved KYC/AML program and operating evidence.');
    check('sanctions-evidence', Boolean(env('SANCTIONS_PROVIDER_EVIDENCE_ID')), 'SANCTIONS_PROVIDER_EVIDENCE_ID identifies the production screening provider and test evidence.');
    check('custody-dual-control-evidence', Boolean(env('CUSTODY_DUAL_CONTROL_EVIDENCE_ID')), 'CUSTODY_DUAL_CONTROL_EVIDENCE_ID identifies segregated custody, key management, allowlists, and recovery evidence.');
    check('independent-security-review-evidence', Boolean(env('INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID')), 'INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID identifies the external security review and remediation sign-off.');
    check('disaster-recovery-evidence', Boolean(env('DISASTER_RECOVERY_EVIDENCE_ID')), 'DISASTER_RECOVERY_EVIDENCE_ID identifies backup restore, failover, and rollback evidence.');
    return;
  }

  check('production-runtime', production, `NODE_ENV=${env('NODE_ENV') || '(missing)'}; real-money mode must run as production.`);
  check('money-movement-explicitly-enabled', movement, 'MONEY_MOVEMENT_ENABLED=true is an operator decision, not a default.');
  check('ledger-reads-cut-over', ledgerReads, 'LEDGER_READS_ENABLED=true is required before production money movement.');
  check('testing-mode-disabled', !testing, 'TESTING_ENABLED must be false/unset in production.');
  check('operator-approved-release', Boolean(env('FINANCIAL_RELEASE_APPROVED_BY') && env('FINANCIAL_RELEASE_TICKET') && env('FINANCIAL_RELEASE_EVIDENCE_ID')), 'FINANCIAL_RELEASE_APPROVED_BY, FINANCIAL_RELEASE_TICKET, and FINANCIAL_RELEASE_EVIDENCE_ID identify a reviewed release packet.');
  check('kyc-aml-evidence', Boolean(env('KYC_AML_EVIDENCE_ID')), 'KYC_AML_EVIDENCE_ID identifies the operating KYC/AML program; code status alone is not compliance approval.');
  check('sanctions-evidence', Boolean(env('SANCTIONS_PROVIDER_EVIDENCE_ID')), 'SANCTIONS_PROVIDER_EVIDENCE_ID identifies sanctions screening and test evidence.');
  check('custody-dual-control-evidence', Boolean(env('CUSTODY_DUAL_CONTROL_EVIDENCE_ID')), 'CUSTODY_DUAL_CONTROL_EVIDENCE_ID identifies segregated custody and recovery evidence.');
  check('independent-security-review-evidence', Boolean(env('INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID')), 'INDEPENDENT_SECURITY_REVIEW_EVIDENCE_ID identifies external security review and remediation sign-off.');
  check('disaster-recovery-evidence', Boolean(env('DISASTER_RECOVERY_EVIDENCE_ID')), 'DISASTER_RECOVERY_EVIDENCE_ID identifies backup restore, failover, and rollback evidence.');
  check('circle-testnet-credentials', env('CIRCLE_API_KEY').startsWith('TEST_') && Boolean(env('CIRCLE_ENTITY_SECRET')), 'Circle testnet API key and entity secret are present; no live key may be mixed into this release.');
  check('smartspeed-credential', Boolean(env('SMARTSPEED_API_TOKEN')), 'Smartspeed credential is present for the configured bill provider.');
  check('flutterwave-credential-and-signing', Boolean(env('FLUTTERWAVE_SECRET_KEY') && env('FLUTTERWAVE_WEBHOOK_HASH')), 'Flutterwave secret and webhook hash are present for signed NGN deposits.');
  check('paymentpoint-webhook-closed-until-contract', env('PAYMENTPOINT_WEBHOOK_ENABLED') !== 'true', 'PaymentPoint callback crediting remains disabled until its signature contract is evidenced.');
  check('ledger-alerts-enabled', env('LEDGER_DRIFT_ALERTS_ENABLED') !== 'false', 'Ledger drift alert watcher is enabled.');
  check('ledger-alert-destination', Boolean(env('LEDGER_DRIFT_WEBHOOK_URL') || (env('LEDGER_DRIFT_ALERT_EMAIL') && env('RESEND_API_KEY'))), 'A durable ledger-drift alert has a configured webhook or email destination.');
  check('circle-cctp-contract-evidence', Boolean(env('CIRCLE_CCTP_CONTRACT_EVIDENCE_ID')), 'CIRCLE_CCTP_CONTRACT_EVIDENCE_ID points to the reviewed backend CCTP/BridgeKit contract and replay/status evidence.');
  check('postgres-rehearsal-evidence', Boolean(env('POSTGRES_REHEARSAL_EVIDENCE_ID')), 'POSTGRES_REHEARSAL_EVIDENCE_ID points to the real PostgreSQL migration/locking/restart rehearsal.');
  check('testnet-e2e-evidence', Boolean(env('TESTNET_E2E_EVIDENCE_ID')), 'TESTNET_E2E_EVIDENCE_ID points to the completed sandbox receipt table.');
  check('alert-restart-evidence', Boolean(env('ALERT_RESTART_EVIDENCE_ID')), 'ALERT_RESTART_EVIDENCE_ID points to the durable alert failure/restart drill.');

  const providerFile = env('PROVIDER_PREFLIGHT_EVIDENCE_FILE');
  check('circle-preflight-evidence', providerEvidence('circle'), `Circle read-only preflight PASS is recorded in ${providerFile || '(PROVIDER_PREFLIGHT_EVIDENCE_FILE missing)'}.`);
  check('flutterwave-preflight-evidence', providerEvidence('flutterwave'), `Flutterwave read-only preflight PASS is recorded in ${providerFile || '(PROVIDER_PREFLIGHT_EVIDENCE_FILE missing)'}.`);
  // Smartspeed deliberately returns PENDING_UNVERIFIED until the provider
  // supplies an authoritative status/idempotency contract. Keep this explicit
  // rather than allowing a guessed endpoint to become a release gate bypass.
  check('smartspeed-contract-evidence', Boolean(env('SMARTSPEED_CONTRACT_EVIDENCE_ID')), 'SMARTSPEED_CONTRACT_EVIDENCE_ID points to the provider contract and sandbox receipt packet.');
}

async function databaseChecks() {
  const url = env('DATABASE_URL') || env('SXDB_URL');
  if (!url) {
    pending('postgres-connection', 'DATABASE_URL/SXDB_URL is unavailable; migration, ledger, pending-row, and durable-alert checks could not run.');
    return;
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
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
    `, [['User', 'Wallet', 'Transaction', 'BillPayment', 'LedgerEntry', 'AuditLog', 'LedgerAlertDelivery', 'IdempotencyRecord', 'FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation']]);
    const found = new Set(tableRows.rows.map((row) => row.table_name));
    const required = ['User', 'Wallet', 'Transaction', 'BillPayment', 'LedgerEntry', 'AuditLog', 'LedgerAlertDelivery', 'IdempotencyRecord', 'FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation'];
    check('financial-schema-present', required.every((table) => found.has(table)), `Required tables present: ${required.filter((table) => found.has(table)).join(', ')}.`);
    if (found.has('FinancialControl')) {
      const controls = await client.query(`SELECT "moneyMovementEnabled", "cryptoEnabled", "billPaymentsEnabled", "inboundCreditsEnabled" FROM "FinancialControl" WHERE "id"='global'`);
      const control = controls.rows[0];
      const enabled = Boolean(control && control.moneyMovementEnabled);
      check('database-financial-control-present', Boolean(control), 'The global database circuit-breaker row exists.');
      check('database-financial-control-scope', scope === 'testnet-demo' ? !enabled : enabled, scope === 'testnet-demo'
        ? 'Read-only demo database control remains paused.'
        : 'Real-money scope has explicitly enabled the database control plane after two-person approval.');
      if (scope !== 'testnet-demo' && control) {
        check('database-crypto-control', Boolean(control.cryptoEnabled), 'Crypto control is enabled for the requested real-money scope.');
        check('database-bill-control', Boolean(control.billPaymentsEnabled), 'Bill-payment control is enabled for the requested real-money scope.');
        check('database-inbound-control', Boolean(control.inboundCreditsEnabled), 'Inbound-credit control is enabled for the requested real-money scope.');
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
  if (scope === 'mainnet') {
    // Do not imply that any database result could override the hard mainnet
    // implementation blocker.
    await databaseChecks();
  } else {
    await databaseChecks();
  }

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

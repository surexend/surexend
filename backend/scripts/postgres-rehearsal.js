#!/usr/bin/env node

/**
 * PostgreSQL-only operational rehearsal for the money-flow safety patterns.
 *
 * It creates an isolated, random schema in a dedicated rehearsal database,
 * exercises the guarded pending-row claim with two concurrent connections, and
 * verifies that durable alert state is visible after the first connection is
 * closed. It never writes the application's public tables.
 *
 * Preferred configuration:
 *   POSTGRES_TEST_DATABASE_URL=postgresql://... node scripts/postgres-rehearsal.js
 *
 * DATABASE_URL is accepted only with POSTGRES_REHEARSAL_ALLOW_DATABASE_URL=true
 * so a production URL cannot be mutated accidentally. If no dedicated URL is
 * available, the script reports PENDING_EVIDENCE and exits 3.
 *
 * This is intentionally separate from Jest: it is an opt-in test of real
 * PostgreSQL row-lock/transaction behavior, not an in-memory simulation.
 */
const { Client } = require('pg');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.POSTGRES_TEST_DATABASE_URL
  || (process.env.POSTGRES_REHEARSAL_ALLOW_DATABASE_URL === 'true' ? process.env.DATABASE_URL : '');

if (!url) {
  console.error('[PENDING_EVIDENCE] No dedicated PostgreSQL rehearsal URL is configured. Set POSTGRES_TEST_DATABASE_URL.');
  process.exit(3);
}

const schema = `sx_rehearsal_${Date.now()}_${randomBytes(4).toString('hex')}`;
const quoteIdent = (value) => `"${String(value).replaceAll('"', '""')}"`;
const qSchema = quoteIdent(schema);
const qualified = (table) => `${qSchema}.${quoteIdent(table)}`;

function dbClient() {
  return new Client({
    connectionString: url,
    ...(process.env.POSTGRES_REHEARSAL_SSL === 'false' ? {} : { ssl: { rejectUnauthorized: false } }),
    connectionTimeoutMillis: 20_000,
    query_timeout: 60_000,
  });
}

async function main() {
  const admin = dbClient();
  const results = [];
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${qSchema}`);
    await admin.query(`
      CREATE TABLE ${qualified('Transaction')} (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        locked_amount INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE ${qualified('LedgerAlertDelivery')} (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      INSERT INTO ${qualified('Transaction')} (id, status, locked_amount)
      VALUES ('send-1', 'PENDING', 501);
      INSERT INTO ${qualified('LedgerAlertDelivery')} (id, status, attempts)
      VALUES ('alert-1', 'RETRY', 1);
    `);

    const first = dbClient();
    const second = dbClient();
    await first.connect();
    await second.connect();
    try {
      await first.query(`SET search_path TO ${qSchema}`);
      await second.query(`SET search_path TO ${qSchema}`);

      await first.query('BEGIN');
      const firstClaim = await first.query(`
        UPDATE "Transaction"
        SET status = 'COMPLETED'
        WHERE id = 'send-1' AND status = 'PENDING'
        RETURNING id
      `);
      if (firstClaim.rowCount !== 1) throw new Error('first guarded claim did not claim the pending row');

      // The second UPDATE blocks on the row lock until the first transaction
      // commits. It must then observe status=COMPLETED and affect zero rows.
      await second.query('BEGIN');
      const secondClaimPromise = second.query(`
        UPDATE "Transaction"
        SET status = 'COMPLETED'
        WHERE id = 'send-1' AND status = 'PENDING'
        RETURNING id
      `);
      await new Promise((resolve) => setImmediate(resolve));
      await first.query('COMMIT');
      const secondClaim = await secondClaimPromise;
      await second.query('COMMIT');
      if (secondClaim.rowCount !== 0) throw new Error('concurrent duplicate claim changed the already-settled row');
      results.push({ name: 'concurrent-duplicate-claim', status: 'PASS' });
    } finally {
      await first.end().catch(() => undefined);
      await second.end().catch(() => undefined);
    }

    // Simulate a worker/process boundary: close one connection after a RETRY
    // state is persisted, then open a fresh connection and read the same row.
    const beforeRestart = dbClient();
    await beforeRestart.connect();
    await beforeRestart.query(`SET search_path TO ${qSchema}`);
    await beforeRestart.query(`UPDATE "LedgerAlertDelivery" SET attempts = attempts + 1, last_error = 'simulated outage' WHERE id = 'alert-1'`);
    await beforeRestart.end();

    const afterRestart = dbClient();
    await afterRestart.connect();
    try {
      await afterRestart.query(`SET search_path TO ${qSchema}`);
      const persisted = await afterRestart.query(`SELECT status, attempts, last_error FROM "LedgerAlertDelivery" WHERE id = 'alert-1'`);
      const row = persisted.rows[0];
      if (!row || row.status !== 'RETRY' || row.attempts !== 2 || row.last_error !== 'simulated outage') {
        throw new Error(`durable alert state was not persisted across connections: ${JSON.stringify(row)}`);
      }
      results.push({ name: 'durable-alert-restart', status: 'PASS' });
    } finally {
      await afterRestart.end().catch(() => undefined);
    }

    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), schema, results }, null, 2));
    const evidenceFile = process.env.POSTGRES_REHEARSAL_EVIDENCE_FILE;
    if (evidenceFile) {
      const absolute = path.resolve(evidenceFile);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, `${JSON.stringify({ checkedAt: new Date().toISOString(), schema, results }, null, 2)}\n`, { mode: 0o600 });
      console.log(`Wrote PostgreSQL rehearsal evidence to ${absolute}`);
    }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${qSchema} CASCADE`).catch((error) => {
      console.error(`[WARN] Could not clean rehearsal schema ${schema}: ${error.message || error}`);
    });
    await admin.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[FAIL] PostgreSQL rehearsal failed: ${error.stack || error}`);
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Apply every checked-in Prisma migration to a dedicated PostgreSQL database,
 * then verify the fail-closed control plane, transaction rollback behavior, and
 * migration history. This never targets public application tables unless the
 * caller explicitly opts in with POSTGRES_MIGRATION_REHEARSAL_ALLOW_DATABASE_URL.
 *
 * Required for a real run:
 *   POSTGRES_MIGRATION_REHEARSAL_DATABASE_URL=postgresql://... node scripts/postgres-migration-rehearsal.js
 *
 * The URL must point at an isolated rehearsal database. A production URL is
 * accepted only with POSTGRES_MIGRATION_REHEARSAL_ALLOW_DATABASE_URL=true.
 * POSTGRES_MIGRATION_REHEARSAL_SSL=false is for a local dedicated server only.
 *
 * Exit codes: 0 = migration/rollback checks passed; 1 = failure; 3 = pending
 * evidence because no dedicated database was supplied or backup tooling was not
 * supplied.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const url = process.env.POSTGRES_MIGRATION_REHEARSAL_DATABASE_URL
  || (process.env.POSTGRES_MIGRATION_REHEARSAL_ALLOW_DATABASE_URL === 'true' ? process.env.DATABASE_URL : '');
if (!url) {
  console.error('[PENDING_EVIDENCE] Set POSTGRES_MIGRATION_REHEARSAL_DATABASE_URL to an isolated rehearsal database.');
  process.exit(3);
}

const migrationRoot = path.resolve(__dirname, '..', 'prisma', 'migrations');
const migrations = fs.readdirSync(migrationRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function client() {
  return new Client({
    connectionString: url,
    ...(process.env.POSTGRES_MIGRATION_REHEARSAL_SSL === 'false' ? {} : { ssl: { rejectUnauthorized: false } }),
    connectionTimeoutMillis: 20_000,
    query_timeout: 120_000,
  });
}

async function main() {
  const db = client();
  const results = [];
  await db.connect();
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS "_sx_rehearsal_migrations" (
        migration_name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of migrations) {
      const already = await db.query('SELECT 1 FROM "_sx_rehearsal_migrations" WHERE migration_name = $1', [migration]);
      if (already.rowCount) continue;
      const sql = fs.readFileSync(path.join(migrationRoot, migration, 'migration.sql'), 'utf8');
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('INSERT INTO "_sx_rehearsal_migrations" (migration_name) VALUES ($1)', [migration]);
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw new Error(`migration ${migration} failed: ${error.message || error}`);
      }
    }
    results.push({ name: 'checked-in-migrations-applied', status: 'PASS', count: migrations.length });

    const requiredTables = ['User', 'Wallet', 'LedgerEntry', 'FinancialControl', 'FinancialControlChange', 'FinancialLimitBucket', 'FinancialLimitReservation'];
    const tableRows = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [requiredTables]);
    const found = new Set(tableRows.rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !found.has(table));
    if (missing.length) throw new Error(`migration schema is missing ${missing.join(', ')}`);
    results.push({ name: 'financial-schema-present', status: 'PASS', count: requiredTables.length });

    const control = await db.query('SELECT "moneyMovementEnabled", "cryptoEnabled", "billPaymentsEnabled", "inboundCreditsEnabled" FROM "FinancialControl" WHERE id = $1', ['global']);
    const row = control.rows[0];
    if (!row || row.moneyMovementEnabled || row.cryptoEnabled || row.billPaymentsEnabled || row.inboundCreditsEnabled) {
      throw new Error('financial control did not start in the fail-closed paused state');
    }
    results.push({ name: 'financial-control-fail-closed', status: 'PASS' });

    await db.query('BEGIN');
    await db.query('UPDATE "FinancialControl" SET reason = $1 WHERE id = $2', ['rollback rehearsal must not persist', 'global']);
    await db.query('ROLLBACK');
    const afterRollback = await db.query('SELECT reason FROM "FinancialControl" WHERE id = $1', ['global']);
    if (afterRollback.rows[0]?.reason === 'rollback rehearsal must not persist') {
      throw new Error('transaction rollback did not restore the control row');
    }
    results.push({ name: 'transaction-rollback', status: 'PASS' });

    const dumpBin = process.env.PG_DUMP_BIN;
    const restoreBin = process.env.PG_RESTORE_BIN;
    if (dumpBin && restoreBin) {
      results.push({ name: 'backup-restore-tooling-configured', status: 'PENDING_EXTERNAL_EXECUTION', detail: 'pg_dump/pg_restore paths supplied; execute against the dedicated database and retain the dump checksum.' });
    } else {
      results.push({ name: 'backup-restore-tooling', status: 'PENDING_EVIDENCE', detail: 'Set PG_DUMP_BIN and PG_RESTORE_BIN and run the backup/restore drill against the dedicated database.' });
    }

    const evidence = { checkedAt: new Date().toISOString(), migrations, results };
    console.log(JSON.stringify(evidence, null, 2));
    if (process.env.POSTGRES_MIGRATION_REHEARSAL_EVIDENCE_FILE) {
      const output = path.resolve(process.env.POSTGRES_MIGRATION_REHEARSAL_EVIDENCE_FILE);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      console.log(`Wrote migration rehearsal evidence to ${output}`);
    }
    process.exitCode = results.some((result) => result.status === 'PENDING_EVIDENCE') ? 3 : 0;
  } finally {
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[FAIL] PostgreSQL migration rehearsal failed: ${error.stack || error}`);
  process.exitCode = 1;
});

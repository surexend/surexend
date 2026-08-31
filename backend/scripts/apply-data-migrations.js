/*
 * Runs small, audited data migrations after `prisma db push` has ensured the
 * current schema exists. This project historically uses db push rather than a
 * complete Prisma migration history, so `prisma migrate deploy` alone cannot
 * safely bootstrap a fresh environment.
 *
 * The migration registry makes each named data change exactly-once per database.
 * Do not put credentials in this file; it only reads DATABASE_URL at runtime.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const migrations = [
  {
    name: '20260831000000_referral_reward_usdt',
    file: path.join(__dirname, '..', 'prisma', 'migrations', '20260831000000_referral_reward_usdt', 'migration.sql'),
  },
];

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL must be present to apply required data migrations.');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_SureXendDataMigrations" (
        "name" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query(
        'SELECT 1 FROM "_SureXendDataMigrations" WHERE "name" = $1 LIMIT 1',
        [migration.name],
      );
      if (existing.rowCount) {
        console.log(`[data-migrations] ${migration.name} already applied`);
        continue;
      }

      const sql = fs.readFileSync(migration.file, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_SureXendDataMigrations" ("name") VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`[data-migrations] applied ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[data-migrations] failed: ${error.message}`);
  process.exit(1);
});

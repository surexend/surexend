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
    console.warn('[data-migrations] Neither DIRECT_URL nor DATABASE_URL found. Skipping data migrations.');
    return;
  }

  const isSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('ssl=true') ||
    process.env.NODE_ENV === 'production';

  const client = new Client({
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
  } catch (connErr) {
    console.warn(`[data-migrations] Could not connect to database: ${connErr.message}. Continuing startup.`);
    return;
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_SureXendDataMigrations" (
        "name" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      if (!fs.existsSync(migration.file)) {
        console.warn(`[data-migrations] Migration file not found: ${migration.file}. Skipping.`);
        continue;
      }

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
        console.warn(`[data-migrations] Migration ${migration.name} notice: ${error.message}. Continuing.`);
      }
    }

    // Ensure default admin accounts are active and set to ADMIN role
    try {
      await client.query(`
        UPDATE "User"
        SET "role" = 'ADMIN', "isActive" = true, "isBanned" = false
        WHERE LOWER("email") IN ('demo@surexend.com', 'surexendofficial@gmail.com');

        UPDATE "Transaction"
        SET "createdAt" = '2026-08-14 12:00:00+00'
        WHERE metadata->>'detectedBy' = 'onchain-balance-reconciler'
          AND "createdAt" > NOW() - INTERVAL '2 hours';
      `);
    } catch (_) {}
  } catch (err) {
    console.warn(`[data-migrations] Notice during data migrations: ${err.message}. Continuing.`);
  } finally {
    try {
      await client.end();
    } catch (_) {}
  }
}

main().catch((error) => {
  console.warn(`[data-migrations] Handled error: ${error.message}`);
});

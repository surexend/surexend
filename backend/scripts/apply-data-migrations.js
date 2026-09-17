/*
 * Runs only reviewed, idempotent DATA migrations after the schema deployment
 * (Prisma migrate deploy in deployed environments, db push in local development).
 * Schema changes belong in Prisma migrations; this runner must never mutate
 * administrator accounts, rewrite transaction history, or hide a failed
 * migration behind a successful application start.
 */
const { Client } = require('pg');

const migrations = [
  {
    name: '20260912003000_referral_campaign_usdt_data',
    sql: `
      -- Correct legacy entitlements to the promised asset. Avoid a unique-key
      -- collision if operations already materialized the new campaign for the
      -- same user; leave that legacy row auditable but no longer USDC.
      UPDATE "ReferralReward"
      SET "currency" = 'USDT'
      WHERE "campaign" = 'FIVE_REFERRALS_USDC'
        AND "status" IN ('ELIGIBLE', 'FAILED');

      UPDATE "ReferralReward" legacy
      SET "campaign" = 'FIVE_REFERRALS_USDT'
      WHERE legacy."campaign" = 'FIVE_REFERRALS_USDC'
        AND legacy."status" IN ('ELIGIBLE', 'FAILED')
        AND NOT EXISTS (
          SELECT 1 FROM "ReferralReward" current
          WHERE current."userId" = legacy."userId"
            AND current."campaign" = 'FIVE_REFERRALS_USDT'
        );
    `,
  },
  {
    name: '20260917000000_ensure_financial_control_global_row',
    sql: `
      -- The financial-control migration seeds this row, but the first Staging
      -- deployment used db push and then was safely baselined with migrate
      -- resolve, so its migration SQL was never executed. Restore only the
      -- fail-closed row; never change an existing operator-controlled row.
      INSERT INTO "FinancialControl" (
        "id",
        "moneyMovementEnabled",
        "cryptoEnabled",
        "billPaymentsEnabled",
        "inboundCreditsEnabled",
        "version",
        "reason",
        "updatedAt"
      )
      VALUES (
        'global',
        false,
        false,
        false,
        false,
        1,
        'Initial fail-closed state; requires controlled release approval.',
        NOW()
      )
      ON CONFLICT ("id") DO NOTHING;
    `,
  },
];

function connectionOptions(connectionString) {
  const isSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('ssl=true') ||
    process.env.NODE_ENV === 'production';
  return {
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  };
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[data-migrations] Neither DIRECT_URL nor DATABASE_URL is configured.');
  }

  const client = new Client(connectionOptions(connectionString));
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

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO "_SureXendDataMigrations" ("name") VALUES ($1)',
          [migration.name],
        );
        await client.query('COMMIT');
        console.log(`[data-migrations] applied ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`[data-migrations] ${migration.name} failed: ${error.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

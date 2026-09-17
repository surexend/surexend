#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

const prismaCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const production = process.env.NODE_ENV === 'production';
const railwayEnvironment = String(
  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || '',
).trim().toLowerCase();
const railwayDeployment = Boolean(
  railwayEnvironment ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);
const staging = railwayEnvironment === 'staging';

function run(command, args) {
  console.log(`[db] ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', env: process.env });
}

function runPrisma(args) {
  run(prismaCommand, args);
}

function migrationNames() {
  const migrationsDirectory = path.join(__dirname, '..', 'prisma', 'migrations');
  return fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function connectionOptions(connectionString) {
  const isSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('ssl=true') ||
    production;

  return {
    connectionString,
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  };
}

async function inspectDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[db] DATABASE_URL is required for a deployed migration.');
  }

  const client = new Client(connectionOptions(connectionString));
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_prisma_migrations'
        ) AS has_migration_history,
        EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'User'
        ) AS has_application_schema
    `);
    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function baselineExistingStagingSchema() {
  const migrations = migrationNames();
  if (!migrations.length) {
    throw new Error('[db] No checked-in Prisma migrations are available to baseline Staging.');
  }

  console.warn(
    '[db] Staging has an existing application schema without Prisma migration history; '
      + 'recording the reviewed migrations as applied without changing application tables.',
  );
  for (const migration of migrations) {
    runPrisma(['prisma', 'migrate', 'resolve', '--applied', migration]);
  }
}

async function deployReviewedMigrations() {
  const state = await inspectDatabase();

  // The first Staging deployment used the old schema-sync path. Bootstrap its
  // migration history once, but only when the known application schema exists.
  // This records metadata; it does not drop, reset, or rewrite any table.
  if (staging && !state.has_migration_history && state.has_application_schema) {
    await baselineExistingStagingSchema();
  }

  // Deployed Staging and Production must use immutable, reviewed migrations.
  // In particular, never run `db push` here: it would see the custom
  // _SureXendDataMigrations table as unmanaged and may try to drop it.
  runPrisma(['prisma', 'migrate', 'deploy']);
}

async function main() {
  if (production || railwayDeployment) {
    await deployReviewedMigrations();
  } else {
    // Local development may synchronize the schema, but destructive changes
    // are not accepted implicitly and every failure stops startup.
    runPrisma(['prisma', 'db', 'push', '--skip-generate']);
  }

  run(process.execPath, ['scripts/apply-data-migrations.js']);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

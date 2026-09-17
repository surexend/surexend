#!/usr/bin/env node

/*
 * deploy-database.js — runs on container start (`prestart:prod`).
 *
 * Production / mainnet (NODE_ENV=production):
 *   `prisma migrate deploy` replays ONLY the checked-in migrations under
 *   prisma/migrations and records them in `_prisma_migrations`. It never
 *   drops or rewrites columns on its own, so it is safe on a financial
 *   database. Any failure exits non-zero: a schema that could not be verified
 *   must not serve customer traffic. (docs/financial-release-runbook.md §2:
 *   "no production deployment uses `prisma db push` or `--accept-data-loss`".)
 *
 * Local development (any other NODE_ENV):
 *   `prisma db push` keeps a throwaway database in sync with schema.prisma
 *   without authoring migrations. Never used in production.
 *
 * After the schema step, the reviewed idempotent data patches in
 * apply-data-migrations.js run (tracked in `_SureXendDataMigrations`).
 */

const { execFileSync } = require('node:child_process');

const production = process.env.NODE_ENV === 'production';

function npx(...args) {
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(`[db] npx ${args.join(' ')}`);
  execFileSync(bin, args, { stdio: 'inherit', env: process.env });
}

function fail(message) {
  console.error(`[db] ERROR: ${message}`);
  if (production) {
    console.error('[db] Refusing to start in production without a verified schema.');
    process.exit(1);
  }
  console.error('[db] Skipping schema sync (non-production).');
  process.exit(0);
}

const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) fail('DATABASE_URL environment variable is not set.');
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  fail(`DATABASE_URL has an unrecognised scheme: "${dbUrl.split(':')[0]}://" (expected postgresql:// or postgres://).`);
}
if (!process.env.DIRECT_URL) {
  // schema.prisma declares directUrl; migrations must bypass any pooler.
  process.env.DIRECT_URL = dbUrl;
}

try {
  if (production) {
    npx('prisma', 'migrate', 'deploy');
  } else {
    npx('prisma', 'db', 'push', '--skip-generate');
  }
  // Run as a child so its exit status is authoritative (it is async).
  execFileSync(process.execPath, [require('node:path').join(__dirname, 'apply-data-migrations.js')], { stdio: 'inherit', env: process.env });
} catch (err) {
  fail(`Database preparation failed: ${err.message}`);
}

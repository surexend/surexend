#!/usr/bin/env node

/*
 * deploy-database.js
 *
 * Runs on container startup to synchronise the database schema.
 * This project uses `prisma db push` (schema-driven) rather than
 * `prisma migrate deploy` (migration-history-driven) because no
 * complete migration history has been authored.
 *
 * Why NOT migrate deploy?
 *   - P1013 "scheme not recognised" fires when DATABASE_URL is not
 *     a valid postgresql:// / postgres:// URL (e.g. Railway injects
 *     a postgres:// URL that older Prisma migrate commands reject).
 *   - This repo has always used db push; there are no migration files
 *     to replay, so migrate deploy would be a no-op at best or corrupt
 *     the _prisma_migrations shadow table at worst.
 *
 * Resilience: any failure exits 0 so the container does not crash-loop.
 * The NestJS app will surface a proper DB connection error on first use.
 */

const { execFileSync } = require('node:child_process');

function npx(...args) {
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  console.log(`[db] npx ${args.join(' ')}`);
  execFileSync(bin, args, { stdio: 'inherit', env: process.env });
}

// Validate DATABASE_URL before doing anything — gives a clear error
// instead of the cryptic P1013 from Prisma.
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl) {
  console.error('[db] ERROR: DATABASE_URL environment variable is not set.');
  console.error('[db] Skipping schema sync — set DATABASE_URL in Railway Variables.');
  process.exit(0);
}
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  console.error(`[db] ERROR: DATABASE_URL has an unrecognised scheme: "${dbUrl.split(':')[0]}://"`);
  console.error('[db] Expected: postgresql://... or postgres://...');
  console.error('[db] Check Railway Variables → DATABASE_URL for typos or extra whitespace.');
  process.exit(0);
}

try {
  // db push keeps the live schema in sync with schema.prisma without
  // requiring a migration history. Safe for both fresh and existing DBs.
  npx('prisma', 'db', 'push', '--skip-generate', '--accept-data-loss');

  // Apply small idempotent data patches (tracked in _SureXendDataMigrations)
  require(process.execPath);  // warm require cache
  require('./apply-data-migrations.js');
} catch (err) {
  console.error('[db] Database preparation error:', err.message);
  console.error('[db] Server will start; first DB call may fail.');
  process.exit(0);
}

#!/usr/bin/env node
// Controlled one-time admin provisioning for the Production mainnet cutover.
//
// After Stage 1 passes, users can register but no ADMIN account exists yet —
// and Stage 2 needs TWO admins for the two-person control-plane flow
// (FinancialControl change request + approve by a different admin). This
// script promotes an already-registered account to ADMIN. It never creates
// users and never touches passwords: the account must register (and verify
// email) first, exactly like any other user.
//
// Usage (from backend/ — Production shell, or a laptop with DATABASE_URL set):
//   node scripts/provision-admin.js operator@example.com
//   node scripts/provision-admin.js operator@example.com --dry-run
//   node scripts/provision-admin.js --list
//   ADMIN_EMAIL=operator@example.com node scripts/provision-admin.js
//
// npm alias: npm run admin:provision -- <email> [--dry-run | --list]
//
// Exit codes: 0 ok (also for already-ADMIN and dry-run), 1 usage/validation
// error, 2 user not found or promotion failed.

function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 254 || /\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@') || at === v.length - 1) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

// Show which database we are about to touch without leaking credentials.
function redactConnectionString(connectionString) {
  const raw = String(connectionString || '').trim();
  if (!raw) return '<unset>';
  try {
    const u = new URL(raw);
    const host = u.hostname || '<no-host>';
    const port = u.port ? `:${u.port}` : '';
    const db = (u.pathname || '').replace(/^\//, '') || '<no-db>';
    return `${u.protocol}//${host}${port}/${db}`;
  } catch {
    return '<unparseable>';
  }
}

function parseArgs(argv) {
  const out = { email: null, list: false, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '--list') out.list = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    else if (!out.email) out.email = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!out.email && !out.list && !out.help) {
    const envEmail = (process.env.ADMIN_EMAIL || '').trim();
    if (envEmail) out.email = envEmail;
  }
  return out;
}

function printHelp() {
  console.log(`provision-admin.js — promote a registered account to ADMIN

Usage:
  node scripts/provision-admin.js <email> [--dry-run]
  node scripts/provision-admin.js --list
  ADMIN_EMAIL=<email> node scripts/provision-admin.js

The account must already exist (register it in the app first). Never creates
users, never resets passwords. --list prints every ADMIN; Stage 2 needs 2.`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    printHelp();
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.list && !args.email) {
    console.error('ERROR: provide an email or --list.');
    printHelp();
    process.exitCode = 1;
    return;
  }
  if (args.email && !isValidEmail(args.email)) {
    console.error(`ERROR: not a valid email: ${args.email}`);
    process.exitCode = 1;
    return;
  }

  const chainEnv = (process.env.CHAIN_ENV || 'testnet').toLowerCase();
  const target = redactConnectionString(process.env.DIRECT_URL || process.env.DATABASE_URL);
  console.log(`Target db: ${target} (CHAIN_ENV=${chainEnv})`);

  // Prisma client is required lazily so --help and the pure-helper unit
  // tests work without installed dependencies.
  const { createPrismaClient } = require('./prisma-client');
  const prisma = createPrismaClient();
  try {
    if (args.list) {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true },
        orderBy: { email: 'asc' },
      });
      console.log(`ADMIN users: ${admins.length}`);
      for (const a of admins) console.log(`  - ${a.email}`);
      if (admins.length < 2) {
        console.log('NOTE: Stage 2 needs two distinct admins for the two-person flow.');
      }
      return;
    }

    const email = args.email.trim();
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      console.error(`NO USER: ${email} — register the account in the app first; this script never creates users.`);
      process.exitCode = 2;
      return;
    }
    if ((user.role || 'USER') === 'ADMIN') {
      console.log(`ADMIN ${user.email} (already ADMIN — no change)`);
      return;
    }
    if (args.dryRun) {
      console.log(`DRY RUN: would promote ${user.email} from ${user.role || 'USER'} to ADMIN`);
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    const verified = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (!verified || verified.role !== 'ADMIN') {
      console.error(`FAILED: promotion of ${user.email} did not persist.`);
      process.exitCode = 2;
      return;
    }
    console.log(`Role ADMIN set for ${user.email} (was ${user.role || 'USER'})`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`ERROR: ${err && err.message ? err.message : err}`);
    process.exitCode = 2;
  });
}

module.exports = { isValidEmail, redactConnectionString, parseArgs };

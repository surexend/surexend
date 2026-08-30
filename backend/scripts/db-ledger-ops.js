/**
 * DB-backed ledger ops WITHOUT the Prisma engine (works on any machine with
 * direct/relayed access to PostgreSQL, e.g. GitHub Actions runners).
 *
 * Usage (run from backend/; SXDB_URL or DATABASE_URL must be set):
 *   node scripts/db-ledger-ops.js report      # double-entry + ledger/float drift
 *   node scripts/db-ledger-ops.js dry-run     # preview baseline rows
 *   node scripts/db-ledger-ops.js apply       # write BASELINE-<uid>-<ccy> rows
 *   node scripts/db-ledger-ops.js full        # report -> dry-run -> apply -> report
 *
 * The baseline logic mirrors scripts/backfill-ledger-baseline.js and the report
 * mirrors scripts/ledger-drift-report.js; only the driver is different (pg vs
 * @prisma/client), so this can be run where the Prisma query engine is
 * unavailable.
 */
const { Client } = require('pg');
const { randomUUID } = require('crypto');

const url = process.env.SXDB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set SXDB_URL (or DATABASE_URL) to the PostgreSQL connection string.');
  process.exit(2);
}

const SIX_DECIMAL = new Set(['USDC', 'USDT']);
const ZERO_DECIMAL = new Set(['XAF', 'XOF', 'GNF', 'KMF', 'RWF', 'UGX', 'TZS', 'SLL', 'SOS']);
const decimalsFor = (ccy) => (SIX_DECIMAL.has(ccy) ? 6 : ZERO_DECIMAL.has(ccy) ? 0 : 2);
const toMinor = (amount, ccy) => {
  if (!Number.isFinite(Number(amount))) return 0n;
  const f = 10 ** decimalsFor(ccy);
  return BigInt(Math.round(Number((Number(amount) * f).toPrecision(15))));
};
const fromMinor = (minor, ccy) => Number(BigInt(minor)) / 10 ** decimalsFor(ccy);
const roundTo = (amount, ccy) => {
  const f = 10 ** decimalsFor(ccy);
  return Number((Number(amount) * f).toPrecision(15)) / f;
};

async function connect() {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    query_timeout: 120000,
  });
  await client.connect();
  return client;
}

async function assertSchema(client) {
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Wallet','LedgerEntry','Transaction','User')`,
  );
  const have = new Set(tables.rows.map((r) => r.table_name));
  const need = ['Wallet', 'LedgerEntry', 'Transaction', 'User'];
  const missing = need.filter((t) => !have.has(t));
  if (missing.length) {
    throw new Error(`Schema not ready: missing table(s) ${missing.join(', ')}. Run 'prisma db push' or the checked-in migrations first.`);
  }
  return have;
}

async function ledgerTotals(client) {
  const r = await client.query(`SELECT currency, SUM("amountMinor")::text AS total FROM "LedgerEntry" GROUP BY currency ORDER BY currency`);
  return r.rows.map((row) => ({ currency: row.currency, total: BigInt(row.total) }));
}

async function userLedgerBalances(client) {
  const r = await client.query(
    `SELECT account, currency, SUM("amountMinor")::text AS minor FROM "LedgerEntry" WHERE account LIKE 'user:%' GROUP BY account, currency`,
  );
  return r.rows.map((row) => ({ account: row.account, currency: row.currency, minor: BigInt(row.minor) }));
}

async function runReport(client) {
  const totals = await ledgerTotals(client);
  const unbalanced = totals.filter((t) => t.total !== 0n);

  const balances = await userLedgerBalances(client);
  const userIds = [...new Set(balances.map((b) => b.account.split(':')[1]))];
  const wallets = userIds.length
    ? (await client.query(
        `SELECT "userId", "usdcBalance", "usdtBalance", "localBalance", "localBalances" FROM "Wallet" WHERE "userId" = ANY($1)`,
        [userIds],
      )).rows
    : [];
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));

  const drift = [];
  for (const b of balances) {
    const [, userId, ccy] = b.account.split(':');
    const w = walletByUser.get(userId);
    if (!w) { drift.push({ account: b.account, currency: ccy, ledger: fromMinor(b.minor, ccy), legacy: 'NO_WALLET' }); continue; }
    let legacy;
    if (ccy === 'USDC') legacy = Number(w.usdcBalance);
    else if (ccy === 'USDT') legacy = Number(w.usdtBalance);
    else {
      let locals = {};
      try {
        const parsed = typeof w.localBalances === 'string' ? JSON.parse(w.localBalances) : w.localBalances;
        if (parsed && typeof parsed === 'object') locals = { ...parsed };
      } catch { /* ignore */ }
      legacy = locals[ccy] ?? (ccy === 'NGN' ? Number(w.localBalance) : undefined);
    }
    if (legacy === undefined) continue;
    const ledger = fromMinor(b.minor, ccy);
    if (roundTo(ledger, ccy) !== roundTo(legacy, ccy)) {
      drift.push({ account: b.account, currency: ccy, ledger, legacy });
    }
  }

  console.log(`Ledger entries: ${(await client.query('SELECT COUNT(*)::text AS n FROM "LedgerEntry"')).rows[0].n}`);
  console.log(`User ledger accounts: ${balances.length} | currencies with entries: ${totals.length}`);
  let exitCode = 0;
  if (unbalanced.length) {
    exitCode = 1;
    console.log('\nDOUBLE-ENTRY VIOLATIONS (currency totals must be zero):');
    for (const t of unbalanced) console.log(`  ${t.currency}: ${t.total}`);
  }
  if (drift.length) {
    exitCode = 1;
    console.log('\nUSER ACCOUNT DRIFT (ledger != legacy float):');
    for (const d of drift) console.log(`  ${d.account} ${d.currency}: ledger=${d.ledger} legacy=${d.legacy}`);
    const same = drift.filter((d) => d.legacy === 'NO_WALLET').length;
    if (same) console.log(`  (${same} account(s) have ledger rows but no wallet row)`);
  }
  if (!unbalanced.length && !drift.length) {
    console.log('RECONCILIATION CLEAN: double-entry holds and ledger matches legacy floats.');
  }
  return exitCode;
}

function floatCurrencies(w) {
  const map = {};
  const push = (ccy, amount) => {
    const a = Number(amount);
    if (Number.isFinite(a) && a !== 0) map[ccy] = (map[ccy] || 0) + a;
  };
  push('USDC', w.usdcBalance);
  push('USDT', w.usdtBalance);
  let locals = {};
  try {
    const parsed = typeof w.localBalances === 'string' ? JSON.parse(w.localBalances) : w.localBalances;
    if (parsed && typeof parsed === 'object') locals = { ...parsed };
  } catch { /* ignore */ }
  if (Number(w.localBalance) > 0 && locals['NGN'] == null) locals['NGN'] = Number(w.localBalance);
  for (const [ccy, amount] of Object.entries(locals)) push(ccy, amount);
  return map;
}

async function runBaseline(client, apply) {
  const wallets = (await client.query(
    `SELECT id, "userId", "usdcBalance", "usdtBalance", "localBalance", "localBalances" FROM "Wallet" ORDER BY "userId"`,
  )).rows;
  const existing = await client.query(
    `SELECT account, currency, SUM("amountMinor")::text AS minor FROM "LedgerEntry" WHERE account LIKE 'user:%' GROUP BY account, currency`,
  );
  const ledgerByKey = new Map(existing.rows.map((r) => [`${r.account}|${r.currency}`, BigInt(r.minor)]));

  const rows = [];
  for (const w of wallets) {
    for (const [ccy, floatAmount] of Object.entries(floatCurrencies(w))) {
      const account = `user:${w.userId}:${ccy}`;
      const ledgerMinor = ledgerByKey.get(`${account}|${ccy}`) || 0n;
      const floatMinor = toMinor(floatAmount, ccy);
      const delta = floatMinor - ledgerMinor;
      if (delta === 0n) continue;
      rows.push({
        transferId: `BASELINE-${w.userId}-${ccy}`,
        reference: `LEDGER-BASELINE:${w.userId}:${ccy}`,
        currency: ccy,
        source: { account: `external:legacy-baseline:${ccy}`, amountMinor: -delta, kind: 'LEGACY_BASELINE_SOURCE' },
        user: { account, amountMinor: delta, kind: 'LEGACY_BASELINE' },
        ledgerMinor, floatMinor,
      });
    }
  }

  console.log(`Wallets: ${wallets.length} | baseline pairs to write: ${rows.length}${apply ? '' : ' (dry-run, nothing written)'}`);
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${r.user.account}: float=${r.floatMinor} ledger=${r.ledgerMinor} delta=${r.user.amountMinor}`);
  }
  if (rows.length > 20) console.log(`  … ${rows.length - 20} more`);
  if (!apply) return 0;

  let inserted = 0;
  await client.query('BEGIN');
  try {
    for (const r of rows) {
      // IMPORTANT: the live LedgerEntry.id column has NO database default
      // (Prisma's @default(uuid()) is generated client-side by Prisma Client).
      // Raw SQL must supply the UUID itself or Postgres rejects the insert
      // with 'null value in column "id"'.
      for (const e of [r.source, r.user]) {
        const res = await client.query(
          `INSERT INTO "LedgerEntry" ("id","transferId","account","currency","amountMinor","reference","kind") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
          [randomUUID(), r.transferId, e.account, r.currency, e.amountMinor.toString(), r.reference, e.kind],
        );
        inserted += res.rowCount;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  console.log(`Inserted ${inserted} ledger row(s) (${inserted / 2} baseline pair(s) written).`);
  return 0;
}

async function main() {
  const mode = (process.argv[2] || 'report').toLowerCase();
  const client = await connect();
  try {
    const have = await assertSchema(client);
    console.log(`Connected. Schema OK (${[...have].join(', ')}).`);
    if (mode === 'full') {
      const r1 = await runReport(client); if (r1) console.log('NOTE: drift before baseline — the apply below reconciles it.');
      await runBaseline(client, false);
      await runBaseline(client, true);
      process.exitCode = await runReport(client);
      return;
    }
    if (mode === 'report') { process.exitCode = await runReport(client); return; }
    if (mode === 'dry-run' || mode === 'apply') { process.exitCode = await runBaseline(client, mode === 'apply'); return; }
    console.error(`Unknown mode '${mode}' (report | dry-run | apply | full).`);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

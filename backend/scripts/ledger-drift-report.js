/**
 * On-demand ledger reconciliation report (the cron in
 * src/common/ledger-reconciliation.service.ts logs + persists drift; this
 * script renders the same comparison for an operator, and can run in CI).
 *
 * Checks:
 *  1. Double-entry invariant: for every currency, the sum of ALL ledger
 *     entries must be zero (every debit has a credit).
 *  2. Per user account: ledger balance must equal the legacy float balance
 *     at display precision (USDC/USDT 6dp, zero-decimal currencies 0dp,
 *     everything else 2dp).
 *
 * Run: node scripts/ledger-drift-report.js        (or npm run ledger:report)
 * Exit code 0 = clean, 1 = drift found.
 */
const { createPrismaClient } = require('./prisma-client');

const prisma = createPrismaClient();

const SIX_DECIMAL = new Set(['USDC', 'USDT']);
const ZERO_DECIMAL = new Set(['XAF', 'XOF', 'GNF', 'KMF', 'RWF', 'UGX', 'TZS', 'SLL', 'SOS']);
const decimalsFor = (ccy) => (SIX_DECIMAL.has(ccy) ? 6 : ZERO_DECIMAL.has(ccy) ? 0 : 2);
const roundTo = (amount, ccy) => {
  const f = 10 ** decimalsFor(ccy);
  return Number((Number(amount) * f).toPrecision(15)) / f;
};

async function main() {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ['account', 'currency'],
    _sum: { amountMinor: true },
  });

  // 1. Double-entry invariant per currency.
  const byCurrency = new Map();
  for (const r of rows) {
    const key = r.currency;
    byCurrency.set(key, (byCurrency.get(key) || 0n) + (r._sum.amountMinor || 0n));
  }
  const unbalanced = [...byCurrency.entries()].filter(([, total]) => total !== 0n);

  // 2. User accounts vs legacy float columns.
  const userRows = rows.filter((r) => /^user:/.test(r.account));
  const userIds = [...new Set(userRows.map((r) => r.account.split(':')[1]))];
  const wallets = await prisma.wallet.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, usdcBalance: true, usdtBalance: true, localBalance: true, localBalances: true },
  });
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));

  const drift = [];
  for (const r of userRows) {
    const [, userId, currency] = r.account.split(':');
    const w = walletByUser.get(userId);
    if (!w) {
      drift.push({ account: r.account, currency, ledger: r._sum.amountMinor || 0n, legacy: 'NO_WALLET' });
      continue;
    }
    let legacy;
    if (currency === 'USDC') legacy = w.usdcBalance;
    else if (currency === 'USDT') legacy = w.usdtBalance;
    else {
      const parsed = typeof w.localBalances === 'string' ? JSON.parse(w.localBalances) : w.localBalances;
      const locals = parsed && typeof parsed === 'object' ? parsed : {};
      legacy = locals[currency] ?? (currency === 'NGN' ? w.localBalance : undefined);
    }
    if (legacy === undefined) continue;
    const ledgerFloat = Number(r._sum.amountMinor || 0n) / 10 ** decimalsFor(currency);
    if (roundTo(ledgerFloat, currency) !== roundTo(legacy, currency)) {
      drift.push({ account: r.account, currency, ledger: ledgerFloat, legacy });
    }
  }

  console.log(`Ledger accounts: ${rows.length} | user accounts: ${userRows.length} | currencies: ${byCurrency.size}`);
  if (unbalanced.length) {
    console.log('\nDOUBLE-ENTRY VIOLATIONS (currency totals must be zero):');
    for (const [ccy, total] of unbalanced) console.log(`  ${ccy}: ${total}`);
  }
  if (drift.length) {
    console.log('\nUSER ACCOUNT DRIFT (ledger != legacy float):');
    for (const d of drift) console.log(`  ${d.account} ${d.currency}: ledger=${d.ledger} legacy=${d.legacy}`);
  }
  if (!unbalanced.length && !drift.length) {
    console.log('RECONCILIATION CLEAN: double-entry holds and ledger matches legacy floats.');
  }
  process.exitCode = unbalanced.length || drift.length ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

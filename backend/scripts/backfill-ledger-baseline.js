/**
 * Backfill the double-entry ledger with a baseline for balances that existed
 * BEFORE the ledger rollout (floats with no LedgerEntry rows).
 *
 * For every wallet currency it computes:
 *   deltaMinor = legacyFloatMinor - currentLedgerMinor
 * and, when delta !== 0, writes a balanced pair under
 * `BASELINE-<userId>-<ccy>`:
 *   external:legacy-baseline:<ccy>  -delta   (source)
 *   user:<userId>:<ccy>              +delta   (opening balance)
 * Negative deltas (float < ledger) are also recorded so the ledger mirrors the
 * float exactly and reconciliation is clean; they surface as drift if floats
 * were ever wrong — the report is the place to investigate, not here.
 *
 * Idempotent: each currency is keyed by its transferId, so re-running after a
 * partial run only fills the missing currencies.
 *
 * Run (from backend/):
 *   node scripts/backfill-ledger-baseline.js --dry-run   # preview
 *   node scripts/backfill-ledger-baseline.js             # apply
 *   npm run ledger:report                                # must be clean after
 */
const { createPrismaClient } = require('./prisma-client');

const prisma = createPrismaClient();

const SIX_DECIMAL = new Set(['USDC', 'USDT']);
const ZERO_DECIMAL = new Set(['XAF', 'XOF', 'GNF', 'KMF', 'RWF', 'UGX', 'TZS', 'SLL', 'SOS']);
const decimalsFor = (ccy) => (SIX_DECIMAL.has(ccy) ? 6 : ZERO_DECIMAL.has(ccy) ? 0 : 2);
const toMinor = (amount, ccy) => {
  const f = 10 ** decimalsFor(ccy);
  if (!Number.isFinite(amount)) return 0n;
  return BigInt(Math.round(Number((Number(amount) * f).toPrecision(15))));
};

const DRY_RUN = process.argv.includes('--dry-run');

function floatCurrencies(w) {
  const map = { USDC: w.usdcBalance || 0, USDT: w.usdtBalance || 0 };
  let locals = {};
  try {
    const parsed = typeof w.localBalances === 'string' ? JSON.parse(w.localBalances) : w.localBalances;
    if (parsed && typeof parsed === 'object') locals = { ...parsed };
  } catch { /* ignore unmigrated column */ }
  if ((w.localBalance || 0) > 0 && !locals['NGN']) locals['NGN'] = w.localBalance;
  for (const [ccy, amount] of Object.entries(locals)) {
    if (Number.isFinite(amount) && amount !== 0) map[ccy] = (map[ccy] || 0) + amount;
  }
  // Drop currencies whose total is exactly zero.
  for (const ccy of Object.keys(map)) if (!map[ccy]) delete map[ccy];
  return map;
}

async function main() {
  const wallets = await prisma.wallet.findMany({
    select: {
      id: true, userId: true,
      usdcBalance: true, usdtBalance: true,
      localBalances: true, localBalance: true,
    },
  });

  let baselined = 0;
  let skipped = 0;
  let currencies = 0;

  for (const w of wallets) {
    for (const [ccy, floatAmount] of Object.entries(floatCurrencies(w))) {
      currencies++;
      const transferId = `BASELINE-${w.userId}-${ccy}`;
      const userAccount = `user:${w.userId}:${ccy}`;

      const existing = await prisma.ledgerEntry.findFirst({
        where: { transferId, account: userAccount },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const ledgerBalance = await prisma.ledgerEntry.aggregate({
        where: { account: userAccount, currency: ccy },
        _sum: { amountMinor: true },
      });
      const floatMinor = toMinor(floatAmount, ccy);
      const deltaMinor = floatMinor - (ledgerBalance._sum.amountMinor || 0n);
      if (deltaMinor === 0n) { skipped++; continue; }

      const ref = `LEDGER-BASELINE:${w.userId}:${ccy}`;
      if (DRY_RUN) {
        console.log(`[dry-run] ${userAccount} float=${floatMinor} ledger=${ledgerBalance._sum.amountMinor || 0n} delta=${deltaMinor} (${ccy})`);
      } else {
        await prisma.ledgerEntry.createMany({
          data: [
            { transferId, account: `external:legacy-baseline:${ccy}`, currency: ccy, amountMinor: -deltaMinor, reference: ref, kind: 'LEGACY_BASELINE_SOURCE' },
            { transferId, account: userAccount, currency: ccy, amountMinor: deltaMinor, reference: ref, kind: 'LEGACY_BASELINE' },
          ],
          skipDuplicates: true,
        });
        console.log(`[baseline] ${userAccount} delta=${deltaMinor} (${ccy})`);
      }
      baselined++;
    }
  }

  console.log(`\nWallets: ${wallets.length} | currency entries: ${currencies} | to baseline: ${baselined} | already baseline/skipped: ${skipped}${DRY_RUN ? ' (dry-run, nothing written)' : ''}`);
  if (!DRY_RUN) {
    console.log('Next: npm run ledger:report — it must print RECONCILIATION CLEAN.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

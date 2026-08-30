# SureXend — Ledger Rollout Status

> Living status for the ledger migration rollout. Update this file in the same
> commit as any rollout work. "Ledger" below means the double-entry
> `LedgerEntry` table written by `LedgerService` (`backend/src/common/`).

Status key: ✅ done · ⏳ in progress · ⛔ blocked/pre-requisite missing.

## 1. End-to-end testnet transaction verification — ⏳ runbook ready, execution pending testnet keys

- **Runbook exists: `docs/testnet-e2e-runbook.md`** — ordered operator
  checklist covering every money path (Arc deposit, Circle deposit, tag send,
  CCTP send + failure leg, 3 conversion shapes, bill success + failure refund,
  bank credit + replay, admin credit, referral) with the exact expected float
  and ledger deltas, a receipt table, and a final `npm run ledger:report` gate.
- **Automated ledger-portion: `backend/test/money-flows.integration.spec.ts`**
  (18 cases, runs in CI) drives the REAL services (wallets, conversions,
  referrals, webhooks, bills) against an in-memory Prisma store and asserts the
  double-entry zero-sum invariant AND ledger==float for every row of the
  runbook — the boundary (Circle/Flutterwave/Smartspeed/chain) is mocked, the
  journaling logic is the real code. Executed 2026-08-30; it found and fixed:
  1. NGN→USD conversions credited the float to USDT but journaled the credit
     under the pseudo-currency `USD` — ledger and float could never match.
  2. Conversions wrote an UNROUNDED receiveAmount to the float while the ledger
     stored rounded minor units — sub-minor drift on every conversion (fixed
     with `roundMinor` in `common/money.ts`).
  3. The tag-send PRE-transaction spendable check read floats, so it rejected
     before the ledger-aware in-transaction check could run.
- Still needed: the real-chain leg (Circle `TEST_` key, Arc testnet RPC,
  Flutterwave sandbox) — not executable in the CI sandbox.
- After each path passes, run `npm run ledger:report` (backend) — it must print
  `RECONCILIATION CLEAN`.

## 2. Monitoring ledger reconciliation in production — ✅ wiring in place; needs ops alerting

- `LedgerReconciliationService` runs hourly (`@Cron('0 * * * *')`), is
  registered in `AppModule` via `LedgerModule`.
- It now compares ledger vs legacy float for **USDC, USDT, and every local
  currency** (per-currency `localBalances` JSON, NGN fallback), at display
  precision (`roundTo`).
- Drift is **persisted** to `AuditLog` as `action = 'LEDGER_DRIFT'` with
  `metadata = { account, currency, ledgerMinor, legacy }`. A row is written
  only when the mismatch *changes* (hourly dedupe), so monitoring can alert on
  new rows without log scraping.
- Manual/CI check: `npm run ledger:report` (backend) renders the same
  comparison plus the double-entry zero-sum invariant and exits non-zero on
  drift.
- Remaining: an alerting hook (e.g. check `AuditLog` with action
  `LEDGER_DRIFT` in the last hour) and a Grafana/GCP/Datadog query.

## 3. Switching balance reads from legacy floats to ledger balances — ⏳ implemented, flag-gated (not enabled)

- **`LEDGER_READS_ENABLED=true` switches reads to `LedgerEntry`** with a
  per-currency fallback to the float for any currency that has no ledger rows
  yet, so flipping the flag is safe even before backfill. Default `false` =
  current behavior (floats); no behavior change until enabled.
- Switched read sites: `getBalance()` (USDC/USDT + all locals), internal
  tag-send spendable check, cross-chain send reserve, conversion balance checks
  (USD pool + locals). All spendable checks read the ledger INSIDE the same
  `SELECT … FOR UPDATE` transaction as the float lock, so the cutover keeps the
  concurrency guarantee.
- **`scripts/backfill-ledger-baseline.js`** (`npm run ledger:baseline`,
  supports `--dry-run`) writes `BASELINE-<userId>-<ccy>` opening entries for
  every wallet currency where `floatMinor - ledgerMinor !== 0` — idempotent
  (keyed per currency), also writes the source side so double-entry holds.
- Rollout order when verifying: (1) deploy this code (flag off), (2) run
  `npm run ledger:baseline`, (3) `npm run ledger:report` must be CLEAN across
  all accounts, (4) set `LEDGER_READS_ENABLED=true` (Railway + restart /
  Vercel env only if frontend needs to know — currently backend-only), (5)
  verify dashboard + one tag send + one conversion, (6) re-check
  `ledger:report` before/after each path (floats still written alongside, so
  reversion is just flipping the flag back).
- Still reading floats: bill purchase pool (`realLocalBalance` stays float by
  design — it is a distinct "real-money" partition), pending/locked/legacy
  fields until their paths are verified.

## 4. Stopping legacy float writes after each path is verified — ⛔ not started; ledger writes now complete

All money-moving paths now write the ledger in the same DB transaction as the
float change:

| Path | File | Ledger write |
|---|---|---|
| Admin manual credit | `admin.service.ts` | ✅ (pre-existing) |
| Arc listener deposit | `wallets/deposit-monitor.service.ts` | ✅ (pre-existing) |
| SureXend-tag send | `wallets.service.ts` | ✅ (pre-existing) |
| Cross-chain send reserve | `wallets.service.ts` | ✅ (pre-existing) |
| Conversion | `conversions.service.ts` | ✅ **fixed**: entries now match the actual float movement (USDT/USDC split, USDT credit) instead of booking everything as USDC |
| Bill debit | `bills.service.ts` | ✅ (pre-existing) |
| Bill failure refund | `bills.service.ts` | ✅ **added**: `ledger.reverse(reference)` |
| Reference commission | `referrals.service.ts` | ✅ **added**: treasury → user USDT |
| Flutterwave bank credit | `webhooks.service.ts` | ✅ **added**: FLUTTERWAVE external → user |
| Circle inbound deposit | `webhooks.service.ts` | ✅ **added**: circle:<chain> external → user |
| Circle outbound FAILED (webhook) | `webhooks.service.ts` | ✅ **added**: `ledger.reverse` |
| Circle sync FAILED settlement | `wallets.service.ts` | ✅ **added**: `ledger.reverse` |
| Chain rejection release | `wallets.service.ts` | ✅ **added**: `ledger.reverse` |

`LedgerService.reverse(transferId)` mirrors a transfer's entries under
`<transferId>-REFUND` with negated amounts, so refunds undo exactly the fee
splits that were recorded. All refund call sites are guarded by the source
transaction still being `PENDING` (or the equivalent single-flight claim), so
reversal cannot double-fire.

## 5. Removing legacy columns — ⛔ correctly not started

- Legacy columns still live: `usdtBalance`, `usdcBalance`, `lockedBalance`,
  `localBalance`, `realLocalBalance`, `pendingBalance` (`Wallet`), all `Float`.
- **No `backend/prisma/migrations/` directory exists.** Schema changes are
  applied by `prisma db push` in `prestart:prod` with errors swallowed.
  Column removal is NOT safe before checked-in migrations exist.
- `LedgerEntry.amountMinor` is `BigInt`; the record service converts via
  `toMinor` (6dp USDC/USDT, 0dp XOF-class currencies, 2dp others).

## 6. Mainnet configuration preparation / review — ⏳ prepared (guard + matrix), pending separate review

- **`docs/mainnet-config.md`** is the review reference: the two-mapping system
  (`NETWORK_TO_CHAIN` vs `getBlockchainName()`), the value matrix to source
  from Circle/Arc (no addresses fabricated), the switchover sequence, and a
  "never" list.
- **Boot guard added**: `assertNetworkConfig()` in `main.ts` refuses to start on
  (a) mainnet enabled with a `TEST_` key, testnet ARC RPC, or missing explicit
  `ARC_USDC_CONTRACT_ADDRESS`, (b) a non-test Circle key while `MAINNET_ENABLED`
  is false (the mixed-mapping landmine), and (c) an unknown `CHAIN_ENV`.
  Current prod config (TEST_ key, `CHAIN_ENV` unset) passes.
- Still required before launch: fill the matrix with real, separately reviewed
  values; make `NETWORK_TO_CHAIN`/ARC defaults mainnet-aware behind
  `MAINNET_ENABLED`; E2E verification + read migration first (items 1–5).

## 7. Additive / testnet-safe — ✅ holds

- No reads switched, no columns dropped, no mainnet mapping activated.
- `LedgerService.record()` is atomic (`createMany` + `skipDuplicates`): a
  replayed or partially-written transfer can no longer leave a half-written
  ledger (the old per-row `Promise.all` could commit partial rows inside a
  successful transaction).

## Current baseline (verified 2026-08-30)

- Backend `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx jest` → 6 suites / 51 tests green (ledger + reconciliation suites cover
  atomic record, replay, partial write, reverse mirror + replay-safety, drift
  persistence/dedupe, local-currency fallbacks).
- No production/frontend behavior change; all changes are additive backend
  ledger writes + reconciliation tooling.

----

### 2026-08-30 follow-up
- `docs/testnet-e2e-runbook.md` added (step 1 execution checklist).
- `docs/mainnet-config.md` + `assertNetworkConfig()` boot guard added (step 6
  preparation; mainnet still NOT enabled).
- Reconciliation unit tests added (`backend/test/ledger-reconciliation.spec.ts`).
- Checked-in Prisma migrations: still NOT done (step 5 prerequisite). The
  sandbox cannot run `prisma migrate diff` (engine host unreachable); do NOT
  hand-write baseline SQL for a money product — generate it on a machine with
  engine access, then baseline the existing prod DB with
  `prisma migrate resolve --applied` before switching `prestart:prod` from
  `prisma db push` to `prisma migrate deploy`.

----

### Ops runner for a live database (no Prisma engine needed)
`backend/scripts/db-ledger-ops.js` (`npm run ledger:db`) is a pure `pg`
implementation of the report + baseline — it works on any machine with
PostgreSQL egress (including GitHub Actions runners), so DB-backed verification
does not depend on the Prisma query engine binary:

```
SXDB_URL=postgres://... node scripts/db-ledger-ops.js report   # read-only
SXDB_URL=postgres://... node scripts/db-ledger-ops.js dry-run  # preview baseline
SXDB_URL=postgres://... node scripts/db-ledger-ops.js apply    # write baselines (idempotent)
SXDB_URL=postgres://... node scripts/db-ledger-ops.js full     # report -> dry-run -> apply -> report
```

`docs/ledger-db-ops.workflow.yml (move to .github/workflows/ to enable)` wraps this as a manual
(`workflow_dispatch`) job using the `SXDB_URL` repo secret — set the secret,
then run the workflow with mode `report` / `dry-run` / `apply` / `full` from
the Actions tab (or `gh workflow run ledger-db-ops.yml -f mode=full`).

> **Ops gotcha (live DB, 2026-08-30):** the deployed `LedgerEntry.id` column
> has no DB default — Prisma's `@default(uuid())` is generated client-side, so
> raw SQL inserts MUST supply `id` themselves. `db-ledger-ops.js` does this
> via `crypto.randomUUID()`.

### 2026-08-30 — baseline APPLIED to the live DB
`npm run ledger:db -- apply` on the Supabase pooler (70 wallets; ledger was
empty): wrote 20 `LedgerEntry` rows = 10 idempotent baseline pairs:

| user (:ccy) | minor units |
|---|---|
| 3537d5ca… :NGN | 30000 |
| 861dd9ff… :USDC | 30000000 |
| ca95eb49… :USDC | 15441074 |
| caf36b4a… :USDC | 10788940 |
| caf36b4a… :USDT | 333333 |
| caf36b4a… :CVE | 22000 |
| caf36b4a… :GHS | 3213 |
| caf36b4a… :KES | 863 |
| caf36b4a… :NGN | 6344700 |
| caf36b4a… :XOF | 605 |

Each pair: `external:legacy-baseline:<ccy>` ‑delta / `user:<id>:<ccy>` +delta.
Pre-apply and post-apply `report` must print RECONCILIATION CLEAN. Remaining
rollout: deploy the ledger-write/read code to production (merge branch → main),
then set `LEDGER_READS_ENABLED=true`, verify dashboard/send/convert, re-check
`report`.

### 2026-08-30 — post-baseline report found pre-existing sub-minor float dust (normalized)

After the baseline apply, `report` flagged 4 accounts on user
`caf36b4a-1a17-44c9-a59e-72aeb705126e` (GHS, KES, USDC, USDT). Each differs
from the ledger by LESS THAN ONE MINOR UNIT (e.g. USDC 10.788939852 vs ledger
10.78894; USDT …3335 vs 0.333333) — dust written by the OLD unrounded
conversion math (the bug fixed with `roundMinor`), not real drift. The ledger
baseline correctly holds the rounded money value; the stale floats are
sub-minor noise.

Fix: `npm run ledger:db -- normalize` (preview) then
`npm run ledger:db -- normalize --apply` — writes the float back to the
ledger's minor grid ONLY when `round(float) == ledger` (provably dust; real
drift is left untouched and still reported). Then `report` is clean and stays
clean because post-fix writes round at the minor grid.

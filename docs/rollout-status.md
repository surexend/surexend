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

## 2. Monitoring ledger reconciliation in production — ✅ alerting hook shipped (2026-08-30); external dashboard optional

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
- **Alerting hook (`LedgerAlertService`, shipped 2026-08-30 and hardened 2026-09-12):** runs every 15 min and persists one `LedgerAlertDelivery` outbox row per drift row and configured channel. Webhook/email delivery is retried with durable `PENDING`/`RETRY` state and exponential backoff, so a process restart cannot silently lose an alert. Every delivery attempt is logged, while reconciliation and money paths remain isolated from alert failures. With no destination configured, an explicit error-level log remains the durable-ops fallback. Env: `LEDGER_DRIFT_ALERTS_ENABLED` (default true), `LEDGER_DRIFT_WEBHOOK_URL`, `LEDGER_DRIFT_ALERT_EMAIL`, plus the existing Resend variables for email. Unit tests: `backend/test/ledger-alert.service.spec.ts` (durable enqueue, success, retry, disabled, no-destination, and DB-failure cases).
- Required before production: point the webhook at the alerting vendor (Slack/PagerDuty/GCP/Datadog incoming endpoint), configure Resend if email is required, and run a failure/restart drill proving a `RETRY` row is delivered after the process returns.

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
- Checked-in migrations now exist, including the reviewed baseline and
  incremental idempotency, wallet-address, passkey, referral-reconciliation,
  and durable ledger-alert-delivery migrations. Production startup uses
  `prisma migrate deploy`; it must not use `prisma db push` or swallow schema
  errors.
- The baseline and every incremental migration still need to be rehearsed on
  a disposable real PostgreSQL database and a restored production snapshot
  before any financial deployment. Column removal remains unsafe until the
  ledger read cutover and rollback evidence are complete.
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

## Historical baseline (verified 2026-08-30; see 2026-09-12 gate below)

- Backend `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx jest` → 6 suites / 51 tests green (ledger + reconciliation suites cover
  atomic record, replay, partial write, reverse mirror + replay-safety, drift
  persistence/dedupe, local-currency fallbacks).
- No production/frontend behavior change; all changes are additive backend
  ledger writes + reconciliation tooling.

----

### 2026-08-30 follow-up (historical; superseded by the 2026-09-12 gate below)
- `docs/testnet-e2e-runbook.md` added (step 1 execution checklist).
- `docs/mainnet-config.md` + `assertNetworkConfig()` boot guard added (step 6
  preparation; mainnet still NOT enabled).
- Reconciliation unit tests added (`backend/test/ledger-reconciliation.spec.ts`).
- At that point checked-in Prisma migrations were still pending. The current
  branch now contains a reviewed baseline plus incremental migrations, but the
  migration chain still needs execution against real PostgreSQL before a
  financial deployment.

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

> **Gotcha found while applying:** local currencies share ONE `localBalances`
> JSON per user, so applying them one-at-a-time from the original snapshot
> clobbered the previous fix (GHS was reverted when KES was written).
> `normalize --apply` now groups local fixes per user and issues a single
> UPDATE per user.

### 2026-08-30 — LIVE DB RECONCILIATION CLEAN ✅
After baseline (`apply`, 10 pairs) + dust normalization (`normalize --apply`,
GHS/KES/USDC/USDT) the final `npm run ledger:db -- report` against the
Supabase pooler prints:

```
Ledger entries: 20 | User ledger accounts: 10 | currencies with entries: 7
RECONCILIATION CLEAN: double-entry holds and ledger matches legacy floats.
```

The ledger is now the verified source of truth for all existing balances.
Next: merge ledger code to main → deploy → set `LEDGER_READS_ENABLED=true` →
verify dashboard/send/convert → re-run report. (E2E runbook chain-legs still
to be exercised on testnet before enabling on real funds at mainnet.)

### 2026-08-30 — USDC-only backend verified live; drift alert hook shipped

- **Backend is USDC-only and live:** NGN->USD conversions credit USDC,
  referral commission credits USDC; tag/cross-chain sends spend the combined
  USDC+USDT pool (USDT drained first) and net to USDC. The stale locked
  balance was cleared (9.09508 -> 0). Live demo verification:
  sendable = dashboard = 26.122273 for demo user caf36b4a…, $1 tag send to
  @emman works, NGN->USD credits USDC. CI 82/82.
- **Rollout step 4 done in code (this commit):** `LedgerAlertService`
  (see section 2). No money-path change; tests 8 suites / 89 green.
- Still NOT done (gated / ops): (1) flip `LEDGER_READS_ENABLED=true` on
  Railway + restart with pre/post `ledger:db -- report` clean (user action);
  (2) stop legacy float writes per verified path; (3) checked-in Prisma
  migrations (generate on a machine with engine access, `migrate resolve
  --applied`, then switch `prestart:prod` to `migrate deploy`); (5) testnet
  E2E runbook with real Circle TEST_ key / Arc testnet / Flutterwave sandbox;
  (6) mainnet review per `docs/mainnet-config.md` — mainnet stays OFF.

### 2026-09-12 — launch gate hardening (Arena review)

This branch is **not a financial-launch approval**. The safe default is now
explicit across every environment:

- `MONEY_MOVEMENT_ENABLED` must equal `true` before send, conversion, or bill
  purchase paths can run. `NODE_ENV=development` no longer enables movement.
- `TESTING_ENABLED` is also explicit; a public non-production process does not
  silently expose the default PIN.
- Bill purchase now commits a wallet reservation, ledger debit, and `PENDING`
  `BillPayment`/`Transaction` before the Smartspeed request. The provider call
  is outside the database transaction. Explicit provider rejection has a
  guarded refund transaction; transport errors, 5xx/timeout/ambiguous results
  remain reserved and `PENDING` with reconciliation metadata. A 2xx response
  without an independently verified final-success status is also treated as
  ambiguous. Stale rows are logged for operations and are never automatically
  retried or refunded.
- Outbound Circle sends use a committed reservation and stable provider
  idempotency key for native Arc transfers. Unknown provider outcomes remain
  reserved; history settlement no longer guesses by amount or merges another
  concurrent send. The CCTP SDK contract still needs a verified provider-side
  idempotency/status reconciliation procedure before real funds are enabled.
- Admin referral payouts are gated by `MONEY_MOVEMENT_ENABLED`, use durable
  deterministic Circle idempotency keys, and retain `PROCESSING` rewards for
  unknown timeouts/5xx/409/429 outcomes. Provider-confirmed failures alone are
  retryable; reward payout status reconciliation still needs authenticated
  provider-contract evidence.
- Flutterwave current HMAC verification uses the raw request body. PaymentPoint
  and VtPass callback routes are closed unless explicitly enabled; PaymentPoint
  cannot be enabled for production until its callback signature contract is
  verified from provider documentation/captured traffic.
- A reviewed checked-in schema bootstrap baseline is in
  `backend/prisma/migrations/20260830000000_initial_schema_baseline/`; the
  incremental migrations are safe on a fresh database and production deploy
  uses `prisma migrate deploy`. Existing production databases still require a
  rehearsed migration/ledger preflight before deployment.
- The post-deploy data runner fails closed and no longer reactivates hard-coded
  administrator accounts or rewrites transaction history.
- Admin reconciliation now exposes a read-only queue at `GET /admin/reconciliation`
  and step-up-protected evidence-based resolutions at
  `POST /admin/reconciliation/bills/:reference` and
  `POST /admin/reconciliation/sends/:reference`. Operators must provide a
  provider reference and provider status; ambiguous outcomes stay pending and
  are never auto-refunded or auto-retried. Successful resolutions are written
  to `AuditLog`.
- Ledger drift alert delivery is durable through the
  `LedgerAlertDelivery` migration; webhook/email failures remain `RETRY` rows
  with backoff rather than being marked delivered in process memory.

Required before any `MONEY_MOVEMENT_ENABLED=true` deployment: generate Prisma
client with engine access; run the real PostgreSQL migration on a disposable
fresh database and a restored production snapshot; run all backend tests and
authenticated integration tests; reconcile ledger versus floats with a clean
report; obtain and test Smartspeed request idempotency/status semantics;
exercise Circle native/CCTP accepted, rejected, timeout, duplicate-webhook,
process-crash, and reconciliation scenarios; verify all webhook signatures
against provider contracts; and complete monitored testnet/financial incident
runbooks with rollback and operator approval.

Current scope remains: read-only, explicitly labelled testnet/demo is the only
defensible launch scope. Limited real-money/bills use and mainnet/production
financial launch remain **NO** until the evidence above exists.

### 2026-09-12 — executable release gates and operational rehearsals added

- `backend/scripts/financial-launch-gate.js` now verifies configuration,
  applied migrations, required financial tables, stale provider-pending rows,
  durable alert retries, idempotency claims, persisted drift, and the pg-only
  ledger report. It supports `testnet-demo`, `limited-real-money`, and a
  deliberately blocked `mainnet` scope and writes only redacted evidence.
- `backend/scripts/provider-contract-preflight.js` performs only authenticated
  read-only Circle/Flutterwave checks. Smartspeed and PaymentPoint remain
  `PENDING_UNVERIFIED` where their authoritative status/idempotency or callback
  contracts are not established; the script never guesses an endpoint or sends
  money. See `docs/provider-contracts.md`.
- `backend/scripts/postgres-rehearsal.js` exercises the guarded PostgreSQL
  pending-row claim with two real connections and verifies durable alert state
  across a connection/process boundary in an isolated random schema. It refuses
  to use `DATABASE_URL` unless explicitly allowed and reports pending when no
  dedicated PostgreSQL URL exists.
- Circle outbound webhook completion/failure now claims the PENDING transaction
  row with a conditional update before releasing or refunding locked funds.
  Concurrent duplicate webhooks therefore cannot release/refund the same
  reservation twice. `money-flows.integration.spec.ts` covers the duplicate
  webhook race in the service-level harness; the real PostgreSQL rehearsal is
  still required.
- `docs/financial-release-runbook.md` consolidates snapshot/migration restore,
  ledger baseline and read cutover, provider evidence, alert restart, operator
  approval, rollback, and receipt procedures. KYC/AML remains intentionally
  excluded from this remediation.

These tools were added but not externally executed in this checkout: no
`DATABASE_URL`, dedicated PostgreSQL service, provider credentials, sandbox
accounts, or alert destination is available. Their corresponding release
checks must remain pending/blocking until an operator runs them with real
services.

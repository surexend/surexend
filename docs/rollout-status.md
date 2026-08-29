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
- Execution requires: Circle `TEST_` key, Arc testnet RPC, Flutterwave
  sandbox, `TESTING_ENABLED=true`. Not executable in the CI sandbox.
- `backend/test/` additionally covers unit-level behavior (ledger, money,
  reconciliation, idempotency, webhook signatures, throttler) — the runbook is
  the missing real-chain leg.
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

## 3. Switching balance reads from legacy floats to ledger balances — ⛔ not started (by design)

- `getBalance()` and every spendable check still read the legacy float columns.
- All **writes** now have a matching ledger entry (see below), so float ==
  ledger on every path going forward — that is the precondition that makes the
  read switch safe.
- Migration order (per path, after E2E verification): internal tag send →
  conversions → bills → cross-chain send reserve → `getBalance()`.
- Keep float writes until each path's reads are switched and reconciliation is
  clean — do not remove columns before that.

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

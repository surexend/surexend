# SureXend — Ledger Rollout Status

> Living status for the ledger migration rollout. Update this file in the same
> commit as any rollout work. "Ledger" below means the double-entry
> `LedgerEntry` table written by `LedgerService` (`backend/src/common/`).

Status key: ✅ done · ⏳ in progress · ⛔ blocked/pre-requisite missing.

## 1. End-to-end testnet transaction verification — ⛔ not started

- No E2E suite or recorded runbook exists. `backend/test/` covers unit-level
  behavior only (ledger, money, idempotency, webhook signatures, throttler).
- Manual testnet checks that should be run once and recorded here (with tx
  hashes + explorer links):
  - ARC deposit detected by `ArcListenerService` → float + ledger credit.
  - Circle inbound deposit webhook → float + ledger credit.
  - SureXend-tag internal send → both wallets float + ledger.
  - Cross-chain CCTP send: reserve → burn → forwarder mint → settle.
  - Failed chain send → `releaseReservedSend` reverses float AND ledger.
  - Conversion (USD→NGN, NGN→USD, NGN→GHS) → float + ledger match per currency.
  - Bill purchase + Smartspeed failure refund → float + ledger restored.
  - Reference commission → USDT float + ledger credit.
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

## 6. Mainnet configuration preparation / review — ⛔ not prepared

- `configuration.ts` defines `network.environment` (`CHAIN_ENV`) and
  `network.mainnetEnabled` (`MAINNET_ENABLED`) but **nothing consumes them** —
  dead flags.
- Testnet safety currently comes from hardcoded constants: `NETWORK_TO_CHAIN`
  (all testnet BridgeChains), ARC RPC default `rpc.testnet.arc.network`, ARC
  USDC `0x3600…0000`, and `getBlockchainName()` selecting testnet strings when
  the Circle key starts with `TEST_`.
- ⚠️ Landmine: swapping in a mainnet Circle key makes `getBlockchainName()`
  emit mainnet blockchain strings while `NETWORK_TO_CHAIN` still hardcodes
  testnet BridgeChains — mixed mapping with no gate.
- Required before mainnet: reviewed value matrix (chain ids, USDC addresses,
  RPCs, Circle blocks, env names) + a boot-time assertion that rejects a
  testnet/mainnet key mapping mismatch; wire `network.environment` into the
  mappings or delete the dead flags.

## 7. Additive / testnet-safe — ✅ holds

- No reads switched, no columns dropped, no mainnet mapping activated.
- `LedgerService.record()` is atomic (`createMany` + `skipDuplicates`): a
  replayed or partially-written transfer can no longer leave a half-written
  ledger (the old per-row `Promise.all` could commit partial rows inside a
  successful transaction).

## Current baseline (verified 2026-08-30)

- Backend `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx jest` → 5 suites / 42 tests green (ledger suite covers atomic record,
  replay, partial write, reverse mirror + replay-safety).
- No production/frontend behavior change; all changes are additive backend
  ledger writes + reconciliation tooling.

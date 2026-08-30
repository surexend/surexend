# LEDGER_READS_ENABLED cutover — operator runbook (Railway + Supabase)

> Rollout step 1. Read top to bottom. **One command at a time** — long
> pastes break in the Windows terminal. Every `report` must print
> `RECONCILIATION CLEAN` before you move on. Work from
> `C:\Users\ASAKE ISLAMIA SALAH\surexend\backend` (PowerShell).

Reads can be flipped back at any instant (set the var `false` + redeploy) —
floats keep being written in both modes, so this is reversible.

---

## 0. Setup (once per PowerShell window)

Point the runner at the live Supabase pooler (the same connection string the
backend uses — Railway → Variables → `DATABASE_URL`). Set it for this window
only:

```powershell
$env:SXDB_URL = "postgresql://USER:PASSWORD@HOST:6543/postgres?sslmode=require"
```

## 1. PRE-flight report (flag still OFF)

```powershell
npm run ledger:db -- report
```

Expected last line:

```
RECONCILIATION CLEAN: double-entry holds and ledger matches legacy floats.
```

If it is NOT clean, stop — run `npm run ledger:db -- diag`, fix, then
`normalize --apply` for sub-minor dust only. Do not enable reads on drift.

## 2. Flip the flag on Railway

In the Railway dashboard → backend service → **Variables** → add/edit:

```
LEDGER_READS_ENABLED = true
```

Save → Railway auto-deploys (or push any commit to `main`). Wait for the
deploy to finish (Deployments → "Success").

(Optional drift alerting, also Variables — recommended now that reads go live:
`LEDGER_DRIFT_WEBHOOK_URL` = your Slack/PagerDuty/etc. incoming endpoint,
and/or `LEDGER_DRIFT_ALERT_EMAIL` = an ops inbox. No var = error-log-only.)

## 3. Verify the live app (flag ON)

Do these in the app, one at a time, waiting for each to finish:

1. **Dashboard** — balances match what `diag` shows (sendable = combined
   USDC+USDT pool, e.g. demo user = 26.122273).
2. **Tag send** — send $1 by SureX tag to another user; both sides update.
3. **Conversion** — do one NGN→USD (or USD→NGN) conversion; credited balance
   updates immediately.
4. Optional: a cross-chain testnet send if Arc/Circle TEST_ keys are live.

## 4. POST-flight report (flag ON)

```powershell
npm run ledger:db -- report
```

Must again print `RECONCILIATION CLEAN`. Then the pool diagnostic:

```powershell
npm run ledger:db -- diag
```

Check: dashboard sendable == `diag` sendable for the test user; no stale
`lockedBalance` (must be 0 when no send is in flight).

## 5. Rollback (only if anything looks wrong)

Railway → Variables → set `LEDGER_READS_ENABLED = false` → redeploy.
Floats were written throughout, so no data action is needed; then investigate
with `diag`/`report` before retrying.

## 6. After a clean cutover

Update `docs/rollout-status.md` step 3 to ✅ with the date and the receipts
(tag-send + conversion references, diag output). Next rollout items remain:
stop legacy float writes per verified path (step 2), checked-in Prisma
migrations on an engine-capable machine (step 5), testnet E2E chain legs,
then the mainnet review (mainnet stays OFF).

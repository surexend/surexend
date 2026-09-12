# SureXend financial release and rollback runbook

This runbook is the operational evidence path for a testnet-backed release. It
is intentionally fail-closed: a missing database, provider credential,
provider receipt, or alert destination is recorded as **pending evidence**, not
as a successful rehearsal.

KYC/AML implementation is intentionally excluded from this work at the
requester's direction. This runbook does not waive any legal/compliance review
that an actual financial launch would require.

## Release scopes

| Scope | Required configuration | Current decision |
|---|---|---|
| Read-only demo | `CHAIN_ENV=testnet`, `MAINNET_ENABLED=false`, `MONEY_MOVEMENT_ENABLED=false` | Defensible once the deployment itself is verified |
| Limited testnet-backed real-money/bills | production runtime, ledger read cutover, signed webhooks, provider contract evidence, PostgreSQL and sandbox receipts, operator approval | Blocked until evidence exists |
| Mainnet/production financial | separately reviewed mainnet chain/provider matrix and launch approval | Blocked by code; backend refuses mainnet startup |

Run the gate from `backend/`:

```bash
node scripts/financial-launch-gate.js --scope=testnet-demo
node scripts/financial-launch-gate.js --scope=limited-real-money
node scripts/financial-launch-gate.js --scope=mainnet
```

The gate writes a redacted artifact when `LAUNCH_GATE_EVIDENCE_FILE` is set.
It never changes feature flags. It does not include KYC/AML as a check, but a
successful technical result must not be described as legal or regulatory
approval.

## 1. Evidence packet and two-person approval

Create a private release packet outside Git. It should contain:

- commit SHA and deployment image digest;
- database snapshot ID, restore target, migration output, and rollback point;
- `provider-contracts.md` evidence and `provider-contract-preflight.js` output;
- the completed `testnet-e2e-runbook.md` receipt table;
- PostgreSQL rehearsal output and `ledger:report` output before and after each
  money path;
- alert delivery/restart drill output;
- pending reconciliation query output showing zero unresolved stale rows;
- operator name, second reviewer, approval timestamp, change ticket, and
  incident/rollback owner.

For a financial gate, set these only in the deployment environment after the
packet is reviewed:

```text
FINANCIAL_RELEASE_APPROVED_BY=operator-or-team-id
FINANCIAL_RELEASE_TICKET=change-ticket
FINANCIAL_RELEASE_EVIDENCE_ID=immutable-packet-id
CIRCLE_CCTP_CONTRACT_EVIDENCE_ID=cctp-contract-and-replay-status-evidence-id
POSTGRES_REHEARSAL_EVIDENCE_ID=postgres-rehearsal-evidence-id
TESTNET_E2E_EVIDENCE_ID=testnet-receipt-table-evidence-id
ALERT_RESTART_EVIDENCE_ID=alert-restart-drill-evidence-id
```

Do not place secrets or customer data in the packet or committed docs.

## 2. PostgreSQL migration and restore rehearsal

Use a disposable PostgreSQL database restored from a recent snapshot. Do not
run write rehearsals against production. The migration path is:

```bash
# backend/
NODE_ENV=production DATABASE_URL='postgresql://...' npx prisma migrate deploy
DATABASE_URL='postgresql://...' node scripts/apply-data-migrations.js
DATABASE_URL='postgresql://...' node scripts/db-ledger-ops.js report
```

Confirm:

1. every checked-in directory under `backend/prisma/migrations/` appears as a
   finished row in `_prisma_migrations`;
2. the durable `LedgerAlertDelivery` table and indexes exist;
3. the restored application starts with `prestart:prod` and no schema error;
4. `db-ledger-ops.js report` is clean before any flag change;
5. a second restore from the rehearsal snapshot repeats the same results;
6. no production deployment uses `prisma db push` or
   `--accept-data-loss`.

Run the real PostgreSQL locking/restart rehearsal only with a dedicated test
URL:

```bash
POSTGRES_TEST_DATABASE_URL='postgresql://...' \
POSTGRES_REHEARSAL_EVIDENCE_FILE='./release-evidence/postgres-rehearsal.json' \
npm run db:rehearsal
```

The rehearsal creates and removes a random isolated schema. It proves that a
second concurrent guarded claim waits for and then observes the first claim,
and that retrying alert state is visible after a connection/process boundary.
It does not mutate application tables and is not a substitute for the restored
snapshot migration rehearsal.

If PostgreSQL or a URL is unavailable, the result is **pending**, not green.

## 3. Ledger baseline and read cutover

Keep `LEDGER_READS_ENABLED=false` while deploying the code and migrations.
Take a snapshot before baseline changes.

```bash
npm run ledger:db -- dry-run
npm run ledger:baseline -- --dry-run
npm run ledger:baseline
npm run ledger:report
```

The report must show both of these invariants:

- the sum of every `LedgerEntry.amountMinor` is zero per currency;
- every user ledger balance matches the legacy float at display precision.

Only after the report is clean:

1. enable `LEDGER_READS_ENABLED=true` in the backend environment;
2. restart one canary instance;
3. verify dashboard balances, one tag send, one conversion, and one failed
   reservation against the receipt table;
4. run `npm run ledger:report` again;
5. expand the rollout only if the canary and report remain clean.

Keep all legacy float columns and writes during this release. Do not remove
columns or make a destructive schema change as part of a rollback.

## 4. Provider preflight and sandbox receipts

The preflight is read-only:

```bash
PROVIDER_PREFLIGHT_EVIDENCE_FILE='./release-evidence/provider-preflight.json' \
npm run provider:preflight -- --all --network
```

Circle and Flutterwave may produce a `PASS` only after their authenticated
read-only checks. Smartspeed and PaymentPoint remain `PENDING_UNVERIFIED` until
their contracts are recorded; do not call guessed endpoints.

Then execute the authenticated sandbox flows in
`docs/testnet-e2e-runbook.md`. Record provider transaction IDs, tx hashes,
webhook IDs, local references, amounts, statuses, and explorer/console links.
Replay each duplicate webhook and prove that both the float and ledger change
only once. A timeout, 408, 409, 429, 5xx, connection reset, process crash, or
non-terminal status remains pending; do not refund or retry automatically.

## 5. Alerting and restart drill

Before any money movement:

1. configure `LEDGER_DRIFT_ALERTS_ENABLED=true`;
2. configure `LEDGER_DRIFT_WEBHOOK_URL`, or
   `LEDGER_DRIFT_ALERT_EMAIL` with `RESEND_API_KEY`;
3. verify the deployment can reach the destination without exposing secrets in
   logs;
4. in an isolated rehearsal database, create an approved test drift and run
   the watcher;
5. verify a `LedgerAlertDelivery` row progresses through `PENDING`/`RETRY` to
   `DELIVERED`, including `attempts`, `nextAttemptAt`, and `lastError`;
6. stop/restart the worker while a delivery is pending and prove the fresh
   process delivers the persisted row;
7. remove the test drift and run the ledger report clean.

Alert failure must never trigger a wallet refund or a provider retry. A
`RETRY` row or any `LEDGER_DRIFT` audit row blocks financial release.

## 6. Operator reconciliation and approval

The admin reconciliation list is the source of pending external outcomes.
For every pending bill or send, an authorized operator must obtain provider
evidence containing at least:

- provider reference/transaction ID or tx hash;
- provider terminal status;
- account/address and amount/currency match;
- provider timestamp and console/API lookup;
- reviewer note and operator identity.

The protected resolution endpoint requires provider reference and status and
writes a `BILL_PROVIDER_RECONCILED` or `SEND_PROVIDER_RECONCILED` audit event.
A completed outcome releases only the reservation; a confirmed failure refunds
through the guarded ledger reversal. Never mark a provider outcome from an
amount match, an HTTP status alone, a user screenshot without provider lookup,
or a timeout.

Before enabling a financial scope, the database gate must report zero stale
pending sends/bills, zero due/retrying durable alerts, zero stale idempotency
claims, and a clean ledger report.

## 7. Rollback

### Application/config rollback

1. Stop new money movement at the edge and set
   `MONEY_MOVEMENT_ENABLED=false`.
2. Keep webhook signature verification enabled. Do not delete pending rows or
   refund them because the application was rolled back.
3. If the issue is ledger reads and the pre-cutover report proves floats are
   still aligned, set `LEDGER_READS_ENABLED=false` and restart. Re-run the
   report and preserve the incident packet.
4. Keep provider-unknown sends/bills pending for reconciliation. Reuse the
   original Circle idempotency key for any explicitly approved provider query;
   never submit a new mutating request with a fresh key.
5. If schema rollback is required, restore the database snapshot into an
   isolated target first. Use a reviewed forward migration or restore plan;
   never run `db push --accept-data-loss` on a live financial database.

### Ledger rollback criteria

Rollback the read flag if a canary shows any ledger/float drift, negative or
unexpected spendable balance, duplicate transaction, or mismatch in a receipt.
Do not drop `LedgerEntry`, `LedgerAlertDelivery`, or legacy columns. Open an
incident, preserve logs and provider IDs, and reconcile every pending row
before resuming.

### Provider incident

For a provider outage or ambiguous response, close the affected path, leave
reservations pending, and page the operator. Resolution requires provider
terminal evidence and the protected admin endpoint. Automatic retry/refund is
not a rollback strategy.

## 8. Post-release observation

For the first release window, operators should review:

- ledger report and database gate at least hourly;
- `LEDGER_DRIFT`, `LedgerAlertDelivery`, and reconciliation queues;
- provider error/latency and webhook signature rejection counts;
- duplicate/idempotency metrics and pending reservation age;
- the exact receipt references for each testnet path.

Any deviation returns the deployment to read-only/demo mode until evidence is
re-established.

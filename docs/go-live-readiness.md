# SureXend go-live readiness review

**Review date:** 2026-09-16  
**Branch reviewed:** `arena/01a0aa53-surexend`  
**Decision:** **NO-GO for mainnet and NO-GO for unrestricted real-money launch**

## Executive decision

SureXend is not ready to move from testnet to mainnet. Mainnet now has an
explicit, fail-closed reviewed-matrix validator: `CHAIN_ENV=mainnet`,
`MAINNET_ENABLED=true`, `MAINNET_CONFIG_APPROVED=true`, a real non-test Circle
credential, and a complete `MAINNET_CHAIN_MATRIX_JSON` are all required before
boot. The matrix is deployment evidence, not a source-code default; no mainnet
values are invented here, and the release remains blocked until the matrix is
independently verified on-chain and against provider documentation.

No software can honestly guarantee “no loss whatsoever.” A billion-dollar-grade
financial release requires defense in depth, independent review, operational
controls, provider contracts, legal approval, and tested recovery procedures.
The controls in this repository reduce risk; they do not make loss impossible or
constitute a security audit, penetration test, custody audit, KYC/AML approval,
license, or insurance policy.

The only currently defensible deployment scope is an explicitly labelled,
read-only testnet/demo environment with:

```text
CHAIN_ENV=testnet
MAINNET_ENABLED=false
MONEY_MOVEMENT_ENABLED=false
```

## Controls implemented in this pass

- `FinancialControl` is a database-backed circuit breaker seeded disabled. Every
  crypto send, conversion, bill payment, administrative credit/referral payout,
  and provider inbound credit requires both the deployment flag and the matching
  database switch. An emergency pause is immediate; enabling movement requires a
  pending change approved by a distinct, stepped-up admin.
- Customer movement in production/mainnet requires `KYCStatus.VERIFIED`, and
  configured exact-match blocked-address screening is fail-closed. This is a
  technical control, not a substitute for a licensed sanctions/AML provider or
  compliance program.
- Daily minor-unit reservations are atomic and conservative. They use a locked
  per-user/day/currency bucket and a stable operation reference; failed or
  unknown provider outcomes consume the reservation rather than allowing retry
  abuse.
- Mainnet canary mode is an independent allowlist gate. When enabled, only
  explicitly listed user IDs can start customer movement; disabling it requires
  a staged-canary evidence packet.
- Mainnet consumers (CCTP, Circle wallet blockchain names, and EVM deposit
  monitoring) read the reviewed matrix instead of silently converting a testnet
  key into mainnet behavior. Mainnet remains disabled by default.

These controls still require a real PostgreSQL migration rehearsal and generated
Prisma-client validation before release. They do not close the external custody,
provider, legal/compliance, independent-review, or recovery-evidence blockers.

## Evidence collected

- Source and Prisma schema reviewed across frontend, backend, migrations, auth,
  wallet, ledger, provider, webhook, admin, and deployment code.
- Frontend `npm run typecheck`: **passed** after dependency installation.
- Backend unit tests could not be used as a release signal in this sandbox:
  Prisma client generation was blocked by the unavailable Prisma engine download,
  so the generated client was incomplete and Jest reported generated-client
  type errors. This is **pending evidence**, not a pass.
- `npm audit --omit=dev` now reports **22 advisories: 0 critical, 0 high,
  9 moderate, 13 low**. The high-severity findings were removed by upgrading
  direct `sharp`, `@nestjs/config`, `uuid`, and `multer`, and by applying
  reviewed `body-parser`, `qs`, `glob`, `file-type`, `toml`, and scoped UUID
  overrides. The dependency smoke check confirms `toml.parse`, Anchor, and the
  Solana RPC WebSocket UUID exception still load. Remaining moderate/low items
  are transitive Circle/Solana crypto, Nest major-line, WebAuthn, and
  stream-json paths with no safe non-breaking fix; they remain tracked but no
  longer trip the high-severity `security:audit` gate. The GitHub workflow update
  is still pending repository workflow permission.
- An isolated embedded PostgreSQL server rehearsal has now passed the guarded
  concurrent-duplicate-claim and durable-alert-restart checks in
  `scripts/postgres-rehearsal.js`. A second isolated run applied all nine
  checked-in migrations, verified the required financial schema and fail-closed
  control seed, and passed transaction rollback via
  `scripts/postgres-migration-rehearsal.js`. These are real PostgreSQL
  concurrency/migration/rollback results, but they are not a substitute for the
  dedicated production-like backup/restore rehearsal; that script explicitly
  remains pending until `pg_dump`/`pg_restore` evidence is run against the
  dedicated database.
- Provider preflight was executed with `--all --network`, but all four providers
  remain `PENDING_UNVERIFIED` because no authenticated provider credentials are
  configured in this environment. No provider contract evidence was fabricated.
- No production PostgreSQL migration/restore packet, end-to-end testnet receipt
  packet, external penetration test, custody approval, KYC/AML approval,
  sanctions approval, independent security review, or staged-canary observation
  packet was available in this environment.

## Blockers before mainnet

### P0 — financial correctness and custody

1. **Mainnet chain matrix is code-validated but not release-approved.** The
   application now consumes an explicit `MAINNET_CHAIN_MATRIX_JSON` for enabled
   networks and rejects incomplete, local, non-HTTPS, malformed, or unreviewed
   entries at startup. Real values must still be sourced from Circle/Arc
   documentation, verified on-chain, versioned in the release packet, and
   independently reviewed; never infer mainnet from an API-key prefix.
2. **Legacy `Float` columns remain compatibility snapshots.** All newly
   enabled money movement must use the integer-minor-unit ledger as its source
   of truth; startup now refuses money movement when non-zero float balances lack
   a ledger baseline, and the production gate requires ledger reads. The legacy
   columns are still written for compatibility and need a real PostgreSQL
   rehearsal, drift report, full-path test, and eventual removal before the
   accounting cutover can be called complete.
3. **Custody/key management is not at institutional standard.** The code now
   provides a database emergency pause, two-person release workflow, atomic
   per-user daily limits, and an audit surface for financial-control changes.
   Circle entity secrets and provider credentials must still be held in a
   managed secrets system, wallets must be least-privilege and segregated,
   treasury actions need custody-side dual control and allowlists, anomaly
   detection must be operational, and a production application environment
   must not be the only control over customer funds.
4. **Provider outcome contracts are incomplete.** Circle CCTP, bank funding,
   and bill-provider contracts need authoritative status, idempotency, timeout,
   reconciliation, and webhook replay evidence. Unknown provider outcomes must
   remain pending; they must never be guessed into success or failure.
5. **KYC/AML, sanctions, transaction monitoring, licensing, safeguarding,
   complaints, privacy, and consumer-protection controls are not complete.**
   The code contains simplified KYC states, not a production compliance
   program. This is a launch blocker regardless of technical test results.

### P0 — security and operations

6. **Independent security review is missing.** Commission a scoped external
   penetration test, threat model, dependency review, secure SDLC review, and
   custody/operational control review. Include XSS/CSRF, OAuth, WebAuthn,
   webhook forgery/replay, IDOR, admin escalation, provider ambiguity, and
   concurrency/failure injection.
7. **Observability and incident response need production evidence.** Configure
   durable ledger-drift paging, SLOs, provider/webhook rejection metrics,
   immutable audit export, database backups, restore verification, on-call
   ownership, incident severity rules, and a tested emergency kill switch.
8. **Database access must be separated.** App, migration, read-only reporting,
   and break-glass roles need least privilege. Ledger tables require restricted
   update/delete permissions and backup/restore monitoring. Application code
   alone cannot make an append-only ledger immutable.

## Hardening included in this review

- New login sessions are issued as `HttpOnly`, `Secure` (in production),
  `SameSite=Lax` access/refresh cookies. JWT bearer headers remain only as a
  migration compatibility path. OAuth no longer places JWTs in a URL fragment.
- JWT authentication accepts the access cookie, while refresh cookies are scoped
  to `/api/v1/auth`; frontend requests use credentials and no longer write new
  tokens to browser storage.
- OTP generation uses `crypto.randomInt`, new OTPs are HMAC-hashed at rest, OTP
  consumption is conditional/one-time, and registration verification is scoped
  to `REGISTER` codes. Login OTP now cannot bypass enabled TOTP 2FA. The schema
  migration is `20260916000000_hash_otp_codes`.
- Production startup now requires HTTPS frontend/WebAuthn configuration, a
  non-local Redis service, and a durable ledger alert destination when money
  movement is enabled. Transaction PIN lockout and refresh-session security fail
  closed instead of silently falling back to per-instance memory in production.
- The ledger journal rejects replayed transfer IDs whose existing rows differ
  in account, currency, amount, reference, or kind. Partial compatible rows
  can still be completed safely.
- State-changing requests are globally audit-intercepted with sensitive fields
  redacted and oversized strings truncated. Provider payloads were removed from
  application logs where they could expose PII or payment details.
- Bank-account/provider provisioning is closed while money movement is disabled,
  preventing a read-only demo from initiating provider side effects.
- The financial-control migration (`20260916010000_financial_control_plane`)
  seeds movement disabled, adds atomic daily limit buckets/reservations, and the
  admin API exposes separate request/approve and immediate pause operations.
- On-chain deposit recording now commits the transaction history row, float
  compatibility snapshot, and integer ledger journal in one database
  transaction; a partial wallet write cannot suppress a later reconciliation.

These changes are safety improvements, not launch approval. They must be
validated by the backend test suite and a deployed rehearsal environment.

## Required release gates

A mainnet candidate must not be promoted until all of the following are green
and independently reviewed:

1. Complete the mainnet configuration matrix and code review; start with
   `MAINNET_ENABLED=false` and a separate deployment/treasury from testnet.
2. Replace float money paths with integer minor-unit/decimal accounting, or
   finish the ledger cutover with proof that no financial path can read/write a
   float as its source of truth.
3. Rehearse every checked-in Prisma migration against a disposable PostgreSQL
   database restored from a recent production-shaped snapshot, then restore it
   again and verify the application starts.
4. Run backend typecheck and all tests with a generated Prisma client; run
   frontend typecheck/build and dependency/security scans in CI.
5. Execute the complete testnet receipt runbook: deposits, tag sends, CCTP
   success/failure, conversions, bill success/failure, bank credit replay,
   admin credit, referral payout, duplicate webhook, timeout, process crash,
   and concurrent request cases. Reconcile ledger and legacy balances before
   and after each path.
6. Run read-only provider preflight and record authoritative provider contract
   evidence. Record receipt IDs, provider references, webhook IDs, tx hashes,
   status lookups, and explorer/console links in a private release packet.
7. Configure and test ledger-drift alert delivery, including a process
   restart with a pending/retrying outbox row. Any unresolved drift or due alert
   blocks release.
8. Enforce verified KYC/AML/sanctions policy and transaction limits in the
   actual money paths. A UI status or admin boolean is not sufficient.
9. Complete external security, custody, compliance, and disaster-recovery
   sign-off. Require two-person approval with an immutable change ticket,
   image digest, database snapshot, rollback owner, and emergency contacts.
10. Launch with a capped canary and staged limits. Keep the kill switch and
    reconciliation/reporting active; expand only after signed observation
    windows remain clean.

The executable technical gate remains:

```bash
cd backend
node scripts/financial-launch-gate.js --scope=testnet-demo
node scripts/financial-launch-gate.js --scope=limited-real-money
node scripts/financial-launch-gate.js --scope=mainnet
```

The `mainnet` gate is expected to remain blocked until the implementation and
review above are complete.

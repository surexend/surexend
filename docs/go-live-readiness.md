# SureXend go-live readiness review

**Review date:** 2026-09-16  
**Branch reviewed:** `arena/01a0aa53-surexend`  
**Decision:** **NO-GO for mainnet and NO-GO for unrestricted real-money launch**

## Executive decision

SureXend is not ready to move from testnet to mainnet. The backend deliberately
refuses to boot when `CHAIN_ENV=mainnet` or `MAINNET_ENABLED=true`, because the
wallet, Arc transfer, CCTP, reconciliation, and explorer mappings still contain
Arc/testnet assumptions. That fail-closed behavior is correct and must not be
removed as a release shortcut.

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

## Evidence collected

- Source and Prisma schema reviewed across frontend, backend, migrations, auth,
  wallet, ledger, provider, webhook, admin, and deployment code.
- Frontend `npm run typecheck`: **passed** after dependency installation.
- Backend unit tests could not be used as a release signal in this sandbox:
  Prisma client generation was blocked by the unavailable Prisma engine download,
  so the generated client was incomplete and Jest reported generated-client
  type errors. This is **pending evidence**, not a pass.
- `npm audit --omit=dev` reported **45 advisories: 0 critical, 11 high,
  25 moderate, 9 low** in the installed backend dependency graph after
  removing the unused native `bcrypt` dependency and upgrading direct Multer.
  A real release requires triage, upgrades, or documented compensating controls;
  this repository must not treat the audit as clean.
- No production PostgreSQL migration/restore rehearsal, provider contract
  preflight, end-to-end testnet receipt packet, alert restart drill, or external
  penetration test was available in this environment.

## Blockers before mainnet

### P0 — financial correctness and custody

1. **Mainnet chain matrix is not implemented or independently reviewed.** The
   current release contains `ARC-TESTNET`, testnet BridgeKit chains, and testnet
   RPC/token defaults. Mainnet must use an explicit, versioned matrix sourced
   from Circle/Arc documentation and verified on-chain; never infer mainnet from
   an API-key prefix.
2. **Balances still have legacy `Float` fields.** Financial balances should be
   integer minor units or a rigorously specified decimal type. The double-entry
   ledger migration is additive and flag-gated, but legacy writes/reads and
   baseline reconciliation still need real PostgreSQL rehearsal and canary
   evidence.
3. **Custody/key management is not at institutional standard.** Circle entity
   secrets and provider credentials must be held in a managed secrets system,
   wallets must be least-privilege and segregated, treasury actions must have
   dual control, withdrawal limits, allowlists, anomaly detection, and an
   emergency pause. A production application environment must not be the only
   control over customer funds.
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

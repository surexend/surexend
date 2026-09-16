# SureXend

SureXend is currently a **testnet-stage financial application**. It is not
approved for mainnet or unrestricted real-money launch.

## Current release decision

The backend intentionally fails closed for mainnet configuration. The only
defensible public scope is a clearly labelled testnet/demo deployment with
money movement disabled:

```text
CHAIN_ENV=testnet
MAINNET_ENABLED=false
MONEY_MOVEMENT_ENABLED=false
```

See [`docs/go-live-readiness.md`](docs/go-live-readiness.md) for the 2026-09-16
security/readiness review, blockers, completed hardening, and required evidence.
The operational release procedure is in
[`docs/financial-release-runbook.md`](docs/financial-release-runbook.md).

## Development checks

```bash
npm ci
npm run typecheck
npm run lint
npm run build

cd backend
npm ci
npx prisma generate
npx tsc -p tsconfig.json --noEmit
npm test -- --ci
```

The backend requires PostgreSQL, Redis, JWT secrets, and explicit provider
configuration. Never use `.env.example` values in a deployed environment and
never enable `MAINNET_ENABLED` until the mainnet implementation and independent
review are complete.

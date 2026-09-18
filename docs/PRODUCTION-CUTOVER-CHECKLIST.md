# Production mainnet cutover — live checklist

Short operator checklist. Full detail: `docs/mainnet-config.md`. Tick items in
order; each is safe to repeat. Never put secrets in this file or in chat.

## Status (update as you go)

- [x] 0. PR #20 merged (`f73369c` on `main`) — `migrate deploy`, fail-closed boot
- [ ] A. Confirm Production Supabase DB ≠ Staging DB (compare `DATABASE_URL` hosts/project refs)
- [ ] B. Wipe Production DB (Supabase SQL editor):
      `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;`
- [ ] C. Railway Production → add `DIRECT_URL` = Supabase **Direct connection** string (db.<ref>.supabase.co:5432); keep `DATABASE_URL` = pooler
- [ ] D. Redeploy Production; log must show `prisma migrate deploy` applying 10 migrations, then the app starting or a clear `Refusing to start:` line
      NOTE: right after the DB wipe in B the production admin gate refuses to boot
      ("no active, unbanned administrator is provisioned") — expected. Provision the
      first admin via J1 before continuing; registrations are impossible until the
      app boots.
- [ ] E. Circle Console (mainnet): create `LIVE_API_KEY`; confirm entity secret registered (save recovery file); create mainnet webhook → `https://surexend-production.up.railway.app/api/v1/webhooks/circle`, copy secret
- [ ] F. From a laptop, in `backend/`: `CIRCLE_API_KEY='LIVE_API_KEY:…' CIRCLE_ENTITY_SECRET='…' npm run mainnet:wallet-sets` → two UUIDs
- [ ] G. Railway Production variables (see table below)
- [ ] H. Redeploy; log shows `Stamped database as mainnet`
- [ ] I. Run in Production shell:
      `CHAIN_ENV=mainnet PROVIDER_PREFLIGHT_EVIDENCE_FILE=./release-evidence/provider-preflight-mainnet.json npm run provider:preflight -- --all --network`
      `npm run launch:gate -- --scope=mainnet-preflight`
      Both must PASS → Stage 1 complete (mainnet live, money paused)
- [ ] J. Provision the two Stage-2 admins.
      J1 — FIRST admin (the DB was wiped in B, so nobody can register yet):
           in Railway Production set ADMIN_EMAIL=<operator1 email>,
           ADMIN_PASSWORD=<strong password>, ADMIN_BOOTSTRAP_INITIAL=true and
           redeploy. The log must show
           `[admin-bootstrap] Created the first administrator account (...)`.
           Log in at /admin to confirm, then REMOVE all three variables
           (deleting them redeploys automatically).
      J2 — SECOND admin (the app is now serving): register operator2 in
           Production like any user, then in the Production shell
           `npm run admin:provision -- operator2@example.com`
      `npm run admin:provision -- --list` must show both (Stage 2 needs two distinct admins for the two-person flow)
- [ ] K. Stage 2 canary — see `docs/mainnet-config.md` §6

## Step G — Production variables

Secrets (operator-supplied):
```
CIRCLE_API_KEY=LIVE_API_KEY:…
CIRCLE_ENTITY_SECRET=<64 hex>
CIRCLE_WALLET_SET_ID=<uuid from F>
CIRCLE_REFERRAL_REWARD_WALLET_SET_ID=<second uuid from F>
CIRCLE_WEBHOOK_SECRET=<from E>
DATABASE_URL=<pooler>   DIRECT_URL=<direct>
```
Fixed values (copy verbatim):
```
NODE_ENV=production
CHAIN_ENV=mainnet
MAINNET_ENABLED=true
MAINNET_CONFIG_APPROVED=true
MAINNET_DB_ISOLATION_CONFIRMED=true
MAINNET_ENABLED_NETWORKS=ARC
MAINNET_CHAIN_MATRIX_JSON={"ARC":{"circleBlockchain":"ARC","cctpChain":"Arc","rpcUrls":["https://rpc.mainnet.arc.io"],"chainId":5042,"usdcContract":"0x3600000000000000000000000000000000000000","usdcDecimals":6,"explorerUrl":"https://explorer.arc.io"}}
MONEY_MOVEMENT_ENABLED=false
LEDGER_READS_ENABLED=false
CANARY_MODE=true
```
Leave unset: `TESTING_ENABLED`, `FINANCIAL_RELEASE_APPROVED`.
Keep existing: SmartSpeed, PaymentPoint, JWT, Redis, WebAuthn, SMTP, `FRONTEND_URL`.

Frontend (Production): `NEXT_PUBLIC_CHAIN_ENV=mainnet`, `NEXT_PUBLIC_ARC_EXPLORER_BASE=https://explorer.arc.io/tx/`

## Incident note 2026-09-17
Production crash-looped with `global control row is missing` + `Invalid or
unexpected token`: the pre-#20 `deploy-database.js` threw after `db push` and
before the data migrations, so `FinancialControl` was never seeded. Fixed in
PR #20 (`migrate deploy`, fail-closed). Because that DB was built with
`db push` it has no migration history → step B wipes it (it holds no data).

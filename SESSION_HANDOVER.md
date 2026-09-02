# SUREXEND — FULL SESSION HANDOVER PROMPT

> Paste this entire document as your very first message in a new session.
> It fully reconstructs the context. Read it, then confirm to the user:
> "Context loaded. I know the project, what's been built, what's pending, and the verification commands."

> **IMPORTANT**: Living documentation now lives in `docs/` — `prd.md`,
> `architecture.md`, `project_plan.md`, `memory.md`. `SESSION_HANDOVER.md` is the
> quick-start prompt; the docs are the source of truth. Keep all of them updated
> in the same commit as the work.

---

## ROLE

You are the senior full-stack developer for **SureXend**, an African fintech app (USDT stablecoin wallet). You are picking up an active, working codebase mid-project. The user is the product owner. Work is done in short, focused turns: they report a symptom, you investigate, fix, verify (typecheck/build), commit, and push. Be concise. Do NOT add code comments unless asked. Only commit/push when the user asks (they usually will, at the end of each turn).

## MACHINE / SHELL FACTS (IMPORTANT)

- OS: Windows. Shell: PowerShell 5.1 (NOT bash — no `&&`, no `grep`/`ls`). Use `;`, `if ($?) { ... }`, `Select-String`, `Get-ChildItem`.
- Project root (repo root): `C:\Users\ASAKE ISLAMIA SALAH\OneDrive\Documents\surexend\surexend`
- Backend is a subfolder: `<root>\backend`
- Repo: `https://github.com/Archsec-Emman/surexend.git`, branch `main`, remote `origin`.
- `tsc` is NOT on PATH. Always run `npx tsc` (from the folder with the relevant tsconfig).
- The root `tsconfig.json` includes BOTH frontend and `backend/` — running `npx tsc --noEmit` at root produces false positives (Nest decorators). DO NOT use root typecheck.

## VERIFICATION COMMANDS (the only reliable ones)

1. **Backend typecheck** (from `<root>\backend`):
   `npx tsc -p tsconfig.json --noEmit` → EXIT 0 = good.
2. **Frontend typecheck** (from `<root>`): write a temp `tsconfig.check.json` at root:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": true,
       "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
       "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
       "isolatedModules": true, "jsx": "preserve", "incremental": true,
       "plugins": [{ "name": "next" }], "paths": { "@/*": ["./src/*"] }
     },
     "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"]
   }
   ```
   then `npx tsc -p tsconfig.check.json`, then delete the file. EXIT 0 = good.
3. **Frontend build**: `npx next build` (from root) — passes. Note `typescript.ignoreBuildErrors: true` in next.config.ts.
4. **Backend build**: `nest build` (from `<root>\backend`) — no output = success.
5. `backend/err.log` and `backend/out.log` are empty and gitignored — ignore them.

## ARCHITECTURE

- **Frontend**: Next.js App Router, TypeScript, Tailwind, framer-motion, @tanstack/react-query, react-hot-toast, lucide-react. Client components marked `'use client'`. All routes under `src/app/`.
- **Backend**: NestJS + Prisma (Postgres) + Redis (ioredis) + bcryptjs. Global prefix `api/v1` (main.ts). JWT auth. Deployed as Docker (`node:22-slim` — MUST stay 22, a transitive Circle dep requires it).
- **Proxy**: next.config.ts rewrites `/api/:path*` → `${BACKEND_URL}/api/:path*`. Frontend API base is `process.env.NEXT_PUBLIC_API_URL || '/api/v1'`.
- **Deployment**: Backend on **Railway** (`surexend-production.up.railway.app`), frontend on **Vercel** (user corrected me: Vercel, NOT Netlify — ignore netlify.toml unless they say otherwise). `prestart:prod` = `prisma db push || echo "...continuing anyway"` — schema push failures are swallowed, so backend code MUST be defensive against missing columns.
- **Theme**: `NEXT_PUBLIC_BRAND_VARIANT` = 'gold' | 'lemon' via ThemeContext. Accent hex: gold `#D4A017`, lemon `#B5E23D`.

## CORE FEATURES BUILT

- **42 African currencies** (40 national + XAF + XOF shared), covering ALL 54 African countries. Each has `code`, `name`, `symbol`, `flag`, `country`, `countryCode`, and `countries[]` for XAF (6 countries: Cameroon, CAR, Chad, Rep. of the Congo, Equatorial Guinea, Gabon) and XOF (8: Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo). Both CFA pegged at 655.957 = €1.
- **CurrencyFlag** component (`src/components/CurrencyFlag.tsx`): real emoji flags everywhere; gradient code badge ONLY on Windows (userAgent detect). ~70% of users are mobile — emoji is primary.
- **Real balances everywhere** — NO fake balance fallbacks remain. getBalance returns `{ usdtBalance, usdcBalance, localBalance, localBalances: {} }`. Dashboard/withdraw/convert all read real values.
- **Wallet-to-wallet conversions**: USD <-> LOCAL and LOCAL <-> LOCAL (via USD cross-rate). Executed via conversions.service.execute → records a CONVERT transaction in history (history page has CONVERT filter).
- **KYC**: verified/unverified ONLY (no tiers). getKycStatus returns `{ status, isVerified, limits: { dailyWithdrawal } }`. Backend `kycTier` column still exists in DB but is no longer exposed/used in UI.
- **PIN**: 4-digit, bcrypt-hashed, required for conversions, sends, bills. setup-pin + change-pin endpoints. `pinSet` exposed in getProfile.
- **Receive**: walletAPI.getDepositAddress(network) → GET /api/v1/wallets/deposit-address. Addresses for EVM chains, SOLANA, ARC. QR code shown.
- **Send**: SureXend Tag (zero fee) or on-chain USDT/USDC via Circle. PinGuard protects it.

## TESTING MODE (default PIN) — current state

- Backend config (`backend/src/config/configuration.ts`):
  ```ts
  testing: {
    enabled: process.env.TESTING_ENABLED === 'true' || (process.env.NODE_ENV || 'development') !== 'production',
    defaultPin: process.env.DEFAULT_PIN || '0000',
  }
  ```
- **PinGuard** (`backend/src/common/guards/pin.guard.ts`), **conversions.service.execute**, and **bills.service.purchaseBill**: if user has NO custom PIN and testing.enabled, accept `defaultPin` ('0000'). Otherwise require/validate the stored bcrypt hash.
- Frontend shows a hint "use default PIN 0000" on the convert PIN step and the change-pin page ONLY when `NEXT_PUBLIC_TESTING_ENABLED === 'true'`.
- **Deploy pending**: user must set `TESTING_ENABLED=true` (+ optionally `DEFAULT_PIN=0000`) on Railway, and `NEXT_PUBLIC_TESTING_ENABLED=true` on Vercel + redeploy. The backend one actually gates PIN acceptance; the Vercel one only shows hints. When going live: remove/disable both → custom PIN becomes mandatory automatically. **This deploy step has been explained to the user but not yet confirmed done.**

## LEDGER ROLLOUT — current state (2026-08-30, see docs/rollout-status.md)

- Double-entry ledger (`LedgerService` → `LedgerEntry`, minor units via
  `toMinor`) is now written on EVERY money path (floats and ledger change in
  the same DB transaction). Missing writes were added to: webhooks (Circle
  deposit, Flutterwave bank credit, Circle FAILED refund), referrals
  (commission), bills (failure refund), wallets (sync FAILED settlement +
  `releaseReservedSend`). Conversions now book the ledger exactly as the float
  moved (USDT/USDC split) instead of everything as USDC.
- `LedgerService.record()` is atomic (`createMany` + `skipDuplicates`) —
  partial ledger writes are impossible. `LedgerService.reverse(transferId)`
  mirrors a transfer under `<transferId>-REFUND`; all refund paths use it.
- Reconciliation (`LedgerReconciliationService`, hourly) covers USDC/USDT/local
  currencies and persists drift to `AuditLog` (`LEDGER_DRIFT`); `npm run
  ledger:report` runs the same check on demand (CI-friendly, exit 1 on drift).
- **Read cutover is implemented but OFF**: `LEDGER_READS_ENABLED` (default
  false) switches `getBalance`, tag send, cross-chain reserve and conversion
  reads to `LedgerEntry` with per-currency float fallback; floats are still
  written in both modes. To go live: deploy (flag off) → `npm run
  ledger:baseline` → `npm run ledger:report` clean → set
  `LEDGER_READS_ENABLED=true` → verify → re-check report. Floats NOT removed;
  code stays additive and testnet-safe; **Mainnet NOT enabled.** Next: real
  testnet E2E (keys needed), then enable the flag, then stop float writes,
  then checked-in migrations + column removal.
- **Verification is automated**: `backend/test/money-flows.integration.spec.ts`
  (18 cases) drives the real money services against an in-memory Prisma store
  and asserts double-entry + ledger==float on every runbook row; `npm test`
  = 7 suites / 72 tests. It found 3 real bugs (fixed): NGN→USD ledger credit
  booked as 'USD' pseudo-currency; unrounded float credits vs rounded ledger
  (now `roundMinor`); tag-send pre-check not ledger-aware.
- Mainnet prep: `docs/mainnet-config.md` + `assertNetworkConfig()` boot guard
  (`main.ts`) — refuses mixed testnet/mainnet configs. On a machine with Prisma
  engine access: `npx prisma generate` (the sandbox uses a gitignored typing
  stub in `node_modules/.prisma/client`), and generate the checked-in baseline
  migration + `migrate resolve --applied` the live DB before switching
  `prestart:prod` off `prisma db push`.

## THE PIN CONFIRM BUG (already fixed, do not regress)

Old bug: in `/app/settings/change-pin`, the confirm step compared stale state — `submit(newPin.join(''), confirmPin.join(''))` read the pre-update `confirmPin`. Fix: pass the just-built array: `submit(newPin.join(''), next.join(''))`. The page now flows: (if pinSet) Current → New → Confirm; (else) New → Confirm. Mismatch → toast + reset to New.

## RECEIVE PAGE 500 (root cause, fixed — understand it)

Symptom: receive page toast "Server error. Please try again later." (fires on ANY status >= 500 via api.ts interceptor). Root cause: `getDepositAddress` and other wallet queries used full `prisma.wallet.findUnique({ where: { userId } })` — a Prisma query that selects ALL columns, which 500s if the deployed DB hasn't migrated the `localBalances` column. Fix pattern: use EXPLICIT `select` of only existing columns, and read `localBalances` in its own guarded try/catch. Applied at: `wallets.service.ts` getBalance (~75), getDepositAddress (~426, `select: { id: true }` on find + create), sendCrypto (~543, `select: { id, usdtBalance, usdcBalance }`), conversions.service.ts execute (~137), bills.service.ts purchaseBill (~80, `select: { id, usdtBalance }`), referrals.service.ts (~99, `select: { id }`). If a "server error" ever reappears, suspect ANOTHER full-wallet select was introduced. webhooks.service.ts is safe (uses wallet.update only).

## CONVERSION FEES — ZEROED FOR TESTING

- Backend `computeConversion`: `feeRate = 0` (was 0.012).
- Frontend convert preview: `feeUsd = 0`.
- api.ts mocks: `feePercent: 0`, preview fee `0`, execute mock fee `0`.
- bills page text no longer says "includes 1.2% fee".
- Sanity math (no fee): $2.80 → 4,149.6 NGN → 43.18 GHS → 349.70 KES → $2.80.
- Note: withdraw page still shows a 0.50 USDT "Network Fee" — that is separate (fiat payout), intentionally left.

## KYC — VERIFIED/UNVERIFIED ONLY (current state)

- `users.service.getKycStatus` returns `{ status, isVerified, limits }` (no `tier`).
- Dashboard badge: "✓ Verified". Profile KYCBadge: Verified (green) / Unverified (red). Marketing page: "Identity Verification". api.ts mocks use `status: 'VERIFIED', isVerified: true`.
- New `/app/kyc` page: status card + feature-lock list (crypto requires KYC; airtime/data/bills always available) + note that testing skips verification.
- **PLANNED FOR LAUNCH (user's stated intent)**: use an EXTERNAL KYC provider (e.g. Smile Identity — config block `app.smileIdentity` already exists) that handles verification and reports back; then set user status to VERIFIED (or leave UNVERIFIED with a clear failure message). At launch, ALL crypto operations require KYC; only airtime/data/bills work without it. This is NOT required during testing.

## CURRENT STATE — CROSS-CHAIN SEND (verified 2026-08-15)

### Send path WORKS end-to-end (testnet). Verified on-chain:
- 4 USDC CCTP send → Sepolia mint **2.440392** to `0x06b141...`
  (tx `0x9f3a3f2e...`, block 11483979).
- Live test 2 USDC → Sepolia mint **2.000000** (tx `0x4a102a...`, block 11484952).
- **`0x06b141...` currently holds 4.440392 USDC on ETH-SEPOLIA** (queried live).
- Fee collector gets the difference (e.g. 1.559608 from the 4 USDC send).

### "Circle Console shows 0 USDC + two transactions" is NORMAL (not a bug):
- CCTP from a Circle wallet = ERC20 approve + burn = two outbound txs, both
  reported by Circle's feed as 0-amount contract executions (USDC goes INTO the
  bridge contract, not a wallet).
- The real credit is a MINT on the destination chain to the recipient address.
- Circle Console only shows balances for entity-managed wallets; an external
  recipient address is never shown in Console, but the mint tx proves delivery.

### THE big user-facing issue: testnet vs mainnet
- Whole stack is TESTNET (`TEST_*` key; `ETHEREUM → Ethereum_Sepolia`).
- Recipients viewing their wallet on MAINNET see 0, because testnet USDC lives
  on the destination TESTNET chain. The funds ARE at the recipient address on
  the testnet chain.
- **OPEN ACTION**: confirm with product owner whether this build is meant as
  sandbox (then tell recipients to check the testnet network in MetaMask, e.g.
  Sepolia + USDC `0x1c7D4B...`) or must be mainnet (then change key + mapping).

### Golden rule for this repo (learned the hard way):
Never assert an explanation without verifying on-chain receipts. Mint/transfer
hashes are the ground truth. See `docs/memory.md` for the "mistakes not to
repeat" list.

## SUREX TAG SYSTEM + HOME PAGE LAUNCH BATCH (2026-08-15)

- **SureX Tag**: new `User.surexTag String? @unique` column. Users choose it at
  registration (`@handle`, 3-20 alphanum/underscore, unique; auto-fallback to
  `firstname.lastname` if skipped). `users.service.getProfile` lazy-backfills a
  tag for pre-tag users.
- **Tag sends WORK**: `POST /wallets/send` with `network: 'SUREX_TAG'` →
  `sendToSurexTag` — zero-fee internal USDC transfer (debit sender / credit
  recipient wallet), writes SEND + RECEIVE COMPLETED txs (shared
  `TAG-<ts>-<rand>` reference), fires SEND + DEPOSIT notifications. No chain hop.
  Previously SUREX_TAG crashed (hit CCTP bridge with an invalid chain).
- **Notifications**: bell drawer = transactions + security. Backend now creates
  SEND notifications on successful sends (crypto + tag). DEPOSIT / SWAP / LOGIN
  already existed.
- **USDC is the main coin** — USDT removed from dashboard banner/balance/chart/
  fund modal + send-page wording. Dashboard ticker + market chart now use live
  FX rates (`https://open.er-api.com/v6/latest/USD`, 30s poll, static fallback).
- **Dashboard polish**: real profile name + @tag (no hardcoded "Alex"); EU
  Invoice link removed; AUTO wallet ordering compares USD value (so $39 > 5,000
  NGN); cash-flow chart excludes CONVERT + converts local→USD (kills the fake
  "$2,401.10 in"); referral card is "Coming Soon" (no fake numbers); CONVERT
  amount green on homepage (was amber).
- New frontend files/touches: `auth/register/page.tsx` (tag input),
  `app/dashboard/page.tsx`, `app/layout.tsx`, `app/profile/page.tsx`,
  `app/send/page.tsx`, `lib/api.ts`. Backend: `schema.prisma`, `auth.service.ts`,
  `auth/dto/auth.dto.ts`, `users.service.ts`, `wallets.service.ts` (now injects
  NotificationsService — global module, no import needed).

## COMMITS SO FAR (main, all pushed to origin)

- (pending) — homepage launch batch + SureX Tag system (see below)
- `7a5f1f4` — feat: real live market charts (backend proxy: Yahoo/CoinGecko/FloatRates) for every currency + premium receipt redesign (variant-aware real logo)
- `00cc60f` — revert(dashboard): restore single combined market chart with one dropdown (user rejected two-card split)
- `c2d9233` — feat: split dashboard markets into two cards; fix receipt logo (reverted dashboard part in 00cc60f)
- `30caa6d` — fix(schema): WalletAddress unique must be per network, not global
- `22dbba3`, `fe7a788` — docs: PRD/architecture/project plan/memory + testnet decision
- `2bb2d3a` — fix: settle CCTP fee via history sync and webhook settlement paths
- `3e9ffaa` — fix: surface and charge CCTP forwarder relay fee on cross-chain sends
- `8b7b97d` — fix: complete CCTP sends from amount-less Circle steps, correct Arc network labels
- `cee2b73` — feat: add Monad network, dedup pending->completed send rows, per-chain explorer links
- `6c7201b` — feat: native Arc->Arc sends, de-block balance endpoint, throttle reconcile/history sync, drop CCTP from UI
- `fbe3834` — fix: auto CCTP send from Arc, drop second destination-network picker, 4-digit PIN consistency, instant balance loads
- `1302ebf` — feat: derive ARC-TESTNET wallets at every displayed EVM address via circle derive-by-address
- `da21667` — fix: retry eth_getLogs with backoff on transient testnet RPC rate limits
- `c2c7b80` — Fix PIN confirm mismatch bug; add testing default PIN (0000)
- `2c6b66a` — Fix receive-page 500, simplify KYC to verified/unverified, zero conversion fees, add PIN setup page
- `500609f` — real flags on mobile, sticky search, CFA country lists, all 42 African currencies
- `e3d7172` — resilient getBalance, all African currencies with searchable picker, cross-platform flags, no fake balances
- `a8a5efc` — separate USD & multi-currency local wallets + working wallet-to-wallet conversions
- earlier: desktop modal fixes, FAILED deposits, Vercel build fixes

## KEY FILES

- `docs/prd.md`, `docs/architecture.md`, `docs/project_plan.md`, `docs/memory.md` — living documentation (source of truth)
- `backend/src/config/configuration.ts` — all env config + `testing` block
- `backend/src/common/guards/pin.guard.ts` — PIN validation with testing fallback
- `backend/src/wallets/wallets.service.ts` — getBalance, getDepositAddress, sendCrypto → sendCrossChainFromArc, syncCircleHistory, estimateSendFee
- `backend/src/wallets/cctp.service.ts` — CCTP bridge + fee estimate (NETWORK_TO_CHAIN is all testnet)
- `backend/src/wallets/wallets.controller.ts` — GET /wallets/cctp-fee, POST /wallets/send
- `backend/src/webhooks/webhooks.service.ts` — outbound settlement (amount + fee, usdcBalance refund, PENDING guard)
- `backend/src/conversions/conversions.service.ts` — execute, computeConversion (fee=0)
- `backend/src/bills/bills.service.ts` — purchaseBill (PIN testing fallback)
- `backend/src/users/users.service.ts` — getProfile (pinSet), getKycStatus, setupPin, changePin
- `backend/src/common/currency.constants.ts` — 42 currencies, countries arrays
- `src/lib/api.ts` — ALL API clients + mocks (AFRICAN_CURRENCIES, walletAPI, conversionAPI, userAPI, billAPI, etc.)
- `src/components/CurrencyFlag.tsx`
- `src/app/app/send/page.tsx`, `convert/page.tsx`, `receive/page.tsx`, `withdraw/page.tsx`, `bills/page.tsx`, `dashboard/page.tsx`, `history/page.tsx`, `profile/page.tsx`, `kyc/page.tsx`, `settings/change-pin/page.tsx`, `referrals/page.tsx`
- `src/app/page.tsx` (marketing), `next.config.ts`, `.env.local`, `backend/.env.example`
- `backend/scripts/*.js` — live-test + diagnostic scripts (some untracked; run via railway)

## WORKING STYLE NOTES

- The user reports a symptom → I diagnose (grep/read) → fix → typecheck (backend + frontend) → optionally `npx next build` → commit + push → summarize concisely.
- Backend changes require `npx tsc -p tsconfig.json --noEmit` from `backend/`; frontend changes require the temp tsconfig.check.json trick.
- When a fix touches the deployed DB schema assumptions, use defensive selects (see RECEIVE PAGE section).
- Never invent fake balances; always surface real data. Mock fallbacks in api.ts are acceptable for the live-backend-unavailable case but should mirror real shapes.
- When asked about opencode/this tool: consult https://opencode.ai docs via web fetch.
- Do NOT create new docs unless explicitly requested — BUT keep the existing `docs/` set + `SESSION_HANDOVER.md` updated whenever state changes, and commit them in the same commit as the work.
- NEVER assert a root cause without on-chain verification (mint/transfer receipts). See `docs/memory.md` "mistakes not to repeat".
- Respect the user's launch plan: external KYC provider, crypto requires KYC at launch, custom PIN mandatory at launch, remove testing flags.

## 2026-08-17 — AI assistant "ready" + domain migration next

### AI assistant (chat transactions, maximum security)
- Security model: **the AI only proposes, it never executes.** `POST /support/chat`
  returns a validated `action` (send/bill/receipt); the client shows a
  confirmation card + inline 4-digit PIN pad; execution goes through the normal
  guarded endpoints (`wallets/send` with PinGuard, `bills/purchase`) carrying an
  `X-Txn-Source: chat` audit header. Prompt injection at worst yields a proposal
  the victim still must approve with a PIN. Server re-validates all fields,
  caps chat amounts (send <= 5000 USDT, bill <= 500000), allowlists bill types +
  networks, rate-limits 40 msgs/min/user.
- Keys optional: OPENAI_API_KEY (gpt-4o-mini, preferred) -> GEMINI_API_KEY
  (legacy) -> local knowledge base. **To activate the real brain later: add
  OPENAI_API_KEY to Railway env — zero code change.**
- Files: `backend/src/support/support.service.ts` (+`openai.apiKey` in
  `configuration.ts`), `src/components/AISupportWidget.tsx`,
  `src/lib/receipt.ts` (new canvas renderer), `src/lib/api.ts` (chat action
  passthrough + optional headers on send/purchase).
- Next: Redis-backed rate limiter, server-side idempotency, tighten UI amount
  caps, then switch widget to OpenAI streaming once key lands.

### Domain migration (Namecheap -> Vercel) — what to ask for
- Need from whoever owns the Namecheap account: **account login (or DNS
  management access)** and the domain's **renewal/expiry status** (a domain
  locked for transfer or expiring soon needs renewing first).
- The actual registrar does NOT need to move to Vercel — keep the domain
  registered at Namecheap (cheap) and just point its DNS at Vercel. No EPP code
  / unlock needed for that. (EPP code + unlock only matter if transferring the
  registration away from Namecheap entirely.)
- In Vercel: add the domain to the project (Domains tab), then at Namecheap set
  the DNS record (A record -> `76.76.21.21`) or point Namecheap's nameservers
  to Vercel's (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`) and let Vercel
  manage DNS. Keep the old site's records until the new one resolves to avoid
  downtime; remove them after.

## 2026-08-17 (round 3) — chart fix, smoothness, white receipts, glass tiles, smarter fallback
- Chart straight-line bug: Yahoo intermittently 429s -> old fallback forged 12
  equal FloatRates points = horizontal line. Now: backend retries query1/query2,
  and on total failure returns an empty series (never fabricate a flat line);
  dashboard live ticker supplies real movement; 1M/1Y date labels; live tip
  updates in place after 30 ticks so history doesn't scroll away.
- Smoothness: ring 2px; blur 18/24px saturate 165/155.
- Receipts: amount is white in-app + all downloads (history + chat renderer).
- Glass: faint diamond lattice tile pattern (--tile, gold/lemon) replaces the
  invisible dot grid; content stays above it.
- Assistant fallback: real intent parser (send/bill/convert/receipt/balance)
  that asks clarifying questions; balance answered server-side (model never
  sees it); new convert action card (PIN -> /conversions/execute). Real brain
  still activates by adding OPENAI_API_KEY only.
- Recommendation recorded: build the ADMIN DASHBOARD before migrating the
  domain (migration is a 10-minute DNS step at launch-prep; admin dashboard is
  core launch work: KYC review, monitoring, ops). Next session: admin dashboard
  brainstorm (Tier 1-3 previously proposed).

## 2026-08-17 (round 4) — glass readability, real USDC chart, receipt fix, ADMIN BUILT
- Glass: tile lattice feathered (gradient peaks) + alpha 0.10->0.05 -> tiny text
  readable, texture still visible.
- USDC chart: backend returns REAL `live` anchor (CoinGecko last close or
  simple-price); ticker uses it (never 1.0); empty history is seeded with it;
  Y axis zooms into near-constant series so the real ~0.03% wiggle shows.
- Receipt: `spaced()` textAlign bug (letters colliding) fixed in history +
  receipt.ts; swap arrow now a clean centered chip.
- ADMIN DASHBOARD SHIPPED (backend + frontend): User.role field (db push),
  @Roles('ADMIN') + RolesGuard, admin module (overview/users/transactions/
  kyc/user-detail), /admin UI with role guard + 5 pages, adminAPI client,
  sidebar Admin Console link. MAKE DEMO AN ADMIN ON PROD:
  `node scripts/make-admin.js demo@surexend.com` (run in Railway shell after
  deploy so `prisma db push` has added the role column).
  UPDATE: scripts/ is NOT in the Railway image (dist/ only), so on prod use
  `ADMIN_EMAILS=demo@surexend.com` in Railway env -> redeploy -> main.ts
  promotes matching users on boot (idempotent) -> then remove the var.
- Next: VTU/airtime depth + integration batch, then domain migration at
  launch-prep.

## 2026-08-17 (round 5) - launch batch: auth (Google+OTP), honest admin, VTU real, swaps paused
Commit 7ca4652 (pushed).
- LOGIN ERROR FIX: api.ts interceptor no longer swallows /auth/login 401s; the
  login page now shows the real backend message ("Invalid credentials"). The
  misleading "Session expired" toast + refresh flow is skipped for login calls.
- GOOGLE OAUTH (env-ready, zero code change to activate): set GOOGLE_CLIENT_ID +
  GOOGLE_CLIENT_SECRET on Railway. Endpoints: GET /auth/google (returns {url}),
  GET /auth/google/config ({enabled}), GET /auth/google/callback (exchange ->
  find-or-create user by email -> redirect to /auth/oauth-callback?accessToken=
  ..&refreshToken=..). New Google users: random unusable passwordHash +
  google-<n> placeholder phone (editable in admin console). Google buttons on
  login + register only render when config says enabled. New frontend page:
  /auth/oauth-callback (stores tokens, redirects to dashboard).
- PASSWORDLESS OTP LOGIN: POST /auth/otp/request {email} (LOGIN OTP via Resend,
  requires existing active account) + POST /auth/otp/verify-login {email,code}
  (issues tokens). Login page has an inline "Sign in with a code" flow.
- ADMIN: (1) mobile access - ShieldCheck header button on all viewports when
  role==='ADMIN'. (2) honest overview - totalVolumeIn = completed RECEIVE +
  REFERRAL_EARNING; totalVolumeOut = SEND+WITHDRAWAL+CONVERT+BILL_PAYMENT;
  revenue = tx.fee + conversion.fee (no double counting). (3) email + phone
  editable via PATCH /admin/users/:id. (4) MANUAL DEPOSITS: POST
  /admin/users/:id/credit {amount,currency,note} -> credits USDT/USDC, creates
  COMPLETED RECEIVE tx (DEP-<ts>), notifies user; UI form on user detail page.
- SWAP TO NAIRA PAUSED: conversions preview + execute reject USD -> LOCAL
  ("paused for now"); convert page shows amber banner + blocks that direction.
  LOCAL -> USD (buy crypto) still works.
- VTU REAL: providers now return real VTPass service IDs per category (airtime
  MTN/AIRTEL/GLO/9MOBILE; data *-Data; electricity IKEDC/EKEDC/PHEDC/AEDC/BEDC/
  KAEDCO; tv DSTV/GOTV/STARTIMES; internet SMILE/SPECTRANET/SWIFT). data-plans
  parses VTPass variations into {code,name,amount,validity}. purchaseBill takes
  planCode, uses the REAL NGN rate (ConversionsService.getRates - never the old
  hardcoded 1500), sends variation_code for data, FAILED + REFUNDS USDT on any
  non-'000'/error from VTPass. Bills page estimate uses the live rate.
- KYC INEFFECTIVE (owner decision): /app/kyc + profile banner reworded -
  everything "Available", verification optional during launch, nothing blocked.
- Builds green: nest build + next build (login page wrapped in Suspense for
  useSearchParams CSR bailout). Note: next.config.ts has ignoreBuildErrors.
- NEXT DEPLOY ACTIONS: set GOOGLE_CLIENT_ID/SECRET + confirm VTPASS_API_KEY/
  VTPASS_SECRET_KEY/VTPASS_PUBLIC_KEY/VTPASS_BASE_URL on Railway; deposit
  integration approval still pending (manual crediting is the live path);
  change admin email via /admin/users/[id] now that email editing exists.

Commit 253e606: admin-by-email promotion at sign-in (ensureAdminIfListed in
auth.service.ts; generateTokens returns role). Demo scripts repointed to
surexendofficial@gmail.com. Set ADMIN_EMAILS=surexendofficial@gmail.com on
Railway + redeploy to activate.

Commit 75b9b4b: perf (splash 1000ms, hero delays 0-0.6s). Commit 855c11d: SMS
OTP removed (email OTP only). Commit a2b01a1: SEO files. Commit 3de502c:
realistic phone mockup. Google OAuth LIVE - redirect_uri
https://surexend.com/api/v1/auth/google/callback (no www).

== ROUND 8: SMARTSPEED VTU (airtime + data, full catalog) ==
- Provider: https://www.smartspeedtelecom.com/api. Auth header `Authorization:
  Token <key>` + Content-Type application/json. Token in backend/.env
  (gitignored) - ADD SMARTSPEED_API_TOKEN TO RAILWAY + redeploy.
- Network IDs: MTN=1 GLO=2 9MOBILE=3 AIRTEL=4. Airtime VTU discounts:
  MTN 96.5 GLO 90 AIRTEL 97 9MOBILE 98 (shown under airtime provider names;
  app charges face value, discount is margin).
- Catalog endpoint GET /api/user/ (cached 10 min in-memory) -> Dataplans
  {NET}_PLAN.{ALL}[] = {dataplan_id,plan,plan_amount,month_validate,plan_type}.
  Counts: MTN 73, GLO 27, AIRTEL 43, 9MOBILE 14.
- bills.service.ts: providers + data-plans live; purchaseBill -> POST /topup/
  {network,mobile_number,amount,Ported_number:false,airtime_type:"VTU"} or
  POST /data/ {network,mobile_number,plan,Ported_number:false}; USDT deduction
  + auto-refund on failure kept; ref prefix SS-. Non airtime/data rejected.
- Success detection is defensive (no documented response examples): 2xx with
  no `detail`/`error`/`success:false`/failed `Status` = COMPLETED. VERIFY with a
  real small purchase once the account is funded (balance ~NGN 40 now).
- Frontend bills page: all data plans grouped by planType in scrollable grid;
  airtime providers show discount %. Mocks in api.ts updated to new shape.
- Builds green (nest build, next build). Push to main -> Railway + Vercel.

== ROUND 9: ADMIN PRICING ENGINE + FULL INVOICES ==
- ServicePricing model (auto db push on deploy): category/provider/planCode/
  costPrice/sellPrice/marginPct, @@unique([category,provider,planCode]).
- Sell-price engine: data = per-plan override ?? cost*(1+network margin) ?? cost;
  airtime = face*(1+markup%). Server-side always (client amount never trusted).
  getDataPlans returns amount=SELL + costPrice; providers return sellMarkup.
- Admin /admin/pricing: airtime markup% per network (₦100->₦X preview), data
  network tabs + auto-margin Apply-to-all + per-plan cost|sell|profit table.
  Endpoints: GET /admin/pricing; PUT /admin/pricing/airtime, /data-margin,
  /data. AdminModule imports BillsModule; AdminService injects BillsService.
- Invoices: getTransactionById attaches BillPayment + invoiceNumber=reference.
  History receipt modal shows bill rows (Invoice No, Service, Recipient, Plan,
  Amount Paid, USDT, Rate, Provider Ref). Admin transactions rows clickable ->
  DetailModal via GET /admin/transactions/:id (cost/sell/margin/provider ref).
- bill metadata now stores costPrice/marginPct/sellPrice/planName/planValidity.
- Builds green. Next deploy: SMARTSPEED_API_TOKEN + ADMIN_EMAILS on Railway,
  fund Smartspeed, real purchase test.

== ROUND 10: BILLS SAFETY GUARD + BANK-TRANSFER LOCAL FUNDING ==
- Bills blocked for accounts with zero completed RECEIVE deposit (guard in
  purchaseBill, toggle BILLS_REQUIRE_FUNDING=false). Prevents testnet/empty
  balances spending real naira at Smartspeed.
- New VirtualAccount model + LocalFundingService (wallets module):
  GET /wallets/local-funding/account creates a Flutterwave VNUBAN permanent
  virtual account; returns {configured:false} when FLUTTERWAVE_SECRET_KEY unset
  so UI falls back to manual instructions.
- Flutterwave webhook charge.completed (bank transfer) -> processBankTransfer
  Deposit credits localBalances (NGN) + RECEIVE tx (channel bank_transfer) +
  notification, deduped by DEP-FLW-<id>.
- Receive page shows "Fund Local Currency" bank card (account number copy /
  bank / account name) when configured.
- DEPLOY NEEDS: FLUTTERWAVE_PUBLIC_KEY, FLUTTERWAVE_SECRET_KEY,
  FLUTTERWAVE_WEBHOOK_HASH on Railway + webhook URL set to
  https://surexend.com/api/v1/webhooks/flutterwave in Flutterwave dashboard.
- Only real-money links today: Smartspeed wallet (bills) + manual deposits +
  bank transfer webhook. Crypto deposits/sends are TESTNET until Circle mainnet.

== ROUND 11: SIGN-OUT RELIABILITY + PRIVATE SESSION CLEANUP (2026-09-02) ==
- ROOT CAUSE CONFIRMED: profile sign-out used `localStorage.clear()` +
  `router.push('/auth/login')`, but active access tokens are in sessionStorage
  and a route-gating cookie. The cookie survived, so middleware still treated
  the user as authenticated and could redirect the login route back to the app;
  the backend refresh session was also never revoked.
- FIXED: profile sign-out now calls `authAPI.logout()` (capturing the refresh
  token before cleanup), clears all auth token locations/cookie immediately,
  clears React Query data, and uses `router.replace`. Local sign-out completes
  offline; a server revocation failure is surfaced precisely instead of
  blocking the user or showing a misleading generic API toast.
- HARDENED: the Axios interceptor never refreshes on `/auth/logout`; auth
  storage cleanup is safe when browser storage/cookies are restricted, removes
  only auth plus the unscoped user avatar (not device preferences), and issues
  a same-origin cross-tab sign-out signal. App and admin tabs consume it. The
  public backend logout endpoint is throttled at 20 requests/minute.
- PWA PRIVACY: `public/sw.js` is now cache `surexend-v55`; private/auth/API
  navigations are never cached, and logout asks the worker to remove private
  entries left by older versions. Server-saved avatars are preferred after
  profile load.
- VALIDATION: frontend typecheck/build, mobile-safety check, service-worker
  syntax check, and `git diff --check` all pass. The logout controller change
  is a one-line throttle addition; backend build remains environment-dependent
  on Prisma/native dependencies and was not separately validated here.
## 2026-08-31 — SEND-FROM SOURCE PICKER REDESIGN (SureX Tag transfers)

The native `<select>` under "Send from" on `/app/send` (SureX Tag mode) is now a
custom, accessible account picker. No backend, API, PIN or spendability changes.

- New `src/components/SendFromPicker.tsx`: compact "Send from" trigger card
  (icon, name, code, available balance, chevron) + bottom sheet on phones /
  anchored popover on ≥768px. Rows grouped "Digital balance" (USDC only) and
  "Local balances" (each held currency, zero-balance rows disabled).
  Exports `SendFromAsset` type, `SendFromBadge`, `sendFromAssetName`.
- Styling: `.sfp-*` token block in `globals.css` — solid surfaces, 1px borders,
  small static shadows, NO backdrop-filter/blur/animated gradients (budget
  Android GPU contract). Neutral colours come from `--sfp-*` vars overridden by
  `html[data-color-mode='light']`; brand accents are injected inline from
  `useTheme()` because portaled content sits outside the `[data-variant]` div.
  Motion: opacity/transform only, 190ms, no springs, `prefers-reduced-motion`
  honoured. Dialog DOM mounts only while open; one rect measurement per open
  (+ resize listener while open); no polling/timers/scroll listeners; selection
  = one parent state update + close.
- A11y: trigger is a labelled `type="button"` combobox trigger
  (aria-haspopup/expanded/controls), panel is a modal `role="dialog"` with
  `role="listbox"`/`role="group"`/`role="option"`, ArrowUp/Down/Home/End, Enter,
  Escape, Tab focus trap, focus restore to the trigger, Android hardware-back
  closes the sheet first (`useBackLayer` priority 40 > the step layer's 30).
- `src/app/app/send/page.tsx`: `tagTransferAssets` now memoized and tagged
  `kind: 'digital' | 'local'` (USDC still first, locals still filtered > 0 —
  derivation unchanged otherwise). New guard effect: if the selected source is
  empty and another balance can fund the transfer, the selection auto-moves to
  it. Amount step shows a "Sending from" card; review step shows
  "Sending from <name> balance (CODE)". `walletAPI.send` still sends
  `network:'SUREX_TAG'` + `currency: transferCurrency` (verified E2E).
- `src/app/app/dashboard/page.tsx`: Send modal's SureX Tag subtitle now
  mentions "from your USDC or local balance" (consistency only).
- `design-preview/` (untracked, local only): 10 screenshots — gold/lemon,
  dark/light, mobile/desktop, amount/review steps, empty + zero states.
- Validated: `npm run typecheck`, `npm run check-mobile-safety`, `git diff
  --check`, `npx next build` all green; plus a headless-Chrome E2E pass
  (47/47 checks ×6 viewport/theme combos, 9/9 brand checks gold+lemon, edge
  states, back-button) asserting the full flow pick→amount→review→PIN→
  POST /wallets/send payload `{"network":"SUREX_TAG","currency":"KES"}`.

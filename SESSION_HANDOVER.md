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

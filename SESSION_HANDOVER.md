# SUREXEND — FULL SESSION HANDOVER PROMPT

> Paste this entire document as your very first message in a new session.
> It fully reconstructs the context. Read it, then confirm to the user:
> "Context loaded. I know the project, what's been built, what's pending, and the verification commands."

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

## COMMITS SO FAR (main, all pushed to origin)

- `c2c7b80` — Fix PIN confirm mismatch bug; add testing default PIN (0000)  ← HEAD
- `2c6b66a` — Fix receive-page 500, simplify KYC to verified/unverified, zero conversion fees, add PIN setup page
- `500609f` — real flags on mobile, sticky search, CFA country lists, all 42 African currencies
- `e3d7172` — resilient getBalance, all African currencies with searchable picker, cross-platform flags, no fake balances
- `a8a5efc` — separate USD & multi-currency local wallets + working wallet-to-wallet conversions
- earlier: desktop modal fixes, FAILED deposits, Vercel build fixes

## KEY FILES

- `backend/src/config/configuration.ts` — all env config + `testing` block
- `backend/src/common/guards/pin.guard.ts` — PIN validation with testing fallback
- `backend/src/wallets/wallets.service.ts` — getBalance (~75), getDepositAddress (~426), sendCrypto (~543)
- `backend/src/conversions/conversions.service.ts` — execute, computeConversion (fee=0)
- `backend/src/bills/bills.service.ts` — purchaseBill (PIN testing fallback)
- `backend/src/users/users.service.ts` — getProfile (pinSet), getKycStatus, setupPin, changePin
- `backend/src/common/currency.constants.ts` — 42 currencies, countries arrays
- `src/lib/api.ts` — ALL API clients + mocks (AFRICAN_CURRENCIES, walletAPI, conversionAPI, userAPI, billAPI, etc.)
- `src/components/CurrencyFlag.tsx`
- `src/app/app/convert/page.tsx`, `receive/page.tsx`, `send/page.tsx`, `withdraw/page.tsx`, `bills/page.tsx`, `dashboard/page.tsx`, `history/page.tsx`, `profile/page.tsx`, `kyc/page.tsx`, `settings/change-pin/page.tsx`, `referrals/page.tsx`
- `src/app/page.tsx` (marketing), `next.config.ts`, `.env.local`, `backend/.env.example`

## WORKING STYLE NOTES

- The user reports a symptom → I diagnose (grep/read) → fix → typecheck (backend + frontend) → optionally `npx next build` → commit + push → summarize concisely.
- Backend changes require `npx tsc -p tsconfig.json --noEmit` from `backend/`; frontend changes require the temp tsconfig.check.json trick.
- When a fix touches the deployed DB schema assumptions, use defensive selects (see RECEIVE PAGE section).
- Never invent fake balances; always surface real data. Mock fallbacks in api.ts are acceptable for the live-backend-unavailable case but should mirror real shapes.
- When asked about opencode/this tool: consult https://opencode.ai docs via web fetch.
- Do NOT create docs/READMEs unless explicitly requested.
- Respect the user's launch plan: external KYC provider, crypto requires KYC at launch, custom PIN mandatory at launch, remove testing flags.

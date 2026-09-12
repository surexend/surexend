# SureXend — Full Assessment & Roadmap

**Original review date:** 2026-08-29 · **Current update:** 2026-09-12 · **Branch:** `arena/01a096aa-surexend` · **Reviewed:** whole repo (frontend, backend, schema, docs, git state)

This is a blunt read of where SureXend is, what is genuinely strong, what is
dangerous, and what has to happen for this to become a billion-dollar fintech.
It is written to be disagreed with — but every claim below is either read from
the code or cited.

> **Current launch gate — 2026-09-12:** This document's older sections are
> historical unless they conflict with the current gate. The project is **not
> approved for limited real-money/bills use or a mainnet/production financial
> launch**. The only defensible scope is a read-only, explicitly labelled
> testnet/demo deployment. Money movement is fail-closed unless
> `MONEY_MOVEMENT_ENABLED=true`; production also requires ledger reads and
> startup rejects all mainnet configurations because the current release still
> contains testnet-only chain mappings. See the current evidence and required
> actions in `docs/rollout-status.md`.

---

## Status update — 2026-08-29 (same day, fixes applied)

Sections 4–6 below describe the state as reviewed. Since then the following
have been fixed on `arena/01a04d9a-surexend`:

| Defect | Fix |
|---|---|
| P0-1 `/app/invoice` fabricated bank accounts | Page replaced with a waitlist (`FeatureComingSoon`); every fake IBAN/entity deleted |
| P0-2 `/app/withdraw` fake success | Page replaced with the same honest waitlist |
| P0-3 Hardcoded JWT fallback secret | `jwt.strategy.ts` throws instead; `main.ts` refuses to boot without `JWT_SECRET` / `JWT_REFRESH_SECRET` / `DATABASE_URL`, and refuses `TESTING_ENABLED=true` in production |
| P0-4 Flutterwave webhook bypassable | Constant-time compare (`timingSafeEqual` on hashes), and the endpoint returns 503 when `FLUTTERWAVE_WEBHOOK_HASH` is unset |
| P0-5 Circle webhook unsigned | Verified with ECDSA-SHA256 against Circle's `/v2/notifications/publicKey/{keyId}` on the **raw** body (`rawBody: true` in `main.ts`); public keys cached. `WEBHOOK_REQUIRE_SIGNATURE=false` to replay locally |
| P0-6 VtPass webhook unsigned | Requires `VTPASS_WEBHOOK_SECRET`; endpoint stays closed (503) until it is set |
| P0-7 No rate limiting | `ThrottlerProxyGuard` applied globally (`APP_GUARD`), proxy-aware via XFF; tighter `@Throttle` limits on login/register/OTP/reset; webhooks `@SkipThrottle`. Plus a Redis-backed PIN lockout: 5 failures → 15-minute lock, with an in-memory fallback if Redis is down |
| P0-8 No idempotency | `IdempotencyService` + `IdempotencyRecord` table on `wallets.send`, `bills.purchase`, `conversions.execute`; the frontend sends `Idempotency-Key` on every money call; replays are pruned after 24h |
| P0-9 Send ordering race | `sendCrossChainFromArc` now reserves (`usdcBalance → lockedBalance` under `SELECT … FOR UPDATE`) **before** the chain call, then settles or refunds (`releaseReservedSend`) — it can no longer move USDC the ledger never records |
| 4 masked TypeScript errors | Fixed (dead `NairaSign` import, `<button>` given motion props, recharts tuple type, `Boolean()` narrowing). `typescript.ignoreBuildErrors` is now **false**, backend is excluded from the root tsconfig, and `npm run typecheck` is a real script |
| No tests / no CI | Jest + ts-jest configured, first unit tests added (webhook signature, idempotency, throttler tracker), and `.github/workflows/ci.yml` runs backend typecheck + tests and frontend typecheck + build |

**Still open** (deliberately not done in the same pass, because each is a
migration rather than a patch): money as `Float` → integer minor units,
double-entry ledger, checked-in migrations, Redis-backed throttler storage,
httpOnly auth cookies, audit logging on money/admin actions, error monitoring.
See section 5 and the 90-day sequence in section 9.

---

## 1. What has actually been built

A working, genuinely polished African stablecoin wallet:

| Layer | State |
|---|---|
| Frontend | Next.js 15 App Router PWA, Tailwind, framer-motion, recharts. ~13k LOC. Gold/Lemon theming, SEO landings + blog + FAQ/JSON-LD, PWA install prompt, offline page, mobile-safety checks. |
| Backend | NestJS 10 + Prisma (Postgres) + Redis. ~13k LOC, 17 modules. Global prefix `/api/v1`, JWT + refresh, PIN/biometric transaction auth, passkeys (WebAuthn), roles + admin console. |
| Crypto | Circle W3S wallets on **Arc testnet**; native Arc transfers; CCTP cross-chain sends via BridgeKit forwarder; fee estimation; deposit monitor (on-chain log scan) + history sync/settlement. |
| Fiat | 42 African currencies with USD cross-rates; conversions with **real-naira vs testnet-funds isolation**; Flutterwave virtual accounts for bank-transfer funding; Smartspeed VTU (airtime + data, full live catalog). |
| Ops | Admin console (overview / users / transactions / KYC / pricing / broadcast), per-plan margin engine, invoices, manual credits, `ADMIN_EMAILS` bootstrap. |
| Growth | SureX Tag (zero-fee instant P2P), referrals, campaigns leaderboard, AI support assistant (propose-only, PIN-gated). |

Roughly **26k lines** of application code. That is a real product, built fast,
and the discipline written into this repo ("no fake balances", "verify on-chain
before claiming a fix") is better than most teams at this stage.

## 2. Honest stage: an impressive demo with a real VTU feature — not yet a company

Evidence from the code:

- **The crypto stack is testnet.** `TEST_*` Circle key, `ARC-TESTNET`,
  `ETHEREUM → Ethereum_Sepolia`. On-chain tokens are worthless. The only real
  money rails today are Smartspeed (bills), manual admin credits, and the
  Flutterwave bank-transfer webhook.
- **Two user-facing flows are not real.** `/app/withdraw` shows a success screen
  after `setTimeout(…, 1500)` and calls no API — there is no withdrawal endpoint
  in the backend at all. `/app/invoice` renders bank accounts for entities that
  do not exist (see P0-1). Both violate this repo's own "no fake numbers" rule.
- **KYC is intentionally optional.** `/app/kyc` and the profile banner tell
  users verification is optional and nothing is blocked.
- **The core product earns nothing.** Conversion fee is hard-zeroed; SureX Tag
  sends are zero-fee; CCTP passes the network fee straight through. The only
  margin in the system is on airtime/data.
- **Zero tests, no CI, no error monitoring.** No `*.spec.ts`, no `*.test.ts`,
  no `.github/`, no Sentry/OTel. Four real TypeScript errors are shipped
  silently because `next.config.ts` sets `typescript.ignoreBuildErrors: true`.
- **Docs have drifted from code.** `docs/memory.md` still says "swap to Naira
  paused"; the code now implements real-naira isolation with its own error
  messages. `SESSION_HANDOVER.md` is the most current doc but is a running log,
  not a plan.

**So: you have a product shell plus a genuine airtime/data resale business.**
That is a good start. It is not yet a fintech company, and it is definitely not
yet a licensable, monetizable, defensible one.

## 3. What is genuinely strong — do not throw this away

1. **SureX Tag.** Instant, zero-fee, no-chain-hop P2P. This is your most
   differentiated asset: it is a closed-loop payments network, and it is the one
   thing OPay/Moniepoint cannot copy for free.
2. **Real-naira / testnet-fund isolation** (`realLocalBalance` vs
   `localBalances`). Most teams get this wrong and lose real money doing it.
3. **"No fake balances" as a written, enforced principle** — visible in the
   defensive Prisma selects, the honest admin volume math, and the "return an
   empty series rather than fabricate a flat line" chart fix.
4. **Ops tooling ahead of stage.** The admin pricing engine storing cost/sell/
   margin per plan is the beginning of real unit economics.
5. **Mobile-first polish and SEO surface.** Landing, blog, FAQ schema, PWA —
   distribution is already partly built.

## 4. P0 — fix before another user touches it

These are money-loss, legal, or account-takeover issues found in the code today.

1. **`/app/invoice` fabricates bank accounts.** It renders IBANs/BICs for
   "SureXend Europe B.V." (BNP Paribas), "SureXend UK Ltd." (ClearBank),
   "SureXend Inc." (Evolve Bank & Trust), UBS, and eight more — none of which
   exist. A user who pays one of these has sent real money somewhere you do not
   control. **Delete the page or hard-gate it behind a real treasury account.**
   This is the single most dangerous thing in the repo.
2. **`/app/withdraw` fakes success.** `handleExecute` is a 1.5s timer. Either
   build the payout or replace the page with an honest "coming soon".
3. **Hardcoded JWT fallback secret.** `auth/jwt.strategy.ts` falls back to
   `'surexend-default-jwt-secret-key-12345'`. If `JWT_SECRET` is ever unset in
   an environment, anyone can mint a valid admin token for any user id.
   **Fail fast on boot if the secret is missing, and rotate — treat the
   committed value as burned.**
4. **Flutterwave webhook verification is bypassable.**
   `if (hash !== secretHash) throw` passes when *both* are `undefined` — i.e.
   when `FLUTTERWAVE_WEBHOOK_HASH` is not configured, every request is accepted.
   It is also a non-constant-time compare. Use `crypto.timingSafeEqual` and
   reject when the secret is unset.
5. **Circle webhook has no signature verification at all** (the comment says
   "in Sandbox, we process the payload directly"). Anyone who finds the URL can
   POST a fake deposit and credit their own balance. `CIRCLE_WEBHOOK_SECRET`
   already exists in config — use it.
6. **Vtpass webhook: no verification** ("omitted for brevity").
7. **No rate limiting on money endpoints.** `ThrottlerModule` is registered in
   `app.module.ts` but `ThrottlerGuard` is never applied anywhere. Combined with
   a 4-digit PIN (10,000 combinations), PIN brute-force is wide open. Apply the
   guard to `/auth/*`, `/wallets/send`, `/bills/purchase`, `/conversions/execute`
   and add per-user PIN attempt lockout.
8. **No idempotency on money movements.** Send, bill purchase and conversion all
   accept a retried/double-clicked request as a second transaction. Add a client
   idempotency key with a unique constraint (this is already on the AI-assistant
   "next hardening" list in `docs/memory.md`).
9. **Send ordering bug.** In `sendCrossChainFromArc`, the chain leg (native
   transfer or CCTP bridge) executes **before** the ledger debit transaction. If
   the in-transaction spendable check then fails, real USDC has left the wallet
   but the ledger never records the debit. Reserve/debit first inside the
   transaction, then submit to chain, then release on failure.

## 5. P1 — foundations a real money company needs

- **Money is stored as `Float`.** Every balance in `schema.prisma` is `Float`,
  and updates use `increment`/`decrement`. Floats plus concurrent updates equal
  silent drift, and there is no way to prove a balance is correct. Move to
  integer minor units (or `Decimal`), then introduce an **append-only
  double-entry ledger** with balances as derived state. This is the single
  biggest architectural upgrade available to you.
- **No migrations.** `prestart:prod` runs `prisma db push` and *swallows
  failures*, which is why the code is littered with defensive selects. Check in
  real migrations and make schema drift impossible to ignore.
- **No reconciliation.** There is a deposit monitor (on-chain → ledger) but no
  job that proves ledger == Circle == Flutterwave == Smartspeed and alerts on
  drift. For a licensed VASP this is not optional.
- **No tests, no CI.** Highest-leverage fix available: golden tests for
  conversion math, send/spendable logic, ledger invariants, webhook
  idempotency, and PIN/rate-limit behaviour. Then GitHub Actions running
  backend typecheck + tests + `next build`, and *then* turn off
  `ignoreBuildErrors`.
- **No error monitoring.** No Sentry/OTel anywhere. You cannot run a payments
  company without knowing when webhooks fail.
- **Tokens in `localStorage`** (`src/lib/api.ts`). Any XSS is a full account
  takeover. Move to httpOnly, SameSite cookies.
- **Audit logging is nearly unused.** The `AuditLog` model and interceptor
  exist but are wired to the auth controller only. Every money action and
  *every admin action* (especially manual credits) must be audited immutably.
- **Testing-mode PIN.** `TESTING_ENABLED` / `DEFAULT_PIN=0000` is on whenever
  `NODE_ENV !== 'production'`. Confirm `NODE_ENV=production` on Railway and that
  `TESTING_ENABLED` is not set there.

## 6. P2 — the business gap (this is the billion-dollar part)

**Current revenue: airtime/data markup. That is all.** Conversions are free,
tag sends are free, the CCTP fee passes through, withdrawals do not exist.

Do the arithmetic: 100,000 monthly airtime users spending ₦2,000 each is
₦200M GMV. At a realistic 3% net margin that is ₦6M/month — roughly **$4k
per month**. Airtime/data is a customer-acquisition feature that OPay and
Moniepoint give away to 30M+ users as a loss leader. It is not the engine.

### What the market decided in 2025–2026

- **Yellow Card shut down retail entirely** to go all-in on B2B stablecoin
  infrastructure, raised a **$40M Series C in August 2026** (~$145M total),
  operates in 50+ markets, holds licences in Switzerland, Poland, Canada, South
  Africa and Botswana with Nigeria pending, and partners with Visa, Mastercard
  and Western Union [8](https://www.vanguardngr.com/2026/08/yellow-cards-new-funding-ll-improve-cross-border-payments/) [9](https://brandspurng.com/2026/08/15/yellow-card-secures-40-million-funding-to-expand-stablecoin-payment-infrastructure-across-global-markets/) [5](https://techpoint.africa/insight/techpoint-digest-1216/).
- **Quidax** (5,000+ businesses) and **Busha Business** (1,500+ businesses,
  SEC-licensed, now distributing USDT with Tether) made the same pivot to B2B
  stablecoin infrastructure [6](https://techcabal.com/2026/07/30/quidax-b2b-stablecoin-infrastructure-africa/) [7](https://techcabal.com/2026/07/20/busha-business-tether/).

The companies with the most data concluded that **retail consumer crypto wallets
in Africa do not have defensible economics, and B2B cross-border settlement and
treasury does.** That is the strongest signal available, and it is recent.

### What the regulator now requires (Nigeria)

- VASP registration under the **ISA 2025** and SEC Digital Asset Rules.
  Registration categories are mutually exclusive (DAOP / DAX / DAC / DAI), and
  an initial assessment filing plus ARIP application comes first [4](https://www.mondaq.com/nigeria/fin-tech/1695342/how-virtual-assets-service-providers-vasps-can-obtain-licenses-in-nigeria).
- Proposed costs: **₦30m registration fee** and **₦2bn (~$1.4M) minimum capital**
  for digital asset exchanges and custodians; a January 2026 circular raised
  DAX/custodian capital from ₦500m to ₦2bn with compliance required by
  **30 June 2027** [2](https://guardian.ng/featured/sec-proposes-n30m-registration-fee-n2bn-capital-requirement-for-digital-asset-firms/) [1](https://www.htx.com/en-in/news/crypto-regulation-nigerian-sec-raises-capital-requirement-fo-hh5dKlj5/).
- **ARIP** (Accelerated Regulatory Incubation Program) grants an
  Approval-in-Principle valid up to 12 months so you can operate under SEC
  supervision while working toward full registration [4](https://www.mondaq.com/nigeria/fin-tech/1695342/how-virtual-assets-service-providers-vasps-can-obtain-licenses-in-nigeria) [3](https://monaquatorium.org/vasp-licensing-in-nigeria-a-complete-guide-for-crypto-businesses).
- Also required: CAC incorporation, a Nigerian office with a resident
  CEO/MD, a fidelity bond of at least 25% of paid-up capital, CBN AML/KYC
  compliance to retain bank access, and **7-year record retention** [3](https://monaquatorium.org/vasp-licensing-in-nigeria-a-complete-guide-for-crypto-businesses) [4](https://www.mondaq.com/nigeria/fin-tech/1695342/how-virtual-assets-service-providers-vasps-can-obtain-licenses-in-nigeria).

**Implication:** licensing is a multi-month, capital-intensive board workstream.
Starting it *after* you scale users is how companies get shut down. Start it now,
in parallel with engineering, and use ARIP to operate legally in the interim.

## 7. The three credible wedges — pick one

**A. B2B cross-border settlement + treasury** *(what the winners chose)*
Ticket sizes $5k–$500k, take-rate 0.5–2%, low CAC, acute pain (FX scarcity,
paying foreign suppliers). Your stack is ~80% there already: USD balances,
on/off-ramp, admin ops, virtual accounts. Needs: business accounts, KYB,
multi-user approvals, an FX quote/spread engine, settlement SLAs, licences.

**B. Diaspora remittance corridor** (US/UK/CA → NG/KE/GH)
High frequency, 1–3% take rate, strong retention. Needs payout licences per
corridor and heavy AML; competes with Western Union/MoneyGram/Chipper.

**C. Closed-loop P2P + merchant payments on SureX Tag**
Your most differentiated asset. Build "send to any @tag" into a network with
merchant QR. Monetize **at the boundary** (on-ramp/off-ramp spread), never
inside the loop.

**Recommendation: A as the business, C as the funnel.** B2B pays for the
company; the consumer app builds brand, volume and liquidity. Do not try to
charge for consumer transfers — every durable African crypto business makes its
money where crypto meets fiat.

## 8. What "billion-dollar" actually requires

- **A monetized boundary.** FX spread on off-ramp + B2B settlement fees + float
  yield. Not airtime markup.
- **Licences.** Nigeria SEC (ARIP → full registration), then a second market.
  Budget legal and capital now.
- **Trust infrastructure.** KYC/KYB, sanctions screening, transaction
  monitoring, travel rule, 7-year retention. Today KYC is optional, which
  structurally blocks bank partners and every institutional customer.
- **Measured unit economics per transaction.** You already store cost/sell/
  margin for bills — extend that to *every* money movement. You cannot price
  what you do not measure.
- **A retention loop.** A wallet is used when it is where your money *arrives*.
  Virtual accounts (which you have) get business and salary receipts landing in
  SureXend; being the cheapest way to spend dollars locally keeps them. That is
  the moat.
- **Ops maturity.** Reconciliation, dispute handling, refund SLAs, support. Your
  admin console is a good seed.

## 9. Suggested 90-day sequence

**Week 0 — stop the bleeding (1–2 days)**
- Delete or hard-gate `/app/invoice`; make `/app/withdraw` honest
- JWT: fail fast when the secret is missing; rotate the burned fallback
- Constant-time webhook verification (Flutterwave); verify Circle + Vtpass
  signatures; reject unsigned requests
- Apply `ThrottlerGuard` to auth and money endpoints; add PIN attempt lockout
- Idempotency keys on send / bill purchase / conversion
- Fix the send ordering bug (reserve → chain → release)

**Weeks 1–3 — make the money correct**
- Checked-in Prisma migrations; kill `prisma db push`
- Integer minor units + append-only double-entry ledger; derived balances
- Golden test suite + GitHub Actions; remove `ignoreBuildErrors` once green
- Sentry + structured logs + alerts on webhook failure and ledger drift
- Nightly reconciliation across Circle / Flutterwave / Smartspeed

**Weeks 3–6 — revenue engine + trust**
- FX/spread engine with explicit margin on every on-ramp/off-ramp leg (retire
  the 0% conversion fee)
- Real off-ramp: bank payout via Flutterwave transfers (make withdraw real)
- KYC/KYB via Smile Identity (config exists) with limits tied to verification
- Sanctions screening + monitoring rules; audit log on every money and admin
  action

**Weeks 6–12 — pick the wedge and prove it**
- Build B2B: business accounts, KYB, multi-user approvals, payables, FX quotes,
  settlement SLAs
- Start licence work in parallel: SEC initial assessment + ARIP filing
- Instrument the funnel: activation, funded-account rate, 30-day retention,
  revenue per funded user

## 10. What I verified — and what I could not

**Verified locally**
- Frontend typecheck: **4 real errors**, all currently masked:
  - `src/app/app/bills/page.tsx:15` imports `NairaSign`, which does not exist
    in `lucide-react@0.408.0`
  - `src/app/app/bills/page.tsx:566` passes framer-motion props to a plain
    `<button>`
  - `src/app/app/dashboard/page.tsx:698` recharts `domain` type mismatch
  - `src/lib/content/index.ts:30` `'p' is possibly 'undefined'`
- No test files, no CI config, no observability dependency anywhere.
- `ThrottlerGuard` defined in config but never applied; `AuditLogInterceptor`
  applied to the auth controller only.

**Could not verify in this sandbox (not code defects)**
- `npx next build` fails here because `fonts.googleapis.com` is blocked. Worth
  noting anyway: **your production build depends on reaching Google Fonts at
  build time.** Self-host the fonts to remove that dependency.
- Backend `npx tsc -p tsconfig.json --noEmit` could not complete: the sandbox
  npm mirror kept resetting and left an incomplete `backend/node_modules`.
  Run it locally to confirm the backend is still clean.

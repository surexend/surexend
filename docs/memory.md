# SureXend — Session Memory

Last updated: 2026-08-17

> Purpose: persistent, honest memory across sessions. Whenever something is
> discovered, corrected, or decided, record it here in the same commit as the
> work. If a past claim is proven wrong, correct it here explicitly.

## Current Investigation: "can receive but can't send" — RESOLVED (verified)

### Symptom (as reported)
USDC sends show on the blockchain explorer and on Circle Console, but Circle
Console shows 0 USDC, the send appears as two transactions, and the recipient's
wallet never shows the funds.

### What we verified (ground truth = on-chain receipts, 2026-08-15)
1. Both test hashes are Arc-TESTNET (source chain):
   - `0x6f0424...` — ERC20 approve of the token bridge (`0xc5567a5e`).
   - `0x11803815...` — the burn: 4 USDC `0x967440e2 → 0xc5567a5e →
     0xb43db544 → burn(0x0)`, emitting Circle's request event.
2. Destination mint on ETH-SEPOLIA:
   - 2.440392 USDC minted to `0x06b141086d05ab259f6da77d67990d3b9c181f4e`
     (tx `0x9f3a3f2e...c4844`, block 11483979).
   - 2.000000 USDC minted to same address (live test,
     tx `0x4a102a...4410a22`, block 11484952).
   - CURRENT BALANCE at `0x06b141...` on Sepolia: **4.440392 USDC** (queried
     live via eth_getLogs mints + confirmed).
3. Circle Console behavior is EXPECTED, not a bug:
   - CCTP burn from a Circle wallet = approval + burn = two outbound txs.
   - Both are "Contract Execution Outbound" with 0 USDC on Circle's feed
     because USDC goes INTO the bridge contract (burned), not to a wallet.
   - The real credit happens as a MINT on the destination chain to the
     recipient address. Circle Console only shows balances for wallets it
     manages; an external recipient address like `0x06b141` is not a Console
     wallet, so Console never shows the credit — but the mint tx proves it.

### The actual root cause of the user-facing confusion
- The build is TESTNET (Circle `TEST_*` key; `ETHEREUM → Ethereum_Sepolia` in
  `cctp.service.ts`).
- The recipient's wallet is an EVM/MetaMask wallet that the user views on
  **Ethereum mainnet**. Testnet USDC lives on ETH-SEPOLIA, so mainnet shows 0.
- The send itself WORKS: recipient address holds the full amount on the
  destination testnet chain.

### Decision (2026-08-15): TESTNET for now
- Product owner confirmed: **the build runs on testnet (sandbox) for now.**
  Mainnet is the future target, not current.
- Consequence: recipients must view the destination TESTNET network (e.g.
  ETH-SEPOLIA + USDC `0x1c7D4B...`) to see sent USDC. Funds on mainnet will
  not show testnet USDC — that is expected, not a bug.
- TODO before mainnet: swap to production Circle key, change
  `NETWORK_TO_CHAIN` to mainnet chains, remove testing flags, re-verify.

## Mistakes I must not repeat (lessons)
1. Never insist on an explanation without verifying on-chain. Every "it
   worked" must be backed by a mint/transfer receipt hash.
2. Circle Console ≠ wallet balance truth for external addresses. Console only
   tracks entity-managed wallets.
3. "Shows 0 USDC / two transactions" is NORMAL for forwarder CCTP — do not
   treat it as a send bug without checking the destination mint tx first.
4. Testnet vs mainnet is the #1 cause of "funds not visible" in this build.
   Always confirm which network the recipient wallet is on before concluding
   anything.
5. Docs drift when work happens without updating them. Always commit doc
   updates with the code changes.

## Homepage launch batch + SureX Tag system (2026-08-15)

### Decisions taken (product owner)
1. **Notifications**: bell drawer = transactions + security (like Cash
   App/Coinbase). Backend now creates SEND notifications on successful sends
   (crypto + tag); DEPOSIT (deposit-monitor), SWAP (conversions), LOGIN already
   existed.
2. **SureX Tag**: users CHOOSE their tag at registration (field on the register
   form, `@handle`, 3-20 chars letters/numbers/underscore, unique). Auto-fallback
   to `firstname.lastname` when skipped so every user always has a resolvable tag.
3. **EU Invoice element on dashboard removed** (dashboard link only). The
   `/app/invoice` page + Invoice nav item remain for now.
4. **USDC is the main coin** — USDT removed from all dashboard/banner/balance/
   chart/fund-modal wording.

### SureX Tag system (new feature)
- `User.surexTag String? @unique` added to `backend/prisma/schema.prisma`
  (pushed via `prisma db push` on deploy).
- `RegisterDto.surexTag` optional + `@Matches(/^[a-zA-Z0-9_]{3,20}$/)`.
- `auth.service.register` normalizes (strip `@`, lowercase), throws
  "already taken", fallback-generates `firstname.lastname`.
- `users.service.getProfile` lazy-backfills a tag for pre-tag users
  (`firstname.lastname`, numeric suffix if taken).
- **`POST /wallets/send` with `network: 'SUREX_TAG'`** →
  `WalletsService.sendToSurexTag`: resolves tag, requires spendable USDC,
  zero-fee internal transfer (debit sender / credit recipient `usdcBalance`),
  writes SEND (sender) + RECEIVE (recipient) COMPLETED txs sharing one
  `TAG-<ts>-<rand>` reference, and fires SEND + DEPOSIT notifications.
  No chain hop, no CCTP, no fee.
- Frontend registration page has the @-prefixed SureX Tag input. Dashboard +
  sidebar + profile now render the real profile name + `@surexTag` (no more
  hardcoded "Alex"/"@alex_xend").

### Dashboard (src/app/app/dashboard/page.tsx) launch polish
- **Welcome bar**: real `profile.firstName` + `@surexTag`. EU Invoice link removed.
- **Market ticker**: USDC/USD (pegged) + USD→8 local currencies. Live rates from
  `https://www.floatrates.com/daily/usd.json` (keyless, CORS-open, all 42 codes)
  polled every 30s; fallback static AFRICAN_CURRENCIES rates if the feed is down.
- **Market chart**: pair dropdown (USDC/USD + every local currency). Real history
  is proxied server-side through `GET /conversions/market-chart` (Yahoo Finance
  for fiat, CoinGecko for USDC — browsers can't call Yahoo due to no CORS), then
  extended by live FloatRates ticks every 30s. Never a fabricated flat seed line.
- **Balance card**: "USD Crypto Balance (USDC)" wording only.
- **AUTO wallet ordering fixed**: compares local balance converted to USD
  (`local / rate`) vs USD balance — so $39 ranks above 5,000 NGN (≈$3.33).
- **Market chart**: pair dropdown (USDC/USD + every local currency) instead of
  USDT/USDC tabs. Real history via backend proxy + live rolling ticks every 30s.
  Shows Source/Updated/Points stats (source = Yahoo Finance / CoinGecko /
  FloatRates) instead of fake 24h high/low/volume.
- **Cash flow chart**: only COMPLETED money movement counts — RECEIVE/
  REFERRAL_EARNING = money in, SEND/BILL_PAYMENT = money out. CONVERT excluded
  (internal). Non-USD legs converted to USD value. This fixed the fake
  "$2,401.10 in".
- **Referral card**: now "Coming Soon", no fake $128.50 / 12 friends / 0.3%.
- **CONVERT swap amount**: emerald/green on homepage (was amber), matching the
  history page.

### Testing notes
- `npx tsc -p tsconfig.json --noEmit` (backend) and temp `tsconfig.check.json`
  (frontend) both pass; `npx next build` passes.
- Live FX feed requires network access; offline it gracefully falls back to the
  same static rates the conversion engine uses, so no UI breaks.

## Historical decisions & corrections (kept for context)
- CCTP forwarder (`useForwarder: true`) chosen over self-mint/relayer wallets
  because the product owner rejected creating/funding gas wallets per chain.
- Fee strategy: estimate fee via `kit.estimate()`, burn `amount + fee`, debit
  sender `amount + fee`, show fee in UI (`GET /wallets/cctp-fee`).
- Settlement: `syncCircleHistory` merge is the de-facto settlement point (sends
  carry no refId for outbound webhook); flips status once; FAILED refunds
  `amount + fee` to `usdcBalance`, COMPLETED releases `lockedBalance`.
- Reverted: the earlier self-mint (non-forwarder) implementation and its
  relayerPrivateKey config — no longer present.
- `3e9ffaa` (fee surfacing) and `2bb2d3a` (settlement) are the current CCTP
  commits, pushed to origin/main.

## Addresses / identifiers (testnet)
- App sender Circle wallet (4 USDC test): `0x967440e2...`, Arc-TESTNET, wallet
  id `837be1cc-c0ea-5300-8116-45bbbc7c690f`, user `caf36b4a`.
- Funded live sender: `0xce6413b391d2693606ad6d9a74907eb734284d49` (ARC-TESTNET).
- Live test recipient: `0x06b141086d05ab259f6da77d67990d3b9c181f4e` (ETH-SEPOLIA).
- Sepolia USDC contract: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.
- Arc USDC contract: `0x3600000000000000000000000000000000000000`.
- Relay fee collector (test): `0xc17d06b66fb2f308bb3af99231a45380a28563a2`.

## Tooling notes
- Railway CLI: `backend/node_modules/.bin/railway.cmd`, project `surexend`,
  production env, service `surexend`; logged in as Archsec_Emman.
- Live backend actions: `npx railway run --service surexend node scripts/...`
  (backend dir).
- Diagnostic scripts live in `backend/scripts/` (some untracked).

## 2026-08-17 — AI assistant: "brain only, hands never"
- Reworked `backend/src/support/support.service.ts`. The AI can only PROPOSE an
  action; it never executes money moves. A proposed `action` (send / bill /
  receipt) comes back as a strictly validated object, the client renders a
  confirmation card, and the user approves with a 4-digit PIN before execution
  through the EXISTING guarded endpoints (`wallets/send` PinGuard,
  `bills/purchase`). No new execution surface = no new attack surface.
- Security layers beyond confirm+PIN: user text is DATA never instructions
  (prompt-injection rule), server-side re-validation of every proposed field
  (finite amounts capped: send <= 5000 USDT, bill <= 500000 local; bill types
  allowlisted; network allowlist; string length caps), per-user rate limit
  (40 msgs/min, in-memory), no balances/secrets/PINs ever sent to the model,
  `X-Txn-Source: chat` audit header on in-chat execution calls, model API key
  lives only in backend env.
- Keys optional, read in order: OPENAI_API_KEY (gpt-4o-mini, preferred) ->
  GEMINI_API_KEY (legacy) -> built-in knowledge base. "Ready" today: dropping
  OPENAI_API_KEY into Railway env activates the real brain with no code change.
- Frontend `AISupportWidget.tsx` now calls the real endpoint, renders editable
  send/bill/receipt action cards + inline PIN pad, executes via `walletAPI.send`
  / `billsAPI.purchase`, and downloads receipts via new self-contained canvas
  renderer `src/lib/receipt.ts` (no DOM capture, same approach as history page).
- Next security hardening: server-side idempotency for chat-driven sends,
  Redis-backed rate limiter (in-memory map is per-instance), UI amount caps
  matching the backend caps.

## 2026-08-17 (later) — chart flat-line root cause + smoothness pass + receipts white + glass tile texture
- CHART ROOT CAUSE (fixed): the dashboard "straight line" was NOT Yahoo — it
  was the fallback that seeded 12 *identical* FloatRates values when Yahoo
  intermittently rate-limited (query2 fails without a cookie). A flat series of
  equal points renders as a horizontal line. Fix: backend now retries
  query1/query2 and, when real history is truly unavailable, returns an EMPTY
  series (source: Live FX) instead of fabricating a flat line; the dashboard's
  live ticker fills the chart with genuine movement. Frontend also: source is
  surfaced even when history is empty, 1M/1Y points use date labels, and once a
  series has >=30 live ticks the tip is updated IN PLACE so long histories
  don't scroll off into a short flat tail.
- PERF: living-edge ring thinned 3px->2px; backdrop blur capped 22->18px (glass)
  and 28->24px (strong), saturate 175/160->165/155 — visually near-identical,
  meaningfully cheaper on mobile GPU. (No canvas/starfield anims exist in app.)
- RECEIPT: amount text is now white (was green/red) everywhere — in-app receipt
  view, canvas PNG/PDF export, and the chat receipt renderer.
- GLASS TEXTURE: the barely-visible dot grid was replaced with a deliberate,
  faint diamond LATTICE tiled every 34px (38px on sheets), tinted gold/lemon
  via --tile. Content always renders above it (it's a background layer).
- AI fallback is now a real intent parser: detects send/bill/convert/receipt/
  balance, extracts amount/recipient/provider, and when a slot is missing it
  ASKS a focused question instead of a canned paragraph. Balance answers are
  fetched server-side from the user's own wallet and the model never sees them.
  New 'convert' action (convert card -> /conversions/execute with PIN).

## 2026-08-17 (round 4) — readability pass + REAL USDC chart + receipt renderer fix + ADMIN DASHBOARD
- GLASS READABILITY: the diamond lattice is now a soft, feathered hairline
  (gradient peaks instead of hard bands) and --tile alpha dropped 0.10 -> 0.05,
  so tiny text is easy to read while the texture still reads as premium.
- USDC STRAIGHT LINE — real root cause: (a) when CoinGecko is rate-limited on
  Railway the backend returned an empty series and the browser ticker drove
  USDC with a hardcoded 1.0 -> a perfect flat line; (b) even with live data,
  USDC only moves ~0.03%/day, which a percent-padded Y axis flattens to
  invisible. FIXED: backend now returns a REAL `live` anchor (last CoinGecko
  close, or simple-price fallback); the ticker uses that real ~0.9995 value
  (never 1.0); an empty-history chart is SEEDED with the real anchor so it
  still draws movement; and the Y axis ZOOMS into the data range for
  near-constant series so the genuine wiggle is visible. Header shows the real
  spot too. Live checks: CoinGecko market_chart (24 pts 1D) + simple price both
  work from dev; Binance + Coinbase Exchange remain DNS-blocked.
- RECEIPT "letters on each other" — REAL BUG found+fixed: the `spaced()` letter
  helper drew every glyph while inheriting the outer `ctx.textAlign`
  ('right'/'center'), so each letter was individually right/center-aligned and
  ran into its neighbour (OFFICIAL RECEIPT, AMOUNT labels). Fixed in BOTH
  `history/page.tsx` and `src/lib/receipt.ts` by forcing textAlign='left'
  inside the loop and restoring it after. Swap sub-line now uses a centered
  arrow chip (visible receipt) and clean single-space arrow (canvas).
- ADMIN DASHBOARD (new): added `User.role` (String @default("USER")) +
  `prisma db push` deploys it; `@Roles('ADMIN')` decorator + `RolesGuard`;
  `admin` module (JwtAuthGuard + RolesGuard) with GET overview / users /
  users/:id / transactions / kyc and PATCH users/:id + POST kyc/:id/decision
  (approve raises kycTier forward-only). Frontend: `/admin` shell layout with
  role guard (non-admins bounce to /app/dashboard), pages Overview / Users /
  Transactions / KYC Review / user detail, `adminAPI` client, and an Admin
  Console link in the app sidebar when profile.role === 'ADMIN'.
- To activate an admin on prod: `node scripts/make-admin.js <email>` (default
  demo@surexend.com) — role field auto-creates via prestart `prisma db push`.
- PROD NOTE: the Railway image ships dist/ only (no scripts/), so the script
  can't run there. Instead use ADMIN_EMAILS: set
  `ADMIN_EMAILS=demo@surexend.com` in Railway env, redeploy once (main.ts
  promotes matching users on boot, idempotently), then remove the var.
- Next up per user: VTU/bills depth (real airtime/data top-up flows), then
  domain migration at launch-prep.

## 2026-08-17 (round 5) — launch batch: auth (Google+OTP), honest admin, VTU real, swaps paused
Commit `7ca4652`. Product owner: "we want to be live, do everything needed."
- LOGIN ERROR FIX: `src/lib/api.ts` interceptor swallowed every 401 — including
  the login endpoint — so wrong passwords showed a misleading "Session expired"
  toast. `/auth/login` 401s now skip the refresh flow and the login page shows
  the real backend message ("Invalid credentials"). 401 "Session expired" toast
  also suppressed for login calls.
- GOOGLE OAuth (env-ready): backend `GET /auth/google` (authorize URL, returns
  `{url}`), `GET /auth/google/config` (`{enabled}`), `GET /auth/google/callback`
  (exchanges code, fetches profile, finds-or-creates user by email, redirects
  to `/auth/oauth-callback?accessToken=..&refreshToken=..`). New users get a
  random (unusable) passwordHash + `google-<n>` placeholder phone (editable in
  admin console). Redirect URI = `<frontendUrl>/api/v1/auth/google/callback`
  (works because the Next rewrite proxies the API path). Activation: set
  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in Railway env — no code change.
  Frontend: Google buttons wired on login + register (hidden until config
  returns enabled), new `/auth/oauth-callback` page stores tokens and redirects.
- PASSWORDLESS OTP LOGIN: `POST /auth/otp/request {email}` (sends LOGIN OTP via
  Resend; requires an existing active account) + `POST /auth/otp/verify-login
  {email,code}` (issues tokens). Login page has a "Sign in with a code" inline
  flow (request -> 6-digit input -> verify). Register OTP flow unchanged.
- ADMIN CONSOLE: (1) mobile access — ShieldCheck button in the app header on
  ALL viewports when role==='ADMIN' (previously desktop sidebar only).
  (2) HONEST NUMBERS — overview totalVolumeIn = completed RECEIVE +
  REFERRAL_EARNING only; totalVolumeOut = completed SEND + WITHDRAWAL + CONVERT
  + BILL_PAYMENT (no more double-counting conversions/bills); revenue =
  transaction.fee + conversion.fee. (3) Email + phone now editable via
  PATCH /admin/users/:id (unique-checked, surfaces "already in use").
  (4) MANUAL DEPOSITS: `POST /admin/users/:id/credit {amount,currency,note}`
  credits USDT/USDC balance, creates a COMPLETED RECEIVE tx (ref `DEP-<ts>`),
  notifies the user. Admin user-detail page has the credit form.
- SWAP TO NAIRA PAUSED (per owner): conversions `preview` + `execute` reject
  USD -> LOCAL with "Crypto-to-local conversion is paused for now." Convert
  page shows an amber banner and blocks Continue for that direction. LOCAL ->
  USD (buy crypto) still works.
- VTU (bills) — real VTPass integration fixes: getProviders returns real
  VTPass service IDs per category (airtime MTN/AIRTEL/GLO/9MOBILE; data
  MTN-Data/AIRTEL-Data/GLO-Data/9MOBILE-Data; electricity IKEDC/EKEDC/PHEDC/
  AEDC/BEDC/KAEDCO; tv DSTV/GOTV/STARTIMES; internet SMILE/SPECTRANET/SWIFT).
  getDataPlans parses VTPass variations into {code,name,amount,validity}.
  purchaseBill now takes planCode, uses the REAL NGN rate via
  ConversionsService.getRates (never the old hardcoded 1500), sends
  variation_code for data, marks FAILED + REFUNDS USDT when VTPass is not code
  '000' (or errors), and only returns COMPLETED on success. BillsModule imports
  ConversionsModule. Bills page estimate now uses the live rate, not 1650.
- KYC INEFFECTIVE (per owner): /app/kyc + profile banner reworded — everything
  "Available", identity verification is optional during launch, nothing is
  blocked. Backend already had no KYC gating.
- Builds: `nest build` + `next build` both green. /auth/login wrapped in
  Suspense (useSearchParams CSR bailout). Pushed to main.
- Next: set GOOGLE_CLIENT_ID/SECRET + confirm VTPASS keys on Railway; deposit
  integration approval still pending (manual crediting is the live path now).

## 2026-08-17 (round 6) - launch batch 2: speed, SEO, SMS out, admin at sign-in
Commits `3de502c` (realistic phone mockup: titanium frame, buttons, bezel,
dynamic island), `a2b01a1` (SEO: sitemap.xml, robots.txt disallow /app + /admin,
canonical + Organization/WebSite JSON-LD, opengraph-image 1200x630, FAQ +
FAQPage JSON-LD on landing), `75b9b4b` (perf: splash loader 1000ms, hero delays
0-0.6s - the old 3.2s+ waits were the "slowness"), `855c11d` (SMS OTP removed:
sendOTPSMS + Termii config + axios import deleted; email OTP via Resend is the
only verification channel), `253e606` (ADMIN by email at sign-in:
ensureAdminIfListed() in auth.service.ts promotes ADMIN_EMAILS matches on
login/verifyLoginOtp/googleCallback; generateTokens returns role; demo scripts
repointed to surexendofficial@gmail.com).
- GOOGLE OAuth is LIVE (user configured client id/secret on Railway). Redirect
  URI must be `https://surexend.com/api/v1/auth/google/callback` (apex
  308-redirects to www; the /api/v1 proxy serves the callback).
- ADMIN_EMAILS=surexendofficial@gmail.com is the desired admin config (user
  changed it; demo@surexend.com "doesn't exist"). Not yet applied on Railway.

## 2026-08-17 (round 7) - Smartspeed Telecom VTU: real airtime + data (all bundles)
- Provider token provided by user; `SMARTSPEED_API_TOKEN` read from env
  (base URL default https://www.smartspeedtelecom.com/api). Token is in
  backend/.env (gitignored) for local runs; MUST be added to Railway env.
- Network IDs confirmed from live catalog: MTN=1, GLO=2, 9MOBILE=3, AIRTEL=4.
  Airtime VTU discounts: MTN 96.5%, GLO 90%, AIRTEL 97%, 9MOBILE 98% (shown on
  the airtime provider list; app charges face value, discount is margin).
- Live plan catalog (cached 10 min in memory from GET /api/user/): MTN 73,
  GLO 27, AIRTEL 43, 9MOBILE 14 plans = {code:dataplan_id, name:plan,
  validity:month_validate, amount:plan_amount, planType:plan_type}. Frontend
  bills page now shows ALL plans grouped by plan type (scrollable), not 8.
- bills.service.ts rewritten to Smartspeed: providers (airtime/data) live from
  catalog; getDataPlans maps catalog; purchaseBill posts /api/topup/
  {network,mobile_number,amount,Ported_number:false,airtime_type:'VTU'} or
  /api/data/ {network,mobile_number,plan,Ported_number:false}; refunds USDT and
  marks FAILED on any error (DRF-style detail/error detection, 60s timeout);
  ref prefix SS-. Other categories (electricity/tv/internet) rejected with
  "not available yet" at purchase. validateMeter now hits Smartspeed
  /validatemeter.
- RESPONSE SHAPES NOT DOCUMENTED: success = HTTP 2xx + no detail/error/failed
  status (defensive; verify with a real small purchase). Smartspeed account
  balance is only ~NGN 40 - user must fund it to test purchases.
- Builds: nest build + next build both green.
- NEXT DEPLOY ACTION: add SMARTSPEED_API_TOKEN to Railway + redeploy; set
  ADMIN_EMAILS=surexendofficial@gmail.com on Railway; fund the Smartspeed
  account; verify a small real topup/data purchase end-to-end.

## 2026-08-17 (round 8) - admin pricing engine + full transaction invoices
- ServicePricing model (prisma, auto-created on Railway via prestart db push):
  category ('data'|'airtime'), provider, planCode ('' = network-level row),
  costPrice, sellPrice (per-plan override), marginPct (data auto-margin /
  airtime markup on face value). @@unique([category, provider, planCode]).
- SELL-PRICE ENGINE (bills.service): data sell = per-plan override ?? cost*(1 +
  network margin/100) ?? cost. Airtime sell = face value * (1 + markup/100).
  getDataPlans returns {amount: SELL, costPrice}; providers include
  sellMarkup. purchaseBill resolves prices SERVER-SIDE (client amount never
  trusted), stores costPrice/marginPct/sellPrice/planName/planValidity in
  bill metadata; airtime still sends face value upstream, user charged markup.
- ADMIN PRICING UI: /admin/pricing (new nav item). Airtime: per-network
  markup% + "₦100 → ₦X" preview. Data: network tabs, per-network "auto margin
  %" Apply-to-all, per-plan sell-price table (Service cost | Your sell |
  Profit) with Save/Reset (blank+Reset reverts to auto). Endpoints:
  GET /admin/pricing; PUT /admin/pricing/airtime {provider,marginPct};
  PUT /admin/pricing/data-margin {provider,marginPct};
  PUT /admin/pricing/data {provider,planCode,sellPrice|null}. AdminService now
  injects BillsService (BillsModule imported by AdminModule).
- TRANSACTION INVOICES: transactions.service.getTransactionById now attaches
  linked BillPayment + invoiceNumber=reference. User history receipt modal
  shows bill rows for BILL_PAYMENT (Invoice No, Service, Recipient, Plan,
  Amount Paid ₦, USDT, Rate, Provider Ref, Error). Admin transactions page:
  rows clickable -> DetailModal (GET /admin/transactions/:id) with full record
  incl service cost/sell/margin and provider ref.
- Builds green (nest build + next build). Prisma client regenerated locally.
- NEXT DEPLOY ACTION: none new beyond round 7 (SMARTSPEED_API_TOKEN +
  ADMIN_EMAILS on Railway, fund Smartspeed account, test a real purchase).

## 2026-08-17 (round 9) - bills safety guard + bank-transfer local funding
- BILLS SAFETY: purchaseBill now blocks accounts with ZERO completed RECEIVE
  deposits ("Fund your wallet first..."). Toggle: BILLS_REQUIRE_FUNDING=false.
  Stops testnet/empty balances spending real naira at Smartspeed.
- LOCAL FUNDING (bank transfer): VirtualAccount model (userId, provider
  FLUTTERWAVE, reference unique, accountNumber/Name/Bank/code). New
  LocalFundingService in wallets module -> GET /wallets/local-funding/account
  creates a Flutterwave VNUBAN permanent virtual account (POST
  /v3/virtual-account-numbers with email/tx_ref/phone/names/narration). If
  FLUTTERWAVE_SECRET_KEY missing -> { configured:false } and the UI falls back
  to "contact support" manual message.
- WEBHOOK: Flutterwave charge.completed with transfer/account payment_type ->
  processBankTransferDeposit credits localBalances (per-currency JSON, legacy
  localBalance fallback) + RECEIVE transaction (currency=NGN, channel
  bank_transfer) + notification. Dedup via DEP-FLW-<flwId> unique reference.
  Match user by VirtualAccount.reference in {tx_ref, meta.product_id, flw_ref}.
- FRONTEND: Receive page shows "Fund Local Currency (Bank Transfer)" card with
  account name/number (copy button)/bank when configured; helpful message when
  not. walletAPI.getLocalFundingAccount added.
- REQ: FLUTTERWAVE_SECRET_KEY + FLUTTERWAVE_WEBHOOK_HASH + FLUTTERWAVE_PUBLIC_KEY
  on Railway. Set webhook URL https://surexend.com/api/v1/webhooks/flutterwave in
  the Flutterwave dashboard (verif-hash header checked). VNUBAN needs a
  Flutterwave business account (BVN may be required by Flutterwave).
- Balance model: user USDT/USDC/NGN are ledger numbers (manual deposits +
  bank_transfer webhook). Only REAL-money links: Smartspeed wallet (bills) and
  eventually Flutterwave payouts. Crypto on-chain = TESTNET now (Circle TEST_ key
  + testnet RPC), so on-chain tokens are worthless; manual deposits + bank
  transfer are the only real funding paths until mainnet is configured.

## 2026-08-29 — full review, then safety & correctness pass

The whole repo was reviewed end to end; findings are in `docs/assessment.md`.
Nine P0 defects were fixed in the same session:

1. **`/app/invoice` was rendering fabricated bank accounts** — IBANs/BICs for
   "SureXend Europe B.V.", "SureXend UK Ltd.", "SureXend Inc.", UBS, ClearBank
   and eight more entities that do not exist. Anyone could have paid them. The
   page is now an honest waitlist (`FeatureComingSoon`) and the data is gone.
   **Lesson: a money product must never render account details it does not
   own, even as placeholder UI.**
2. **`/app/withdraw` faked success** with `setTimeout(..., 1500)` and no API
   call. Same treatment. Payouts need a completed registration that does not
   exist yet.
3. `jwt.strategy.ts` fell back to a hardcoded secret committed in the repo.
   Removed; `main.ts` now refuses to boot without `JWT_SECRET`,
   `JWT_REFRESH_SECRET` and `DATABASE_URL`, and refuses `TESTING_ENABLED=true`
   when `NODE_ENV=production`.
4. Webhooks were effectively unauthenticated. Flutterwave compared
   `hash !== secretHash`, which passed when the secret was unset AND the header
   was absent. Circle had no verification at all (the comment said "in Sandbox,
   we process the payload directly"). Now: constant-time compares, Circle
   verified with ECDSA-SHA256 against `/v2/notifications/publicKey/{keyId}` on
   the **raw** body (`rawBody: true` is required or the signature never
   matches), and unconfigured providers return 503 instead of accepting
   everything.
5. `ThrottlerModule` was registered in `app.module.ts` but `ThrottlerGuard` was
   never applied anywhere — there was no rate limiting at all. Now global via
   `APP_GUARD`, proxy-aware (we sit behind the Next rewrite, so the socket
   address is Vercel's, not the user's), with tighter limits on auth routes.
6. **PIN brute force**: a 4-digit PIN is 10,000 combinations and nothing
   counted attempts. `TransactionAuthService` now counts failures in Redis and
   locks for 15 minutes after 5, degrading to an in-memory counter if Redis is
   down (never fail open silently — log loudly).
7. No idempotency anywhere → a retried send could double-spend. Added
   `IdempotencyService` + `IdempotencyRecord` on send / bill purchase /
   conversion execute; the frontend sends a fresh `Idempotency-Key` per
   attempt.
8. **Send ordering**: `sendCrossChainFromArc` submitted the chain transfer
   *before* the ledger debit, so a later failed balance check left real USDC
   gone with nothing recorded. Order is now: reserve under
   `SELECT … FOR UPDATE` → submit to chain → settle, or refund via
   `releaseReservedSend` (guarded on `status === 'PENDING'` so it can never
   release twice).
9. `typescript.ignoreBuildErrors: true` hid four real type errors. Fixed them,
   set it to `false`, excluded `backend/` from the root tsconfig (Nest
   decorators need the backend's own tsconfig), added `npm run typecheck`.

Also added: the repo's first tests (Jest + ts-jest — webhook signature
verification, idempotency replay semantics, throttler tracker) and
`.github/workflows/ci.yml` running backend typecheck + tests and frontend
typecheck + build.

### Verification notes for this session
- `npx next build` cannot run in this sandbox (Google Fonts is blocked), and
  the backend `npm install` kept failing (the configured npm mirror resets
  connections). **The backend changes were reviewed by hand, not typechecked —
  run `npx tsc -p tsconfig.json --noEmit` and `npm test` in `backend/` before
  trusting them.**
- Frontend `npm run typecheck` passes locally.
- Building depends on reaching `fonts.googleapis.com` at build time. Self-host
  the fonts to remove that dependency.

## 2026-08-30 — ledger rollout: closed all write gaps, made reconciliation monitorable

Audit of the rollout checklist (`docs/rollout-status.md`) found the ledger was
not complete: five money paths updated float balances with NO ledger entry, and
conversions booked the entire USD debit as USDC while the float drew USDT first
(permanent per-currency drift). All were fixed, additively:

1. **`LedgerService.record()` is now atomic.** Replaced per-row `Promise.all`
   with `createMany({ skipDuplicates: true })`. The old code could commit a
   PARTIAL ledger transfer when one row conflicted (webhook replay), skewing
   balances forever; `skipDuplicates` also self-heals missing rows.
2. **`LedgerService.reverse(transferId)`** mirrors a transfer under
   `<transferId>-REFUND` with negated amounts. Every refund path now calls it
   (guarded by the PENDING status claim so it can never double-fire):
   - webhook Circle outbound FAILED + syncCircleHistory FAILED settlement
   - `releaseReservedSend` (chain rejection)
   - bill failure refund
3. **New ledger writes added:** Flutterwave bank credit, Circle inbound
   deposit, referral commission (treasury → user USDT).
4. **Conversion ledger now matches the float movement exactly** (USDT/USDC
   split debit, USDT credit) instead of booking everything as USDC.
5. **`LedgerReconciliationService` covers all currencies** (USDC, USDT, every
   local via `localBalances` JSON + NGN fallback), compares at display
   precision, and persists drift to `AuditLog` (`action='LEDGER_DRIFT'`,
   deduped per hour / only when the mismatch changes) so monitoring can alert
   without log scraping.
6. **`npm run ledger:report`** (`scripts/ledger-drift-report.js`) renders the
   same comparison plus the per-currency zero-sum double-entry invariant; exit
   code 1 on drift. Runs locally/CI; use on testnet after each E2E pass.

Verification: backend `npx tsc -p tsconfig.json --noEmit` exit 0 and `npx jest`
42/42 green. NOTE: in this sandbox `prisma generate` cannot run (binaries.prisma.sh
is unreachable); a temporary local typing stub
(`backend/node_modules/.prisma/client/*`) was used for typecheck and jest. It
is gitignored and never committed. On a machine with engine access, re-run
`npx prisma generate` (which overwrites it) before trusting tsc.

Still pending (rollout order): E2E testnet verification per path → gradual
read switch to ledger (tag send → conversions → bills → cross-chain reserve →
`getBalance()`) → stop float writes per path → checked-in Prisma migrations →
column removal → mainnet config review (the `CHAIN_ENV`/`MAINNET_ENABLED` flags
are currently dead code; mainnet needs a real value matrix + boot-time
assertions).

## 2026-08-30 (2) — testnet E2E runbook + mainnet-prep guard

- `docs/testnet-e2e-runbook.md`: operator checklist for the unexecuted
  testnet E2E leg (step 1) — 8 rows + failure legs + replay checks, expected
  float/ledger deltas, receipt table, final `npm run ledger:report` gate.
- `docs/mainnet-config.md` + `assertNetworkConfig()` in `main.ts`: boot-time
  refusal on mixed testnet/mainnet config (non-test CIRCLE_API_KEY without
  MAINNET_ENABLED; mainnet enabled with TEST_ key, testnet ARC RPC, or missing
  ARC_USDC_CONTRACT_ADDRESS; unknown CHAIN_ENV). Current TEST_-key prod passes.
  Mainnet remains NOT enabled.
- Reconciliation service now has unit tests (drift persistence, dedupe,
  local-currency/JSON-string/localBalance fallback, platform-account skip).
- Checked-in migrations intentionally NOT attempted in the sandbox: Prisma CLI
  needs binaries.prisma.sh (unreachable); hand-written baseline SQL is not
  acceptable for a money product. Generate on an engine-capable machine and
  baseline the live DB (`prisma migrate resolve --applied`) before flipping
  `prestart:prod` to `migrate deploy`.

## 2026-08-30 (3) — ledger read cutover: flag-gated implementation + baseline backfill

- `LEDGER_READS_ENABLED` (config `app.ledger.reads`, default **false**) switches
  balance READS to `LedgerEntry` when true, with a per-currency fallback to the
  legacy float for currencies the ledger has no rows for — safe to enable
  before backfill, per currency rather than all-or-nothing.
- Read sites switched (flag-gated): `getBalance()` (USDC/USDT + all locals),
  internal tag-send spendable, cross-chain send reserve, conversion checks
  (USD pool + locals). Spendable reads run inside the same FOR UPDATE
  transaction as the float lock (`ledger.balanceOf(..., prisma)` /
  `balancesOfUser(userId, prisma)`).
- `scripts/backfill-ledger-baseline.js` (`npm run ledger:baseline`, `--dry-run`)
  seeds `BASELINE-<userId>-<ccy>` opening entries per wallet currency where
  floatMinor != ledgerMinor — idempotent, double-entry balanced.
- `LedgerService` gained `balancesOfUser()` (startsWith prefix) and tx-scoped
  `balanceOf()`/`balancesOf()`.
- Flow to go live: deploy flag-off → `ledger:baseline` → `ledger:report` clean
  → set `LEDGER_READS_ENABLED=true` → verify dashboard/send/convert →
  re-check report. Reversion = flip flag back (floats still written in both
  modes). Still on floats: bills' `realLocalBalance` partition (by design),
  pending/locked fields.

## 2026-08-30 (4) — executed ledger verification: integration spec + 3 real fixes

Wrote `backend/test/money-flows.integration.spec.ts` (18 cases, runs in CI):
drives the actual WalletsService/ConversionsService/ReferralsService/
WebhooksService/BillsService against an in-memory Prisma store (FakePrisma:
wallet/ledger/transaction/conversion/billPayment/referral + $queryRaw FOR
UPDATE emulation), mocks axios/ioredis and the Circle SDK boundary, and
asserts per-currency double-entry zero-sum + ledger==float on every runbook
row (deposits, tag send, conversions ×2, FAILED refund reverse, bill refund).
`seedWallet` writes ledger baselines like the backfill script. Executed here;

found & fixed three real bugs:
1. NGN→USD conversion: float credited USDT but ledger journal wrote the
   pseudo-currency 'USD' → permanent per-currency drift (ledger:
   CONVERSION_SETTLEMENT/CREDIT now use creditCcy='USDT').
2. Conversions credited/credited UNROUNDED amounts to floats while ledger
   kept rounded minor units → sub-minor drift each conversion. Added
   `roundMinor()` to common/money.ts and use it for debitTotal/localCredit/
   creditedUsdt (float and ledger now agree exactly).
3. Tag-send PRE-transaction spendable check still read floats, so it rejected
   before the ledger-aware in-transaction check ran; now ledger-aware when
   LEDGER_READS_ENABLED.

Verification: tsc exit 0; jest 7 suites / 72 tests green. Real-chain E2E
(runbook rows with Circle/Arc/Flutterwave) still requires testnet credentials.

## 2026-08-30 (5) — DB ops runner for live baseline/report

The sandbox cannot reach PostgreSQL directly (egress TLS allowlist resets the
Supabase pooler handshake) and cannot run the Prisma query engine, so
`backend/scripts/db-ledger-ops.js` (`npm run ledger:db`) re-implements
ledger-drift-report + backfill-ledger-baseline on plain `pg` (new deps: pg).
It refuses to run if Wallet/LedgerEntry/Transaction/User tables are missing;
`report` is read-only (double-entry invariant + per-user ledger/float drift,
exit 1 on drift), `dry-run` previews, `apply` writes idempotent
BASELINE-<uid>-<ccy> pairs in one transaction, `full` chains report→dry-run→
apply→report. `docs/ledger-db-ops.workflow.yml` runs it on demand with the
SXDB_URL repo secret. Run `full` on the real DB before setting
LEDGER_READS_ENABLED=true.

## 2026-08-30 (6) — LIVE DB ledger baseline + normalization: RECONCILIATION CLEAN

Ran the pg runner against the real Supabase pooler (SXDB_URL provided by user;
sandbox cannot reach it, user executes locally):
1. `ledger:db -- report`: 0 entries (ledger brand new).
2. `ledger:db -- apply`: wrote 20 rows = 10 BASELINE-<uid>-<ccy> pairs
   (USDC/USDT/NGN/CVE/GHS/KES/XOF on 4 wallets, 70 wallets scanned).
3. `report` found 4 sub-minor dust floats (GHS/KES/USDC/USDT on one user) —
   pre-existing unrounded conversion dust; ledger values were correct.
4. `normalize --apply` fixed them (one gotcha: localBalances JSON is per-user,
   so a per-user grouped UPDATE was required; scalar columns fine).
5. FINAL `report`: `RECONCILIATION CLEAN: double-entry holds and ledger
   matches legacy floats.` (20 entries, 10 user accounts, 7 currencies).

Ledger is now the verified baseline for all existing balances. Next steps:
merge to main, deploy, LEDGER_READS_ENABLED=true, verify, re-report. Note the
DB has no default for LedgerEntry.id (Prisma generates uuid client-side) and
JSON localBalances updates must be per-user single-write.

## 2026-08-30 (7) — UI/security whole-product pass + next-session context

A broad UI/responsiveness upgrade and security hardening pass has now been
landed across the web app.

### What shipped in this pass
- Premium-fintech visual polish across landing, auth, dashboard, bills,
  support, history, send/receive/withdraw, profile, and admin surfaces.
- Reduced-motion and mobile-safety cleanups on animated/scroll-heavy views.
- Login-time 2FA challenge flow completed end to end.
- Refresh-session rotation/revocation landed for password and passkey auth.
- Client auth/session helpers and middleware-based app/admin route protection
  are in place.
- Login privacy leakage reduced and audit-log secret redaction broadened.
- Support assistant copy/intent handling aligned more closely to live product
  capabilities.
- Sensitive admin mutations now require step-up approval through either a
  transaction PIN or passkey token:
  - backend guard: `backend/src/common/guards/admin-step-up.guard.ts`
  - shared frontend approval UI: `src/components/admin/AdminStepUpModal.tsx`
  - wired admin actions: user updates/deletes/manual credits, KYC decisions,
    pricing changes, and broadcasts
- Frontend security headers were tightened in `next.config.ts` with a
  compatibility-mode CSP and stronger permissions/cross-origin headers.
- Frontend build resilience improved by removing build-time Google Fonts
  dependence from `src/app/layout.tsx` and using CSS/system fallbacks.

### Validation status
- `git diff --check` clean.
- Frontend `npm run build` passes.
- Frontend `npm run typecheck` passes after build generated `.next/types`.
- Backend build is still not fully validated in this sandbox because:
  - `bcrypt` native install hit TLS/network restrictions unless scripts are
    skipped;
  - `prisma generate` could not fetch engine binaries, so Prisma client types
    could not be regenerated here;
  - resulting Nest build errors are broad Prisma typing failures and are not a
    clean signal on only this session's changes.

### Context for the next session — do these 3 steps
1. **Final manual polish sweep**
   - review admin and authenticated flows for edge-case loading/error/empty
     states;
   - look for any copy or spacing that still feels below premium-fintech
     quality.
2. **Run a live visual inspection**
   - launch preview(s), verify responsive behavior across the major routes, and
     confirm the new admin step-up modal feels smooth on mobile and desktop.
3. **Do the closing whole-product review**
   - re-audit the app end to end for UI, responsiveness, and security;
   - if backend dependencies can be installed in a less restricted environment,
     run `backend/npm run build` and any follow-up validation there.

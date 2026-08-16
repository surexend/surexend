# SureXend — Session Memory

Last updated: 2026-08-15

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

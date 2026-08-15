# SureXend — Product Requirements Document

Last updated: 2026-08-15

## 1. Product Summary

SureXend is an African fintech mobile/web app for stablecoins (USDT/USDC) and
local-currency (fiat) transactions. Users hold crypto balances on-chain
(ARC-TESTNET native USDC), convert between USDC and 42 African local
currencies, send crypto peer-to-peer or cross-chain (CCTP), receive USDC via
deposit addresses, and pay bills/airtime/data.

The entire build is **testnet** (Circle sandbox: `TEST_*` API key, ARC-TESTNET
source chain, ETH-SEPOLIA / MATIC-AMOY / etc. destinations).

## 2. Goals & Non-Goals

Goals:
- Reliable receive + send of USDC for African users with minimal friction.
- Real balances everywhere — no fake numbers in the UI.
- Cross-chain delivery: funds live on Arc, recipients receive on the chain of
  their choosing via Circle CCTP.
- 42 African currencies (40 national + XAF + XOF), conversions via USD
  cross-rate.

Non-goals (currently):
- Mainnet/production USDC (explicitly deferred; whole stack is testnet).
- External KYC provider integration (planned for launch, not during testing).
- BSC/BEP20 support in the send UI (in config but not surfaced).

## 3. Users & Roles

- End user: holds USDC (on Arc), sends/receives, converts, pays bills.
- Product owner: the user of this repo, tests everything manually via the UI
  and Circle Console.
- Circle Console: source of truth for Circle-managed wallets; only shows
  balances for wallets created in the Console's entity.

## 4. Core Features

### 4.1 Accounts & Security
- Email/password auth (JWT, refresh tokens).
- 4-digit PIN, bcrypt-hashed, required for sends/conversions/bills.
- Testing mode: default PIN `0000` when user has no custom PIN and
  `TESTING_ENABLED` allows it.

### 4.2 Balances
- `GET /api/v1/wallets/balance` returns `{ usdBalance, usdcBalance,
  lockedBalance, localBalances, rate, pending }`.
- Sources: DB ledger (usdcBalance) reconciled in the background with on-chain
  Arc USDC and Circle history. No fake fallbacks.

### 4.3 Receive
- `GET /api/v1/wallets/deposit-address?network=X` → per-chain deposit address
  (EVM chains, SOLANA, ARC). QR code shown in UI.
- Every EVM address is also registered as an ARC-TESTNET wallet at boot
  (`ensureAllAddressesHaveArcWallets`) so Arc deposits are visible to Circle.

### 4.4 Send
- `POST /api/v1/wallets/send` with `{ toAddress, amount, network, pin }`.
- Funds always live on Arc; `network` is the DESTINATION chain.
- Destination = ARC → native same-chain transfer (Circle developer transfer).
- Destination = other chain → CCTP via BridgeKit (`useForwarder: true`).
- CCTP: burn `amount + fee` on Arc, recipient nets `amount`; fee estimated via
  `kit.estimate()`, shown in UI, debited from sender.
- History sync merges Circle outbound steps (approve + burn, both 0 USDC on
  Circle feed) into the single pending send row and settles locked balance.

### 4.5 Conversions
- USD <-> LOCAL and LOCAL <-> LOCAL via USD cross-rate.
- Conversion fee rate currently **0** (zeroed for testing).
- Records CONVERT transactions in history.

### 4.6 Bills / Airtime / Data
- VtPass-backed airtime/data/bills.
- Testing PIN fallback applies.

### 4.7 KYC
- Simplified: verified / unverified only (no tiers).
- Crypto ops require KYC at launch; airtime/data/bills work without it.

## 5. Non-Functional Requirements
- Frontend build must pass `npx next build`; backend must pass
  `npx tsc -p tsconfig.json --noEmit`.
- No fake balances. Defensive Prisma selects (deployed DB schema may lag).
- Deterministic docs: this repo must always contain current PRD,
  architecture, plan, and memory so direction survives any session.

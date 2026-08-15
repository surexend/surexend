# SureXend — Project Plan

Last updated: 2026-08-15

## Principle

This file is the living roadmap. It must always reflect reality: what is
built, what is being worked on, what is blocked, and what is next. Update it
whenever the state changes, and commit with the work so the repo is always the
source of truth.

## Current State (as of 2026-08-15)

### Verified facts
- Send path WORKS end-to-end on testnet. Evidence: 4 USDC CCTP send → Sepolia
  mint 2.440392 USDC to `0x06b141...` (tx
  `0x9f3a3f2ed3628e1342e8c5da316fa885e0f8c26a5aac1c2c33c17835c9744844`,
  block 11483979). Live test 2 USDC → Sepolia mint 2.000000 (tx
  `0x4a102a9586ef15f5ce14e9ff5db96c5f854cfae2d641c6a484caaa1284410a22`,
  block 11484952). Total 4.440392 USDC currently at `0x06b141...` on
  ETH-SEPOLIA.
- "Circle Console shows 0 USDC + appears as two transactions" for a CCTP send
  is NORMAL: CCTP burns from the sender's wallet generate an ERC20 approval
  + a burn, both reported by Circle's feed as 0-amount contract executions
  (the USDC goes into the bridge contract, not a wallet). This is documented
  in the app code (`wallets.service.ts`) and confirmed by Circle docs.
- The funds DO arrive at the recipient address on the DESTINATION TESTNET
  chain (mint txs verified above). If the recipient's wallet app shows 0, it
  is because the wallet is viewed on mainnet (or a different chain) — testnet
  USDC lives on the testnet chain.

### The big open question (customer-facing)
Recipients expect to see USDC in their MetaMask wallets. Because the whole
stack is testnet, they must view the SAME address on the DESTINATION TESTNET
network (e.g. ETH-SEPOLIA) to see the funds. Product owner must confirm this
is the intended behavior (sandbox) vs. the expectation of real mainnet USDC.

## Phases

### Phase 1 — Foundation (DONE)
- Auth, PIN, 42 currencies, real balances, conversions, receive, bills.
- No fake balance fallbacks.

### Phase 2 — Crypto send (IN PROGRESS / mostly done, needs confirmation)
- [x] Native Arc→Arc sends.
- [x] CCTP Arc→EVM/Solana sends via BridgeKit forwarder.
- [x] Fee estimation + UI display + ledger charge (`GET /wallets/cctp-fee`).
- [x] History sync + settlement of CCTP sends (fee preserved, locked balance
      released/refunded).
- [x] Live-tested: recipient nets full amount on destination testnet chain.
- [ ] CONFIRM with product owner: sandbox/testnet vs mainnet expectations.
- [ ] Decide UI wording so users understand "recipient must check testnet
      network" during sandbox, and remove it before mainnet.

### Phase 3 — Launch readiness (NOT STARTED)
- External KYC provider (Smile Identity config exists in `configuration.ts`).
- Remove testing flags (`TESTING_ENABLED`, `NEXT_PUBLIC_TESTING_ENABLED`,
  default PIN `0000`).
- Mainnet key + mainnet chain mapping if mainnet is the target.
- Real Circle API key (production) and wallet set.

## Known Limitations / Backlog
- CCTP fee is an estimate; actual fee may differ slightly.
- `estimateSendFee` fails open to fee 0 on error while send fails closed
  (minor UI inconsistency).
- BSC/BEP20 in config but not in send UI list.
- Old `handover_context.md`/`README.md` are stale; docs/ + SESSION_HANDOVER.md
  are the source of truth.
- Diagnostic scripts (`backend/scripts/*.js`) are untracked; decide whether to
  keep them committed.

## How We Work
1. Symptom → investigate (read actual code, verify on-chain) → fix → verify
   (backend `npx tsc -p tsconfig.json --noEmit`; frontend temp tsconfig trick
   or `npx next build`) → commit + push.
2. NEVER assert without verification. On-chain receipts and mint logs are the
   ground truth.
3. Update docs/project_plan/memory/handover in the same commit as the work.

# SureXend — Architecture

Last updated: 2026-08-15

## 1. Stack

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind, framer-motion,
  @tanstack/react-query, react-hot-toast, lucide-react, recharts. Deployed on
  Vercel. `NEXT_PUBLIC_BRAND_VARIANT` = 'gold' | 'lemon'.
- **Backend**: NestJS 10 + Prisma (Postgres) + Redis (ioredis) + bcryptjs.
  Global prefix `api/v1`. JWT auth. Deployed as Docker (`node:22-slim`) on
  Railway (service `surexend`). `prestart:prod` swallows `prisma db push`
  failures → backend MUST use defensive selects.
- **Circle**: W3S wallets (`@circle-fin/adapter-circle-wallets`), BridgeKit
  (`@circle-fin/bridge-kit`) for CCTP. Testnet key (starts `TEST_`).

## 2. Repo Layout

```
surexend/
  src/                     # Next.js frontend
    app/                   # routes (send, receive, convert, dashboard, ...)
    lib/api.ts             # all API clients + mocks
    lib/utils.ts
  backend/
    src/wallets/           # wallets.controller/service + cctp.service
    src/webhooks/          # webhooks.service (Circle/Flutterwave/VtPass)
    src/scripts/           # live-test + diagnostic scripts (run via railway)
  docs/                    # THIS repo's living documentation
  SESSION_HANDOVER.md      # session-start prompt (keep updated)
```

## 3. Cross-Chain Send Flow (CCTP) — the core path

1. User picks destination network in the send UI (ARC, POLYGON, AVALANCHE,
   ARBITRUM, ETHEREUM, BASE, OPTIMISM, SOLANA, MONAD).
2. `GET /api/v1/wallets/cctp-fee?destinationNetwork=X&amount=N` →
   `estimateSendFee()` → `cctpService.estimateFee()` (BridgeKit `kit.estimate`)
   returns the USDC fee Circle's forwarder will deduct.
3. `POST /api/v1/wallets/send` → `sendCrossChainFromArc()`:
   - compute spendable (gross on-chain USDC net of CONVERT ledger + locked).
   - if dest == ARC → `sendNativeArcTransfer()` (Circle developer transfer,
     token `0x360000...`, blockchain `ARC-TESTNET`).
   - else → `cctpService.bridge()`:
     - `NETWORK_TO_CHAIN` maps app network → BridgeChain constant
       (ARC→Arc_Testnet, ETHEREUM→Ethereum_Sepolia, etc. — **all testnet**).
     - burns `amount + fee` on Arc with `useForwarder: true` → Circle's
       forwarder relays the mint, recipient receives exactly `amount`.
   - DB ledger: debit `usdcBalance` by `amount + fee`, lock `amount + fee`,
     create PENDING SEND row (metadata: toAddress, destinationNetwork, cctp,
     txId, txHashes).
4. Circle feed reports the sender's two outbound steps (approve + burn) with
   **0 USDC** (normal for CCTP — the burn sends USDC into the bridge contract,
   not to a wallet).
5. `syncCircleHistory()` merges those amount-less outbound steps into the
   pending row, preserves the recorded fee, and settles `lockedBalance`
   (release on COMPLETED, refund `amount + fee` to `usdcBalance` on FAILED).
6. Destination mint is Circle's forwarding service minting to the recipient
   address on the destination chain (testnet). Verified mint tx hashes appear
   on that chain's explorer.

## 4. Network mapping (TESTNET ONLY)

`NETWORK_TO_CHAIN` in `cctp.service.ts`:

| App network | BridgeChain |
|---|---|
| ARC | Arc_Testnet |
| POLYGON | Polygon_Amoy_Testnet |
| ETHEREUM | Ethereum_Sepolia |
| AVALANCHE | Avalanche_Fuji |
| ARBITRUM | Arbitrum_Sepolia |
| BASE | Base_Sepolia |
| OPTIMISM | Optimism_Sepolia |
| SOLANA | Solana_Devnet |
| MONAD | Monad_Testnet |

`getBlockchainName()` in `wallets.service.ts` maps to Circle blockchain strings
(e.g. `ETH-SEPOLIA` when key is test). `getNetworkFromBlockchain()` reverses
it for history/explorer links.

## 5. Balance & History

- `getBalance()` returns DB-ledger figures, triggers background
  `reconcileWallet` (deposit monitor) + `syncCircleHistory`.
- `syncCircleHistory()` is the de-facto CCTP settlement point (outbound
  webhook cannot match sends — Circle sends carry no refId). Dedupes by
  reference = `SEND/RECV-<chain>-<txHash>`.
- CCTP amount-less outbound steps (`transactionType === 'OUTBOUND'` with 0
  amount) are matched to pending sends; plain amount-less inbound noise is
  skipped.

## 6. Deploy & Config

- Railway: backend at `surexend-production.up.railway.app`, service name
  `surexend`. CLI at `backend/node_modules/.bin/railway.cmd` (logged in as
  Archsec_Emman, project `surexend`, production env). Circle creds live in the
  Railway env — use `npx railway run --service surexend node scripts/...` for
  live actions.
- Vercel: frontend. `BACKEND_URL` set; do NOT set `NEXT_PUBLIC_API_URL` to
  localhost.
- Config source: `backend/src/config/configuration.ts` (registerAs('app')).
  Circle block: `app.circle.{apiKey,entitySecret,walletSetId,webhookSecret}`.

## 7. Known Limitations / Open Questions

- Whole stack is testnet; recipient wallets on mainnet will NOT show testnet
  USDC. Verify with MetaMask switched to the destination TESTNET network.
- CCTP fee is an estimate; actual forwarder fee can differ slightly.
- `estimateSendFee` fails open to fee 0 on estimate errors (UI shows 0), while
  `sendCrossChainFromArc` fails closed on spendable check — minor UX
  inconsistency.
- The old `handover_context.md`/`README.md` predate this doc; this `docs/`
  folder + `SESSION_HANDOVER.md` are the source of truth going forward.

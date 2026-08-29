# Mainnet Configuration — Preparation & Review Reference

> **Status: NOT ENABLED.** `MAINNET_ENABLED` is false everywhere, `CHAIN_ENV`
> defaults to `testnet`, and every chain mapping in the code is testnet. This
> document is the *preparation* for the separately-reviewed launch config. Do
> not enable mainnet until this matrix is filled, reviewed, and the rollout
> checklist in `rollout-status.md` is complete.

## 1. Why this is a two-mapping system

Chain selection lives in two independent places and they MUST stay consistent:

| Place | File | Selected by | Testnet values | Mainnet values |
|---|---|---|---|---|
| BridgeKit chains | `wallets/cctp.service.ts` `NETWORK_TO_CHAIN` | hardcoded map (const) | `Arc_Testnet`, `Ethereum_Sepolia`, `Polygon_Amoy_Testnet`, `Avalanche_Fuji`, `Arbitrum_Sepolia`, `Base_Sepolia`, `Optimism_Sepolia`, `Solana_Devnet`, `Monad_Testnet` | **not yet mapped** — must be added explicitly |
| Circle blockchain strings | `wallets/wallets.service.ts` `getBlockchainName()` | `CIRCLE_API_KEY` prefix (`TEST_` → testnet) | `ARC-TESTNET`, `ETH-SEPOLIA`, … | `ARC`, `ETH`, `POLYGON`, `AVAX`, `ARB`, `BASE`, `OP`, `SOL`, `MONAD` |

⚠️ Landmine (now guarded at boot): a mainnet Circle key flips **only** the second
mapping. `assertNetworkConfig()` in `main.ts` refuses to boot on:
- `MAINNET_ENABLED=true` / `CHAIN_ENV=mainnet` without a non-test Circle key,
  with an `ARC_RPC_URL` still pointing at testnet, or without an explicit
  `ARC_USDC_CONTRACT_ADDRESS` (the code default is the Arc **testnet**
  precompile `0x3600000000000000000000000000000000000000`);
- a non-test Circle key while `MAINNET_ENABLED` is false (mixed mapping).

## 2. Values to source & review (NONE are committed / hardcoded)

| Variable | Testnet (current) | Mainnet value owner | Reviewed by | Notes |
|---|---|---|---|---|
| `CIRCLE_API_KEY` | `TEST_…` (Railway) | Circle dashboard | ops + security | Must be a **mainnet** key; changing it flips `getBlockchainName()` |
| `CIRCLE_WALLET_SET_ID` | sandbox set | Circle | ops | Mainnet wallet set |
| `CIRCLE_WEBHOOK_SECRET` | sandbox | Circle | ops | Re-verify signature on mainnet webhooks |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` | Arc docs | ops | Testnet URL hardcoded as default; mainnet must be explicit |
| `ARC_CHAIN_ID` | `5042002` | Arc docs | ops | Verify the real mainnet chain id |
| `ARC_USDC_CONTRACT_ADDRESS` | `0x3600…0000` (testnet precompile) | Arc docs / token contract | ops + security | **Never reuse the testnet default** |
| `NETWORK_TO_CHAIN` entries | testnet BridgeChains | bridge-kit constants | dev + ops | Add mainnet constants + a per-network switch |
| `getBlockchainName()` mainnet branch | exists | — | dev | Already implemented; only reachable with a mainnet key |
| `FRONTEND_URL`, `WEBAUTHN_*`, SMTP/Firebase | prod values | — | ops | Unchanged by mainnet |
| `ADMIN_EMAILS` | set/removed per boot | — | ops | Remove after use |

## 3. Proposed switchover sequence (review before executing)

1. Fill the matrix above and record values in a private vault (never in git).
2. Code change: make `NETWORK_TO_CHAIN` (and ARC defaults) select the mainnet
   variant **only when `MAINNET_ENABLED=true`** — keep testnet as the default
   path so the current deployment is untouched.
3. Deploy with mainnet Circle key + testnet flag still off → boot guard passes
   only after step 4's explicit checks; no traffic changes.
4. Flip `MAINNET_ENABLED=true` + `CHAIN_ENV=mainnet` + mainnet ARC vars on
   Railway **and** the matching frontend env at the same time.
5. Verify with a **tiny** real deposit to a controlled address, then
   `npm run ledger:report` must be clean.
6. Keep `TESTING_ENABLED` off in production (already enforced at boot).

## 4. Explicit "never" list

- Never set `MAINNET_ENABLED=true` (or `CHAIN_ENV=mainnet`) in the same
  deployment as a `TEST_` Circle key, the testnet ARC RPC URL, or the testnet
  ARC USDC address — the boot guard exists to stop this.
- Never enable mainnet while balances are still read from legacy floats and
  any money path is unverified — that is the migration gap tracked in
  `rollout-status.md`.
- Never hardcode mainnet addresses/keys in this repo (same policy as the 2026-08-29
  secret audit).

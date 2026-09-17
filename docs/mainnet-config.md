# Mainnet Configuration — Preparation & Review Reference

> **Status: NOT ENABLED.** `MAINNET_ENABLED` is false by default. The official
> ARC-only reference values are recorded below, but no Production secret,
> approval flag, wallet set, or money-movement switch is enabled here. The
> application consumes `MAINNET_CHAIN_MATRIX_JSON` and refuses to boot unless
> every enabled network has an explicit reviewed Circle name, BridgeKit chain,
> RPC, chain ID, USDC contract/decimals, and explorer URL. This document remains
> the preparation reference for the private release packet.

## 1. Why this is a two-mapping system

Chain selection lives in two independent places and they MUST stay consistent:

| Place | File | Selected by | Testnet values | Mainnet values |
|---|---|---|---|---|
| BridgeKit chains | `wallets/cctp.service.ts` | reviewed matrix in `MAINNET_CHAIN_MATRIX_JSON` for mainnet; testnet constants otherwise | `Arc_Testnet`, `Ethereum_Sepolia`, `Polygon_Amoy_Testnet`, `Avalanche_Fuji`, `Arbitrum_Sepolia`, `Base_Sepolia`, `Optimism_Sepolia`, `Solana_Devnet`, `Monad_Testnet` | private provider-reviewed `cctpChain` values |
| Circle blockchain strings | `wallets/wallets.service.ts` `getBlockchainName()` | reviewed matrix for mainnet; explicit testnet map otherwise | `ARC-TESTNET`, `ETH-SEPOLIA`, … | private provider-reviewed `circleBlockchain` values |

⚠️ Landmine (now guarded at boot): a mainnet Circle key must never be allowed
to select only one side of the mapping. `assertNetworkConfig()` requires
`CHAIN_ENV=mainnet`, `MAINNET_ENABLED=true`, `MAINNET_CONFIG_APPROVED=true`, a
non-test Circle credential, and a complete matrix for every enabled network. It
also refuses a non-test Circle key while `MAINNET_ENABLED` is false (mixed
mapping). The matrix still needs provider and on-chain review before approval.

## 2. Values to source & review (NONE are committed / hardcoded)

| Variable | Testnet (current) | Mainnet value owner | Reviewed by | Notes |
|---|---|---|---|---|
| `CIRCLE_API_KEY` | `TEST_…` (Railway) | Circle dashboard | ops + security | Must be a **mainnet** key; changing it flips `getBlockchainName()` |
| `CIRCLE_WALLET_SET_ID` | sandbox set | Circle | ops | Mainnet wallet set |
| `CIRCLE_WEBHOOK_SECRET` | sandbox | Circle | ops | Re-verify signature on mainnet webhooks |
| `MAINNET_CHAIN_MATRIX_JSON.rpcUrls` | `https://rpc.testnet.arc.network` (testnet default) | Arc/provider docs | ops | Mainnet URLs must be managed HTTPS endpoints |
| `MAINNET_CHAIN_MATRIX_JSON.chainId` | `5042002` (testnet) | network docs | ops | Verify each enabled mainnet chain ID |
| `MAINNET_CHAIN_MATRIX_JSON.usdcContract` | testnet contract/precompile | token contract | ops + security | **Never reuse a testnet address** |
| `MAINNET_CHAIN_MATRIX_JSON.cctpChain` | testnet BridgeKit constants | provider docs | dev + ops | Record the exact provider-reviewed mainnet value |
| `MAINNET_CHAIN_MATRIX_JSON.circleBlockchain` | testnet Circle names | Circle docs | dev + ops | Record the exact Circle mainnet value |
| `NEXT_PUBLIC_CHAIN_ENV` + `NEXT_PUBLIC_*_EXPLORER_BASE` | testnet defaults in `src/lib/explorers.ts` | deployment matrix explorers | ops + frontend | Mainnet has no testnet fallback; missing values hide the link |
| `FRONTEND_URL`, `WEBAUTHN_*`, SMTP/Firebase | prod values | — | ops | Unchanged by mainnet |
| `ADMIN_EMAILS` | set/removed per boot | — | ops | Remove after use |

## 3. Verified Arc mainnet reference

The official Arc network reference and the current Circle Wallets/Bridge Kit
SDK identify the following Arc mainnet values. These are deployment data for
an `ARC`-only launch; they do not authorize the launch or replace custody and
release approval:

```json
{
  "ARC": {
    "circleBlockchain": "ARC",
    "cctpChain": "Arc",
    "rpcUrls": ["https://rpc.mainnet.arc.io"],
    "chainId": 5042,
    "usdcContract": "0x3600000000000000000000000000000000000000",
    "usdcDecimals": 6,
    "explorerUrl": "https://explorer.arc.io"
  }
}
```

References:

- <https://docs.arc.io/arc/references/connect-to-arc>
- <https://docs.arc.io/arc/references/contract-addresses>
- <https://developers.circle.com/cctp/concepts/supported-chains-and-domains>
- Circle `@circle-fin/bridge-kit` `1.15.x` chain definitions (`Arc`, chain ID
  `5042`, CCTP domain `26`, and the RPC/explorer/USDC values above).

## 4. Proposed switchover sequence (review before executing)

1. Fill the matrix above and record values in a private vault (never in git).
2. Populate the private `MAINNET_CHAIN_MATRIX_JSON` and
   `MAINNET_ENABLED_NETWORKS`; do not put real secrets or unreviewed values in
   git. The testnet constants remain the default path.
3. Independently review the mainnet BridgeKit/Circle mapping, provider
   contracts, reconciliation, token addresses, RPC ownership, and explorer
   links; the database control plane and launch gate must remain closed during
   this work.
4. Only after a separate release is approved, set the private matrix,
   `MAINNET_ENABLED=true`, `CHAIN_ENV=mainnet`, and the matching frontend
   environment at the same time. Start with `CANARY_MODE=true` and a tiny
   approved-user allowlist; the backend rejects all other customer movement.
5. Verify with a **tiny** real deposit and send for each canary user, then
   `npm run ledger:report` must be clean and the observation window must be
   signed before expanding limits or disabling canary mode.
6. Keep `TESTING_ENABLED` off in production (already enforced at boot).

## 5. Explicit "never" list

- Never set `MAINNET_ENABLED=true` (or `CHAIN_ENV=mainnet`) in the same
  deployment as a `TEST_` Circle key, the testnet ARC RPC URL, or the testnet
  ARC USDC address — the boot guard exists to stop this.
- Never enable mainnet while balances are still read from legacy floats and
  any money path is unverified — that is the migration gap tracked in
  `rollout-status.md`.
- Never hardcode mainnet addresses/keys in this repo (same policy as the 2026-08-29
  secret audit).

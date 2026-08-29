# Testnet E2E Verification Runbook

> Purpose: prove every money path moves BOTH the legacy float and the
> double-entry ledger (`LedgerEntry`) correctly, then record the receipts. Run
> this before switching any balance read to the ledger
> (`rollout-status.md` step 3).
>
> Prerequisites: `CIRCLE_API_KEY=TEST_…` (sandbox), Arc testnet RPC reachable,
> `TESTING_ENABLED=true` + `DEFAULT_PIN=0000` (dev/test only), a clean
> `npm run ledger:report` (backend) BEFORE starting (it must also report
> `DOUBLE-ENTRY VIOLATIONS: none`).
>
> Copy this file's appendix table and fill in `txHash` / explorer links as you
> go. If ANY row fails, stop and fix before the next row.

## General helper (run from `backend/`, with everything installed)

```bash
# Optional: paste a drift report after each row
npm run ledger:report
# Expected: 'RECONCILIATION CLEAN' after every row; if you get drift,
# the row's ledger entries did not match its float movement -> fix first.
```

## Row 1 — Arc native deposit (ArcListenerService)

1. Create a fresh test user, open Receive → ARC, copy the deposit address.
   Backend must have created an `ARC` `WalletAddress` (derived from an EVM
   address if needed).
2. Send native test USDC **on Arc testnet** (e.g. a faucet or the Arc bridge)
   to that address for a round amount like `5.000000`.
3. Wait ≤ 60s for the 15s poller. Check:
   - `Transaction` row: `type=RECEIVE`, `status=COMPLETED`,
     `reference=RECV-ARC-<txHash>`, `currency=USDC`, amount 5.
   - `Wallet.usdcBalance` +5 exactly.
   - `LedgerEntry` transferId = that reference: `external:arc:USDC` −5 and
     `user:<id>:USDC` +5 (+5.000000 in minor units).
4. Record txHash.

## Row 2 — Circle inbound deposit webhook

1. From the same user, deposit into a Circle-managed address (Ethereum Sepolia)
   for a non-round amount (`3.123456`).
2. Wait for Circle's `transactions.inbound` webhook. Check:
   - `Transaction` `RECV-<txId>` COMPLETED, currency USDC, amount `3.123456`.
   - `Wallet.usdcBalance` +3.123456; `LedgerEntry` `circle:ETH-SEPOLIA:USDC`
     −3.123456 / `user:<id>:USDC` +3.123456.
3. Replay the same webhook payload (the protected CLI replay path) → the
   dedupe check must skip, and `ledger:report` must NOT report drift (this
   proves atomic `record()` + skipDuplicates).

## Row 3 — SureXend-tag internal send

1. User A sends `10` USDC by tag to User B (fee 0). Check both:
   - A: `usdcBalance` −10; ledger `user:A:USDC` −10 (`SEND`).
   - B: `usdcBalance` +10; ledger `user:B:USDC` +10 (`RECEIVE`).
   - Both `Transaction` rows COMPLETED (SEND + RECEIVE).
2. Re-send the same `Idempotency-Key` → must not double-debit (float or ledger).

## Row 4 — Cross-chain CCTP send (ARC → Ethereum Sepolia)

1. User A initiates a CCTP send of `2.5`. Immediately check:
   - `Wallet.usdcBalance` −(2.5 + fee), `lockedBalance` +(2.5 + fee).
   - `Transaction` PENDING; `LedgerEntry` `user:A:USDC` −(2.5+fee),
     `external:<dest>:USDC` +2.5, `platform:fees:USDC` +fee.
2. Wait for the burn + forwarder mint on Ethereum Sepolia. Check the PENDING
   row flips to COMPLETED exactly once, `lockedBalance` returns to 0.
3. **Failure leg:** send to an invalid destination and/or trigger a chain
   rejection (or wait for a FAILED Circle state). Check `releaseReservedSend`/
   sync settlement: `usdcBalance` restored, `lockedBalance` 0,
   `ledger:report` clean → the `<reference>-REFUND` reversal entries exist.

## Row 5 — Conversion

Run one of each (amounts chosen to split the USD pool):
1. **USD → NGN**: ensure the user has some USDT AND some USDC. Convert e.g.
   `20` USD → NGN. Check `usdtBalance`/`usdcBalance` decremented exactly in
   order (USDT first), `localBalances.NGN` +received, and ledger entries: user
   USDT −x, treasury USDT +x, user USDC −y, treasury USDC +y, treasury NGN
   −z, user NGN +z.
2. **NGN → USD**: `localBalances.NGN` −amount, `usdtBalance` +received;
   ledger user NGN / treasury NGN / treasury USDT / user USDT.
3. **NGN → GHS** (or another local): both locals move; ledger mirrors.

## Row 6 — Bill purchase + failure refund

1. Create a bill purchase with a real-ish NGN balance
   (`realLocalBalance` funded via Row 7). Success path: `localBalances.NGN`
   and `realLocalBalance` decrement, ledger user NGN / treasury NGN.
2. Failure path (Smartspeed provider rejects — use a plan that errors):
   the catch refunds float AND `ledger.reverse(reference)` writes
   `<reference>-REFUND` (+NGN user, −NGN treasury). `ledger:report` clean.

## Row 7 — Flutterwave bank-transfer credit

1. Fund the user's virtual account (Flutterwave sandbox transfer). Check:
   `localBalances.NGN` +amount, `realLocalBalance` +amount, ledger
   `external:FLUTTERWAVE:NGN` −amount / `user:<id>:NGN` +amount, RECEIVE tx
   COMPLETED with `DEP-FLW-…` reference.
2. Replay the webhook → dedupe, no double credit, no ledger drift.

## Row 8 — Admin manual credit (optional, ops)

Use the admin credit endpoint for USDC + NGN. Check the float and ledger
(external manual source → user). `ledger:report` clean.

## Row 9 — Referral commission

With a referred user, complete a fee-earning transaction; verify the referrer's
`usdtBalance` +commission and ledger `platform:treasury:USDT` −c /
`user:<referrer>:USDT` +c with `REF-EARN-…` reference.

## Final gate

```bash
npm run ledger:report          # exit 0 = the double-entry invariant holds and
                               # ledger == legacy float for every currency
```

Then, and only then, start `rollout-status.md` step 3 (switch reads path by
path). Keep float writes until the matching path's reads are migrated.

## Appendix — receipts

| Row | Path | txHash / webhook id | ledger transferId | Float delta OK | Ledger delta OK | Date |
|---|---|---|---|---|---|---|
| 1 | Arc deposit |  |  | ☐ | ☐ |  |
| 2 | Circle deposit |  |  | ☐ | ☐ |  |
| 3 | Tag send |  |  | ☐ | ☐ |  |
| 4 | CCTP send |  |  | ☐ | ☐ |  |
| 4b | CCTP failure |  |  | ☐ | ☐ |  |
| 5 | Convert ×3 |  |  | ☐ | ☐ |  |
| 6 | Bill + refund |  |  | ☐ | ☐ |  |
| 7 | Bank credit |  |  | ☐ | ☐ |  |
| 8 | Admin credit |  |  | ☐ | ☐ |  |
| 9 | Referral |  |  | ☐ | ☐ |  |

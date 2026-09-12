# Provider contract evidence and preflight

This document records what the application is allowed to assume about each
money-moving provider. A successful HTTP response alone is not a settlement
receipt. Provider-specific status, signature, idempotency, and reconciliation
evidence must be captured in the release packet before enabling a path.

## Read-only preflight

From `backend/`:

```bash
node scripts/provider-contract-preflight.js --all --network
```

The script never creates a wallet, sends a transfer, purchases a bill, or
retries an ambiguous request. It emits one of:

- `PASS`: the requested authenticated read-only check completed.
- `FAIL`: a deterministic configuration or provider response failed.
- `PENDING_UNVERIFIED`: credentials or authoritative contract evidence are
  missing. This is not a pass and must not be converted into a retry.

To retain a redacted release artifact:

```bash
PROVIDER_PREFLIGHT_EVIDENCE_FILE=./release-evidence/provider-preflight.json \
  node scripts/provider-contract-preflight.js --all --network
```

Do not put API keys, entity secrets, webhook secrets, or customer data in the
evidence file. The evidence must include the operator, timestamp, environment,
provider request/response identifiers where available, and the sandbox account
used for any separately executed money-flow test.

## Circle

- The application uses Circle developer-controlled wallet APIs and a stable
  UUIDv4 idempotency key derived from the committed local send reference for
  wallet creation and native transfers.
- A repeated Circle mutating request must reuse the same idempotency key. Never
  generate a fresh key after a timeout or connection reset.
- Native Arc transfers include the local `refId`; CCTP/BridgeKit currently has
  no application-level idempotency parameter in this backend. A CCTP outcome
  that is not confirmed is therefore retained as `PENDING` and requires Circle
  history or operator evidence before resolution.
- Circle webhook signatures are checked against the raw request body and the
  Circle key-id/public-key flow. A webhook is not a substitute for querying the
  provider state.
- Circle's current platform guidance recommends using Bridge Kit for frontend
  bridging and CCTP directly for backend transfers. This backend still calls
  Bridge Kit for CCTP, so that architecture and its provider-side replay/status
  behavior require a separate review before real funds are enabled.
- Circle’s official API documentation states that mutating transfer requests
  require a UUIDv4 `idempotencyKey` and reusing it returns the original request:
  <https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-developer-transaction-transfer>

## Flutterwave

- Current webhook verification uses the exact raw request body and the
  `flutterwave-signature` HMAC-SHA256 value. The legacy `verif-hash` path is
  accepted only when the current signature header is absent and a configured
  legacy secret exists.
- Only explicit successful settlement statuses are credited. Missing,
  non-terminal, or ambiguous statuses are ignored and require provider
  reconciliation.
- The release packet must contain a captured sandbox webhook and a read-only
  transaction lookup proving the mapping from provider transaction ID to the
  local reference. Do not use a guessed callback field as proof.
- Flutterwave’s current webhook documentation is:
  <https://developer.flutterwave.com/docs/webhooks>

## Smartspeed bills

The repository does not currently contain an authoritative Smartspeed status or
idempotency contract. The bill flow therefore must not treat a generic 2xx,
network timeout, or undocumented response field as proof of delivery. Unknown
outcomes remain pending and are reconciled from provider evidence before an
operator resolves or refunds them.

Before enabling real bills, record all of the following from the provider's
sandbox contract and an authenticated test:

1. request idempotency/replay behavior;
2. provider transaction/reference field;
3. accepted, pending, failed, and reversed status values;
4. read-only status endpoint and retention period;
5. callback authentication and raw-body signing rules;
6. a successful receipt plus a failed/refunded receipt.

## PaymentPoint

PaymentPoint’s callback signature and terminal-status contract has not been
independently established for this repository. `PAYMENTPOINT_WEBHOOK_ENABLED`
must remain `false`; credentials alone do not authorize money crediting.

Before enabling the webhook, record the provider's signed callback algorithm,
header, canonical bytes, replay protection, terminal statuses, and a sandbox
replay test. Until then, the preflight reports `PENDING_UNVERIFIED`.

## Release decision

A missing credential, failed read-only check, missing signature contract, or
ambiguous provider outcome is a release blocker for that provider path. This
work intentionally does **not** implement KYC/AML. That scope decision does not
waive any provider, ledger, database, security, or operator evidence gate.

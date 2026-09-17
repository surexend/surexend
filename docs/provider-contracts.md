# Provider contract evidence and preflight

This document records what the application is allowed to assume about each
money-moving provider. A successful HTTP response alone is not a settlement
receipt. Provider-specific status, signature, idempotency, and reconciliation
evidence must be captured in the release packet before enabling a path.

## Provider selection and read-only preflight

Provider requirements are selected through `ENABLED_PROVIDERS`, whose current
safe default is `circle,paymentpoint,smartspeed`. `FLUTTERWAVE_ENABLED=true`
explicitly adds the legacy Flutterwave path; leaving it false removes
Flutterwave from runtime, webhook, and release-gate requirements. Credentials
alone do not silently enable a provider.

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

## Flutterwave (optional legacy path)

Flutterwave is disabled unless `FLUTTERWAVE_ENABLED=true`. When disabled, it
is not a launch-gate provider, its webhook route is closed, and local funding
will not fall back to it. If it is explicitly enabled:

- Webhook verification uses the exact raw request body and the
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

The preflight now calls the same authenticated, read-only `/user/` catalog
endpoint used for bill discovery when `--network` is supplied. This proves
reachability and credential acceptance only; it is not a bill receipt and does
not establish idempotency or terminal-status semantics.

The official SmartSpeed Postman collection documents Token authentication and
these transaction surfaces:

- `GET /api/user/` for account details;
- `GET /api/data/` for all data transactions;
- `GET /api/data/{id}` for querying one data transaction;
- purchase and query sections for airtime, electricity, cable, IUC, and meter
  validation.

Source: <https://documenter.getpostman.com/view/14036001/U16gQTNa?version=latest>

The collection's published request examples do not include response bodies or
status schemas. Therefore its documented query routes are safe reachability
surfaces, not proof that a bill was delivered. The bill flow must still reject
an undocumented response, network timeout, or non-terminal outcome. Unknown
outcomes remain pending and are reconciled from provider evidence before an
operator resolves or refunds them. No additional provider request is needed
for the routes explicitly documented above; the missing response semantics
remain a deliberate fail-closed boundary.

Before enabling real bills, record all of the following from the provider's
sandbox contract and an authenticated test:

1. request idempotency/replay behavior;
2. provider transaction/reference field;
3. accepted, pending, failed, and reversed status values;
4. read-only status endpoint and retention period;
5. callback authentication and raw-body signing rules;
6. a successful receipt plus a failed/refunded receipt.

## PaymentPoint

PaymentPoint is the selected local-funding path when its API key, secret, and
business ID are configured. The launch gate includes it only when those
credentials are present; it does not silently substitute Flutterwave.

PaymentPoint's official documentation now establishes the following parts of
its contract:

- Base URL: `https://api.paymentpoint.co`;
- Bearer authentication plus an `api-key` header;
- virtual-account creation at `/api/v1/createVirtualAccount`;
- webhook JSON fields including `transaction_id`, `amount_paid`,
  `settlement_amount`, `transaction_status`, and `timestamp`;
- `Paymentpoint-Signature` as an HMAC-SHA256 signature over the raw JSON body,
  represented as a hexadecimal digest in the provider's PHP, Python, and
  Node examples.

Sources:

- <https://paymentpoint.gitbook.io/paymentpoint.co/welcome-to-paymentpoint/authentication>
- <https://paymentpoint.gitbook.io/paymentpoint.co/welcome-to-paymentpoint/errors>
- <https://paymentpoint.gitbook.io/paymentpoint.co/services/virtual-account/create-virtual-account>
- <https://paymentpoint.gitbook.io/paymentpoint.co/services/webhook-documentation>

The PaymentPoint errors page also documents HTTP `409 Conflict` when the same
idempotent key is reused and recommends exponential backoff for `429 Too Many
Requests`. This records provider-level idempotency/error guidance, but it does
not name the idempotency header/key or define duplicate webhook delivery,
replay protection, webhook retry semantics, a read-only transaction-status
endpoint, or the full reconciliation contract.

This matches the backend's explicit `hmac-sha256-raw-hex` mode and
`paymentpoint-signature` header. The official webhook page contains one
contradictory sentence about removing the signature from the payload; its
runnable PHP, Python, and Node examples hash the raw request body, so the
backend follows those examples. No undocumented behavior is inferred.

`PAYMENTPOINT_WEBHOOK_ENABLED` must remain `false`; credentials and documented
signature syntax alone do not authorize money crediting. The preflight will
not guess a status endpoint or call virtual-account creation just to obtain
evidence. Until the remaining documented-and-evidenced controls exist,
mainnet remains closed for this inbound-credit path.

## Release decision

A missing credential, failed read-only check, missing signature contract, or
ambiguous provider outcome is a release blocker for that provider path. This
work intentionally does **not** implement KYC/AML. That scope decision does not
waive any provider, ledger, database, security, or operator evidence gate.

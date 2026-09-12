-- Durable provider idempotency and reconciliation state for Circle referral payouts.
-- An unknown response must not make an already-submitted reward retryable.
ALTER TABLE "ReferralReward"
  ADD COLUMN IF NOT EXISTS "providerIdempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "providerState" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliationRequired" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralReward_providerIdempotencyKey_key"
  ON "ReferralReward"("providerIdempotencyKey");

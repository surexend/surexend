-- Claim idempotency keys before executing money-moving side effects.
-- The reviewed initial baseline contains the legacy columns; these statements
-- upgrade it safely on both fresh and already-provisioned databases.
ALTER TABLE "IdempotencyRecord"
  ADD COLUMN IF NOT EXISTS "requestHash" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "IdempotencyRecord"
  ALTER COLUMN "response" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "IdempotencyRecord_status_updatedAt_idx"
  ON "IdempotencyRecord"("status", "updatedAt");

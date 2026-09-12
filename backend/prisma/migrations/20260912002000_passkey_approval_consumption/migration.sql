-- Persist transaction-bound WebAuthn approvals so each approval can be
-- atomically consumed across all API instances.
CREATE TABLE IF NOT EXISTS "PasskeyApproval" (
  "id" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "intentHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasskeyApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyApproval_jti_key" ON "PasskeyApproval"("jti");
CREATE INDEX IF NOT EXISTS "PasskeyApproval_userId_expiresAt_idx" ON "PasskeyApproval"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "PasskeyApproval_usedAt_idx" ON "PasskeyApproval"("usedAt");
DO $$ BEGIN
  ALTER TABLE "PasskeyApproval"
    ADD CONSTRAINT "PasskeyApproval_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

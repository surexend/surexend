-- Never keep active authentication codes in plaintext. Existing rows remain
-- readable by the compatibility path until they expire; all new rows use
-- OtpCode.codeHash and set code to NULL.
ALTER TABLE "OtpCode"
  ALTER COLUMN "code" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "codeHash" TEXT,
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "OtpCode_identifier_type_used_expiresAt_idx"
  ON "OtpCode"("identifier", "type", "used", "expiresAt", "attempts");

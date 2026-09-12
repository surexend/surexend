-- A user wallet must have exactly one canonical deposit address per network.
-- This intentionally fails if historical duplicates exist; operations must
-- reconcile those addresses before applying the constraint rather than
-- silently deleting an address that may have received funds.
CREATE UNIQUE INDEX IF NOT EXISTS "WalletAddress_walletId_network_key"
  ON "WalletAddress"("walletId", "network");

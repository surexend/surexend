-- Durable chain-environment stamp for the database.
--
-- Wallet balances, LedgerEntry accounts, and WalletAddress rows are not scoped
-- by network. If a database that carried testnet balances were pointed at a
-- mainnet deployment, those internal testnet balances would be read as
-- spendable mainnet money. The application writes this row on its first boot
-- against a database and refuses to start when CHAIN_ENV does not match it.
CREATE TABLE "DeploymentEnvironment" (
    "id" TEXT NOT NULL,
    "chainEnvironment" TEXT NOT NULL,
    "circleKeyPrefix" TEXT NOT NULL,
    "stampedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stampedBy" TEXT,
    CONSTRAINT "DeploymentEnvironment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeploymentEnvironment_chainEnvironment_check" CHECK ("chainEnvironment" IN ('testnet', 'mainnet'))
);

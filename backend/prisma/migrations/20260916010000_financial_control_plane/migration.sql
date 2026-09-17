-- Database-backed emergency pause and two-person release control.
-- The seed is fail-closed: an operator must explicitly enable each movement
-- class after the deployment, ledger, provider, compliance and custody checks.
CREATE TABLE "FinancialControl" (
    "id" TEXT NOT NULL,
    "moneyMovementEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cryptoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "billPaymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboundCreditsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialControlChange" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "moneyMovementEnabled" BOOLEAN NOT NULL,
    "cryptoEnabled" BOOLEAN NOT NULL,
    "billPaymentsEnabled" BOOLEAN NOT NULL,
    "inboundCreditsEnabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    CONSTRAINT "FinancialControlChange_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialControlChange"
  ADD CONSTRAINT "FinancialControlChange_controlId_fkey"
  FOREIGN KEY ("controlId") REFERENCES "FinancialControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FinancialControlChange_status_createdAt_idx" ON "FinancialControlChange"("status", "createdAt");
CREATE INDEX "FinancialControlChange_controlId_idx" ON "FinancialControlChange"("controlId");

INSERT INTO "FinancialControl" ("id", "reason")
VALUES ('global', 'Initial fail-closed state; requires controlled release approval.');

CREATE TABLE "FinancialLimitBucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitDate" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialLimitBucket_userId_limitDate_currency_key" ON "FinancialLimitBucket"("userId", "limitDate", "currency");

CREATE TABLE "FinancialLimitReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationReference" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "limitDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialLimitReservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialLimitReservation_operationReference_key" ON "FinancialLimitReservation"("operationReference");
CREATE INDEX "FinancialLimitReservation_userId_limitDate_idx" ON "FinancialLimitReservation"("userId", "limitDate");

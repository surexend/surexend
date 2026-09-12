-- Durable per-channel delivery state for ledger drift alerts. A failed alert
-- delivery must remain retryable across process restarts and deployments.
CREATE TABLE "LedgerAlertDelivery" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LedgerAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerAlertDelivery_auditLogId_channel_key"
    ON "LedgerAlertDelivery"("auditLogId", "channel");
CREATE INDEX "LedgerAlertDelivery_status_nextAttemptAt_idx"
    ON "LedgerAlertDelivery"("status", "nextAttemptAt");

ALTER TABLE "LedgerAlertDelivery"
    ADD CONSTRAINT "LedgerAlertDelivery_auditLogId_fkey"
    FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

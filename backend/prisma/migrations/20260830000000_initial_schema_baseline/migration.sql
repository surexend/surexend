-- Reviewed bootstrap baseline for the schema as it existed before the incremental migrations.
-- The CREATE statements are conditional so this can be introduced safely to an existing database; Prisma migration history still records it.

DO $$ BEGIN
  CREATE TYPE "TransactionType" AS ENUM ('SEND', 'RECEIVE', 'CONVERT', 'BILL_PAYMENT', 'REFERRAL_EARNING', 'WITHDRAWAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "KycStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RoleType" AS ENUM ('USER', 'AI', 'HUMAN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "avatar" TEXT,
  "surexTag" TEXT,
  "pin" TEXT,
  "kycTier" INTEGER NOT NULL DEFAULT 0,
  "kycStatus" "KycStatus" NOT NULL DEFAULT 'UNVERIFIED'::"KycStatus",
  "referralCode" TEXT NOT NULL,
  "referredById" TEXT,
  "twoFactorSecret" TEXT,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "currencyDisplay" TEXT NOT NULL DEFAULT 'NGN',
  "defaultWallet" TEXT NOT NULL DEFAULT 'AUTO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "isBanned" BOOLEAN NOT NULL DEFAULT FALSE,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "fcmToken" TEXT,
  CONSTRAINT "User_email_key" UNIQUE ("email"),
  CONSTRAINT "User_phone_key" UNIQUE ("phone"),
  CONSTRAINT "User_surexTag_key" UNIQUE ("surexTag"),
  CONSTRAINT "User_referralCode_key" UNIQUE ("referralCode"),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Passkey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT NOT NULL DEFAULT '[]',
  "deviceName" TEXT NOT NULL DEFAULT '',
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Passkey_credentialId_key" UNIQUE ("credentialId"),
  CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usdtBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "usdcBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "lockedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "localBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "localBalances" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "realLocalBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  CONSTRAINT "Wallet_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WalletAddress" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VirtualAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'FLUTTERWAVE',
  "reference" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualAccount_reference_key" UNIQUE ("reference"),
  CONSTRAINT "VirtualAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING'::"TransactionStatus",
  "amount" DOUBLE PRECISION NOT NULL,
  "fee" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "currency" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transaction_reference_key" UNIQUE ("reference"),
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Conversion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usdtAmount" DOUBLE PRECISION NOT NULL,
  "fiatAmount" DOUBLE PRECISION NOT NULL,
  "fiatCurrency" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "fee" DOUBLE PRECISION NOT NULL,
  "status" "ConversionStatus" NOT NULL DEFAULT 'PENDING'::"ConversionStatus",
  "flutterwaveRef" TEXT,
  "bankAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "isVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "isDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BillPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "usdtAmount" DOUBLE PRECISION NOT NULL,
  "reference" TEXT NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING'::"TransactionStatus",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillPayment_reference_key" UNIQUE ("reference"),
  CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Referral" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredId" TEXT NOT NULL,
  "earnings" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referral_referredId_key" UNIQUE ("referredId"),
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlatformWallet" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "circleWalletId" TEXT,
  "walletSetId" TEXT,
  "blockchain" TEXT NOT NULL,
  "address" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USDC',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformWallet_key_key" UNIQUE ("key"),
  CONSTRAINT "PlatformWallet_circleWalletId_key" UNIQUE ("circleWalletId"),
  CONSTRAINT "PlatformWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReferralReward" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaign" TEXT NOT NULL,
  "requiredReferrals" INTEGER NOT NULL DEFAULT 5,
  "referralCount" INTEGER NOT NULL DEFAULT 0,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "currency" TEXT NOT NULL DEFAULT 'USDT',
  "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
  "platformWalletId" TEXT,
  "circleTransactionId" TEXT,
  "reference" TEXT NOT NULL,
  "approvedById" TEXT,
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralReward_circleTransactionId_key" UNIQUE ("circleTransactionId"),
  CONSTRAINT "ReferralReward_reference_key" UNIQUE ("reference"),
  CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KycDocument" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "documentUrl" TEXT NOT NULL,
  "selfieUrl" TEXT,
  "status" "KycStatus" NOT NULL DEFAULT 'PENDING'::"KycStatus",
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "role" "RoleType" NOT NULL DEFAULT 'USER'::"RoleType",
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OtpCode" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RateCache" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateCache_currency_key" UNIQUE ("currency"),
  CONSTRAINT "RateCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FeeConfig" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "flatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "maxAmount" DOUBLE PRECISION,
  CONSTRAINT "FeeConfig_type_key" UNIQUE ("type"),
  CONSTRAINT "FeeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LedgerEntry" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "reference" TEXT,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServicePricing" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "planCode" TEXT NOT NULL DEFAULT '',
  "costPrice" DOUBLE PRECISION,
  "sellPrice" DOUBLE PRECISION,
  "marginPct" DOUBLE PRECISION,
  "disabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePricing_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Conversion" ADD CONSTRAINT "Conversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_platformWalletId_fkey" FOREIGN KEY ("platformWalletId") REFERENCES "PlatformWallet" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "User_email_phone_idx" ON "User" ("email", "phone");
CREATE INDEX IF NOT EXISTS "Passkey_userId_idx" ON "Passkey" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletAddress_network_address_key" ON "WalletAddress" ("network", "address");
CREATE INDEX IF NOT EXISTS "VirtualAccount_userId_idx" ON "VirtualAccount" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralReward_userId_campaign_key" ON "ReferralReward" ("userId", "campaign");
CREATE INDEX IF NOT EXISTS "ReferralReward_status_createdAt_idx" ON "ReferralReward" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralReward_platformWalletId_idx" ON "ReferralReward" ("platformWalletId");
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_userId_scope_key_key" ON "IdempotencyRecord" ("userId", "scope", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord" ("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_transferId_account_currency_key" ON "LedgerEntry" ("transferId", "account", "currency");
CREATE INDEX IF NOT EXISTS "LedgerEntry_account_currency_idx" ON "LedgerEntry" ("account", "currency");
CREATE INDEX IF NOT EXISTS "LedgerEntry_reference_idx" ON "LedgerEntry" ("reference");
CREATE INDEX IF NOT EXISTS "LedgerEntry_kind_createdAt_idx" ON "LedgerEntry" ("kind", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ServicePricing_category_provider_planCode_key" ON "ServicePricing" ("category", "provider", "planCode");

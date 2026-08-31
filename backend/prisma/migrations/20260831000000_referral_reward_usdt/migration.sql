-- Referral campaign correction: the five-referrals customer promise is 5 USDT,
-- not USDC. The platform wallet remains USDC-funded, while its supported-chain
-- USDT balance is used for reward transfers.
ALTER TABLE "ReferralReward" ALTER COLUMN "currency" SET DEFAULT 'USDT';

-- Existing unsubmitted entitlement rows are safe to correct. Paid rows retain
-- their original asset and campaign identifier for an accurate audit trail.
UPDATE "ReferralReward" AS reward
SET "campaign" = 'FIVE_REFERRALS_USDT',
    "currency" = 'USDT'
WHERE reward."campaign" = 'FIVE_REFERRALS_USDC'
  AND reward."status" IN ('ELIGIBLE', 'FAILED');

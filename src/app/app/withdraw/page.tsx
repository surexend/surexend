'use client'

import FeatureComingSoon from '@/components/ui/FeatureComingSoon'

/**
 * USDC -> local currency payout to a bank account.
 *
 * Cash-out requires a licensed payout partner and completed regulatory
 * registration, neither of which is finished. Until then this page is an
 * honest waitlist — it must never show a success state for a payout that did
 * not happen.
 */
export default function WithdrawPage() {
  return (
    <FeatureComingSoon
      title="Withdraw to Bank"
      subtitle="Convert USDC to local currency and pay out to your bank account. Our payout licence and banking registration are still in progress, so withdrawals are not available yet."
      features={[
        'Cash out USDC to any supported African bank account',
        'Live exchange rate shown before you confirm',
        'Payouts in minutes, with a receipt for every withdrawal',
        'Saved beneficiary accounts and per-transaction limits',
      ]}
      eta="Live once our payout registration is complete"
    />
  )
}

'use client'

import FeatureComingSoon from '@/components/ui/FeatureComingSoon'

/**
 * International invoicing (get paid in EUR / GBP / USD).
 *
 * The payout accounts this feature depends on are not provisioned yet, so the
 * page ships as a waitlist rather than a form. The previous version rendered
 * placeholder IBANs and bank names, which users could reasonably have tried to
 * pay — that is now gone.
 */
export default function InvoicePage() {
  return (
    <FeatureComingSoon
      title="Invoices"
      subtitle="Create professional invoices and get paid in EUR, GBP or USD from clients anywhere. We're still completing the banking partnership that powers payouts, so nothing here is live yet."
      features={[
        'Generate and send branded invoices in seconds',
        'Get paid into a real EUR / GBP / USD account in your business name',
        'Automatic conversion into USDC at a transparent rate',
        'Payment reminders and a paid / unpaid dashboard',
      ]}
      eta="Live once the payout banking integration is approved"
    />
  )
}

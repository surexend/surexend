'use client'

import { motion } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Shield, ShieldCheck, Clock, XCircle } from 'lucide-react'

const STATUS: Record<string, { label: string; color: string; bg: string; icon: any; desc: string }> = {
  VERIFIED: { label: 'Verified', color: '#10B981', bg: 'rgba(16,185,129,0.1)', icon: ShieldCheck, desc: 'Your identity has been verified. All crypto features are unlocked.' },
  PENDING: { label: 'Pending Review', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock, desc: 'Your documents are being reviewed. This usually takes 24-48 hours.' },
  REJECTED: { label: 'Verification Failed', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle, desc: 'We could not verify your identity. Please try again with clearer documents.' },
  UNVERIFIED: { label: 'Unverified', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: Shield, desc: 'Crypto sends, receives, and conversions require identity verification. Airtime, data, and bill payments remain available.' },
}

export default function KYCPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const { data: kycData, isLoading } = useQuery({
    queryKey: ['kyc'],
    queryFn: userAPI.getKYCStatus,
  })

  const status = kycData?.status || 'UNVERIFIED'
  const cfg = STATUS[status] || STATUS.UNVERIFIED
  const StatusIcon = cfg.icon

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 max-w-md mx-auto flex flex-col pb-28 sm:pb-36">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.back()} className="text-[#94A3B8] hover:text-white text-sm font-semibold">← Back</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-2xl space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}>
            <StatusIcon className="w-8 h-8" style={{ color: cfg.color }} />
          </div>
          <h2 className="text-xl font-bold text-white mt-4">Identity Verification</h2>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mt-2" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.label}
          </span>
        </div>

        {isLoading ? (
          <p className="text-center text-[#94A3B8] text-sm">Loading status…</p>
        ) : (
          <>
            <p className="text-[#94A3B8] text-sm text-center">{cfg.desc}</p>

            <div className="space-y-2.5">
              {[
                { label: 'Crypto Send, Receive & Convert', locked: status !== 'VERIFIED' },
                { label: 'Withdraw to Local Bank', locked: status !== 'VERIFIED' },
                { label: 'Airtime, Data & Bill Payments', locked: false },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/5">
                  <span className={`text-sm font-medium ${item.locked ? 'text-[#94A3B8]' : 'text-white'}`}>{item.label}</span>
                  <span className={`text-xs font-bold ${item.locked ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                    {item.locked ? 'Requires KYC' : 'Available'}
                  </span>
                </div>
              ))}
            </div>

            {status === 'VERIFIED' ? (
              <button
                onClick={() => router.push('/app/profile')}
                className="w-full py-4 rounded-xl font-bold text-black shadow-lg"
                style={{ background: colors.gradientBg }}
              >
                Done
              </button>
            ) : (
              <div className="rounded-xl border p-4 text-xs text-[#94A3B8] leading-relaxed" style={{ background: `rgba(${accentRgb}, 0.06)`, borderColor: `rgba(${accentRgb}, 0.2)` }}>
                Identity verification is handled securely by our KYC provider. During testing, verification is skipped so you can
                try all features freely. Full KYC verification will be required at launch for all crypto operations.
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ShieldCheck, Lock, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import BiometricApproveButton from '@/components/BiometricApproveButton'
import type { AdminApprovalPayload } from '@/lib/api'

export default function AdminStepUpModal({
  open,
  title,
  description,
  actionLabel = 'Confirm action',
  loading = false,
  onClose,
  onApprove,
}: {
  open: boolean
  title: string
  description: string
  actionLabel?: string
  loading?: boolean
  onClose: () => void
  onApprove: (approval: AdminApprovalPayload) => Promise<void> | void
}) {
  const { variant } = useTheme()
  const reduceMotion = useReducedMotion()
  const accentRgb = variant === 'gold' ? '212, 160, 23' : '181, 226, 61'
  const accentHex = variant === 'gold' ? '#D4A017' : '#B5E23D'
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (!open) setPin('')
  }, [open])

  const approveWithPin = async () => {
    if (pin.length !== 4) {
      toast.error('Enter your 4-digit transaction PIN')
      return
    }
    await onApprove({ adminPin: pin })
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-3 sm:p-4 liquid-backdrop">
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 280 }}
            className="w-full max-w-md rounded-3xl border border-white/10 liquid-glass-strong overflow-hidden"
          >
            <div className="p-5 sm:p-6 space-y-4 relative">
              <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.85), transparent)` }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" style={{ color: accentHex }} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">{title}</h3>
                    <p className="text-sm text-[#94A3B8] mt-1 leading-relaxed">{description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="p-1.5 rounded-full text-[#64748B] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-amber-300">Step-up approval</p>
                <p className="text-xs text-[#FDE68A] mt-1 leading-relaxed">Sensitive admin actions require your transaction PIN or a biometric approval token before they can execute.</p>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.18em] font-extrabold text-[#64748B] mb-2">
                  Transaction PIN
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter 4-digit PIN"
                    className={`w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3.5 pl-11 pr-4 text-white outline-none transition-colors focus:border-white/25 placeholder:text-[#475569] input-field-${variant}`}
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={approveWithPin}
                disabled={loading || pin.length !== 4}
                className="w-full rounded-2xl py-3.5 font-bold text-black disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${accentHex}, ${accentHex}CC)` }}
              >
                {loading ? 'Authorizing…' : actionLabel}
              </button>

              <BiometricApproveButton
                onApproved={(passkeyToken) => onApprove({ adminPasskeyToken: passkeyToken })}
                intent={{ action: 'admin.stepup' }}
                accentHex={accentHex}
                accentRgb={accentRgb}
                disabled={loading}
                label="Use Face ID or fingerprint instead"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

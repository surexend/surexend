'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { useQuery } from '@tanstack/react-query'
import { userAPI } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Lock, CheckCircle2, Shield, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import PinKeypad from '@/components/PinKeypad'

type Field = 'current' | 'new' | 'confirm'

export default function ChangePinPage() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const router = useRouter()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: userAPI.getProfile,
  })
  const pinAlreadySet = !!profile?.pinSet

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [field, setField] = useState<Field>(pinAlreadySet ? 'current' : 'new')
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  const fieldConfig: Record<Field, { title: string; subtitle: string }> = {
    current: {
      title: 'Enter Current PIN',
      subtitle: 'Enter your existing 4-digit transaction PIN to continue.',
    },
    new: {
      title: pinAlreadySet ? 'Enter New PIN' : 'Create Your PIN',
      subtitle: pinAlreadySet
        ? 'Choose a new 4-digit PIN. Avoid easily guessable numbers.'
        : 'Your PIN protects every send, conversion and bill payment. Stored as a secure hash — never plaintext.',
    },
    confirm: {
      title: 'Confirm Your PIN',
      subtitle: 'Re-enter your new PIN to confirm it.',
    },
  }

  const handleComplete = async (entered: string) => {
    setPinError(null)

    if (field === 'current') {
      setCurrentPin(entered)
      setField('new')
      return
    }

    if (field === 'new') {
      setNewPin(entered)
      setField('confirm')
      return
    }

    // confirm step
    if (entered !== newPin) {
      setPinError("PINs don't match — try again.")
      setNewPin('')
      setField('new')
      return
    }

    setIsLoading(true)
    try {
      if (pinAlreadySet) {
        await userAPI.changePin({ currentPin, newPin })
      } else {
        await userAPI.setupPin(newPin)
      }
      setDone(true)
      toast.success(pinAlreadySet ? 'PIN changed successfully' : 'PIN set up successfully')
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to update PIN'
      toast.error(msg)
      setPinError(msg)
      setCurrentPin('')
      setNewPin('')
      setField(pinAlreadySet ? 'current' : 'new')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center gap-6">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="w-24 h-24 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center shadow-[0_0_48px_rgba(16,185,129,0.25)]"
        >
          <CheckCircle2 className="w-12 h-12 text-emerald-400" strokeWidth={2} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-2xl font-black text-white">PIN {pinAlreadySet ? 'Changed' : 'Created'}!</h2>
          <p className="text-sm text-[#94A3B8] mt-2 max-w-xs mx-auto leading-relaxed">
            Your transaction PIN is now active for conversions, sends, and bill payments.
          </p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          onClick={() => router.push('/app/profile')}
          className="w-full max-w-[320px] py-4 rounded-2xl font-bold text-black shadow-lg text-base"
          style={{ background: colors.gradientBg }}
        >
          Done
        </motion.button>
      </div>
    )
  }

  // ── PIN entry screen ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full min-h-screen pb-28">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#94A3B8] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-white">
          {pinAlreadySet ? 'Change PIN' : 'Set Up PIN'}
        </span>
      </div>

      {/* Step indicators */}
      {pinAlreadySet && (
        <div className="flex items-center justify-center gap-2 mt-4 mb-2">
          {(['current', 'new', 'confirm'] as Field[]).map((f, i) => (
            <div
              key={f}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: f === field ? '32px' : '8px',
                background: ['current', 'new', 'confirm'].indexOf(field) > i
                  ? colors.primary
                  : f === field
                    ? colors.primary
                    : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
      )}

      {/* Icon */}
      <div className="flex justify-center mt-8 mb-2">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: `rgba(${accentRgb}, 0.12)`, boxShadow: `0 0 24px rgba(${accentRgb}, 0.15)` }}
        >
          <Lock className="w-7 h-7" style={{ color: colors.primary }} />
        </div>
      </div>

      {/* Animated field swap */}
      <AnimatePresence mode="wait">
        <motion.div
          key={field}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          className="flex-1 flex flex-col items-center mt-2"
        >
          <PinKeypad
            title={fieldConfig[field].title}
            subtitle={fieldConfig[field].subtitle}
            onComplete={handleComplete}
            disabled={isLoading}
            error={pinError}
            accentHex={colors.primary}
            accentRgb={accentRgb}
            onCancel={field !== (pinAlreadySet ? 'current' : 'new') ? () => {
              setNewPin('')
              setField(pinAlreadySet ? 'current' : 'new')
            } : undefined}
          />
        </motion.div>
      </AnimatePresence>

      {/* Security footnote */}
      <div className="flex items-center justify-center gap-1.5 text-[#475569] text-[11px] pb-4 mt-4">
        <Shield className="w-3.5 h-3.5" />
        <span>Secured with bank-grade encryption (bcrypt)</span>
      </div>
    </div>
  )
}

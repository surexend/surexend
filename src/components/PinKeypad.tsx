'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Delete } from 'lucide-react'

interface PinKeypadProps {
  /** Title displayed above the dots */
  title: string
  /** Subtitle / transaction summary */
  subtitle?: string
  /** Called once all 4 digits are entered */
  onComplete: (pin: string) => void
  /** Disable all keys while a request is in flight */
  disabled?: boolean
  /** Error message — clears the dots and shakes when set */
  error?: string | null
  /** Accent colour for filled dots (hex) */
  accentHex: string
  /** Accent colour for filled dots (rgb triplet, no parens) */
  accentRgb: string
  /** Optional back / cancel action */
  onCancel?: () => void
  /** Optional slot rendered below the keypad (e.g. biometric button) */
  extra?: React.ReactNode
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function PinKeypad({
  title,
  subtitle,
  onComplete,
  disabled = false,
  error,
  accentHex,
  accentRgb,
  onCancel,
  extra,
}: PinKeypadProps) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  // When the parent signals an error, shake and clear
  useEffect(() => {
    if (error) {
      setShake(true)
      setPin('')
      const t = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(t)
    }
  }, [error])

  const tap = (k: string) => {
    if (disabled) return
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (k === '') return
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => onComplete(next), 120)
    }
  }

  return (
    <div className="w-full max-w-[340px] mx-auto p-5 sm:p-6 rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col items-center select-none">
      {/* Top subtle liquid glass highlight */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/[0.06] to-transparent pointer-events-none" />

      {/* ── Title + subtitle ── */}
      <div className="text-center mb-4 px-2 relative z-10">
        <h2 className="text-lg font-extrabold text-white tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-xs text-[#94A3B8] mt-1 leading-snug max-w-[260px] mx-auto">
            {subtitle}
          </p>
        )}
      </div>

      {/* ── PIN dots ── */}
      <motion.div
        className="flex justify-center gap-4 mb-5 relative z-10"
        animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.45 }}
      >
        {Array.from({ length: 4 }, (_, i) => {
          const filled = i < pin.length
          return (
            <motion.div
              key={i}
              animate={
                filled
                  ? { scale: [1, 1.25, 1], opacity: 1 }
                  : { scale: 1, opacity: 1 }
              }
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              className="relative"
            >
              <div
                className="w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 flex items-center justify-center"
                style={{
                  borderColor: filled ? accentHex : 'rgba(255,255,255,0.2)',
                  background: filled ? accentHex : 'transparent',
                  boxShadow: filled ? `0 0 12px rgba(${accentRgb}, 0.6)` : 'none',
                }}
              />
            </motion.div>
          )
        })}
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-400 font-semibold mb-4 -mt-2 relative z-10"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Number grid ── */}
      <div className="grid grid-cols-3 w-full gap-2.5 relative z-10">
        {KEYS.map((k, i) => {
          const isBlank = k === ''
          const isDelete = k === '⌫'

          if (isBlank && !onCancel) {
            return <div key={i} />
          }

          return (
            <motion.button
              key={i}
              disabled={disabled || (isBlank && !onCancel)}
              onClick={() => {
                if (isBlank && onCancel) {
                  onCancel()
                  return
                }
                tap(k)
              }}
              whileTap={
                disabled
                  ? {}
                  : {
                      scale: 0.92,
                      backgroundColor: isDelete
                        ? 'rgba(239,68,68,0.2)'
                        : `rgba(${accentRgb}, 0.22)`,
                    }
              }
              transition={{ type: 'spring', stiffness: 700, damping: 22 }}
              className={[
                'h-[52px] rounded-2xl flex items-center justify-center font-black text-xl transition-all select-none',
                // numeric keys with liquid glass style
                !isDelete && !isBlank
                  ? 'bg-white/[0.04] backdrop-blur-md border border-white/[0.08] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] hover:bg-white/[0.08] hover:border-white/20 active:bg-white/[0.12]'
                  : '',
                // delete key
                isDelete
                  ? 'bg-white/[0.02] border border-white/[0.05] text-[#94A3B8] hover:text-red-400 active:text-red-400'
                  : '',
                // cancel key
                isBlank && onCancel
                  ? 'bg-transparent text-[#64748B] text-xs font-bold border border-transparent hover:text-white'
                  : '',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {isDelete ? (
                <Delete className="w-5 h-5" strokeWidth={2.2} />
              ) : isBlank && onCancel ? (
                'Cancel'
              ) : (
                k
              )}
            </motion.button>
          )
        })}
      </div>

      {/* Loading spinner */}
      {disabled && (
        <div
          className="flex items-center justify-center gap-2 text-xs font-bold mt-4 relative z-10"
          style={{ color: accentHex }}
        >
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `rgba(${accentRgb},0.3)`, borderTopColor: accentHex }}
          />
          Authorizing…
        </div>
      )}

      {/* Biometric / other extras */}
      {extra && !disabled && (
        <div className="mt-4 w-full relative z-10">
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-[10px] text-[#64748B] uppercase tracking-widest font-bold">
              or
            </span>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>
          {extra}
        </div>
      )}
    </div>
  )
}

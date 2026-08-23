'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Fingerprint, ScanFace } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import confetti from 'canvas-confetti'

// Apple-style biometric success moment: a glowing fingerprint rings in, then
// snaps into a filled gradient circle with a drawing checkmark + confetti.
// Used after a passkey approve / enroll succeeds so the win feels tactile.

export default function BiometricSuccessOverlay({
  show,
  title = 'Approved',
  subtitle = 'Let’s go!',
  mode = 'fingerprint',
}: {
  show: boolean
  title?: string
  subtitle?: string
  mode?: 'fingerprint' | 'face'
}) {
  const { variant } = useTheme()
  const isGold = variant === 'gold'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'
  const accentBright = isGold ? '#FFD966' : '#D8FF6E'
  const fired = useRef(false)

  useEffect(() => {
    if (!show || fired.current) return
    fired.current = true
    const t = setTimeout(() => {
      const colors = isGold ? ['#FFD700', '#D4A017', '#ffffff'] : ['#C8F050', '#B5E23D', '#ffffff']
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 34,
        origin: { y: 0.55 },
        colors,
        disableForReducedMotion: true,
      })
    }, 420)
    const reset = setTimeout(() => { fired.current = false }, 2200)
    return () => { clearTimeout(t); clearTimeout(reset) }
  }, [show, isGold])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center liquid-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex flex-col items-center gap-5 px-8 text-center"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 260 }}
          >
            <div className="relative w-28 h-28 flex items-center justify-center">
              {/* expanding halo rings */}
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ border: `2px solid ${accentBright}55` }}
                initial={{ scale: 0.5, opacity: 0.9 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ border: `1.5px solid ${accentHex}66` }}
                initial={{ scale: 0.5, opacity: 0.9 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
              />

              {/* scanning fingerprint icon (phase 1) */}
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: 0, scale: 1.25 }}
                transition={{ duration: 0.35, delay: 0.45 }}
              >
                {mode === 'face' ? (
                  <ScanFace className="w-14 h-14" style={{ color: accentHex }} strokeWidth={1.6} />
                ) : (
                  <Fingerprint className="w-14 h-14" style={{ color: accentHex }} strokeWidth={1.6} />
                )}
              </motion.div>

              {/* filled gradient circle + drawing checkmark (phase 2) */}
              <motion.div
                className="absolute inset-0 rounded-full flex items-center justify-center shadow-2xl"
                style={{
                  background: `conic-gradient(from 180deg, ${accentHex}, ${accentBright}, ${accentHex})`,
                  boxShadow: `0 0 40px ${accentHex}66`,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 320, delay: 0.45 }}
              >
                <motion.span
                  className="w-3/5 h-3/5 rounded-full"
                  style={{ background: '#020203', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                />
                <svg viewBox="0 0 52 52" className="absolute w-3/5 h-3/5" fill="none">
                  <motion.path
                    d="M14 27 L23 36 L39 17"
                    stroke={accentBright}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: 0.55 }}
                  />
                </svg>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.3 }}
            >
              <p className="text-2xl font-extrabold text-white tracking-tight">{title}</p>
              <p className="text-sm text-[#94A3B8] mt-1">{subtitle}</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
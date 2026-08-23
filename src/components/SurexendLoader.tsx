'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'

interface SurexendLoaderProps {
  variant?: 'gold' | 'lemon'
  duration?: number
  onLoadingComplete?: () => void
  isLoading?: boolean
  fullScreen?: boolean
}

export default function SurexendLoader({
  variant: propVariant,
  duration = 3200,
  onLoadingComplete,
  isLoading = true,
  fullScreen = true,
}: SurexendLoaderProps) {
  const { variant: contextVariant } = useTheme()
  const activeVariant = propVariant || contextVariant || 'lemon'
  const isGold = activeVariant === 'gold'
  const [visible, setVisible] = useState(true)

  const t = useMemo(() => {
    return isGold
      ? {
          accent: '#D4A017',
          accentLight: '#FFD700',
          accentRgb: '212, 160, 23',
          logoSrc: '/logo-mark-gold.png',
          // Intense multi-layered metallic gold glow aura
          iconFilter: 'brightness(1.2) drop-shadow(0 0 20px rgba(252, 211, 77, 0.9)) drop-shadow(0 0 45px rgba(212, 160, 23, 0.7)) drop-shadow(0 0 70px rgba(255, 215, 0, 0.4))',
          meshA: 'rgba(212, 160, 23, 0.05)',
          meshB: 'rgba(255, 215, 0, 0.03)',
        }
      : {
          accent: '#B5E23D',
          accentLight: '#D4FF4A',
          accentRgb: '181, 226, 61',
          logoSrc: '/logo-mark-plain.png',
          // Turn black mark → electric lemon
          iconFilter: 'invert(1) sepia(0.5) saturate(6) hue-rotate(30deg) brightness(1.1) drop-shadow(0 0 16px rgba(181, 226, 61, 0.5))',
          meshA: 'rgba(181, 226, 61, 0.05)',
          meshB: 'rgba(212, 255, 74, 0.03)',
        }
  }, [isGold])

  useEffect(() => {
    if (!isLoading) {
      setVisible(false)
      onLoadingComplete?.()
      return
    }
    const timer = setTimeout(() => {
      setVisible(false)
      onLoadingComplete?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [isLoading, duration, onLoadingComplete])

  const content = (
    <motion.div
      className="relative flex flex-col items-center justify-center select-none -translate-y-4 px-4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.4 } }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Soft Radial Aura behind logo ── */}
      <motion.div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: 280,
          height: 280,
          background: `radial-gradient(circle, rgba(${t.accentRgb}, 0.18) 0%, transparent 70%)`,
          filter: 'blur(50px)',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
          scale: [0.95, 1.1, 0.95],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* ── Official Standalone Logo Mark ── */}
      <motion.div
        className="relative z-10 mb-6 flex items-center justify-center"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.img
          src={t.logoSrc}
          alt="SureXend"
          draggable={false}
          className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
          style={{
            filter: t.iconFilter,
            userSelect: 'none',
          }}
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* ── Wordmark ── */}
      <motion.div
        className="relative z-10 flex items-baseline gap-0.5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <span
          className="font-inter font-extrabold tracking-[0.25em]"
          style={{
            fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
            color: 'rgba(255, 255, 255, 0.95)',
          }}
        >
          SURE
        </span>
        <span
          className="font-inter font-extrabold tracking-[0.25em]"
          style={{
            fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
            color: t.accentLight,
            textShadow: `0 0 20px rgba(${t.accentRgb}, 0.6)`,
          }}
        >
          X
        </span>
        <span
          className="font-inter font-extrabold tracking-[0.25em]"
          style={{
            fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
            color: 'rgba(255, 255, 255, 0.95)',
          }}
        >
          END
        </span>
      </motion.div>
    </motion.div>
  )

  if (!fullScreen) return content

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#000000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* ── Ambient gradient orb 1 ── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: '80vmax',
              height: '80vmax',
              borderRadius: '50%',
              background: `radial-gradient(circle at 40% 40%, ${t.meshA}, transparent 60%)`,
              filter: 'blur(80px)',
              top: '-20%',
              left: '-15%',
            }}
            animate={{
              x: [0, 40, -20, 0],
              y: [0, -30, 15, 0],
            }}
            transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* ── Ambient gradient orb 2 ── */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: '70vmax',
              height: '70vmax',
              borderRadius: '50%',
              background: `radial-gradient(circle at 60% 60%, ${t.meshB}, transparent 55%)`,
              filter: 'blur(60px)',
              bottom: '-20%',
              right: '-10%',
            }}
            animate={{
              x: [0, -30, 20, 0],
              y: [0, 20, -25, 0],
            }}
            transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
          />

          {/* ── Centered Content ── */}
          <div className="relative z-10 flex items-center justify-center w-full h-full">
            {content}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

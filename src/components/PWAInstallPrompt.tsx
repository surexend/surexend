'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/context/ThemeContext'
import { Download, X, Smartphone } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const { variant, colors } = useTheme()
  const isGold = variant === 'gold'
  const accentRgb = isGold ? '212, 160, 23' : '181, 226, 61'
  const accentHex = isGold ? '#D4A017' : '#B5E23D'

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // iOS detection
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    setIsIOS(ios)

    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show after 15 seconds — don't interrupt immediately
      setTimeout(() => setShowPrompt(true), 15000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // iOS: show manual install instructions after delay
    if (ios && !sessionStorage.getItem('pwa_prompt_seen')) {
      setTimeout(() => setShowPrompt(true), 20000)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    }
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    sessionStorage.setItem('pwa_prompt_seen', '1')
  }

  if (isInstalled || !showPrompt) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-24 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:w-80"
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.9 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <div
          className="rounded-2xl p-4 relative overflow-hidden"
          style={{
            background: '#121419',
            border: `1px solid rgba(${accentRgb}, 0.3)`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(${accentRgb}, 0.1)`,
          }}
        >
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-[#64748B] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 p-2 border border-white/20 shadow-md"
              style={{ background: colors.gradientBg }}
            >
              <img
                src={variant === 'gold' ? '/logo-mark-gold.png' : '/logo-mark-plain.png'}
                alt="SureXend"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="font-semibold text-white text-sm mb-1">Install SureXend</p>
              {isIOS ? (
                <p className="text-[#94A3B8] text-xs leading-relaxed">
                  Tap <strong style={{ color: accentHex }}>Share</strong> then <strong style={{ color: accentHex }}>&ldquo;Add to Home Screen&rdquo;</strong> for the full app experience.
                </p>
              ) : (
                <p className="text-[#94A3B8] text-xs leading-relaxed">
                  Add SureXend to your home screen for instant access — no download required.
                </p>
              )}
            </div>
          </div>

          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-4 w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-black"
              style={{ background: colors.gradientBg }}
            >
              <Download size={16} />
              Install App
            </button>
          )}

          {isIOS && (
            <div
              className="mt-3 p-3 rounded-xl text-xs flex items-start gap-2"
              style={{ background: `rgba(${accentRgb}, 0.1)` }}
            >
              <Smartphone size={14} style={{ color: accentHex, flexShrink: 0, marginTop: 1 }} />
              <span className="text-[#94A3B8]">
                iOS: Safari → Share icon → Add to Home Screen
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

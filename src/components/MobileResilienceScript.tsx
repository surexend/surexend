'use client'

/**
 * Mobile Resilience Script
 * ========================
 * Injected into <body> as early as possible.
 * Prevents the "white screen of death" on mobile PWAs by:
 *  1. Detecting asset load failures and auto-reloading
 *  2. Monitoring for JS errors that leave blank screens
 *  3. Service Worker update detection with graceful refresh
 *  4. Connection status monitoring with degraded mode banner
 *  5. iOS Safari PWA quirk handling
 */

import { useEffect } from 'react'

export default function MobileResilienceScript() {
  useEffect(() => {
    // ── 1. Asset failure detection ──────────────────────────────────────
    let assetFailCount = 0
    const MAX_ASSET_FAILS = 3

    const handleResourceError = (e: Event) => {
      const target = e.target as HTMLElement
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'script' || tag === 'link' || tag === 'img') {
        assetFailCount++
        console.warn('[SureXend] Asset failed to load:', (target as any).src || (target as any).href)
        if (assetFailCount >= MAX_ASSET_FAILS) {
          console.warn('[SureXend] Multiple asset failures — scheduling reload')
          setTimeout(() => {
            // Only reload if page is blank (no meaningful content rendered)
            const hasContent = document.querySelector('[data-page-loaded]')
            if (!hasContent) {
              window.location.reload()
            }
          }, 2000)
        }
      }
    }

    window.addEventListener('error', handleResourceError, true)

    // ── 2. Blank screen watchdog ────────────────────────────────────────
    // If body is still empty after 8 seconds, reload
    const blankWatchdog = setTimeout(() => {
      const body = document.body
      const hasContent = body.children.length > 1 ||
        body.textContent?.trim().length > 50
      if (!hasContent) {
        console.warn('[SureXend] Blank screen detected — reloading')
        window.location.reload()
      }
    }, 8000)

    // ── 3. Service Worker update detection ─────────────────────────────
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // New SW activated — reload for fresh assets (only once)
        if (!sessionStorage.getItem('sw_reloaded')) {
          sessionStorage.setItem('sw_reloaded', '1')
          window.location.reload()
        }
      })
    }

    // ── 4. Online/Offline status ────────────────────────────────────────
    const offlineBanner = document.createElement('div')
    offlineBanner.id = 'surexend-offline-banner'
    offlineBanner.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #F59E0B;
      color: #000;
      text-align: center;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      z-index: 99999;
      display: none;
    `
    offlineBanner.textContent = '⚡ You\'re offline — some features may be limited'
    document.body.prepend(offlineBanner)

    // display:none keeps the layer out of the compositor entirely while
    // online — a permanent transformed fixed layer (translateY(-100%)) was
    // forcing tile compositing against scrolling content on Android GPUs.
    const showOffline = () => { offlineBanner.style.display = 'block' }
    const showOnline = () => { offlineBanner.style.display = 'none' }

    window.addEventListener('offline', showOffline)
    window.addEventListener('online', showOnline)
    if (!navigator.onLine) showOffline()

    // ── 5. iOS Safari PWA home screen quirks ───────────────────────────
    // Fix: iOS PWA sometimes shows address bar on scroll — prevent it
    const isIOSPWA = (window.navigator as any).standalone === true
    if (isIOSPWA) {
      document.documentElement.dataset.standalone = 'ios'
    }

    // ── 6. Prevent double-tap zoom on iOS (causes layout jumps) ────────

    // ── 7. Preload critical fonts to avoid FOIT ─────────────────────────
    const fonts = [
      { family: 'Inter', weight: '400' },
      { family: 'Inter', weight: '700' },
      { family: 'DM Sans', weight: '400' },
    ]
    fonts.forEach(({ family, weight }) => {
      document.fonts.load(`${weight} 16px "${family}"`).catch(() => {
        // Font failed to load — system font fallback handles it gracefully
      })
    })

    return () => {
      clearTimeout(blankWatchdog)
      window.removeEventListener('error', handleResourceError, true)
      window.removeEventListener('offline', showOffline)
      window.removeEventListener('online', showOnline)
      if (isIOSPWA) delete document.documentElement.dataset.standalone
    }
  }, [])

  return null // No UI — pure side effect
}

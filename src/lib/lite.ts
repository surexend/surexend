'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'surexend_lite_mode'

const SLOW_TYPES = ['slow-2g', '2g', '3g']

export function getLitePreference(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'on') return true
    if (v === 'off') return false
  } catch {}
  return null
}

export function isSlowConnection(): boolean {
  try {
    const conn = (navigator as any).connection
    if (conn?.effectiveType) return SLOW_TYPES.includes(conn.effectiveType)
  } catch {}
  return false
}

export function applyLiteClass(enabled: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('lite-mode', enabled)
}

export function setLitePreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {}
  applyLiteClass(enabled)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('surexend:lite', { detail: enabled }))
  }
}

export function useLite(): { lite: boolean; toggle: () => void } {
  const [lite, setLite] = useState(false)
  const liteRef = useRef(lite)
  liteRef.current = lite

  useEffect(() => {
    const pref = getLitePreference()
    const initial = pref !== null ? pref : isSlowConnection()
    setLite(initial)
    applyLiteClass(initial)
  }, [])

  useEffect(() => {
    const onLite = (e: Event) => setLite((e as CustomEvent).detail)
    window.addEventListener('surexend:lite', onLite)
    return () => window.removeEventListener('surexend:lite', onLite)
  }, [])

  const toggle = useCallback(() => {
    setLitePreference(!liteRef.current)
  }, [])

  return { lite, toggle }
}

/**
 * SureXend theme context: brand accent plus accessible light/dark appearance.
 */
'use client'

import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react'

export type ThemeVariant = 'gold' | 'lemon'
export type ColorMode = 'light' | 'dark'
export type ColorPreference = ColorMode | 'system'

interface ThemeContextValue {
  variant: ThemeVariant
  colorMode: ColorMode
  colorPreference: ColorPreference
  setColorPreference: (preference: ColorPreference) => void
  toggleColorMode: () => void
  colors: {
    primary: string
    light: string
    dark: string
    glow: string
    glowRgb: string
    accent: string
    iconBorder: string
    gradientBg: string
    heroRadial: string
    cardBorder: string
    shadowGlow: string
    shadowGlowSm: string
    particleColor: string
    shimmerColor: string
  }
}

const COLOR_MODE_STORAGE_KEY = 'surexend_color_mode'

const GOLD_COLORS: ThemeContextValue['colors'] = {
  primary: '#D4A017',
  light: '#FFD700',
  dark: '#A07810',
  glow: '#FFE066',
  glowRgb: '212, 160, 23',
  accent: '#C8960C',
  iconBorder: 'rgba(212, 160, 23, 0.4)',
  gradientBg: 'radial-gradient(ellipse at center, #E8B820 0%, #C49015 40%, #A07810 100%)',
  heroRadial: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,160,23,0.25), transparent)',
  cardBorder: 'rgba(212, 160, 23, 0.2)',
  shadowGlow: '0 0 40px rgba(212,160,23,0.5), 0 0 80px rgba(212,160,23,0.2)',
  shadowGlowSm: '0 0 20px rgba(212,160,23,0.6)',
  particleColor: '#FFD700',
  shimmerColor: 'rgba(255, 215, 0, 0.3)',
}

const LEMON_COLORS: ThemeContextValue['colors'] = {
  primary: '#B5E23D',
  light: '#D4FF4A',
  dark: '#8AB52A',
  glow: '#CAFF3A',
  glowRgb: '181, 226, 61',
  accent: '#FFFFFF',
  iconBorder: 'rgba(181, 226, 61, 0.4)',
  gradientBg: 'radial-gradient(ellipse at center, #C8F050 0%, #B0D830 40%, #90B820 100%)',
  heroRadial: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(181,226,61,0.25), transparent)',
  cardBorder: 'rgba(181, 226, 61, 0.2)',
  shadowGlow: '0 0 40px rgba(181,226,61,0.5), 0 0 80px rgba(181,226,61,0.2)',
  shadowGlowSm: '0 0 20px rgba(181,226,61,0.6)',
  particleColor: '#D4FF4A',
  shimmerColor: 'rgba(212, 255, 74, 0.3)',
}

const defaultTheme: ThemeContextValue = {
  variant: 'gold',
  colorMode: 'dark',
  colorPreference: 'system',
  setColorPreference: () => undefined,
  toggleColorMode: () => undefined,
  colors: GOLD_COLORS,
}

const ThemeContext = createContext<ThemeContextValue>(defaultTheme)

function resolveColorMode(preference: ColorPreference): ColorMode {
  if (preference === 'light' || preference === 'dark') return preference
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readPreference(): ColorPreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const value = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {}
  return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [variant] = useState<ThemeVariant>(() => process.env.NEXT_PUBLIC_BRAND_VARIANT === 'lemon' ? 'lemon' : 'gold')
  const [colorPreference, setPreference] = useState<ColorPreference>('system')
  const [colorMode, setColorMode] = useState<ColorMode>('dark')

  const setColorPreference = useCallback((preference: ColorPreference) => {
    setPreference(preference)
    setColorMode(resolveColorMode(preference))
    try { localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference) } catch {}
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorPreference(colorMode === 'dark' ? 'light' : 'dark')
  }, [colorMode, setColorPreference])

  useEffect(() => {
    const preference = readPreference()
    setPreference(preference)
    setColorMode(resolveColorMode(preference))
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (colorPreference === 'system') setColorMode(media.matches ? 'light' : 'dark')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [colorPreference])

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode
    document.documentElement.style.colorScheme = colorMode
  }, [colorMode])

  const colors = variant === 'lemon' ? LEMON_COLORS : GOLD_COLORS
  const value = useMemo(() => ({ variant, colorMode, colorPreference, setColorPreference, toggleColorMode, colors }), [variant, colorMode, colorPreference, setColorPreference, toggleColorMode, colors])

  return <ThemeContext.Provider value={value}><div data-variant={variant}>{children}</div></ThemeContext.Provider>
}

export const useTheme = () => React.useContext(ThemeContext)

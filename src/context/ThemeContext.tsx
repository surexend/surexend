/**
 * SureXend Theme Context
 * Provides the single SureXend Gold brand palette globally.
 */
'use client'

import React, { createContext, useContext, useState } from 'react'

export type ThemeVariant = 'gold' | 'lemon'

interface ThemeContextValue {
  variant: ThemeVariant
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

const ThemeContext = createContext<ThemeContextValue>({
  variant: 'gold',
  colors: GOLD_COLORS,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Brand is locked to Gold — one accent, spent surgically. No runtime switching.
  const [variant] = useState<ThemeVariant>('gold')

  const colors = GOLD_COLORS

  return (
    <ThemeContext.Provider value={{ variant, colors }}>
      <div data-variant={variant}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

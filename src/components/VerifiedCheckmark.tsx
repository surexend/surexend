'use client'

import React from 'react'
import { useTheme } from '@/context/ThemeContext'

interface VerifiedCheckmarkProps {
  size?: number
  className?: string
  variant?: 'gold' | 'lemon' | 'black'
}

export default function VerifiedCheckmark({ size = 18, className = '', variant }: VerifiedCheckmarkProps) {
  const { variant: themeVariant, colors } = useTheme()
  const currentVariant = variant || themeVariant
  const isGold = currentVariant === 'gold'
  const isBlack = currentVariant === 'black'

  // Black tick (default membership) vs gold/lemon rosette (top-5 leaders)
  const badgeColor = isBlack ? '#020203' : (isGold ? '#D4A017' : '#B5E23D')
  const checkColor = isBlack ? '#FFFFFF' : '#020203'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block flex-shrink-0 align-middle ${className}`}
      role="img"
      aria-label="Verified User"
    >
      {/* Twitter / X style 12-point scalloped rosette shape */}
      <path
        d="M22.5 12.5C22.5 10.9 21.6 9.5 20.2 8.8C20.6 7.2 20.1 5.5 18.9 4.3C17.7 3.1 16 2.6 14.4 3C13.7 1.6 12.3 0.7 10.7 0.7C9.1 0.7 7.7 1.6 7 3C5.4 2.6 3.7 3.1 2.5 4.3C1.3 5.5 0.8 7.2 1.2 8.8C-0.2 9.5 -0.7 10.9 -0.7 12.5C-0.7 14.1 0.2 15.5 1.6 16.2C1.2 17.8 1.7 19.5 2.9 20.7C4.1 21.9 5.8 22.4 7.4 22C8.1 23.4 9.5 24.3 11.1 24.3C12.7 24.3 14.1 23.4 14.8 22C16.4 22.4 18.1 21.9 19.3 20.7C20.5 19.5 21 17.8 20.6 16.2C22 15.5 22.5 14.1 22.5 12.5Z"
        fill={badgeColor}
        transform="translate(0.6, -0.6) scale(0.95)"
      />
      {/* Checkmark tick */}
      <path
        d="M9.8 15.2L6.3 11.7L7.7 10.3L9.8 12.4L15.3 6.9L16.7 8.3L9.8 15.2Z"
        fill={checkColor}
        transform="translate(0.6, -0.6) scale(0.95)"
      />
    </svg>
  )
}

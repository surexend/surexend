'use client'

import { Toaster } from 'react-hot-toast'

const baseStyle = {
  background: 'rgba(24, 26, 32, 0.82)',
  color: '#F8FAFC',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '16px',
  padding: '13px 15px',
  maxWidth: 'min(92vw, 420px)',
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: 1.4,
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
  boxShadow: '0 18px 55px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
}

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 14, left: 12, right: 12, zIndex: 120 }}
      toastOptions={{
        duration: 4200,
        style: baseStyle,
        success: {
          duration: 3400,
          style: { ...baseStyle, border: '1px solid rgba(52,211,153,0.28)' },
          iconTheme: { primary: '#34D399', secondary: '#071A12' },
        },
        error: {
          duration: 5200,
          style: { ...baseStyle, border: '1px solid rgba(248,113,113,0.32)' },
          iconTheme: { primary: '#F87171', secondary: '#210A0A' },
        },
        loading: {
          duration: Infinity,
          style: { ...baseStyle, border: '1px solid rgba(96,165,250,0.28)' },
          iconTheme: { primary: '#60A5FA', secondary: '#0A1421' },
        },
      }}
    />
  )
}

import { ImageResponse } from 'next/og'

export const alt = 'SureXend — Your Crypto, Finally Useful in Africa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0B1222 0%, #101A33 55%, #1A2A44 100%)',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            display: 'flex',
          }}
        >
          SURE<span style={{ color: '#E8B820' }}>X</span>END
        </div>
        <div
          style={{
            fontSize: 34,
            color: '#94A3B8',
            marginTop: 20,
            letterSpacing: '0.01em',
          }}
        >
          Your Crypto, Finally Useful in Africa
        </div>
      </div>
    ),
    { ...size }
  )
}
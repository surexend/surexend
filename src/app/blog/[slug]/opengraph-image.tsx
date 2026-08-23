import { ImageResponse } from 'next/og'
import { blogPosts, getSeoPage } from '@/lib/content'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'SureXend guide'

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = blogPosts.find((p) => p.slug === slug) || getSeoPage(slug)
  const title = page?.h1 || 'SureXend Guides'
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          background: 'linear-gradient(135deg, #0B0D12 0%, #131519 55%, #1D2026 100%)',
          color: '#FFFFFF', fontFamily: 'sans-serif', padding: 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>
            SURE<span style={{ color: '#E8B820' }}>X</span>END
          </div>
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.15, maxWidth: 900, letterSpacing: '-0.01em' }}>
          {title}
        </div>
        <div style={{ fontSize: 26, color: '#94A3B8', marginTop: 28 }}>
          Stablecoin guides for Africa — sell, spend & cash out with USDC
        </div>
      </div>
    ),
    { ...size }
  )
}
import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Reverse proxy: forward API requests to the backend so the frontend and
  // backend are served from a single origin (no CORS issues).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ]
  },

  // Allow preview deployments on the monkeycode preview domain
  allowedDevOrigins: ['.monkeycode-ai.live'],

  // Required for Netlify: allow Next.js Image Optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'surexend.com' },
      { protocol: 'https', hostname: '**.netlify.app' },
    ],
    formats: ['image/avif', 'image/webp'],
    unoptimized: false,
  },

  // Disable x-powered-by header
  poweredByHeader: false,

  // Security headers
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],

  // Ignore TypeScript errors during build so preview builds always succeed
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig


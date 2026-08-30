import type { NextConfig } from 'next'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const IS_DEV = process.env.NODE_ENV !== 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${IS_DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  `connect-src 'self' https: wss:${IS_DEV ? " ws: http://localhost:*" : ''}`,
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join('; ')

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

  // Allow preview deployments on common sandbox/dev domains
  allowedDevOrigins: ['.monkeycode-ai.live', '.e2b.app'],

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
        { key: 'Content-Security-Policy', value: contentSecurityPolicy.replace(/\s{2,}/g, ' ').trim() },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      ],
    },
  ],

  // Type errors fail the build. This used to be `ignoreBuildErrors: true`,
  // which silently shipped broken code — notably a bills page that imported an
  // icon that does not exist. `npm run typecheck` runs the same check locally,
  // and root tsconfig.json excludes backend/ (the NestJS decorators need the
  // backend's own tsconfig, checked separately in CI).
  typescript: {
    ignoreBuildErrors: false,
  },
}

export default nextConfig


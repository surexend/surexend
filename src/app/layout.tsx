import type { Metadata, Viewport } from 'next'
import { Inter, DM_Sans } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'
import { ThemeProvider } from '@/context/ThemeContext'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import MobileResilienceScript from '@/components/MobileResilienceScript'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  display: 'swap',
})

const BRAND_VARIANT = process.env.NEXT_PUBLIC_BRAND_VARIANT || 'gold'

export const metadata: Metadata = {
  title: {
    default: 'SureXend — USDC to Naira, Airtime, Bills & Bank Withdrawals in Africa',
    absolute: 'SureXend — Your Crypto, Finally Useful in Africa',
  },
  description: 'The stablecoin spending platform for Africa. Convert USDC to naira at a live rate, buy MTN & Airtel airtime with crypto, pay electricity and DSTV bills, and withdraw to any bank — all from one secure wallet.',
  keywords: ['crypto africa', 'USDC nigeria', 'USDC to naira', 'sell USDC for naira', 'buy airtime with crypto', 'pay bills with crypto', 'stablecoin', 'send money africa', 'crypto to bank', 'crypto to naira', 'send money to nigeria', 'surexend'],
  authors: [{ name: 'SureXend' }],
  creator: 'SureXend',
  publisher: 'SureXend',
  alternates: {
    canonical: 'https://surexend.com',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large', 'max-video-preview': -1 },
  },
  metadataBase: new URL('https://surexend.com'),
  openGraph: {
    title: 'SureXend — Your Crypto, Finally Useful in Africa',
    description: 'Convert USDC to naira, buy airtime with crypto, pay bills and withdraw to any African bank account.',
    url: 'https://surexend.com',
    siteName: 'SureXend',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SureXend — Your Crypto, Finally Useful in Africa',
    description: 'Africa\'s stablecoin spending platform.',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SureXend',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: BRAND_VARIANT === 'lemon' ? '#B5E23D' : '#D4A017',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <head>
        {/* Lite mode — applied before paint to avoid a flash and to auto-detect slow connections */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=localStorage.getItem('surexend_lite_mode');var slow=['slow-2g','2g','3g'].indexOf((navigator.connection&&navigator.connection.effectiveType)||'')>-1;if(v==='on'||(v===null&&slow))document.documentElement.classList.add('lite-mode');}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* PWA meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SureXend" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Splash screens for iOS */}
        <link rel="apple-touch-startup-image" href="/splash/splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px)" />
        <link rel="apple-touch-startup-image" href="/splash/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px)" />
        {/* Structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://surexend.com#organization',
                  name: 'SureXend',
                  url: 'https://surexend.com',
                  logo: 'https://surexend.com/logo-mark-gold.png',
                  description: "Africa's stablecoin spending platform. Convert USDC to local currency, buy airtime, pay bills and withdraw to banks across the continent.",
                  email: 'support@surexend.com',
                  sameAs: [
                    'https://x.com/surexend',
                    'https://www.linkedin.com/company/surexend',
                    'https://www.facebook.com/surexend',
                  ],
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://surexend.com#website',
                  name: 'SureXend',
                  url: 'https://surexend.com',
                  description: 'Buy airtime with crypto, sell USDC for naira, pay bills with crypto, and send money across Africa using USDC.',
                  publisher: { '@id': 'https://surexend.com#organization' },
                },
                {
                  '@type': 'SoftwareApplication',
                  name: 'SureXend',
                  applicationCategory: 'FinanceApplication',
                  operatingSystem: 'Android, iOS, Web',
                  url: 'https://surexend.com',
                  description:
                    'Send money, convert USDC to local currency, pay bills and withdraw to banks across Africa.',
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                  featureList: [
                    'USDC wallet',
                    'Live currency conversion',
                    'Airtime & bill payments',
                    'Bank & mobile-money withdrawal',
                    'Biometric & 2FA security',
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="bg-[#000000] text-white font-dm antialiased">
        {/* Anti-white-screen-of-death mobile resilience */}
        <MobileResilienceScript />
        <ThemeProvider>
          {children}
          <PWAInstallPrompt />
          <Toaster position="top-center" toastOptions={{ style: { background: '#121419', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
        </ThemeProvider>
      </body>
    </html>
  )
}

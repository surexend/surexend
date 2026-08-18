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
  title: 'SureXend — Your Crypto, Finally Useful in Africa',
  description: 'Send money, pay bills, buy airtime, and withdraw to any African bank account using USDC. Africa\'s premier stablecoin spending platform.',
  keywords: ['crypto africa', 'USDC nigeria', 'stablecoin', 'send money africa', 'crypto to bank', 'airtime crypto', 'buy airtime with crypto', 'sell USDC for naira', 'pay bills with crypto', 'crypto to naira', 'surexend'],
  authors: [{ name: 'SureXend' }],
  creator: 'SureXend',
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
    description: 'Send money, pay bills, buy airtime, and withdraw to any African bank account using USDC.',
    url: 'https://surexend.com',
    siteName: 'SureXend',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SureXend — Your Crypto, Finally Useful in Africa',
    description: 'Africa\'s premier stablecoin spending platform.',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SureXend',
  },
  icons: {
    icon: '/logo-mark-gold.png',
    shortcut: '/logo-mark-gold.png',
    apple: '/logo-mark-gold.png',
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
                  name: 'SureXend',
                  url: 'https://surexend.com',
                  logo: 'https://surexend.com/logo-mark-gold.png',
                  description: "Africa's premier stablecoin spending platform. Send money, pay bills, buy airtime, and withdraw to any African bank account using USDC.",
                },
                {
                  '@type': 'WebSite',
                  name: 'SureXend',
                  url: 'https://surexend.com',
                  description: 'Buy airtime with crypto, sell USDC for naira, pay bills with crypto, and send money across Africa using USDC.',
                },
              ],
            }),
          }}
        />
      </head>
      <body className="bg-[#060A15] text-white font-dm antialiased">
        {/* Anti-white-screen-of-death mobile resilience */}
        <MobileResilienceScript />
        <ThemeProvider>
          {children}
          <PWAInstallPrompt />
          <Toaster position="top-center" toastOptions={{ style: { background: '#0F1629', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
        </ThemeProvider>
      </body>
    </html>
  )
}

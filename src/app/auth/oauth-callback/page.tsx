'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authAPI } from '@/lib/api'

function OAuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const hashParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
      : new URLSearchParams()

    const accessToken = hashParams.get('accessToken') || searchParams.get('accessToken')
    const refreshToken = hashParams.get('refreshToken') || searchParams.get('refreshToken')
    const error = hashParams.get('error') || searchParams.get('error')

    const stripSensitiveUrl = () => {
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/auth/oauth-callback')
      }
    }

    if (error) {
      stripSensitiveUrl()
      router.replace(`/auth/login?error=${encodeURIComponent(error)}`)
      return
    }
    if (!accessToken) {
      stripSensitiveUrl()
      router.replace('/auth/login?error=Google%20sign-in%20failed')
      return
    }

    authAPI.storeOAuthTokens(accessToken, refreshToken || undefined)
    stripSensitiveUrl()
    router.replace('/app/dashboard')
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-sm text-[#94A3B8]">Completing sign-in…</p>
      </div>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#000000] text-white">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <OAuthCallback />
    </Suspense>
  )
}
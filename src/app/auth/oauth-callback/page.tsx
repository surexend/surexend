'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function OAuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    // OAuth credentials are set by the backend as HttpOnly cookies before it
    // redirects here. They must never arrive in a fragment/query string.
    const error = searchParams.get('error')
    if (error) {
      router.replace('/auth/login?error=Google%20sign-in%20failed')
      return
    }
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
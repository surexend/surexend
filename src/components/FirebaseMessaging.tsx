'use client'

import { useEffect } from 'react'
import { userAPI } from '@/lib/api'
import { initFirebase } from '@/lib/firebase'

export default function FirebaseMessaging() {
  useEffect(() => {
    let mounted = true

    const setup = async () => {
      try {
        const profile = await userAPI.getProfile()
        if (!profile?.id || !mounted) return

        const messaging = await initFirebase()
        if (!messaging || !mounted) return

        const perm = await Notification.requestPermission()
        if (perm !== 'granted' || !mounted) return

        const { getToken } = await import('firebase/messaging')
        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
        })
        if (!token || !mounted) return

        await fetch('/api/user/fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token })
        })

        await fetch('/api/user/fcm-topic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ topic: `user-${profile.id}` })
        })
      } catch {
        // silent fail — notifications are best-effort
      }
    }

    setup()

    return () => { mounted = false }
  }, [])

  return null
}
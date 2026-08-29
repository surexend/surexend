import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!
}

let messagingInstance: ReturnType<typeof getMessaging> | null = null
let initPromise: Promise<ReturnType<typeof getMessaging> | null> | null = null

export const initFirebase = async () => {
  if (messagingInstance) return messagingInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const app = getApps()[0] || initializeApp(firebaseConfig)
      const supported = await isSupported()
      if (supported) {
        messagingInstance = getMessaging(app)
        // Register service worker for background push notifications (system-level)
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {})
        }
        return messagingInstance
      }
      return null
    } catch {
      return null
    }
  })()

  return initPromise
}

export const getMessagingInstance = () => messagingInstance
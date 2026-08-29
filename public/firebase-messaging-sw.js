importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

const firebaseConfig = {
  apiKey: "AIzaSyAWhXWb37ELRkZHTuepLxr3Vjx1zKwh52k",
  authDomain: "surexend-55f85.firebaseapp.com",
  projectId: "surexend-55f85",
  storageBucket: "surexend-55f85.firebasestorage.app",
  messagingSenderId: "625068317200",
  appId: "1:625068317200:web:4c5d6b3f6f45bc2bb70895"
}

const app = firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'SureXend'
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new notification',
    icon: '/logo-mark-plain.png',
    badge: '/logo-mark-plain.png',
    data: payload.data || {},
    tag: `surexend-${Date.now()}`,
  }
  self.registration.showNotification(notificationTitle, notificationOptions)
})

self.addEventListener('activate', () => self.clients.claim())
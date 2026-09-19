const CACHE_NAME = 'surexend-v56'
const OFFLINE_URL = '/offline.html'
const NON_CACHEABLE_PREFIXES = ['/app', '/admin', '/auth', '/api']

function isNonCacheablePath(pathname) {
  return NON_CACHEABLE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

async function clearPrivateCacheEntries() {
  const cacheNames = await caches.keys()
  await Promise.all(cacheNames.map(async (cacheName) => {
    const cache = await caches.open(cacheName)
    const requests = await cache.keys()
    await Promise.all(requests.map((request) => {
      try {
        return isNonCacheablePath(new URL(request.url).pathname) ? cache.delete(request) : undefined
      } catch {
        return undefined
      }
    }))
  }))
}

// Assets to cache immediately on install. Each is added individually so a
// single missing file can never break the whole install.
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      )
    }).then(() => self.skipWaiting())
  )
})

// ── Activate ─────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

// A logout asks the active worker to remove any private entries left by an
// older worker version. Cache v55 plus activation handles clients that update
// after the logout.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_PRIVATE_CACHE') return
  event.waitUntil(clearPrivateCacheEntries().catch(() => {}))
})

// ── Fetch (network-first pages, stale-while-revalidate assets) ───────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle HTTP/HTTPS requests from our own origin.
  // Prevents unsupported scheme errors (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return
  if (url.origin !== self.location.origin) return

  // Skip non-GET requests and API calls
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return

  // Never cache authenticated or auth pages. Apart from making logout more
  // predictable, this prevents one account's private app shell from being
  // served to another account when a PWA is offline or an upstream request
  // fails. The old cache namespace is removed during activation below.
  if (request.mode === 'navigate' && isNonCacheablePath(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // Public navigation requests — serve fresh content, with the public offline
  // page as a fallback. Only successful responses are cached.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone)).catch(() => {})
          }
          return response
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        })
    )
    return
  }

  // Static assets — Stale-While-Revalidate
  // Clone synchronously inside the promise before the response body is streamed to the client!
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone)).catch(() => {})
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(response => {
            if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
              const responseClone = response.clone()
              cache.put(request, responseClone).catch(() => {})
            }
            return response
          }).catch(() => null)
          return cached || networkFetch
        })
      })
    )
    return
  }
})

// ── Push notifications ───────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const { title = 'SureXend', body = 'You have a new notification', icon = '/icons/icon-192.png', url = '/' } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/badge-96.png',
      data: { url },
      vibrate: [100, 50, 100],
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})


// POS service worker — deploy-resilient, offline-capable.
// Cache names are versioned; bump the suffix to force a clean purge.
const STATIC_CACHE = 'pos-static-v3'
const PAGE_CACHE = 'pos-pages-v3'
const API_CACHE = 'pos-api-v3'
const CURRENT_CACHES = [STATIC_CACHE, PAGE_CACHE, API_CACHE]

const OFFLINE_URL = '/pos'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  // Pre-cache only the offline shell. Do NOT pre-cache every route's HTML —
  // stale HTML referencing purged build chunks is what crashes the app.
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Hashed, immutable build assets → cache-first. The URL changes whenever the
  // content changes, so a cached hit is always correct and never goes stale.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
      )
    )
    return
  }

  // API → network-first, fall back to last cached response when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(API_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Page navigations → network-first so the freshest HTML (and matching chunk
  // refs) always wins. Fall back to a cached copy, then the offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    )
    return
  }

  // Everything else → network-first, cache fallback.
  event.respondWith(fetch(request).catch(() => caches.match(request)))
})

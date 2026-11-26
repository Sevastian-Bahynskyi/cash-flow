// Cashflow's service worker (web-pwa skill). Offline reading, designed on purpose:
// - versioned static assets (/_next/static, icons, fonts) cache-first;
// - navigations network-first; offline, the app shell ("/", which holds no data of its own) answers
//   every page, and the app reads the last loaded data from IndexedDB on the device.
// Never cache API or Supabase responses here. Every respondWith path resolves to a real Response:
// a rejected one shows iOS's "FetchEvent.respondWith received an error" instead of the app.
const STATIC = 'cashflow-static-v1'
const SHELL = 'cashflow-shell-v1'

self.addEventListener('install', () => { self.skipWaiting() })

// Only claim open pages; never navigate them from here (it deadlocks Chrome). Old caches go.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![STATIC, SHELL].includes(key)) await caches.delete(key)
    await self.clients.claim()
  })())
})

const offlinePage = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cashflow</title><body style="font:16px system-ui;padding:48px 24px;background:#E9E8E4;color:#17182B"><h1 style="font-weight:500">You’re offline</h1><p>Open Cashflow once while online, and it will open offline too.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok && url.pathname === '/' && !res.redirected) (await caches.open(SHELL)).put('/', res.clone())
        return res
      } catch {
        return (await caches.match('/', { cacheName: SHELL })) || offlinePage()
      }
    })())
    return
  }

  const isStatic = url.pathname.startsWith('/_next/static/') || /\.(png|svg|woff2?)$/.test(url.pathname)
  if (!isStatic) return
  event.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: STATIC })
    if (hit) return hit
    try {
      const res = await fetch(req)
      if (res.ok) (await caches.open(STATIC)).put(req, res.clone())
      return res
    } catch {
      return new Response('', { status: 504 })
    }
  })())
})

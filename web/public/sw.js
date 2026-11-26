// Cashflow's service worker (web-pwa skill). Offline reading, designed on purpose:
// - versioned static assets (/_next/static, icons, fonts) cache-first;
// - navigations network-first; every page's HTML is a client shell with no data of its own (the app
//   reads the last loaded data from IndexedDB), so offline a visited page answers itself, else "/".
// Never cache API or Supabase responses here. Every respondWith path resolves to a real Response:
// a rejected one shows iOS's "FetchEvent.respondWith received an error" instead of the app.
const STATIC = 'cashflow-static-v1'
const SHELL = 'cashflow-shell-v2'

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
        if (res.ok && !res.redirected && !url.pathname.startsWith('/auth/')) {
          try { await (await caches.open(SHELL)).put(url.pathname, res.clone()) } catch { /* storage full or blocked: still serve the page */ }
        }
        return res
      } catch {
        const hit = await caches.match(url.pathname, { cacheName: SHELL }).catch(() => undefined)
        return hit || (await caches.match('/', { cacheName: SHELL }).catch(() => undefined)) || offlinePage()
      }
    })())
    return
  }

  const isStatic = url.pathname.startsWith('/_next/static/') || /\.(png|svg|woff2?)$/.test(url.pathname)
  if (!isStatic) return
  event.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: STATIC }).catch(() => undefined)
    if (hit) return hit
    let res
    try { res = await fetch(req) } catch { return new Response('', { status: 504 }) }
    if (res.ok) {
      try {
        const cache = await caches.open(STATIC)
        await cache.put(req, res.clone())
        // Hashed assets pile up with every deploy: keep the newest 400.
        const keys = await cache.keys()
        for (const k of keys.slice(0, Math.max(0, keys.length - 400))) await cache.delete(k)
      } catch { /* storage full or blocked */ }
    }
    return res
  })())
})

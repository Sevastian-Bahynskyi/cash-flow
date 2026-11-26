---
name: web-pwa
description: How Cashflow's web app installs and runs as a Home Screen PWA, the way the owner's Ordly app does. Use when building or changing the Next.js web app's shell: the web app manifest, service worker, app icons, Apple meta tags, theme colour, safe areas, offline reading, install from iPhone Safari or Chrome, Vercel headers and deploys.
---

# Web app as an installed PWA

Cashflow is moving from Expo to a web-first PWA (`docs/adr/0001-web-first-pwa.md`). The model is Ordly (`/Users/seva/Developer/personal/ordly`), which the owner uses daily from the iPhone Home Screen. Copy its proven shell; do not reinvent it. Read the Ordly file named in each section before writing the Cashflow one.

For Next.js itself, use the host's Next.js and Vercel skills (`vercel:nextjs`, `vercel:react-best-practices`) and the installed `node_modules/next/dist/docs` when present; they beat memory for version-sensitive APIs.

## Stack

- Next.js App Router on Vercel, pnpm, TypeScript strict, same Supabase project through `@supabase/ssr`.
- Default Node.js runtime. No `export const runtime = 'edge'`.
- `pnpm build` is the verification command; it must pass before any claim of done.

## Manifest (`app/manifest.webmanifest/route.ts` in Ordly)

- Served by a plain route handler, not `app/manifest.ts`. Next's convention injects a `<link rel="manifest">` without `crossorigin`; browsers then fetch the manifest without cookies, and behind Vercel Deployment Protection that request is redirected to Vercel's login, so installs never see the real manifest or icons.
- The layout links it by hand: `<link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />`.
- Fields: `id: '/'` (pinned forever, it is the install's identity), `name`, `short_name`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `background_color` and `theme_color` matching the app's ground, icons 192, 512 and a 512 `maskable`.
- Response headers: `Content-Type: application/manifest+json`, `Cache-Control: no-cache`.

## Icons (`lib/app-icon.ts`, `scripts/render-icons.mjs`, `public/` in Ordly)

- One source SVG. A script renders every PNG (180 apple-touch, 192, 512, 1024, maskable 512 with the art at 80% of the tile) at 4× and downsamples. Never hand-export: aliased edges look pixelated on the Home Screen.
- Every icon URL carries `?v=APP_ICON_VERSION`. Bump it after re-rendering; iOS and service workers cache icons by URL.
- Metadata: `icons.icon` (192, 512, svg), `icons.apple` (180), `other: apple-touch-icon-precomposed`. Keep `public/apple-touch-icon.png` and `apple-touch-icon-precomposed.png` at the root too: iOS asks for them directly.
- iOS caches Home Screen icons hard; verifying a new icon may need removing and re-adding the app.

## Apple tags and viewport (`app/layout.tsx` in Ordly)

- `appleWebApp: { capable: true, title, statusBarStyle: 'black-translucent' }`; content under the status bar needs a scrim or top inset.
- Viewport: `width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`, `themeColor` per light/dark (or the picked theme). Use `env(safe-area-inset-*)` for the notch and home indicator.
- Do not copy Ordly's `maximumScale: 1, userScalable: false`: Cashflow keeps zoom for accessibility (`ui-ux` S5). Prevent iOS input zoom with a 16px minimum input font instead.

## Service worker (`public/sw.js`, `components/PwaRegistration.tsx` in Ordly)

- Register `/sw.js` with `{ updateViaCache: 'none' }` after `load`, call `registration.update()` every 60 s, and reload the page once on `controllerchange` only when it already had a controller (a new deploy). Registration failure never blocks the app.
- `install`: `skipWaiting()`. `activate`: `clients.claim()` only. **Never navigate clients from `activate`**: Chrome holds a navigation's fetch until the worker activates, so it deadlocks and freezes the page.
- **No pass-through fetch handler.** `event.respondWith(fetch(event.request))` made the installed iOS app show "FetchEvent.respondWith received an error: TypeError: Load failed" whenever the network failed.
- `vercel.json`: header `Cache-Control: public, max-age=0, must-revalidate` on `/sw.js`.

## Offline-friendly reading (Cashflow goes further than Ordly)

Ordly has no offline cache. Cashflow wants reading offline. Design it on purpose, not as a pass-through:

- Cache only versioned static assets (`/_next/static/*`, fonts, icons) cache-first, and the app shell for navigations network-first with a cached fallback.
- Never cache authenticated HTML or API responses in the service worker. Keep the last loaded data (transactions of the current and last cycle, categories, budgets) in IndexedDB on the client, scoped to the signed-in user and cleared on sign-out.
- Offline, the app shows the cached data with a quiet "Offline, showing what was loaded at 14:02" line. Adding a transaction offline queues it with its typed amount and saves when back online; it is never lost.
- Every fetch handler path has a fallback that returns a real `Response`; a rejected `respondWith` is the iOS failure above.

## Install

- iPhone Safari: Share → Add to Home Screen (Safari 26+: ≡ → Share → View More → Add to Home Screen, with Open as Web App on). Chrome and Android: the install prompt; keep a `beforeinstallprompt` event captured early for a later install button.
- A Home Screen icon added from the simulator over plain `http://localhost` opens in Safari, not standalone. Check the installed app on a real iPhone against a deployed URL.

## Deploy

- `main` is production: `.github/workflows/vercel-deploy.yml` deploys every push to it, and a preview for every PR. Work on a branch, open a PR, merge only when the owner says so.
- After a merge, verify the Vercel status for the exact commit before claiming production success.

# Web-first PWA like Ordly

Cashflow becomes a web app that installs on the Home Screen as a PWA, built the way Ordly is: Next.js App Router on Vercel, a web app manifest served by a route, a small service worker, rendered icons and Apple meta tags. It keeps the same Supabase project and data. No more native builds or store releases.

**Status:** superseded by the owner on 2026-11-27. Cashflow is the native Aura app. The original decision follows for history.

Why this way:

- **The owner already lives in a PWA.** Ordly runs daily from the iPhone Home Screen; its shell (manifest route, service worker, icons, update reload) is proven on that phone, including the iOS gotchas it cost to learn (`web-pwa` skill).
- **One build, every device.** The same app on iPhone, desktop and any browser; a deploy reaches every install within a minute, with no store review or TestFlight.
- **The web export is already the daily path.** Cashflow already deploys an Expo web export to Vercel; React Native Web adds weight and native-shaped compromises a web-first app does not need.
- **Next.js unless a clearly better reason appears.** It matches Ordly, so patterns, fixes and agent knowledge carry over. A different framework needs a shown reason, recorded as a new ADR.
- **The data does not move.** Same Supabase project, same tables and RLS. Schema changes are additive only and tested locally first; no data is rewritten or dropped.

What it costs:

- Native-only features go: Expo notifications, haptics, native date pickers, document and image pickers. Each gets a web equivalent or is listed for the owner before the switch (stage 3 lists every screen and feature first).
- iOS PWA limits: storage can be evicted, push needs the installed app (iOS 16.4+). Offline reading keeps the last loaded data on the device; it is a cache, never the source of truth.
- The `react-native` skill and Expo guidance are removed from agent routing once the web app replaces the Expo app.

import { NextResponse } from 'next/server'
import type { MetadataRoute } from 'next'
import { appIconUrl } from '@/lib/app-icon'

/**
 * Served by a plain route, not `app/manifest.ts`: that convention links the manifest without
 * `crossorigin`, so browsers fetch it without cookies, and behind Vercel Deployment Protection the
 * install never sees it (web-pwa skill). The layout links this route with `crossOrigin="use-credentials"`.
 */
const manifest: MetadataRoute.Manifest = {
  id: '/',
  name: 'Cashflow',
  short_name: 'Cashflow',
  description: 'Your money, payday to payday.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#E9E8E4',
  theme_color: '#E9E8E4',
  icons: [
    { src: appIconUrl(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: appIconUrl(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: appIconUrl('maskable'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

export function GET(): NextResponse {
  return NextResponse.json(manifest, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } })
}

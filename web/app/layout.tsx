import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { PwaRegistration } from '@/components/PwaRegistration'
import { APP_ICON_VERSION, appIconUrl } from '@/lib/app-icon'
import './globals.css'
import './more.css'
import './marks-a.css'
import './marks-b.css'

const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-hanken', display: 'swap' })

export const metadata: Metadata = {
  title: 'Cashflow',
  description: 'Your money, payday to payday.',
  applicationName: 'Cashflow',
  icons: {
    icon: [
      { url: appIconUrl(192), type: 'image/png', sizes: '192x192' },
      { url: appIconUrl(512), type: 'image/png', sizes: '512x512' },
      { url: `/cashflow-icon.svg?v=${APP_ICON_VERSION}`, type: 'image/svg+xml' },
    ],
    apple: [{ url: appIconUrl(180), type: 'image/png', sizes: '180x180' }],
    other: [{ rel: 'apple-touch-icon-precomposed', url: appIconUrl(180) }],
  },
  appleWebApp: { capable: true, title: 'Cashflow', statusBarStyle: 'black-translucent' },
}

// Zoom stays on (ui-ux S5); inputs use 16px so iOS does not zoom into them.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F3F4' },
    { media: '(prefers-color-scheme: dark)', color: '#17181B' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en" className={hanken.variable}>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>{children}<PwaRegistration /></body>
    </html>
  )
}

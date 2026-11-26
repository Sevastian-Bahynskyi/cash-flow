'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './Icon'
import { useWide } from '@/lib/useWide'

// Phone: four places. Desktop: every place in a calm sidebar (no admin chrome, tells.md N1).
const PLACES: { href: string; icon: string; label: string; desk?: boolean; sepBefore?: boolean }[] = [
  { href: '/', icon: 'cycle', label: 'Cycle' },
  { href: '/budgets', icon: 'budgets', label: 'Budgets', desk: true },
  { href: '/where', icon: 'where', label: 'Where it went', desk: true },
  { href: '/transactions', icon: 'list', label: 'Activity' },
  { href: '/people', icon: 'shared', label: 'People' },
  { href: '/bank', icon: 'bank', label: 'Accounts & sync', desk: true, sepBefore: true },
  { href: '/categories', icon: 'tag', label: 'Categories', desk: true },
  { href: '/rules', icon: 'rule', label: 'Merchant rules', desk: true },
  { href: '/profile', icon: 'profile', label: 'Settings' },
]
// On a phone, budgets and analytics light up Cycle; the partner's pot lights up People; settings pages light up Settings.
const PHONE_PARENT: Record<string, string> = { '/budgets': '/', '/budgets/plan': '/', '/where': '/', '/shared': '/people', '/bank': '/profile', '/categories': '/profile', '/rules': '/profile' }

export function Nav(): React.JSX.Element {
  const path = usePathname()
  const wide = useWide()
  const here = wide ? path : PHONE_PARENT[path] ?? path
  const current = (href: string): boolean => href === '/' ? here === '/' : here === href || here.startsWith(href + '/')
  return (
    <nav className="nav" aria-label="Main">
      <div className="brand">Cashflow</div>
      {PLACES.map((p) => (
        <span key={p.href} style={{ display: 'contents' }}>
          {p.sepBefore && <div className="navsep deskonly" />}
          <Link href={p.href} className={`tab ${p.desk ? 'deskonly' : ''}`} aria-current={current(p.href) ? 'page' : undefined}>
            <Icon name={p.icon} /><span>{p.label}</span>
          </Link>
        </span>
      ))}
    </nav>
  )
}

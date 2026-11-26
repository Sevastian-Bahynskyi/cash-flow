'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './Icon'
import { useWide } from '@/lib/useWide'

// Phone: four places and Add. Desktop: every place in a calm sidebar (no admin chrome, tells.md N1).
const PLACES: { href: string; icon: string; label: string; desk?: boolean; sepBefore?: boolean }[] = [
  { href: '/', icon: 'cycle', label: 'Cycle' },
  { href: '/transactions', icon: 'list', label: 'Transactions' },
  { href: '/budgets', icon: 'budgets', label: 'Budgets' },
  { href: '/where', icon: 'where', label: 'Where it went', desk: true },
  { href: '/shared', icon: 'shared', label: 'Shared' },
  { href: '/bank', icon: 'bank', label: 'Bank', desk: true },
  { href: '/categories', icon: 'tag', label: 'Categories', desk: true, sepBefore: true },
  { href: '/rules', icon: 'rule', label: 'Merchant rules', desk: true },
  { href: '/alerts', icon: 'bell', label: 'Alerts', desk: true },
  { href: '/profile', icon: 'profile', label: 'Profile', desk: true },
]
// On a phone, places reached through Profile light up Cycle; the cycle plan lights up Budgets.
const PHONE_PARENT: Record<string, string> = { '/where': '/', '/bank': '/', '/categories': '/', '/rules': '/', '/alerts': '/', '/profile': '/', '/budgets/plan': '/budgets' }

export function Nav({ onAdd }: { onAdd: () => void }): React.JSX.Element {
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
      <button className="addbtn" onClick={onAdd} aria-label="Add a transaction"><Icon name="add" /><span>Add</span></button>
    </nav>
  )
}

'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './Icon'
import { Oval } from './marks-b/Oval'
import { Sheet } from './Sheet'
import { useAdd } from './AddSheet'
import { useToast } from './Toast'
import { useStore, write } from '@/lib/data/store'
import { useModel, type Model } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { PARTNER } from '@/lib/partner'
import { normalizeMerchantLookupKey } from '@/lib/domain/merchant'
import { dayLabel, kr, shortDate, todayYmd } from '@/lib/fmt'
import type { TransactionRow } from '@/lib/data/types'

/* who-marks: one column that says whose money a row is (brand.md: two people, two colours) */
const WHO = {
  shared: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="9.5" cy="13" r="6.5" fill="var(--anna)" /><circle cx="16.5" cy="13" r="6.5" fill="var(--you-mark)" stroke="var(--surface)" strokeWidth="2" /></svg>,
  moved: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="var(--anna)" strokeWidth="2" /><path d="M5 13h7M9.5 10l3 3-3 3" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  annain: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="var(--anna)" /><path d="M13 9v8M9.5 13.5L13 17l3.5-3.5" fill="none" stroke="var(--on-anna)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  income: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="var(--in)" strokeWidth="1.8" /><path d="M13 9.5v7M9.5 13h7" stroke="var(--in)" strokeWidth="1.8" strokeLinecap="round" /></svg>,
}
type Who = 'none' | 'shared' | 'moved' | 'annain' | 'income'
export const whoOf = (t: TransactionRow): Who => t.is_shared_topup ? (t.shared_participant === 'gf' ? 'annain' : 'moved') : t.kind === 'income' ? 'income' : t.shared ? 'shared' : 'none'
const WHO_LABEL: Record<Who, string> = { none: 'Yours', shared: `Shared with ${PARTNER}`, moved: 'Moved to the shared pot', annain: `${PARTNER}, into the shared pot`, income: 'Money in' }
export function WhoMark({ who }: { who: keyof typeof WHO }): React.JSX.Element { return WHO[who] }

/** One transaction row: whose it is, name, category, amount with sign and colour (copy.md § In and out). */
export function TxRow({ t, m, onOpen, current }: { t: TransactionRow; m: Model; onOpen: (t: TransactionRow) => void; current?: boolean }): React.JSX.Element {
  const { pendingIds } = useStore()
  const w = whoOf(t)
  const meta = m.meta[t.category_id ?? '']
  const foreign = t.currency_code !== 'DKK' ? ` · ${kr(t.original_amount_minor, false, t.currency_code)}` : ''
  let sub: React.ReactNode, amt: React.ReactNode
  if (w === 'moved' || w === 'annain') { sub = <span>{w === 'moved' ? 'Moved to the shared pot' : `${PARTNER}, into the shared pot`}</span>; amt = <div className="amt moved">{kr(t.amount_minor)}<small>Moved</small></div> }
  else if (t.kind === 'income') { sub = <><Icon name={meta?.icon ?? 'in'} /><span>{meta?.name ?? 'Income'}{foreign}</span></>; amt = <div className="amt in">+{kr(t.amount_minor)}<small>In</small></div> }
  else { sub = <><Icon name={meta?.icon ?? 'other'} /><span>{meta?.name ?? 'Category'}{t.shared ? `, shared with ${PARTNER}` : ''}{foreign}</span></>; amt = <div className="amt">{kr(t.amount_minor)}{pendingIds.has(t.id) && <small>Not synced</small>}</div> }
  return (
    <button className="row" onClick={() => onOpen(t)} aria-current={current ? 'true' : undefined} style={current ? { background: 'var(--surface-2)' } : undefined}>
      <span className="who" title={WHO_LABEL[w]}>{w === 'none' ? null : WHO[w]}</span>
      <span style={{ minWidth: 0 }}><div className="nm">{t.name}</div><div className="meta">{sub}</div></span>
      {amt}
    </button>
  )
}

export const SkRows = ({ n }: { n: number }): React.JSX.Element => (
  <>{Array.from({ length: n }, (_, i) => (
    <div className="row" key={i}><span className="sk" style={{ width: 22, height: 22, borderRadius: '50%' }} /><span><span className="sk" style={{ width: `${50 + (i * 37) % 40}%`, height: 12, marginBottom: 6 }} /><span className="sk" style={{ width: '30%', height: 10 }} /></span><span className="sk" style={{ width: 64, height: 12 }} /></div>
  ))}</>
)

/** Loading, offline and error, the same quiet way on every screen; the last numbers stay visible. */
export function StatusLine(): React.JSX.Element | null {
  const { offline, error, loadedAt, reload, queued } = useStore()
  const at = loadedAt ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(loadedAt) : null
  if (offline) return <div className="offline" role="status"><Icon name="offline" /><span>Offline{at ? `. Showing what was loaded at ${at}` : ''}.{queued ? ` ${queued} new saved on this device; they sync when you’re back.` : ' New transactions save on this device and sync later.'}</span></div>
  if (error) return <div className="err" role="alert"><span>{error}</span><button onClick={() => void reload()}>Retry</button></div>
  return null
}

/** Shows the screen once data is here; until then a skeleton, or one clear error. */
export function Gate({ children, skeleton }: { children: (m: Model) => React.ReactNode; skeleton?: React.ReactNode }): React.JSX.Element {
  const { status, error, reload } = useStore()
  const m = useModel()
  if (m) return <>{children(m)}</>
  if (status === 'error') return <div className="panel"><div className="empty"><b>Couldn’t load your money</b>{error}<br /><button className="btn" onClick={() => void reload()}>Retry</button></div></div>
  return <>{skeleton ?? <div className="panel"><SkRows n={6} /></div>}</>
}

export function EmptyAdd({ title, sub }: { title: string; sub?: string }): React.JSX.Element {
  const add = useAdd()
  return <div className="empty"><b>{title}</b>{sub}{sub ? <br /> : null}<button className="btn" onClick={() => add()}><Icon name="add" />Add a transaction</button></div>
}

export function NavRow({ href, icon, name, sub, end }: { href: string; icon: string; name: string; sub?: string; end?: React.ReactNode }): React.JSX.Element {
  return <Link className="linkrow" href={href}><span className="who"><Icon name={icon} /></span><span>{name}{sub ? <span className="sub">{sub}</span> : null}</span><span className="end">{end}<Icon name="chev" /></span></Link>
}

/* the transaction detail and its actions, one sheet for every list */
const DetailCtx = createContext<(t: TransactionRow) => void>(() => undefined)
export const useDetail = (): ((t: TransactionRow) => void) => useContext(DetailCtx)

export function DetailProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [id, setId] = useState<string | null>(null)
  const open = useCallback((t: TransactionRow) => setId(t.id), [])
  return <DetailCtx.Provider value={open}>{children}{id && <Detail id={id} onClose={() => setId(null)} />}</DetailCtx.Provider>
}

export function DetailBody({ t, m, onDone }: { t: TransactionRow; m: Model; onDone?: () => void }): React.JSX.Element {
  const store = useStore()
  const add = useAdd()
  const toast = useToast()
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const w = whoOf(t)
  const meta = m.meta[t.category_id ?? '']
  const ratio = (() => { const s = m.share.get(t.id); return s !== undefined && t.amount_minor ? s : null })()
  const act = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>): Promise<void> => {
    setBusy(true)
    try { await write(store, ['transactions'], run); toast(label); onDone?.() } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const local = store.pendingIds.has(t.id)
  return (
    <>
      <div className="dhero"><div className="big serif num">{t.kind === 'income' ? <span style={{ color: 'var(--in)' }}>+{kr(t.amount_minor)}</span> : kr(t.amount_minor)}</div><p>{t.name}</p></div>
      <dl className="dl">
        <div><dt>Date</dt><dd>{dayLabel(t.occurred_on)}{dayLabel(t.occurred_on).includes(' ') ? '' : `, ${shortDate(t.occurred_on)}`}</dd></div>
        {meta && !t.is_shared_topup && <div><dt>Category</dt><dd>{meta.label}</dd></div>}
        <div><dt>Whose</dt><dd>{WHO_LABEL[w]}</dd></div>
        {t.shared && ratio !== null && <div><dt>Your part</dt><dd className="num">{kr(ratio)}</dd></div>}
        {t.is_shared_topup && <div><dt>Counts as spending</dt><dd>No, it’s money moved</dd></div>}
        {t.currency_code !== 'DKK' && <div><dt>Paid</dt><dd className="num">{kr(t.original_amount_minor, false, t.currency_code)}</dd></div>}
        {t.comment && <div><dt>Note</dt><dd>{t.comment}</dd></div>}
      </dl>
      {!local && (
        <div className="panel" style={{ marginTop: 12 }}>
          <button className="linkrow" onClick={() => { onDone?.(); add(t) }}><span className="who"><Icon name="edit" /></span><span>Edit</span><span /></button>
          {!t.is_shared_topup && <button className="linkrow" onClick={() => { onDone?.(); add({ ...t, id: undefined, occurred_on: todayYmd() }) }}><span className="who"><Icon name="add" /></span><span>Duplicate</span><span /></button>}
          {t.kind === 'expense' && !t.is_shared_topup && (
            <button className="linkrow" disabled={busy} onClick={() => void act(t.shared ? 'Now yours only' : `Shared with ${PARTNER}`, () => supabase().from('transactions').update(t.shared ? { shared: false, shared_participant: null, is_shared_topup: false } : { shared: true, shared_participant: 'me' }).eq('id', t.id))}>
              <span className="who"><Icon name={t.shared ? 'profile' : 'shared'} /></span><span>{t.shared ? 'Make it yours only' : `Share with ${PARTNER}`}</span><span />
            </button>
          )}
          {!t.is_shared_topup && <button className="linkrow" onClick={() => { onDone?.(); router.push(`/rules?new=${encodeURIComponent(normalizeMerchantLookupKey(t.name) || t.name)}&kind=${t.kind}&cat=${t.category_id ?? ''}`) }}><span className="who"><Icon name="rule" /></span><span>Always put {t.name} here</span><span /></button>}
          {ask ? (
            <div className="linkrow" style={{ gridTemplateColumns: '1fr auto auto' }}><span>Delete for good?</span><button className="btn ghost" style={{ minHeight: 38 }} onClick={() => setAsk(false)}>Cancel</button><button className="btn danger" style={{ minHeight: 38 }} disabled={busy} onClick={() => void act(`Deleted ${t.name}`, () => supabase().from('transactions').delete().eq('id', t.id))}>Delete</button></div>
          ) : <button className="linkrow" style={{ color: 'var(--over-text)' }} onClick={() => setAsk(true)}><span className="who" style={{ color: 'inherit' }}><Icon name="trash" /></span><span>Delete…</span><span /></button>}
        </div>
      )}
      {local && <p className="note">Saved on this device. It syncs when you’re online.</p>}
      {t.is_shared_topup && <p className="note">Top-ups change who paid what into the pot, so they can’t move between yours and shared.</p>}
    </>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element | null {
  const m = useModel()
  const t = m?.tx.find((x) => x.id === id)
  if (!m || !t) return null
  return <Sheet open onClose={onClose} title={t.is_shared_topup ? 'Moved' : t.kind === 'income' ? 'Money in' : 'Expense'}><DetailBody t={t} m={m} onDone={onClose} /></Sheet>
}

/** Day groups with each day's spending, newest first. */
export function DayList({ rows, m, onOpen, selected }: { rows: TransactionRow[]; m: Model; onOpen: (t: TransactionRow) => void; selected?: string | null }): React.JSX.Element {
  const days = [...new Set(rows.map((t) => t.occurred_on))].map((d) => {
    const items = rows.filter((t) => t.occurred_on === d)
    return { d, items, tot: items.reduce((a, t) => a + m.mine(t), 0), shared: items.reduce((a, t) => a + (t.shared ? m.mine(t) : 0), 0) }
  })
  // Each day's spend as a thin bar against a typical heavy day (the 90th percentile), so one rent day
  // doesn't flatten the rest; days above it fill the bar.
  const sorted = days.map((x) => x.tot).filter(Boolean).sort((a, z) => a - z)
  const top = Math.max(1, (sorted[Math.floor(sorted.length * 0.9)] ?? 1) * 1.15)
  const today = todayYmd()
  return (
    <>{days.map(({ d, items, tot, shared }) => {
      const label = dayLabel(d)
      return (
        <div key={d}>
          <div className="dayh mkb-dayh">
            {d === today ? <span className="mkb-today">{label}<Oval /></span> : <span>{label}</span>}
            {tot ? <span className="num">{kr(tot)}</span> : null}
            {tot > 0 && <span className="mkb-daybar" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * (tot - shared)) / top).toFixed(1)}%` }} />{shared > 0 && <i className="sh" style={{ width: `${Math.min(100 - Math.min(100, (100 * (tot - shared)) / top), (100 * shared) / top).toFixed(1)}%` }} />}</span>}
          </div>
          <div className="panel">{items.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={onOpen} current={selected === t.id} />)}</div>
        </div>
      )
    })}</>
  )
}

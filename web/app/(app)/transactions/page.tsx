'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { DayList, DetailBody, Empty, Gate, SkRows, StatusLine, SyncLine, TxRow, WhoMark, useDetail } from '@/components/ui'
import { useStore, write } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { addDays, kr, shortDate } from '@/lib/fmt'
import { useWide } from '@/lib/useWide'
import type { TransactionRow } from '@/lib/data/types'

type Filter = 'all' | 'mine' | 'shared'

/** A search token matches a name, note or category, or a date written as 24.11, 24.11.2026, 2026-11 or 2026. */
function matches(t: TransactionRow, m: Model, q: string): boolean {
  const meta = m.meta[t.category_id ?? '']
  const text = `${t.name} ${t.comment ?? ''} ${meta?.label ?? ''}`.toLowerCase()
  const [y, mo, d] = t.occurred_on.split('-')
  const dates = [t.occurred_on, `${+d!}.${+mo!}`, `${d}.${mo}`, `${+d!}.${+mo!}.${y}`, `${d}.${mo}.${y}`, `${+mo!}.${y}`, `${y}-${mo}`, y!, `${+d!}/${+mo!}`]
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((tok) => text.includes(tok) || dates.some((x) => x === tok || x.startsWith(tok + '.')))
}

/** Unsure rows from the last 30 days: the best guess is already applied, one tap confirms it. Older history was accepted as best guess. */
function Inbox({ m, onOpen }: { m: Model; onOpen: (t: TransactionRow) => void }): React.JSX.Element | null {
  const store = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const since = addDays(m.today, -30)
  const items = [...m.tx].reverse().filter((t) => t.needs_review && t.occurred_on >= since)
  if (!items.length) return null
  const confirm = async (ids: string[]): Promise<void> => {
    setBusy(ids.length > 1 ? 'all' : ids[0]!)
    try { await write(store, ['transactions'], () => supabase().from('transactions').update({ needs_review: false }).in('id', ids)); toast(ids.length > 1 ? `Confirmed ${ids.length}` : 'Confirmed') }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(null) }
  }
  const ready = items.filter((t) => t.category_id).map((t) => t.id)
  return (
    <section aria-label="Inbox">
      <h2 className="sec" style={{ marginTop: 0 }}>Inbox, {items.length} to check {ready.length > 1 && <button disabled={Boolean(busy)} onClick={() => void confirm(ready)}>All look right</button>}</h2>
      <div className="panel">{items.map((t) => (
        <div key={t.id} className="inboxrow">
          <TxRow t={t} m={m} onOpen={onOpen} />
          <button className="btn ghost" disabled={Boolean(busy) || !t.category_id} onClick={() => void confirm([t.id])} aria-label={`Confirm ${t.name}`}>{busy === t.id ? '…' : 'Yes'}</button>
        </div>
      ))}</div>
      <p className="note">Each one already counts with its best guess. Tap one to change it.</p>
    </section>
  )
}

const chunks = <T,>(a: T[], n = 100): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

function Transactions({ m }: { m: Model }): React.JSX.Element {
  const params = useSearchParams()
  const open = useDetail()
  const wide = useWide()
  const store = useStore()
  const toast = useToast()
  const catParam = params.get('cat')
  const [filter, setFilter] = useState<Filter>(params.get('shared') === '1' ? 'shared' : 'all')
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [shown, setShown] = useState(1)
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [bulk, setBulk] = useState<null | 'cat'>(null)
  const [busy, setBusy] = useState(false)

  const scoped = useMemo(() => {
    let L = [...m.tx].reverse()
    if (catParam) L = L.filter((t) => m.parentOf(t.category_id)?.id === catParam && !t.is_shared_topup)
    if (filter === 'mine') L = L.filter((t) => !t.shared && !t.is_shared_topup)
    if (filter === 'shared') L = L.filter((t) => t.shared || t.is_shared_topup)
    if (q.trim()) L = L.filter((t) => matches(t, m, q))
    return L
  }, [m, catParam, filter, q])

  // This cycle first; older cycles one at a time. Searching shows every match.
  const groups = useMemo(() => {
    const cycles = [...m.cycles].reverse()
    const out: { key: string; title: string; rows: TransactionRow[] }[] = []
    for (const c of cycles) {
      const rows = scoped.filter((t) => t.occurred_on >= c.startOn && (c.endOnExclusive === null || t.occurred_on < c.endOnExclusive))
      if (rows.length || c === cycles[0]) out.push({ key: c.id, title: `${c.name} cycle`, rows })
    }
    const before = scoped.filter((t) => !m.cycles.length || t.occurred_on < (m.cycles[0]?.startOn ?? '0'))
    if (before.length) out.push({ key: 'pre', title: 'Before salary cycles', rows: before })
    return out
  }, [m, scoped])
  const visible = q.trim() || catParam ? groups : groups.slice(0, shown)
  const detail = wide ? (m.tx.find((t) => t.id === picked) ?? visible[0]?.rows[0]) : undefined
  const pickedRows = m.tx.filter((t) => sel?.has(t.id))
  const kinds = new Set(pickedRows.map((t) => t.kind))
  const anyTop = pickedRows.some((t) => t.is_shared_topup || t.movement === 'moved')
  const total = scoped.reduce((a, t) => a + m.mine(t), 0)

  async function bulkRun(label: string, run: (ids: string[]) => PromiseLike<{ error: { message: string } | null }>): Promise<void> {
    if (!sel) return
    setBusy(true)
    try {
      for (const ids of chunks([...sel])) await write(store, [], () => run(ids))
      await store.reload(['transactions'])
      toast(label); setSel(null); setBulk(null)
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const onOpen = (t: TransactionRow): void => {
    if (sel) { if (store.pendingIds.has(t.id)) return; const n = new Set(sel); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSel(n); return }
    if (wide) setPicked(t.id); else open(t)
  }
  const catName = catParam ? m.byId.get(catParam)?.name : null

  return (
    <>
      <Header title={catName ?? 'Activity'} back={Boolean(catParam)} big={catName ?? 'Activity'} aside={m.current ? `${m.current.name} cycle, ${shortDate(m.current.startOn)} – ${shortDate(m.current.endInclusive)}` : undefined}
        right={<button className="iconbtn" onClick={() => { setSearchOpen((s) => !s); if (searchOpen) setQ('') }} aria-label="Search" aria-expanded={searchOpen}><Icon name="search" /></button>} />
      <StatusLine />
      {!catParam && <SyncLine />}
      <div className="cols"><div>
        {!catParam && !sel && !q.trim() && <Inbox m={m} onOpen={onOpen} />}
        {sel ? (
          <div className="filters"><b style={{ padding: '0 4px' }}>{sel.size ? `${sel.size} selected` : 'Select transactions'}</b><span className="spacer" />
            <button className="btn link" onClick={() => setSel(new Set(visible.flatMap((g) => g.rows.map((t) => t.id)).filter((id) => !store.pendingIds.has(id))))}>All</button>
            <button className="btn ghost" style={{ minHeight: 38 }} onClick={() => setSel(null)}>Cancel</button></div>
        ) : (
          <div className="filters">
            <div className="seg" role="group" aria-label="Show">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
              <button aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>Yours</button>
              <button aria-pressed={filter === 'shared'} onClick={() => setFilter('shared')}><span style={{ width: 18, display: 'inline-flex' }}><WhoMark who="shared" /></span>Shared</button>
            </div>
            <span className="spacer" />
            <button className="btn link" onClick={() => setSel(new Set())}>Select</button>
          </div>
        )}
        {searchOpen && <label className="search"><Icon name="search" /><span className="sr">Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, note, category or date" autoComplete="off" autoFocus /></label>}
        {(q.trim() || catParam || filter !== 'all') && scoped.length > 0 && <p className="note num" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{scoped.length} {scoped.length === 1 ? 'transaction' : 'transactions'}</span><span>Your spending {kr(total)}</span></p>}
        {!m.tx.length ? <div className="panel" style={{ marginTop: 12 }}><Empty title="No transactions yet" sub="What you spend, what comes in and what you move to the pot arrives from your bank, day by day." /></div>
          : !scoped.length ? <div className="panel" style={{ marginTop: 12 }}><div className="empty"><b>Nothing matches</b>Try another name or a date like 24.11.</div></div>
          : visible.map((g, i) => (
            <section key={g.key}>
              {(i > 0 || q.trim()) && <h2 className="sec" style={{ marginTop: 28 }}>{g.title}</h2>}
              {g.rows.length ? <DayList rows={g.rows} m={m} onOpen={onOpen} selected={detail?.id ?? null} /> : <div className="panel" style={{ marginTop: 12 }}><Empty title="Nothing yet this cycle" /></div>}
            </section>
          ))}
        {!q.trim() && !catParam && groups.length > shown && <div style={{ textAlign: 'center', padding: '18px 0 8px' }}><button className="btn ghost" onClick={() => setShown((s) => s + 1)}>Load older</button></div>}
        {!q.trim() && !catParam && groups.length > 0 && groups.length <= shown && shown > 1 && <p className="note" style={{ textAlign: 'center' }}>Nothing older.</p>}
      </div>
      <div className="deskdetail">{detail && !sel && <><h2 className="sec" style={{ marginTop: 0 }}>Detail</h2><DetailBody t={detail} m={m} /></>}</div></div>

      {sel && (
        <div className="selbar">
          <button disabled={!sel.size || kinds.size > 1 || anyTop || busy} title={kinds.size > 1 ? 'Pick only expenses or only income' : undefined} onClick={() => setBulk('cat')}><Icon name="tag" />Category</button>
        </div>
      )}
      {bulk === 'cat' && sel && (
        <Sheet open onClose={() => setBulk(null)} title={`Category for ${sel.size}`}>
          <div className="panel">{m.options.filter((o) => kinds.has('income') ? o.parentName.toLowerCase() === 'income' && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income').map((o) => (
            <button key={o.id} className="row" disabled={busy} onClick={() => void bulkRun(`Moved ${sel.size} to ${o.name}`, (ids) => supabase().from('transactions').update({ category_id: o.id, needs_review: false, reason_source: 'you', reason: `You chose ${o.name}` }).in('id', ids))}><span className="who cat"><Icon name={o.icon} /></span><span className="nm">{o.name}<span className="meta" style={{ display: 'block' }}>{o.parentId !== o.id ? o.parentName : ''}</span></span><span /></button>
          ))}</div>
        </Sheet>
      )}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return (
    <Gate skeleton={<><Header title="Activity" /><div className="panel"><SkRows n={8} /></div></>}>
      {(m) => <Suspense><Transactions m={m} /></Suspense>}
    </Gate>
  )
}

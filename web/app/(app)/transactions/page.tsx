'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { DayList, DetailBody, EmptyAdd, Gate, SkRows, StatusLine, WhoMark, useDetail } from '@/components/ui'
import { useStore, write } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { kr, shortDate, todayYmd } from '@/lib/fmt'
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
  const [bulk, setBulk] = useState<null | 'cat' | 'date' | 'del'>(null)
  const [bulkDate, setBulkDate] = useState(todayYmd())
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
  const anyTop = pickedRows.some((t) => t.is_shared_topup)
  const allShared = pickedRows.length > 0 && pickedRows.every((t) => t.shared)
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
    if (sel) { const n = new Set(sel); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSel(n); return }
    if (wide) setPicked(t.id); else open(t)
  }
  const catName = catParam ? m.byId.get(catParam)?.name : null

  return (
    <>
      <Header title={catName ?? 'Transactions'} back={Boolean(catParam)} big={catName ?? 'Transactions'} aside={m.current ? `${m.current.name} cycle, ${shortDate(m.current.startOn)} – ${shortDate(m.current.endInclusive)}` : undefined}
        right={<button className="iconbtn" onClick={() => { setSearchOpen((s) => !s); if (searchOpen) setQ('') }} aria-label="Search" aria-expanded={searchOpen}><Icon name="search" /></button>} />
      <StatusLine />
      <div className="cols"><div>
        {sel ? (
          <div className="filters"><b style={{ padding: '0 4px' }}>{sel.size ? `${sel.size} selected` : 'Select transactions'}</b><span className="spacer" />
            <button className="btn link" onClick={() => setSel(new Set(visible.flatMap((g) => g.rows.map((t) => t.id))))}>All</button>
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
        {!m.tx.length ? <div className="panel" style={{ marginTop: 12 }}><EmptyAdd title="No transactions yet" sub="What you spend, what comes in and what you move to the pot shows here, day by day." /></div>
          : !scoped.length ? <div className="panel" style={{ marginTop: 12 }}><div className="empty"><b>Nothing matches</b>Try another name or a date like 24.11.</div></div>
          : visible.map((g, i) => (
            <section key={g.key}>
              {(i > 0 || q.trim()) && <h2 className="sec" style={{ marginTop: 28 }}>{g.title}</h2>}
              {g.rows.length ? <DayList rows={g.rows} m={m} onOpen={onOpen} selected={detail?.id ?? null} /> : <div className="panel" style={{ marginTop: 12 }}><EmptyAdd title="Nothing yet this cycle" /></div>}
            </section>
          ))}
        {!q.trim() && !catParam && groups.length > shown && <div style={{ textAlign: 'center', padding: '18px 0 8px' }}><button className="btn ghost" onClick={() => setShown((s) => s + 1)}>Load older</button></div>}
        {!q.trim() && !catParam && groups.length > 0 && groups.length <= shown && shown > 1 && <p className="note" style={{ textAlign: 'center' }}>Nothing older.</p>}
      </div>
      <div className="deskdetail">{detail && !sel && <><h2 className="sec" style={{ marginTop: 0 }}>Detail</h2><DetailBody t={detail} m={m} /></>}</div></div>

      {sel && (
        <div className="selbar">
          <button disabled={!sel.size || anyTop || kinds.has('income') || busy} title={anyTop ? 'Top-ups to the pot can’t be moved' : undefined}
            onClick={() => void bulkRun(`Moved ${sel.size} to ${allShared ? 'yours' : 'shared'}`, (ids) => supabase().from('transactions').update(allShared ? { shared: false, shared_participant: null, is_shared_topup: false } : { shared: true, shared_participant: 'me' }).in('id', ids))}>
            <Icon name={allShared ? 'profile' : 'shared'} />{allShared ? 'To yours' : 'To shared'}</button>
          <button disabled={!sel.size || kinds.size > 1 || anyTop || busy} title={kinds.size > 1 ? 'Pick only expenses or only income' : undefined} onClick={() => setBulk('cat')}><Icon name="tag" />Category</button>
          <button disabled={!sel.size || busy} onClick={() => setBulk('date')}><Icon name="cal" />Date</button>
          <button className="del" disabled={!sel.size || busy} onClick={() => setBulk('del')}><Icon name="trash" />Delete</button>
        </div>
      )}
      {bulk === 'cat' && sel && (
        <Sheet open onClose={() => setBulk(null)} title={`Category for ${sel.size}`}>
          <div className="panel">{m.options.filter((o) => kinds.has('income') ? o.parentName.toLowerCase() === 'income' && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income').map((o) => (
            <button key={o.id} className="row" disabled={busy} onClick={() => void bulkRun(`Moved ${sel.size} to ${o.name}`, (ids) => supabase().from('transactions').update({ category_id: o.id }).in('id', ids))}><span className="who cat"><Icon name={o.icon} /></span><span className="nm">{o.name}<span className="meta" style={{ display: 'block' }}>{o.parentId !== o.id ? o.parentName : ''}</span></span><span /></button>
          ))}</div>
        </Sheet>
      )}
      {bulk === 'date' && sel && (
        <Sheet open onClose={() => setBulk(null)} title={`Date for ${sel.size}`}>
          <label className="field"><span>Date</span><input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} /></label>
          <p className="note">Amount, name and category stay as they are.</p>
          <div className="formfoot"><button className="btn" disabled={busy || !bulkDate} onClick={() => void bulkRun(`Changed the date of ${sel.size}`, (ids) => supabase().from('transactions').update({ occurred_on: bulkDate }).in('id', ids))}>Apply date</button></div>
        </Sheet>
      )}
      {bulk === 'del' && sel && (
        <Sheet open onClose={() => setBulk(null)} title={`Delete ${sel.size}`}>
          <div className="dhero"><div className="big serif num">{sel.size}</div><p>{sel.size === 1 ? 'transaction' : 'transactions'} will be deleted for good.</p></div>
          {pickedRows.some((t) => t.is_salary) && <p className="note" style={{ color: 'var(--over-text)' }}>A salary is among them. Deleting it also deletes that cycle’s budgets.</p>}
          <div className="formfoot"><button className="btn ghost" onClick={() => setBulk(null)}>Cancel</button><button className="btn danger" disabled={busy} onClick={() => void bulkRun(`Deleted ${sel.size}`, (ids) => supabase().from('transactions').delete().in('id', ids))}>Delete {sel.size}</button></div>
        </Sheet>
      )}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return (
    <Gate skeleton={<><Header title="Transactions" /><div className="panel"><SkRows n={8} /></div></>}>
      {(m) => <Suspense><Transactions m={m} /></Suspense>}
    </Gate>
  )
}

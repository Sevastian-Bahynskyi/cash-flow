'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useToast } from './Toast'
import { useStore, write } from '@/lib/data/store'
import { useModel, type Model } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { PARTNER } from '@/lib/partner'
import { normalizeMerchantLookupKey } from '@/lib/domain/merchant'
import { dayLabel, kr, parseAmount, shortDate, todayYmd } from '@/lib/fmt'
import type { TransactionRow } from '@/lib/data/types'

/* who-marks: one column that says whose money a row is (brand.md: two people, two colours) */
const WHO = {
  shared: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="9.5" cy="13" r="6.5" fill="var(--anna)" /><circle cx="16.5" cy="13" r="6.5" fill="var(--you-mark)" stroke="var(--surface)" strokeWidth="2" /></svg>,
  moved: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="var(--anna)" strokeWidth="2" /><path d="M5 13h7M9.5 10l3 3-3 3" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  annain: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="var(--anna)" /><path d="M13 9v8M9.5 13.5L13 17l3.5-3.5" fill="none" stroke="var(--on-anna)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  income: <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="var(--in)" strokeWidth="1.8" /><path d="M13 9.5v7M9.5 13h7" stroke="var(--in)" strokeWidth="1.8" strokeLinecap="round" /></svg>,
}
type Who = 'none' | 'shared' | 'moved' | 'annain' | 'income' | 'own'
export const whoOf = (t: TransactionRow): Who => t.is_shared_topup ? (t.shared_participant === 'gf' ? 'annain' : 'moved') : t.movement === 'moved' ? 'own' : t.kind === 'income' ? 'income' : t.shared ? 'shared' : 'none'
const WHO_LABEL: Record<Who, string> = { none: 'Yours', shared: `Shared with ${PARTNER}`, moved: 'Moved to the shared pot', annain: `${PARTNER}, into the shared pot`, income: 'Money in', own: 'Moved between your accounts' }
const WHO_ICON: Record<Who, React.JSX.Element | null> = { none: null, shared: WHO.shared, moved: WHO.moved, annain: WHO.annain, income: WHO.income, own: WHO.moved }
export function WhoMark({ who }: { who: keyof typeof WHO }): React.JSX.Element { return WHO[who] }

/** One transaction row: whose it is, name, category, amount with sign and colour (copy.md § In and out). */
export function TxRow({ t, m, onOpen, current }: { t: TransactionRow; m: Model; onOpen: (t: TransactionRow) => void; current?: boolean }): React.JSX.Element {
  const { pendingIds } = useStore()
  const w = whoOf(t)
  const meta = m.meta[t.category_id ?? '']
  const foreign = t.currency_code !== 'DKK' ? ` · ${kr(t.original_amount_minor, false, t.currency_code)}` : ''
  let sub: React.ReactNode, amt: React.ReactNode
  const pend = t.status === 'pending' ? <small>Pending</small> : null
  let badge: React.ReactNode = <Icon name={meta?.icon ?? (t.kind === 'income' ? 'in' : 'other')} />
  if (w === 'moved' || w === 'annain' || w === 'own') { badge = WHO_ICON[w]; sub = <span>{WHO_LABEL[w]}</span>; amt = <div className="amt moved">{kr(t.amount_minor)}<small>Moved</small></div> }
  else if (t.kind === 'income') { sub = <span>{meta?.name ?? 'Income'}{foreign}</span>; amt = <div className="amt in">+{kr(t.amount_minor)}{pend ?? <small>In</small>}</div> }
  else { sub = <span>{meta?.name ?? 'Category'}{t.shared ? `, shared with ${PARTNER}` : ''}{foreign}</span>; amt = <div className="amt">{kr(t.amount_minor)}{pend}{pendingIds.has(t.id) && <small>Not synced</small>}</div> }
  return (
    <button className="row" onClick={() => onOpen(t)} aria-current={current ? 'true' : undefined} style={current ? { background: 'var(--surface-2)' } : undefined}>
      {/* the category on a soft disc; shared rows carry the two dots on its corner */}
      <span className={`who ${w === 'income' ? 'in' : ''}`} title={WHO_LABEL[w]}>{badge}{w === 'shared' && <span className="badge">{WHO.shared}</span>}</span>
      <span style={{ minWidth: 0 }}><div className="nm">{t.name}{t.needs_review && <i className="unsure" title="Best guess, not confirmed yet" aria-label="Not confirmed yet" />}</div><div className="meta">{sub}</div></span>
      {amt}
    </button>
  )
}

export const SkRows = ({ n }: { n: number }): React.JSX.Element => (
  <>{Array.from({ length: n }, (_, i) => (
    <div className="row" key={i}><span className="sk" style={{ width: 40, height: 40, borderRadius: '50%' }} /><span><span className="sk" style={{ width: `${50 + (i * 37) % 40}%`, height: 12, marginBottom: 6 }} /><span className="sk" style={{ width: '30%', height: 10 }} /></span><span className="sk" style={{ width: 64, height: 12 }} /></div>
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

const hhmm = (iso: string): string => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const DAY = 86_400_000

/** Bank sync health: quiet "Synced 08:12"; amber when older than a day, failing, or the bank consent ends within 14 days. */
export function SyncLine(): React.JSX.Element | null {
  const { tables, sync, syncing } = useStore()
  if (!tables?.bank_accounts.length) return null
  const last = tables.bank_accounts.map((a) => a.last_synced_at).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null
  const age = last ? Date.now() - Date.parse(last) : Infinity
  const failing = tables.sync_runs[0]?.ok === false || tables.bank_accounts.some((a) => a.last_error)
  const ends = tables.bank_connections.map((c) => c.valid_until).sort()[0]
  const consentDays = ends ? Math.floor((Date.parse(ends) - Date.now()) / DAY) : null
  const renew = consentDays !== null && consentDays < 14
  // Revolut keeps only ~90 days: three days without a sync is the point where history can start to be lost.
  const text = syncing ? 'Syncing…'
    : age > 3 * DAY ? `Not synced for ${Math.floor(age / DAY)} days. Bank history older than 90 days can’t be fetched later.`
    : failing ? `Sync is failing${last ? `. Last synced ${dayLabel(last.slice(0, 10)).toLowerCase()} at ${hhmm(last)}` : ''}.`
    : age > DAY ? `Last synced ${dayLabel(last!.slice(0, 10)).toLowerCase()} at ${hhmm(last!)}`
    : last ? `Synced ${hhmm(last)}` : 'Not synced yet'
  const amber = !syncing && (age > DAY || failing)
  return (
    <>
      {renew && <div className="renew" role="alert"><span><b>Bank access ends {consentDays! <= 0 ? 'today' : `in ${consentDays} ${consentDays === 1 ? 'day' : 'days'}`}.</b> Renew it, or new transactions stop coming in.</span><Link className="btn" href="/bank">Renew</Link></div>}
      <div className={`syncline ${amber ? 'amber' : ''}`} role="status"><span>{text}</span>{!syncing && <button onClick={() => void sync()}>Sync now</button>}</div>
    </>
  )
}

/** Shows the screen once data is here; until then a skeleton, or one clear error. */
export function Gate({ children, skeleton }: { children: (m: Model) => React.ReactNode; skeleton?: React.ReactNode }): React.JSX.Element {
  const { status, error, reload } = useStore()
  const m = useModel()
  if (m) return <>{children(m)}</>
  if (status === 'error') return <div className="panel"><div className="empty"><b>Couldn’t load your money</b>{error}<br /><button className="btn" onClick={() => void reload()}>Retry</button></div></div>
  return <>{skeleton ?? <div className="panel"><SkRows n={6} /></div>}</>
}

export function Empty({ title, sub }: { title: string; sub?: string }): React.JSX.Element {
  return <div className="empty"><b>{title}</b>{sub ?? 'New transactions arrive from your bank.'}</div>
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

const SOURCE: Record<string, string> = { transfer: 'Money moved', salary: 'Salary', person: 'A person', rule: 'Rule', memory: 'Seen before', mcc: 'Bank merchant code', ai: 'AI guess', you: 'You', manual: 'Logged by hand' }
type BankText = { creditor_name: string | null; debtor_name: string | null; remittance: string | null; mcc: string | null; bank_code: string | null; booking_date: string | null; status: string }

/** The bank's own words for a row, fetched only when asked. */
function BankTextRows({ id }: { id: string }): React.JSX.Element {
  const [b, setB] = useState<BankText | null | 'err'>(null)
  useEffect(() => {
    let alive = true
    void supabase().from('bank_transactions').select('creditor_name,debtor_name,remittance,mcc,bank_code,booking_date,status').eq('id', id).maybeSingle()
      .then(({ data, error }) => { if (alive) setB(error || !data ? 'err' : data as BankText) })
    return () => { alive = false }
  }, [id])
  if (b === 'err') return <p className="note">Couldn’t load the bank’s text.</p>
  if (!b) return <p className="note">Loading the bank’s text…</p>
  const rows: [string, string | null][] = [['To', b.creditor_name], ['From', b.debtor_name], ['Text', b.remittance], ['Merchant code', b.mcc], ['Bank code', b.bank_code], ['Booked', b.booking_date ? shortDate(b.booking_date) : b.status === 'PDNG' ? 'Pending' : null]]
  return <dl className="dl">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="raw">{v}</dd></div>)}</dl>
}

/** Pick a category; then "Always for X?" writes a rule so the next sync gets it right. */
function CategoryPick({ t, m, onClose }: { t: TransactionRow; m: Model; onClose: () => void }): React.JSX.Element {
  const store = useStore()
  const toast = useToast()
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const key = t.merchant_key ?? normalizeMerchantLookupKey(t.name)
  const income = t.kind === 'income'
  const same = m.tx.filter((x) => x.id !== t.id && x.needs_review && x.merchant_key && x.merchant_key === t.merchant_key)
  // is_salary stays as the sync set it: flipping it on an existing row would start a cycle without its budgets.
  const choose = async (o: { id: string; name: string }): Promise<void> => {
    setBusy(true)
    try {
      await write(store, ['transactions'], () => supabase().from('transactions').update({ category_id: o.id, needs_review: false, reason_source: 'you', reason: `You chose ${o.name}`, confidence: 1 }).eq('id', t.id))
      setPicked(o)
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const always = async (): Promise<void> => {
    if (!picked || !store.userId) return
    setBusy(true)
    try {
      await write(store, ['merchant_category_rules'], () => supabase().from('merchant_category_rules').upsert({ user_id: store.userId, match_target: 'normalized_merchant', match_type: 'exact', pattern: key, kind: t.kind, canonical_merchant: t.name, category_id: picked.id, is_shared_topup: false, is_blocked: false, priority: 300, source: 'manual' }, { onConflict: 'user_id,kind,match_target,match_type,pattern' }))
      // The same merchant waiting in the Inbox follows the new rule right away.
      if (same.length) await write(store, ['transactions'], () => supabase().from('transactions').update({ category_id: picked.id, needs_review: false, reason_source: 'rule', reason: `Your rule: ${t.name}`, confidence: 1 }).in('id', same.map((x) => x.id)))
      toast(`${t.name} always goes to ${picked.name}`); onClose()
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  if (picked) return (
    <Sheet open onClose={onClose} title="Saved">
      <div className="dhero"><p>{t.name} is now in {picked.name}.</p></div>
      <p className="note" style={{ textAlign: 'center' }}>Always put {t.name} in {picked.name}?{same.length ? ` ${same.length} more waiting in the Inbox follow too.` : ''}</p>
      <div className="formfoot"><button className="btn ghost" onClick={onClose}>Just this one</button><button className="btn" disabled={busy} onClick={() => void always()}>Always</button></div>
    </Sheet>
  )
  return (
    <Sheet open onClose={onClose} title={`Category for ${t.name}`}>
      <div className="panel">{m.options.filter((o) => income ? o.parentName.toLowerCase() === 'income' && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income').map((o) => (
        <button key={o.id} className="row" disabled={busy} aria-current={o.id === t.category_id ? 'true' : undefined} onClick={() => void choose({ id: o.id, name: o.name })}><span className="who cat"><Icon name={o.icon} /></span><span className="nm">{o.name}<span className="meta" style={{ display: 'block' }}>{o.parentId !== o.id ? o.parentName : ''}</span></span><span>{o.id === t.category_id ? <Icon name="check" /> : null}</span></button>
      ))}</div>
    </Sheet>
  )
}

/** Part of one bank payment for another category (Bilka 60 kr. → 45 kr. flowers); the rest stays where it is. */
function SplitSheet({ t, m, onClose }: { t: TransactionRow; m: Model; onClose: () => void }): React.JSX.Element {
  const store = useStore()
  const toast = useToast()
  const parts = m.splitsOf.get(t.id) ?? []
  const used = parts.reduce((a, x) => a + x.amount_minor, 0)
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const v = parseAmount(amount)
  const bad = v === null || v <= 0 || v >= t.amount_minor - used
  const save = async (): Promise<void> => {
    if (bad || !cat || !store.userId) return
    setBusy(true)
    try { await write(store, ['transaction_splits'], () => supabase().from('transaction_splits').insert({ user_id: store.userId, transaction_id: t.id, category_id: cat, amount_minor: v })); setAmount(''); setCat(null); toast('Split saved') }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const remove = async (id: string): Promise<void> => {
    setBusy(true)
    try { await write(store, ['transaction_splits'], () => supabase().from('transaction_splits').delete().eq('id', id)) } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={`Split ${t.name}`}>
      <div className="panel">
        {parts.map((x) => <div className="row" key={x.id}><span className="who cat"><Icon name={m.meta[x.category_id]?.icon ?? 'tag'} /></span><span className="nm">{m.meta[x.category_id]?.name ?? 'Category'}</span><span className="amt">{kr(x.amount_minor)}<button className="btn link" disabled={busy} onClick={() => void remove(x.id)}>Remove</button></span></div>)}
        <div className="row"><span className="who cat"><Icon name={m.meta[t.category_id ?? '']?.icon ?? 'tag'} /></span><span className="nm">{m.meta[t.category_id ?? '']?.name ?? 'Category'}<span className="meta" style={{ display: 'block' }}>The rest stays here</span></span><span className="amt">{kr(t.amount_minor - used)}</span></div>
      </div>
      <label className="field"><span>Amount for another category</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45" /></label>
      {amount && bad && <p className="note" style={{ color: 'var(--over-text)' }}>Less than {kr(t.amount_minor - used)}, more than 0.</p>}
      <div className="panel" style={{ maxHeight: 280, overflow: 'auto' }}>{m.options.filter((o) => o.parentName.toLowerCase() !== 'income' && o.id !== t.category_id).map((o) => (
        <button key={o.id} className="row" aria-pressed={cat === o.id} onClick={() => setCat(o.id)}><span className="who cat"><Icon name={o.icon} /></span><span className="nm">{o.name}</span><span>{cat === o.id ? <Icon name="check" /> : null}</span></button>
      ))}</div>
      <div className="formfoot"><button className="btn" disabled={bad || !cat || busy} onClick={() => void save()}>Split off {v && !bad ? kr(v) : ''}</button></div>
    </Sheet>
  )
}

export function DetailBody({ t, m, onDone }: { t: TransactionRow; m: Model; onDone?: () => void }): React.JSX.Element {
  const store = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<null | 'cat' | 'split'>(null)
  const [raw, setRaw] = useState(false)
  const w = whoOf(t)
  const meta = m.meta[t.category_id ?? '']
  const ratio = (() => { const s = m.share.get(t.id); return s !== undefined && t.amount_minor ? s : null })()
  const act = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>): Promise<void> => {
    setBusy(true)
    try { await write(store, ['transactions'], run); toast(label) } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const neutral = t.is_shared_topup || t.movement === 'moved' || t.movement === 'ignore'
  const splits = m.splitsOf.get(t.id) ?? []
  const back = m.paidBack.get(t.id) ?? 0
  return (
    <>
      <div className="dhero"><div className="big serif num">{t.kind === 'income' ? <span style={{ color: 'var(--in)' }}>+{kr(t.amount_minor)}</span> : kr(t.amount_minor)}</div><p>{t.name}</p></div>
      {t.needs_review && (
        <div className="inboxask">
          <span>Best guess: <b>{meta?.label ?? 'no category yet'}</b>. Right?</span>
          <button className="btn ghost" onClick={() => setPick('cat')}>Change</button>
          <button className="btn" disabled={busy || !t.category_id} onClick={() => void act('Confirmed', () => supabase().from('transactions').update({ needs_review: false }).eq('id', t.id))}>Yes</button>
        </div>
      )}
      <dl className="dl">
        <div><dt>Date</dt><dd>{dayLabel(t.occurred_on)}{dayLabel(t.occurred_on).includes(' ') ? '' : `, ${shortDate(t.occurred_on)}`}{t.status === 'pending' ? ', pending' : ''}</dd></div>
        {meta && !neutral && <div><dt>Category</dt><dd>{meta.label}{splits.length ? `, ${kr(t.amount_minor - splits.reduce((a, x) => a + x.amount_minor, 0))}` : ''}</dd></div>}
        {splits.map((x) => <div key={x.id}><dt>Split</dt><dd>{m.meta[x.category_id]?.label ?? 'Category'}, {kr(x.amount_minor)}</dd></div>)}
        <div><dt>Whose</dt><dd>{WHO_LABEL[w]}{t.shared && t.paid_by ? `, paid by ${t.paid_by === 'me' ? 'you' : PARTNER}` : ''}</dd></div>
        {t.shared && ratio !== null && <div><dt>Your part</dt><dd className="num">{kr(ratio)}</dd></div>}
        {back > 0 && <div><dt>Paid back</dt><dd className="num">{kr(back)}</dd></div>}
        {neutral && <div><dt>Counts as spending</dt><dd>No, it’s money moved</dd></div>}
        {t.currency_code !== 'DKK' && <div><dt>Paid</dt><dd className="num">{kr(t.original_amount_minor, false, t.currency_code)}</dd></div>}
        {t.comment && <div><dt>Note</dt><dd>{t.comment}</dd></div>}
      </dl>
      {(t.reason || t.reason_source) && (
        <div className="why"><h3>Why</h3><p>{t.reason ?? SOURCE[t.reason_source ?? '']}</p>
          <p className="note" style={{ padding: 0 }}>{SOURCE[t.reason_source ?? ''] ?? ''}{t.confidence !== null && t.confidence !== undefined && t.reason_source !== 'you' ? `, ${t.confidence >= 0.8 ? 'sure' : 'a best guess'}` : ''}</p></div>
      )}
      {t.bank_transaction_id && (raw ? <BankTextRows id={t.bank_transaction_id} /> : <button className="btn link" onClick={() => setRaw(true)}>Show the bank’s text</button>)}
      <div className="panel" style={{ marginTop: 12 }}>
        {!neutral && <button className="linkrow" onClick={() => setPick('cat')}><span className="who"><Icon name="tag" /></span><span>Change category</span><span /></button>}
        {!neutral && t.kind === 'expense' && <button className="linkrow" onClick={() => setPick('split')}><span className="who"><Icon name="split" /></span><span>Split off a part</span><span /></button>}
        {t.source !== 'bank' && t.kind === 'expense' && !t.is_shared_topup && (
          <button className="linkrow" disabled={busy} onClick={() => void act(t.shared ? 'Now yours only' : `Shared with ${PARTNER}`, () => supabase().from('transactions').update(t.shared ? { shared: false, shared_participant: null, is_shared_topup: false } : { shared: true, shared_participant: 'me' }).eq('id', t.id))}>
            <span className="who"><Icon name={t.shared ? 'profile' : 'shared'} /></span><span>{t.shared ? 'Make it yours only' : `Share with ${PARTNER}`}</span><span />
          </button>
        )}
      </div>
      {t.source === 'bank' && t.shared && <p className="note">Everything on the joint account is shared.</p>}
      {pick === 'cat' && <CategoryPick t={t} m={m} onClose={() => { setPick(null); onDone?.() }} />}
      {pick === 'split' && <SplitSheet t={t} m={m} onClose={() => setPick(null)} />}
    </>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }): React.JSX.Element | null {
  const m = useModel()
  const t = m?.tx.find((x) => x.id === id)
  if (!m || !t) return null
  return <Sheet open onClose={onClose} title={t.is_shared_topup || t.movement === 'moved' ? 'Moved' : t.kind === 'income' ? 'Money in' : 'Expense'}><DetailBody t={t} m={m} onDone={onClose} /></Sheet>
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
            <span className={d === today ? 'mkb-today' : undefined}>{label}</span>
            {tot ? <span className="num">{kr(tot)}</span> : null}
            {tot > 0 && <span className="mkb-daybar" aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * (tot - shared)) / top).toFixed(1)}%` }} />{shared > 0 && <i className="sh" style={{ width: `${Math.min(100 - Math.min(100, (100 * (tot - shared)) / top), (100 * shared) / top).toFixed(1)}%` }} />}</span>}
          </div>
          <div className="panel">{items.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={onOpen} current={selected === t.id} />)}</div>
        </div>
      )
    })}</>
  )
}

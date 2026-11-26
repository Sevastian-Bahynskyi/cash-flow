'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { ImportFlow } from './ImportFlow'
import { useStore } from '@/lib/data/store'
import { useModel } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { PARTNER } from '@/lib/partner'
import { addDays, dayLabel, kr, minorToInput, parseAmount, todayYmd, typedAmount } from '@/lib/fmt'
import { convertToDkk, currencyOptions } from '@/lib/domain/currency'
import { findSharedTopupCategoryOption, isAllowedIncomeCategoryOption, isSalaryCategoryOption, normalizeIncomeCategoryOption } from '@/lib/domain/category-rules'
import { normalizeMerchantLookupKey } from '@/lib/domain/merchant'
import type { CategoryOption } from '@/lib/domain/categories-types'
import type { TransactionInsert, TransactionRow } from '@/lib/data/types'

/** What opens the composer: nothing (a new expense), a row to edit, or a few fields to start from. */
export type Draft = Partial<Pick<TransactionRow, 'id' | 'kind' | 'amount_minor' | 'original_amount_minor' | 'currency_code' | 'category_id' | 'name' | 'comment' | 'occurred_on' | 'shared' | 'shared_participant' | 'is_shared_topup' | 'recurring'>> & { import?: boolean }
type Mode = 'expense' | 'income' | 'topup'
const Ctx = createContext<(d?: Draft) => void>(() => undefined)
export const useAdd = (): ((d?: Draft) => void) => useContext(Ctx)

export function AddProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const open = useCallback((d?: Draft) => setDraft(d ?? {}), [])
  return (
    <Ctx.Provider value={open}>
      {children}
      {draft && <Composer key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} onAgain={(d) => setDraft({ ...d })} />}
    </Ctx.Provider>
  )
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del']

/** The fastest add path: amount (keypad), category, name, save (AGENTS.md). Everything else stays one tap away. */
function Composer({ draft, onClose, onAgain }: { draft: Draft; onClose: () => void; onAgain: (d: Draft) => void }): React.JSX.Element | null {
  const store = useStore()
  const m = useModel()
  const toast = useToast()
  const editing = Boolean(draft.id)
  const [mode, setMode] = useState<Mode>(draft.is_shared_topup ? 'topup' : draft.kind === 'income' ? 'income' : 'expense')
  const [amt, setAmt] = useState(draft.original_amount_minor ?? draft.amount_minor ? minorToInput((draft.original_amount_minor ?? draft.amount_minor) as number) : '')
  const [ccy, setCcy] = useState(draft.currency_code ?? 'DKK')
  const [cat, setCat] = useState<string | null>(draft.category_id ?? null)
  const [name, setName] = useState(draft.name ?? '')
  const [note, setNote] = useState<string | null>(draft.comment ?? null)
  const [date, setDate] = useState(draft.occurred_on ?? todayYmd())
  const [shared, setShared] = useState(Boolean(draft.shared))
  const [fromAnna, setFromAnna] = useState(draft.shared_participant === 'gf')
  const [step, setStep] = useState<1 | 2 | 3 | 'import'>(draft.import ? 'import' : editing && draft.category_id ? 1 : 1)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sug, setSug] = useState<{ id: string; blockKey: string } | null>(null)
  const [noSug, setNoSug] = useState(false)
  const amtRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const minor = parseAmount(amt.endsWith(',') ? amt.slice(0, -1) : amt) ?? 0
  const partner = PARTNER

  const options = m?.options ?? []
  const optById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const forMode = useMemo(() => options.filter((o) => mode === 'income' ? isAllowedIncomeCategoryOption(o) && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income'), [options, mode])
  const recent = useMemo(() => {
    const seen: string[] = []
    for (const r of [...(m?.tx ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
      if ((mode === 'income') !== (r.kind === 'income') || r.is_shared_topup || seen.includes(r.category_id ?? '')) continue
      if (r.category_id && forMode.some((o) => o.id === r.category_id)) seen.push(r.category_id)
      if (seen.length >= 5) break
    }
    return seen.map((id) => optById.get(id)).filter(Boolean) as CategoryOption[]
  }, [m, mode, forMode, optById])
  const leftIn = (o: CategoryOption): number | null => {
    if (!m) return null
    const b = m.budgetsOf(m.current).list.find((x) => x.id === o.parentId)
    return b ? b.left : null
  }
  const names = useMemo(() => {
    if (!m || !cat) return []
    const f = new Map<string, number>()
    for (const r of m.tx) if (r.category_id === cat) f.set(r.name, (f.get(r.name) ?? 0) + 1)
    return [...f.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n)
  }, [m, cat])

  useEffect(() => { if (step === 1) amtRef.current?.focus({ preventScroll: true }); if (step === 3) nameRef.current?.focus() }, [step])

  // A suggestion from the user's own rules and history; it never blocks Save and never says "AI".
  useEffect(() => {
    const key = normalizeMerchantLookupKey(name)
    if (step !== 3 || mode === 'topup' || noSug || key.length < 2) { setSug(null); return }
    const t = window.setTimeout(async () => {
      const { data } = await supabase().rpc('rank_transaction_category_candidates', { kind_input: mode, raw_text_input: name, normalized_merchant_input: key, bank_category_input: null, sender_input: null, receiver_input: null, limit_input: 3 })
      const top = (data as { category_id: string; source: string; confidence: number }[] | null)?.[0]
      setSug(top && top.category_id !== cat && optById.has(top.category_id) && (top.source === 'rule' || top.confidence >= 0.85) ? { id: top.category_id, blockKey: key } : null)
    }, 300)
    return () => window.clearTimeout(t)
  }, [name, step, mode, cat, noSug, optById])

  const key = (k: string): void => {
    setErr(null)
    setAmt((a) => {
      if (k === 'del') return a.slice(0, -1)
      if (k === ',') return a.includes(',') ? a : (a || '0') + ','
      const [w, f] = a.split(',')
      if ((f !== undefined && f.length >= 2) || (f === undefined && (w ?? '').length >= 7)) return a
      return (a === '0' ? '' : a) + k
    })
  }
  const next = (): void => {
    if (minor <= 0) return
    if (mode === 'topup') { setName((n) => n || 'Top-up, shared account'); setStep(3) } else setStep(cat && editing ? 3 : 2)
  }

  async function save(again: boolean): Promise<void> {
    if (!m || !store.userId || busy) return
    if (minor <= 0) { setStep(1); setErr('Type an amount first.'); return }
    if (!name.trim()) { setErr('Give it a short name.'); return }
    let opt = cat ? optById.get(cat) ?? null : null
    if (mode === 'topup') opt = findSharedTopupCategoryOption(options)
    if (mode === 'income') opt = normalizeIncomeCategoryOption(opt, options)
    if (!opt) { setStep(2); setErr('Pick a category.'); return }
    setBusy(true); setErr(null)
    try {
      const fx = ccy === 'DKK' ? { convertedMinor: minor, rate: 1 } : await convertToDkk(minor, ccy, date)
      const kind = mode === 'income' ? 'income' : 'expense'
      const row: TransactionInsert = {
        user_id: store.userId, kind, amount_minor: fx.convertedMinor, occurred_on: date, name: name.trim(), comment: note?.trim() || null,
        category_id: opt.id, country_iso: null, recurring: Boolean(draft.recurring), shared: kind === 'expense' && mode !== 'topup' ? shared : false,
        shared_participant: mode === 'topup' ? (fromAnna ? 'gf' : 'me') : shared && kind === 'expense' ? 'me' : null,
        is_salary: kind === 'income' && isSalaryCategoryOption(opt), is_shared_topup: mode === 'topup',
        currency_code: ccy, original_amount_minor: minor, converted_amount_minor: fx.convertedMinor, fx_rate: fx.rate,
      }
      if (editing && draft.id) {
        const { user_id: _u, ...update } = row
        const { error } = await supabase().from('transactions').update(update).eq('id', draft.id)
        if (error) throw new Error(error.message)
        await store.reload(['transactions'])
        toast(`Changed ${row.name}`)
      } else {
        const [saved] = await store.addTransactions([row])
        toast(store.offline || !navigator.onLine ? `Saved on this device, ${row.name}. It syncs when you’re online.` : `Saved ${kr(row.amount_minor)}, ${row.name}`,
          saved && !saved.id.startsWith('local-') ? () => { void supabase().from('transactions').delete().eq('id', saved.id).then(() => store.reload(['transactions'])) } : undefined)
        if (navigator.onLine && mode !== 'topup') void remember(store.userId, row, opt)
      }
      if (again) onAgain({ kind: row.kind }); else onClose()
    } catch (e) {
      setErr(e instanceof Error && /exchange|convert/i.test(e.message) ? `Couldn’t get the ${ccy} rate. Check the connection or save it in kr.` : `Not saved. ${e instanceof Error ? e.message : ''}`.trim())
    } finally { setBusy(false) }
  }

  async function blockSuggestions(): Promise<void> {
    if (!sug || !store.userId) return
    setNoSug(true); setSug(null)
    const { error } = await supabase().from('merchant_category_rules').upsert({ user_id: store.userId, kind: mode === 'income' ? 'income' : 'expense', match_target: 'normalized_merchant', match_type: 'exact', pattern: sug.blockKey, canonical_merchant: name.trim(), category_id: null, is_shared_topup: false, is_blocked: true, priority: 300, source: 'manual', notes: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,kind,match_target,match_type,pattern' })
    toast(error ? 'Couldn’t save that. Try again later.' : `No more suggestions for ${name.trim()}`)
    if (!error) void store.reload(['merchant_category_rules'])
  }

  if (!m) return null
  const title = editing ? 'Edit' : mode === 'income' ? 'Money in' : mode === 'topup' ? 'Move to the pot' : 'New expense'
  const opt = cat ? optById.get(cat) : undefined
  const stepNames = ['Amount', mode === 'topup' ? 'To the pot' : 'Category', 'Name']
  const catRow = (o: CategoryOption): React.JSX.Element => {
    const left = mode === 'expense' ? leftIn(o) : null
    return (
      <button key={o.id} className="row" onClick={() => { setCat(o.id); setStep(3); setQ('') }} aria-pressed={cat === o.id}>
        <span className="who cat"><Icon name={o.icon} /></span>
        <span className="nm">{o.parentId !== o.id ? o.name : o.name}<span className="meta" style={{ display: 'block' }}>{o.parentId !== o.id ? o.parentName : ''}</span></span>
        {left === null ? <span /> : left < 0 ? <span className="amt" style={{ color: 'var(--over-text)', fontWeight: 500 }}>{kr(-left, true)} over</span> : <span className="amt" style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{kr(left, true)} left</span>}
      </button>
    )
  }
  const hits = q ? forMode.filter((o) => o.searchKey.includes(q.toLowerCase())) : []

  return (
    <Sheet open onClose={onClose} label={title} title={title} right={step === 1 && !editing ? <button className="iconbtn" onClick={() => setStep('import')} aria-label="Import from a receipt or a bank file"><Icon name="import" /></button> : undefined}>
      {step !== 'import' && (
        <div className="steps" role="list">
          {stepNames.map((s, i) => (
            <button key={s} role="listitem" onClick={() => setStep((i + 1) as 1 | 2 | 3)} aria-current={step === i + 1 ? 'step' : undefined}
              className={typeof step === 'number' && step > i + 1 ? 'done' : ''} disabled={typeof step !== 'number' || i + 1 > step || (mode === 'topup' && i === 1)}>{s}</button>
          ))}
        </div>
      )}
      {step === 'import' && <ImportFlow onDone={onClose} />}
      {step === 1 && (
        <>
          <div className="amountbox">
            <div ref={amtRef} id="amt" className={`big serif num ${amt ? '' : 'zero'}`} role="textbox" aria-label="Amount" tabIndex={0} inputMode="decimal"
              onKeyDown={(e) => {
                if (/^[0-9]$/.test(e.key)) { key(e.key); e.preventDefault() } else if (e.key === ',' || e.key === '.') { key(','); e.preventDefault() } else if (e.key === 'Backspace') { key('del'); e.preventDefault() } else if (e.key === 'Enter') next()
              }}>{typedAmount(amt, ccy)}</div>
            <p>{mode === 'income' ? 'Coming in' : mode === 'topup' ? `Into the pot with ${partner}. Not spending.` : shared ? `Shared with ${partner}, from the pot` : 'Yours'}</p>
            {err && <p style={{ color: 'var(--over-text)' }} role="alert">{err}</p>}
          </div>
          <div className="off">
            <label className="offdate"><Icon name="cal" /><span>{dayLabel(date)}</span><input type="date" value={date} max={addDays(todayYmd(), 366)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" /></label>
            <button onClick={() => setNote((n) => (n === null ? '' : n))} aria-pressed={note !== null}><Icon name="note" />Note</button>
            {mode === 'expense' && <button onClick={() => setShared((s) => !s)} aria-pressed={shared}><span className="shmark"><svg viewBox="0 0 26 20" aria-hidden="true"><circle cx="9" cy="10" r="6" fill="var(--anna)" /><circle cx="16" cy="10" r="6" fill="var(--you)" stroke="var(--surface)" strokeWidth="2" /></svg></span>With {partner}</button>}
            <button onClick={() => { setMode((x) => (x === 'income' ? 'expense' : 'income')); setCat(null); setShared(false) }} aria-pressed={mode === 'income'}><Icon name="in" />Income</button>
            <button onClick={() => { setMode((x) => (x === 'topup' ? 'expense' : 'topup')); setShared(false) }} aria-pressed={mode === 'topup'}><Icon name="moved" />To the pot</button>
            {mode === 'topup' && <button onClick={() => setFromAnna((a) => !a)} aria-pressed={fromAnna}>{fromAnna ? `From ${partner}` : 'From you'}</button>}
            <label className="offdate"><span>{ccy}</span><select value={ccy} onChange={(e) => setCcy(e.target.value)} aria-label="Currency">{currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
            {!editing && m.tx.length > 0 && <button onClick={() => { const last = [...m.tx].reverse().find((r) => r.kind === 'expense' && !r.is_shared_topup); if (last) { setAmt(minorToInput(last.amount_minor)); setCat(last.category_id); setName(last.name); setShared(last.shared); setStep(3) } }}><Icon name="retry" />Same as last</button>}
          </div>
          {note !== null && <input className="notein" placeholder="Note" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}
          <div className="keys">{KEYS.map((k) => <button key={k} onClick={() => key(k)} aria-label={k === 'del' ? 'Delete' : k === ',' ? 'Decimal comma' : k}>{k === 'del' ? <Icon name="del" /> : k}</button>)}</div>
          <button className="btn next" onClick={next} disabled={minor <= 0}>Next</button>
        </>
      )}
      {step === 2 && (
        <>
          <div className="summary"><span className="serif num">{kr(minor, false, ccy)}</span><span style={{ color: 'var(--ink-2)' }}>{shared ? `Shared with ${partner}` : mode === 'income' ? 'Money in' : 'Yours'}</span></div>
          <label className="search" style={{ background: 'var(--surface)', marginTop: 10 }}><Icon name="search" /><span className="sr">Search categories</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" /></label>
          {err && <p className="note" style={{ color: 'var(--over-text)' }} role="alert">{err}</p>}
          <div className="catlist">
            {q ? <div className="panel">{hits.length ? hits.map(catRow) : <div className="empty">No category matches.</div>}</div> : (
              <>
                {recent.length > 0 && <><div className="lbl">Recent</div><div className="panel recent">{recent.map(catRow)}</div></>}
                <div className="lbl">All categories</div><div className="panel">{forMode.map(catRow)}</div>
              </>
            )}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <div className="summary"><span className="serif num">{kr(minor, false, ccy)}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--ink-2)' }}>{mode === 'topup' ? <><Icon name="moved" />To the pot</> : opt ? <><Icon name={opt.icon} />{opt.name}</> : null}</span></div>
          <div className="namebox"><label htmlFor="nm">Name</label><input id="nm" ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setErr(null) }} onKeyDown={(e) => { if (e.key === 'Enter') void save(false) }} autoComplete="off" enterKeyHint="done" placeholder="Name" maxLength={120} /></div>
          {sug && optById.get(sug.id) && (
            <div className="offline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <span>Suggested: <b>{optById.get(sug.id)?.name}</b></span><span className="spacer" />
              <button className="btn link" style={{ minHeight: 36 }} onClick={() => { setCat(sug.id); setSug(null) }}>Use it</button>
              <button className="btn link" style={{ minHeight: 36, color: 'var(--ink-3)' }} onClick={() => void blockSuggestions()}>Don’t suggest again</button>
            </div>
          )}
          {mode === 'income' && opt && isSalaryCategoryOption(opt) && <p className="note"><Icon name="info" /> This salary starts a new cycle on {dayLabel(date)}.</p>}
          <div className="sugs" aria-label="Names you used before">{(mode === 'topup' ? ['Top-up, shared account'] : names).map((n) => <button key={n} onClick={() => setName(n)}>{n}</button>)}</div>
          {err && <p className="note" style={{ color: 'var(--over-text)' }} role="alert">{err}</p>}
          <span className="spacer" />
          <button className="btn next" onClick={() => void save(false)} disabled={!name.trim() || busy}>{busy ? 'Saving…' : 'Save'}</button>
          {!editing && <button className="btn ghost next" style={{ marginTop: 6 }} onClick={() => void save(true)} disabled={!name.trim() || busy}>Save and add another</button>}
        </>
      )}
    </Sheet>
  )
}

/** Learns merchant → category from what was saved (DATA.md § 3, saveMerchantMemoryObservation). Best effort. */
async function remember(userId: string, row: TransactionInsert, opt: CategoryOption): Promise<void> {
  const key = normalizeMerchantLookupKey(row.name)
  if (key.length < 2) return
  const db = supabase()
  const { data } = await db.from('merchant_category_memory').select('id,category_id,observation_count,support_ratio,sample_names,is_shared_topup').eq('kind', row.kind).eq('normalized_merchant', key).maybeSingle()
  if (!data) {
    await db.from('merchant_category_memory').insert({ user_id: userId, kind: row.kind, normalized_merchant: key, canonical_merchant: row.name, category_id: opt.id, is_shared_topup: row.is_shared_topup, observation_count: 1, support_ratio: 1, sample_names: [row.name], last_seen_on: row.occurred_on, source: 'app' })
    return
  }
  if (data.category_id !== opt.id) return
  const n = (data.observation_count as number) + 1
  const names = [...new Set([row.name, ...((data.sample_names as string[] | null) ?? [])])].slice(0, 4)
  await db.from('merchant_category_memory').update({ observation_count: n, support_ratio: Math.min(1, ((data.support_ratio as number) * (n - 1) + 1) / n), sample_names: names, last_seen_on: row.occurred_on, is_shared_topup: Boolean(data.is_shared_topup) || row.is_shared_topup, updated_at: new Date().toISOString() }).eq('id', data.id)
}

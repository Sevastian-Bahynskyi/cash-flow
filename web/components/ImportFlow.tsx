'use client'

import { useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { useStore } from '@/lib/data/store'
import { useModel } from '@/lib/data/model'
import { supabase } from '@/lib/supabase/client'
import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase/config'
import { dayLabel, kr, todayYmd } from '@/lib/fmt'
import { convertToDkk } from '@/lib/domain/currency'
import { findSharedTopupCategoryOption, isAllowedIncomeCategoryOption, isSalaryCategoryOption, normalizeIncomeCategoryOption } from '@/lib/domain/category-rules'
import type { TransactionInsert } from '@/lib/data/types'

type Parsed = { kind: 'expense' | 'income'; name: string; amount: number; currencyCode: string; categoryId: string | null; comment: string | null; occurredOn: string; suggestedSharedTopup?: boolean }
type Row = { key: string; kind: 'expense' | 'income'; name: string; minor: number; ccy: string; cat: string | null; note: string | null; date: string; topup: boolean; dup: boolean }

/** Downscale a photo before sending it (the Expo app sent quality 0.55); big phone photos are slow to upload. */
async function imageDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

/** Many at once from a receipt or a bank file; every row is checked here before anything saves (DATA.md § 3). */
export function ImportFlow({ onDone }: { onDone: () => void }): React.JSX.Element | null {
  const store = useStore()
  const m = useModel()
  const toast = useToast()
  const [busy, setBusy] = useState<null | 'image' | 'csv' | 'save'>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const img = useRef<HTMLInputElement>(null)
  const csv = useRef<HTMLInputElement>(null)
  const candidates = useMemo(() => (m?.options ?? []).map((o) => ({ id: o.id, parent: o.parentName, name: o.name })), [m])
  if (!m) return null

  async function run(kind: 'image' | 'csv', file: File): Promise<void> {
    if (!m) return
    setErr(null); setBusy(kind)
    try {
      if (!navigator.onLine) throw new Error('You’re offline. Import needs a connection.')
      const { data: s } = await supabase().auth.getSession()
      const token = s.session?.access_token
      if (!token) throw new Error('Your session ended. Sign in again.')
      const body = kind === 'image' ? { imageDataUrl: await imageDataUrl(file) } : { csvText: await file.text(), fileName: file.name }
      const res = await fetch(`${supabaseUrl}/functions/v1/parse-transaction-${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabasePublishableKey },
        body: JSON.stringify({ ...body, candidates, today: todayYmd() }),
      })
      const json = (await res.json().catch(() => ({}))) as { transactions?: Parsed[]; error?: string }
      if (res.status === 401) throw new Error('Your session ended. Sign in again.')
      if (!res.ok || json.error) throw new Error(json.error ?? 'The file couldn’t be read.')
      const seen = new Set(m.tx.map((t) => `${t.name.trim().toLowerCase()}|${t.occurred_on}|${t.currency_code}|${t.original_amount_minor}`))
      const out: Row[] = []
      for (const [i, p] of (json.transactions ?? []).entries()) {
        const minor = Math.round(Math.abs(Number(p.amount)) * 100)
        if (!p.name?.trim() || !minor) continue
        const date = /^\d{4}-\d{2}-\d{2}$/.test(p.occurredOn) ? p.occurredOn : todayYmd()
        const ccy = /^[A-Z]{3}$/.test(p.currencyCode ?? '') ? p.currencyCode : 'DKK'
        const k = `${p.name.trim().toLowerCase()}|${date}|${ccy}|${minor}`
        out.push({ key: `${i}`, kind: p.kind === 'income' ? 'income' : 'expense', name: p.name.trim(), minor, ccy, cat: p.categoryId && m.options.some((o) => o.id === p.categoryId) ? p.categoryId : null, note: p.comment, date, topup: Boolean(p.suggestedSharedTopup), dup: seen.has(k) })
        seen.add(k)
      }
      setRows(out.filter((r) => !r.dup))
      if (out.some((r) => r.dup)) toast(`${out.filter((r) => r.dup).length} already in Cashflow, left out`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The file couldn’t be read.')
    } finally { setBusy(null) }
  }

  async function saveAll(): Promise<void> {
    if (!rows || !store.userId || !m) return
    setBusy('save'); setErr(null)
    try {
      const topupCat = findSharedTopupCategoryOption(m.options)
      const payload: TransactionInsert[] = []
      for (const r of rows) {
        const fx = r.ccy === 'DKK' ? { convertedMinor: r.minor, rate: 1 } : await convertToDkk(r.minor, r.ccy, r.date)
        const raw = m.options.find((o) => o.id === (r.topup ? topupCat?.id : r.cat)) ?? null
        const opt = r.kind === 'income' ? normalizeIncomeCategoryOption(raw, m.options) : raw
        if (!opt) throw new Error(`${r.name} needs a category.`)
        payload.push({ user_id: store.userId, kind: r.kind, amount_minor: fx.convertedMinor, occurred_on: r.date, name: r.name, comment: r.note, category_id: opt.id, country_iso: null, recurring: false, shared: false, shared_participant: r.topup ? 'me' : null, is_salary: r.kind === 'income' && isSalaryCategoryOption(opt), is_shared_topup: r.kind === 'expense' && r.topup, currency_code: r.ccy, original_amount_minor: r.minor, converted_amount_minor: fx.convertedMinor, fx_rate: fx.rate })
      }
      await store.addTransactions(payload)
      toast(`Saved ${payload.length}`)
      onDone()
    } catch (e) {
      setErr(`Not saved. ${e instanceof Error ? e.message : ''}`)
    } finally { setBusy(null) }
  }

  if (!rows) return (
    <>
      <p className="note" style={{ padding: '8px 4px 14px' }}>Add many at once. You check each one before it saves.</p>
      <div className="panel">
        <button className="linkrow" onClick={() => img.current?.click()} disabled={Boolean(busy)}><span className="who"><Icon name="image" /></span><span>Screenshot or receipt<span className="sub">A photo or an image</span></span><span className="end"><Icon name="chev" /></span></button>
        <button className="linkrow" onClick={() => csv.current?.click()} disabled={Boolean(busy)}><span className="who"><Icon name="import" /></span><span>Bank statement<span className="sub">A CSV file from your bank</span></span><span className="end"><Icon name="chev" /></span></button>
      </div>
      <input ref={img} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run('image', f) }} />
      <input ref={csv} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run('csv', f) }} />
      {busy && <div className="amountbox"><span className="sk" style={{ width: 56, height: 56, borderRadius: 16 }} /><p>{busy === 'csv' ? 'Reading the statement…' : 'Reading the image…'}</p></div>}
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}><span>{err}</span></div>}
    </>
  )

  const need = rows.filter((r) => !r.topup && !r.cat && (r.kind === 'expense' || !normalizeIncomeCategoryOption(null, m.options))).length
  return (
    <>
      <p className="note" style={{ padding: '4px 4px 12px' }}>{rows.length} found. Nothing saves until you do.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.length === 0 && <div className="panel"><div className="empty"><b>Nothing left to add</b>Close, or pick another file.</div></div>}
        {rows.map((r) => {
          const opt = m.options.find((o) => o.id === r.cat)
          return (
            <div className="icard" key={r.key}>
              <div className="top"><span className="nm">{r.name}</span><b className="num" style={r.kind === 'income' ? { color: 'var(--in)' } : undefined}>{r.kind === 'income' ? '+' : ''}{kr(r.minor, false, r.ccy)}</b></div>
              <div className="meta"><Icon name="cal" />{dayLabel(r.date)}{r.topup ? <><Icon name="moved" />To the pot</> : opt ? <><Icon name={opt.icon} />{opt.name}</> : <span className="need">Needs a category</span>}</div>
              <div className="acts">
                <button onClick={() => setPick(pick === r.key ? null : r.key)}>{r.cat ? 'Change category' : 'Pick a category'}</button>
                <button onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>
              </div>
              {pick === r.key && (
                <div className="panel">{m.options.filter((o) => r.kind === 'income' ? isAllowedIncomeCategoryOption(o) && o.parentId !== o.id : o.parentName.toLowerCase() !== 'income').map((o) => (
                  <button className="row" key={o.id} onClick={() => { setRows(rows.map((x) => x.key === r.key ? { ...x, cat: o.id, topup: false } : x)); setPick(null) }}><span className="who cat"><Icon name={o.icon} /></span><span className="nm">{o.name}</span><span /></button>
                ))}</div>
              )}
            </div>
          )
        })}
      </div>
      {err && <div className="err" role="alert" style={{ marginTop: 12 }}><span>{err}</span></div>}
      <div className="formfoot" style={{ position: 'sticky', bottom: 0, background: 'var(--ground)' }}>
        <button className="btn" onClick={() => void saveAll()} disabled={!rows.length || need > 0 || busy === 'save'}>{busy === 'save' ? 'Saving…' : need ? `${need} still need a category` : `Save ${rows.length}`}</button>
      </div>
    </>
  )
}

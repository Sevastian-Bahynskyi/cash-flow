'use client'

import { normalizeMerchantLookupKey } from '@/lib/domain/merchant'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Gate, SkRows, StatusLine } from '@/components/ui'
import { DeleteAsk, FormErr, Seg, Toggle, useSaver } from '@/components/settings/kit'
import { useStore } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import type { MerchantRuleRow } from '@/lib/data/types'
import { findSharedTopupCategoryOption, isAllowedIncomeCategoryOption, isIncomeCategoryOption } from '@/lib/domain/category-rules'
import { supabase } from '@/lib/supabase/client'
import { useWide } from '@/lib/useWide'

type Kind = 'expense' | 'income'
type Match = MerchantRuleRow['match_type']
type Draft = { pattern: string; match: Match; kind: Kind; cat: string | null; block: boolean; topup: boolean; note: string }
const MATCH: Record<Match, string> = { exact: 'Is exactly', prefix: 'Starts with', contains: 'Contains', regex: 'Matches a pattern' }

const whatOf = (r: MerchantRuleRow, m: Model): string => r.is_blocked ? 'No suggestions' : r.is_shared_topup ? 'Top-up to the pot' : m.meta[r.category_id ?? '']?.name ?? 'Category'
const iconOf = (r: MerchantRuleRow, m: Model): string => r.is_blocked ? 'close' : r.is_shared_topup ? 'moved' : m.meta[r.category_id ?? '']?.icon ?? 'other'

function Rules({ m }: { m: Model }): React.JSX.Element {
  const params = useSearchParams()
  const router = useRouter()
  const wide = useWide()
  const [q, setQ] = useState('')
  const fromTx = params.get('new')
  // From a transaction's "Always put X here": open a new rule with its name, type and category.
  const [open, setOpen] = useState<MerchantRuleRow | 'new' | null>(fromTx !== null ? 'new' : null)
  const [prefill, setPrefill] = useState<Partial<Draft> | null>(fromTx !== null ? { pattern: fromTx.trim().toLowerCase(), kind: params.get('kind') === 'income' ? 'income' : 'expense', cat: params.get('cat') || null } : null)
  const close = (): void => { setOpen(null); setPrefill(null); if (fromTx !== null) router.replace('/rules') }
  const startNew = (): void => { setPrefill(null); setOpen('new') }
  const rules = m.t.merchant_category_rules
  const s = q.trim().toLowerCase()
  const list = s ? rules.filter((r) => `${r.pattern} ${whatOf(r, m)} ${m.meta[r.category_id ?? '']?.label ?? ''} ${r.kind}`.toLowerCase().includes(s)) : rules
  return (
    <>
      <Header title="Merchant rules" big="Merchant rules" aside="A rule always wins over a suggestion" back={!wide} right={<button className="iconbtn" onClick={startNew} aria-label="New rule"><Icon name="add" /></button>} />
      <StatusLine />
      <div style={{ maxWidth: 760 }}>
        {rules.length > 0 && <label className="search" style={{ background: 'var(--surface)' }}><Icon name="search" /><span className="sr">Search rules</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" /></label>}
        <div className="panel">{list.length ? list.map((r) => (
          <button key={r.id} className="linkrow" onClick={() => { setPrefill(null); setOpen(r) }}>
            <span className="who"><Icon name={iconOf(r, m)} /></span>
            <span style={{ minWidth: 0 }}><span className="nm">{r.pattern}</span><span className="sub">{MATCH[r.match_type]}, then {whatOf(r, m)}{r.kind === 'income' ? ', income' : ''}</span></span>
            <span className="end"><Icon name="chev" /></span>
          </button>
        )) : s ? <div className="empty"><b>No rule matches</b>Try part of the merchant name.</div>
          : <div className="empty"><b>No rules yet</b>Make one from any transaction, or here.<br /><button className="btn" onClick={startNew}><Icon name="add" />Add rule</button></div>}</div>
      </div>
      {open && <RuleSheet key={open === 'new' ? 'new' : open.id} m={m} rule={open === 'new' ? null : open} prefill={prefill} onClose={close} />}
    </>
  )
}

function RuleSheet({ m, rule, prefill, onClose }: { m: Model; rule: MerchantRuleRow | null; prefill: Partial<Draft> | null; onClose: () => void }): React.JSX.Element {
  const { userId } = useStore()
  const { busy, err, save } = useSaver()
  const [d, setD] = useState<Draft>(() => ({
    pattern: rule?.pattern ?? '', match: rule?.match_type ?? 'exact', kind: rule?.kind ?? 'expense', cat: rule?.category_id ?? null,
    block: rule?.is_blocked ?? false, topup: rule?.is_shared_topup ?? false, note: rule?.notes ?? '', ...prefill,
  }))
  const [e, setE] = useState<{ pattern?: string; cat?: string }>({})
  const [ask, setAsk] = useState(false)
  const set = (p: Partial<Draft>): void => setD((x) => ({ ...x, ...p }))
  const topup = d.kind === 'expense' && d.topup
  const options = m.options.filter((o) => d.kind === 'income' ? isAllowedIncomeCategoryOption(o) : !isIncomeCategoryOption(o))

  const go = async (): Promise<void> => {
    // Rules match the normalized merchant key (DATA.md § 3), so store the pattern the same way.
    const pattern = normalizeMerchantLookupKey(d.pattern) || d.pattern.trim().toLowerCase()
    const topupCat = topup ? findSharedTopupCategoryOption(m.options)?.id ?? null : null
    const cat = d.block ? null : topup ? topupCat : d.cat
    const next: typeof e = {}
    if (pattern.length < 2) next.pattern = 'Type at least two letters of the merchant’s name.'
    if (!d.block && !cat) next.cat = topup ? 'There is no Top up category to put it in.' : 'Pick a category.'
    setE(next)
    if (Object.keys(next).length) return
    const now = new Date().toISOString()
    const fields = { kind: d.kind, match_type: d.match, pattern, canonical_merchant: pattern, category_id: cat, is_blocked: d.block, is_shared_topup: topup, notes: d.note.trim() || null, updated_at: now }
    const ok = await save('Rule saved', [[['merchant_category_rules'], () => rule
      ? supabase().from('merchant_category_rules').update(fields).eq('id', rule.id)
      : supabase().from('merchant_category_rules').upsert({ user_id: userId, match_target: 'normalized_merchant', priority: 300, source: 'manual', ...fields }, { onConflict: 'user_id,kind,match_target,match_type,pattern' })]])
    if (ok) onClose()
  }
  const del = async (): Promise<void> => { if (rule && await save('Rule deleted', [[['merchant_category_rules'], () => supabase().from('merchant_category_rules').delete().eq('id', rule.id)]])) onClose() }

  return (
    <Sheet open onClose={onClose} title={rule ? 'Edit rule' : 'New rule'}>
      <label className="field" htmlFor="rp"><span>Merchant name</span>
        <input id="rp" value={d.pattern} onChange={(ev) => { set({ pattern: ev.target.value }); setE({ ...e, pattern: undefined }) }} placeholder="for example netto" autoComplete="off" autoCapitalize="none" />
        <span className="hint">Matched without caring about capitals</span>
        {e.pattern && <span className="err2">{e.pattern}</span>}</label>
      <div className="field"><span>Match when the name</span><Seg label="Match when the name" value={d.match} onChange={(v) => set({ match: v })} options={[['exact', 'Is exactly'], ['prefix', 'Starts with'], ['contains', 'Contains']]} /></div>
      <div className="field"><span>Type</span><Seg label="Type" value={d.kind} onChange={(v) => set({ kind: v, cat: null, topup: false })} options={[['expense', 'Expense'], ['income', 'Income']]} /></div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <Toggle on={d.block} onChange={(v) => { set({ block: v }); setE({ ...e, cat: undefined }) }} label="Don’t suggest a category" sub="No suggestion for this merchant" />
        {d.kind === 'expense' && <Toggle on={d.topup} onChange={(v) => { set({ topup: v }); setE({ ...e, cat: undefined }) }} label="It’s a top-up to the pot" sub="Counted as money moved, not spending" />}
      </div>
      {!d.block && !topup && (
        <div className="field" role="group" aria-label="Category"><span>Category</span>
          <div className="panel">{options.map((o) => (
            <button key={o.id} className="row" aria-pressed={d.cat === o.id} onClick={() => { set({ cat: o.id }); setE({ ...e, cat: undefined }) }} style={d.cat === o.id ? { background: 'var(--you-soft)' } : undefined}>
              <span className="who cat"><Icon name={o.icon} /></span>
              <span style={{ minWidth: 0 }}><div className="nm">{o.name}</div>{o.parentId !== o.id && <div className="meta">{o.parentName}</div>}</span>
              <span>{d.cat === o.id ? <Icon name="check" /> : null}</span>
            </button>
          ))}</div>
          {e.cat && <span className="err2">{e.cat}</span>}
        </div>
      )}
      {(d.block || topup) && e.cat && <p className="field"><span className="err2">{e.cat}</span></p>}
      <label className="field" htmlFor="rn"><span>Note</span><textarea id="rn" value={d.note} onChange={(ev) => set({ note: ev.target.value })} placeholder="Optional" /></label>
      {ask && <DeleteAsk what="this rule" busy={busy} onYes={() => void del()} onNo={() => setAsk(false)} />}
      <FormErr err={err === 'That already exists.' ? 'A rule for this name already exists.' : err} />
      <div className="formfoot">
        {rule && !ask && <button className="btn danger" onClick={() => setAsk(true)}>Delete…</button>}
        <button className="btn" disabled={busy} onClick={() => void go()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Sheet>
  )
}

export default function Page(): React.JSX.Element {
  return (
    <Suspense>
      <Gate skeleton={<><Header title="Merchant rules" /><div className="panel"><SkRows n={5} /></div></>}>
        {(m) => <Rules m={m} />}
      </Gate>
    </Suspense>
  )
}

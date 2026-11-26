'use client'

import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { Gate, NavRow, SkRows, StatusLine } from '@/components/ui'
import { FormErr, Seg, Toggle, useSaver } from '@/components/settings/kit'
import { budgetAlerts } from '@/components/settings/alerts'
import { useStore } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import { kr, shortDate, todayYmd } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'
import { supabase } from '@/lib/supabase/client'
import { useWide } from '@/lib/useWide'

const REMINDER_KEY = 'cashflow:reminder'
type ExportRow = { occurred_on: string; name: string; kind: 'expense' | 'income'; converted_amount_minor: number; original_amount_minor: number; currency_code: string; shared: boolean; is_shared_topup: boolean; shared_participant: 'me' | 'gf' | null; categories: { name: string } | { name: string }[] | null }

function Me(): React.JSX.Element {
  const { tables, userId } = useStore()
  const { busy, err, save } = useSaver()
  const p = tables?.profile ?? null
  const [name, setName] = useState(p?.display_name ?? '')
  const file = useRef<HTMLInputElement>(null)
  const initial = (name || 'You').trim()[0]?.toUpperCase() ?? 'Y'
  const saveName = async (): Promise<void> => {
    const n = name.trim() || null
    if (n === (p?.display_name ?? null)) return
    await save('Name saved', [[['profile'], () => supabase().from('profiles').upsert({ user_id: userId, display_name: n, updated_at: new Date().toISOString() })]])
  }
  const upload = async (f: File): Promise<void> => {
    const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : f.type === 'image/heic' ? 'heic' : 'jpg'
    const path = `${userId}/avatar.${ext}`
    await save('Picture saved', [
      [[], () => supabase().storage.from('avatars').upload(path, f, { contentType: f.type || 'image/jpeg', upsert: true })],
      [['profile'], () => {
        const url = supabase().storage.from('avatars').getPublicUrl(path).data.publicUrl
        // ?v= busts the cache: the path stays the same on every upload (DATA.md § 2).
        return supabase().from('profiles').upsert({ user_id: userId, display_name: name.trim() || null, avatar_url: `${url}?v=${Date.now()}`, updated_at: new Date().toISOString() })
      }],
    ])
  }
  return (
    <>
      <div className="me">
        <button className="mepic" onClick={() => file.current?.click()} disabled={busy} aria-label="Change profile picture">
          {p?.avatar_url ? <img src={p.avatar_url} alt="" width={84} height={84} /> : <span className="avatar big">{initial}</span>}
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
        <label className="field" htmlFor="pname" style={{ flex: 1, margin: 0 }}><span>Name</span>
          <input id="pname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} autoComplete="name" enterKeyHint="done" />
        </label>
      </div>
      <FormErr err={err} />
    </>
  )
}

function Reminder(): React.JSX.Element {
  const toast = useToast()
  const [on, setOn] = useState(false)
  useEffect(() => { try { setOn(localStorage.getItem(REMINDER_KEY) === '1') } catch { setOn(false) /* storage blocked: shows off */ } }, [])
  const change = (v: boolean): void => {
    setOn(v)
    // shortcut: only the preference is kept on this device; wire it to push once the web has a notification backend.
    try { localStorage.setItem(REMINDER_KEY, v ? '1' : '0') } catch { toast('Couldn’t keep this on this device.'); return }
    toast(v ? 'Reminder on, every day at 18:00' : 'Daily reminder off')
  }
  return <Toggle on={on} onChange={change} label="Daily reminder at 18:00" sub="A calm nudge to add today’s spending. Needs Cashflow on your Home Screen; reminders arrive once notifications are set up." />
}

const sharing = (r: ExportRow): string => r.is_shared_topup ? `Top-up (${r.shared_participant === 'gf' ? PARTNER : 'Me'})` : r.shared ? 'Shared' : 'Personal'
const catName = (r: ExportRow): string => (Array.isArray(r.categories) ? r.categories[0]?.name : r.categories?.name) ?? (r.kind === 'income' ? 'Income' : 'Uncategorized')
// A leading = + - @ would run as a formula in a spreadsheet: prefix it with ' (CSV injection).
const csvCell = (raw: string): string => { const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }

async function fetchRows(from: string, to: string): Promise<ExportRow[]> {
  const out: ExportRow[] = []
  for (let a = 0; ; a += 1000) {
    const { data, error } = await supabase().from('transactions')
      .select('occurred_on,name,kind,converted_amount_minor,original_amount_minor,currency_code,shared,is_shared_topup,shared_participant,categories(name)')
      .gte('occurred_on', from).lte('occurred_on', to).order('occurred_on').order('id').range(a, a + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as unknown as ExportRow[]))
    if (!data || data.length < 1000) return out
  }
}

function Export({ m }: { m: Model }): React.JSX.Element {
  const toast = useToast()
  const [from, setFrom] = useState(m.prevOf(m.current)?.startOn ?? m.current?.startOn ?? m.today)
  const [to, setTo] = useState(todayYmd())
  const [fmt, setFmt] = useState<'csv' | 'pdf'>('csv')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [print, setPrint] = useState<ExportRow[] | null>(null)
  const bad = Boolean(from && to && from > to) || !from || !to
  useEffect(() => {
    if (!print) return
    const done = (): void => setPrint(null)
    window.addEventListener('afterprint', done, { once: true })
    window.print()
    return () => window.removeEventListener('afterprint', done)
  }, [print])
  const go = async (): Promise<void> => {
    if (!navigator.onLine) { setErr('You’re offline. Export needs a connection.'); return }
    setBusy(true); setErr(null)
    try {
      const rows = await fetchRows(from, to)
      if (fmt === 'pdf') { setPrint(rows); return }
      const head = ['Date', 'Name', 'Category', 'Type', 'Sharing', 'Amount (DKK)', 'Currency', 'Original amount']
      const lines = rows.map((r) => [r.occurred_on, csvCell(r.name), csvCell(catName(r)), r.kind, sharing(r), ((r.kind === 'expense' ? -r.converted_amount_minor : r.converted_amount_minor) / 100).toFixed(2), r.currency_code, (r.original_amount_minor / 100).toFixed(2)].join(','))
      const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url; a.download = `cashflow_${from}_to_${to}.csv`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast(`Exported ${rows.length} transactions`)
    } catch (e) {
      setErr(`Not exported. ${e instanceof Error ? e.message : 'Try again.'}`)
    } finally { setBusy(false) }
  }
  const inc = print?.filter((r) => r.kind === 'income').reduce((a, r) => a + r.converted_amount_minor, 0) ?? 0
  const exp = print?.filter((r) => r.kind === 'expense').reduce((a, r) => a + r.converted_amount_minor, 0) ?? 0
  return (
    <>
      <div className="panel" style={{ padding: 14 }}>
        <div className="dates2">
          <label className="field" htmlFor="ex1" style={{ margin: 0 }}><span>From</span><input id="ex1" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field" htmlFor="ex2" style={{ margin: 0 }}><span>To</span><input id="ex2" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {bad && <p className="field" style={{ margin: '8px 0 0' }}><span className="err2">{!from || !to ? 'Pick both dates.' : 'The start date must be before the end date.'}</span></p>}
        <div style={{ margin: '12px 0' }}><Seg label="Format" value={fmt} onChange={setFmt} options={[['csv', 'CSV'], ['pdf', 'PDF']]} /></div>
        <FormErr err={err} />
        <button className="btn" style={{ width: '100%' }} disabled={bad || busy} onClick={() => void go()}><Icon name="export" />{busy ? 'Exporting…' : `Export ${fmt.toUpperCase()}`}</button>
      </div>
      {print && (
        <section className="printout" aria-hidden="true">
          <h1>Cashflow, {shortDate(from)} – {shortDate(to)}</h1>
          <p>Money in {kr(inc)}. Money out {kr(exp)}. Net {kr(inc - exp)}. Shared spending at its full amount.</p>
          <table><thead><tr><th>Date</th><th>Name</th><th>Category</th><th>Sharing</th><th className="r">Amount</th></tr></thead>
            <tbody>{print.map((r, i) => <tr key={i}><td>{r.occurred_on}</td><td>{r.name}</td><td>{catName(r)}</td><td>{sharing(r)}</td><td className="r">{r.kind === 'income' ? '+' : ''}{kr(r.kind === 'expense' ? -r.converted_amount_minor : r.converted_amount_minor)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  )
}

function Profile({ m }: { m: Model }): React.JSX.Element {
  const { signOut } = useStore()
  const toast = useToast()
  const [out, setOut] = useState(false)
  const { over, close } = budgetAlerts(m)
  return (
    <div className="cols even">
      <div>
        <Me />
        <div className="panel phoneonly" style={{ marginBottom: 14 }}>
          <NavRow href="/where" icon="where" name="Where it went" />
          <NavRow href="/bank" icon="bank" name="Bank" sub="Savings, loans, owed to you" />
          <NavRow href="/categories" icon="tag" name="Categories" sub="And the people you send money to" />
          <NavRow href="/rules" icon="rule" name="Merchant rules" />
          <NavRow href="/alerts" icon="bell" name="Alerts" end={over.length ? <span className="pill ov">{over.length} over</span> : close.length ? <span className="pill" aria-label={`${close.length} close to the line`}>{close.length}</span> : undefined} />
        </div>
        <h2 className="sec">Reminders</h2>
        <div className="panel"><Reminder /></div>
      </div>
      <div>
        <h2 className="sec">Export</h2>
        <Export m={m} />
        <div className="panel" style={{ marginTop: 20 }}>
          <button className="linkrow" style={{ color: 'var(--over-text)' }} disabled={out} onClick={() => { setOut(true); signOut().catch(() => { setOut(false); toast('Not signed out. Check the connection and try again.') }) }}>
            <span className="who" style={{ color: 'inherit' }}><Icon name="signout" /></span><span>{out ? 'Signing out…' : 'Sign out'}</span><span />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Page(): React.JSX.Element {
  const wide = useWide()
  const head = <Header title="Profile" big="Profile" back={!wide} />
  return (
    <Gate skeleton={<>{head}<div className="panel"><SkRows n={4} /></div></>}>
      {(m) => <>{head}<StatusLine /><Profile m={m} /></>}
    </Gate>
  )
}

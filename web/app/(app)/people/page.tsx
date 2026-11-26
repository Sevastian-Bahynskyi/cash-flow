'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { Gate, SkRows, StatusLine, TxRow, useDetail } from '@/components/ui'
import { useStore, write } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import { pot } from '@/lib/data/pot'
import { canonicalId, owedBalances, paybackSuggestions, type PersonInput, type PersonKind } from '@/lib/domain/people'
import { kr, shortDate } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'
import { supabase } from '@/lib/supabase/client'

const KIND: [PersonKind, string, string][] = [
  ['settle_up', 'We settle up', 'What you send and get back keeps a running balance'],
  ['family', 'Family', 'Ask me each time: a gift, or something they pay back'],
  ['partner', 'Partner', 'Shares the joint account with you'],
  ['ignore', 'Ignore', 'Not spending, no balance'],
]
const owes = (v: number): string => v > 0 ? `owes you ${kr(v, true)}` : v < 0 ? `you owe ${kr(-v, true)}` : 'all square'

/** Who owes whom, from bank transfers; the partner's shared pot on top; paybacks the bank rows suggest, one tap to accept. */
function People({ m }: { m: Model }): React.JSX.Element {
  const store = useStore()
  const toast = useToast()
  const open = useDetail()
  const [edit, setEdit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const people: PersonInput[] = useMemo(() => m.t.transfer_people.map((p) => ({ id: p.id, name: p.name, kind: p.kind ?? 'settle_up', opening_balance_minor: p.opening_balance_minor ?? 0, alias_of: p.alias_of ?? null })), [m.t.transfer_people])
  const txs = useMemo(() => m.tx.map((t) => ({ ...t, counterparty_person_id: t.counterparty_person_id ?? null })), [m.tx])
  const balances = useMemo(() => owedBalances(people, txs), [people, txs])
  const taken = useMemo(() => new Set(m.t.paybacks.flatMap((p) => [p.payment_transaction_id, p.expense_transaction_id])), [m.t.paybacks])
  const suggestions = useMemo(() => paybackSuggestions(people, txs, taken), [people, txs, taken])
  const byId = new Map(m.tx.map((t) => [t.id, t]))
  const p = pot(m.tx.filter(m.inCycle(m.current)))
  const partner = balances.find((b) => b.kind === 'partner')
  const list = balances.filter((b) => b.kind === 'settle_up' || b.kind === 'family').sort((a, b) => Math.abs(b.balance_minor) - Math.abs(a.balance_minor) || (b.lastOn ?? '').localeCompare(a.lastOn ?? ''))
  const recent = (id: string) => [...m.tx].reverse().filter((t) => t.counterparty_person_id && canonicalId(people, t.counterparty_person_id) === id).slice(0, 6)

  const accept = async (s: (typeof suggestions)[number]): Promise<void> => {
    if (!store.userId) return
    setBusy(true)
    try {
      await write(store, ['paybacks'], () => supabase().from('paybacks').insert(s.items.map((i) => ({ user_id: store.userId, payment_transaction_id: s.payment_transaction_id, expense_transaction_id: i.expense_transaction_id, amount_minor: i.amount_minor }))))
      toast('Paid back. That part no longer counts as your spending.')
    } catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const setKind = async (id: string, kind: PersonKind): Promise<void> => {
    setBusy(true)
    try { await write(store, ['transfer_people'], () => supabase().from('transfer_people').update({ kind }).eq('id', id)); setEdit(null) }
    catch (e) { toast(e instanceof Error ? e.message : 'Not saved.') } finally { setBusy(false) }
  }
  const editing = edit ? balances.find((b) => b.person_id === edit) : undefined

  return (
    <>
      <div className="cols"><div>
        <h2 className="sec" style={{ marginTop: 0 }}>With {PARTNER}</h2>
        <div className="panel"><Link className="pot" href="/shared">
          <span className="pair" aria-hidden="true"><span className="a">{PARTNER[0]}</span><span className="y">You</span></span>
          <span><span className="v num">{kr(p.sharedBalance)}</span><p>left in the joint account this cycle</p></span>
          <span className="potlines">
            <div><span>{PARTNER} moved in</span><b className="num">{kr(p.gfTopupTotal, true)}</b></div>
            <div><span>You moved in</span><b className="num">{kr(p.meTopupTotal, true)}</b></div>
            <div><span>Your part, {p.myPct} of every 100 kr.</span><b className="num">{kr(p.userEffectiveShare, true)}</b></div>
            {partner && partner.balance_minor !== 0 && <div><span>Between you</span><b className="num">{owes(partner.balance_minor)}</b></div>}
          </span></Link></div>
        {suggestions.length > 0 && <>
          <h2 className="sec">Paid back?</h2>
          <div className="panel">{suggestions.map((s) => {
            const pay = byId.get(s.payment_transaction_id)
            const who = balances.find((b) => b.person_id === canonicalId(people, s.person_id))?.name ?? 'Someone'
            const what = s.items.map((i) => byId.get(i.expense_transaction_id)?.name ?? 'an expense').join(', ')
            return pay ? (
              <div className="inboxrow" key={s.payment_transaction_id + s.items.map((i) => i.expense_transaction_id).join()}>
                <div className="row" style={{ cursor: 'default' }}><span className="who" /><span style={{ minWidth: 0 }}><div className="nm">{who} sent {kr(pay.amount_minor)}</div><div className="meta">{s.ratio === 1 ? 'All' : 'Half'} of {what}, {shortDate(pay.occurred_on)}</div></span><span /></div>
                <button className="btn ghost" disabled={busy} onClick={() => void accept(s)}>Yes</button>
              </div>
            ) : null
          })}</div>
          <p className="note">Yes takes that part out of your spending.</p>
        </>}
      </div><div>
        <h2 className="sec">Who owes whom</h2>
        <div className="panel">{list.length ? list.map((b) => (
          <button className="row" key={b.person_id} onClick={() => setEdit(b.person_id)}>
            <span className="who"><span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>{b.name.trim()[0]?.toUpperCase()}</span></span>
            <span style={{ minWidth: 0 }}><div className="nm">{b.name}</div><div className="meta">{b.kind === 'family' ? 'Family, asked each time' : b.lastOn ? `Last ${shortDate(b.lastOn)}` : 'No transfers yet'}</div></span>
            <span className={`amt ${b.balance_minor > 0 ? 'in' : ''}`}>{b.kind === 'family' ? '' : owes(b.balance_minor)}</span>
          </button>
        )) : <div className="empty"><b>Nobody yet</b>People you send money to by bank or MobilePay show up here.</div>}</div>
        <p className="note">From transfers to and from each person. Tap one to change what kind of person they are.</p>
      </div></div>
      {editing && (
        <Sheet open onClose={() => setEdit(null)} title={editing.name}>
          <div className="dhero"><div className="big serif num">{editing.kind === 'family' ? kr(editing.sentMinor, true) : owes(editing.balance_minor)}</div><p>{kr(editing.sentMinor, true)} sent, {kr(editing.receivedMinor, true)} received</p></div>
          <div className="panel">{KIND.map(([k, label, sub]) => (
            <button key={k} className="row" disabled={busy} aria-pressed={editing.kind === k} onClick={() => void setKind(editing.person_id, k)}><span className="who" /><span><div className="nm">{label}</div><div className="meta">{sub}</div></span><span>{editing.kind === k ? '✓' : ''}</span></button>
          ))}</div>
          <h2 className="sect">Latest</h2>
          <div className="panel">{recent(editing.person_id).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={(x) => { setEdit(null); open(x) }} />)}</div>
        </Sheet>
      )}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return (
    <Gate skeleton={<><Header title="People" /><div className="panel"><SkRows n={5} /></div></>}>
      {(m) => <><Header title="People" big="People" aside={`Who owes whom, and the pot with ${PARTNER}`} /><StatusLine /><People m={m} /></>}
    </Gate>
  )
}

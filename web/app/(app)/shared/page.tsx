'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Gate, SkRows, StatusLine, TxRow, useDetail } from '@/components/ui'
import type { Model } from '@/lib/data/model'
import { pot } from '@/lib/data/pot'
import { kr, shortDate } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'

type Per = 'cycle' | 'year' | 'all'

/** The pot you share: who put in what, what you spent together, and your part, inferred from top-ups. */
function Shared({ m }: { m: Model }): React.JSX.Element {
  const open = useDetail()
  const [per, setPer] = useState<Per>('cycle')
  const year = m.today.slice(0, 4)
  const rows = per === 'cycle' ? m.tx.filter(m.inCycle(m.current)) : per === 'year' ? m.tx.filter((r) => r.occurred_on.startsWith(year)) : m.tx
  const p = pot(rows)
  const byCat = new Map<string, number>()
  for (const r of p.spentRows) { const c = m.parentOf(r.category_id); if (c) byCat.set(c.id, (byCat.get(c.id) ?? 0) + r.amount_minor) }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = cats[0]?.[1] ?? 1
  const recent = [...rows].reverse().filter((r) => r.shared || r.is_shared_topup)
  const tops = [...p.topups].reverse()
  const label = per === 'cycle' ? `${m.current?.name ?? 'This'} cycle` : per === 'year' ? year : 'All time'

  return (
    <>
      <Header title="Shared" big={`With ${PARTNER}`} aside={label} back />
      <StatusLine />
      <div style={{ margin: '0 0 12px' }}><div className="seg" role="group" aria-label="Period">{(['cycle', 'year', 'all'] as const).map((k) => <button key={k} aria-pressed={per === k} onClick={() => setPer(k)}>{k === 'cycle' ? 'Cycle' : k === 'year' ? 'Year' : 'All time'}</button>)}</div></div>
      {!p.totalTopupTotal && !p.sharedExpenseTotal ? (
        <div className="panel"><div className="empty"><b>Nothing shared {per === 'cycle' ? 'this cycle' : per === 'year' ? `in ${year}` : 'yet'}</b>Top-ups into the joint account and what you spend from it arrive from the bank.</div></div>
      ) : (
        <div className="cols"><div>
          <section className="hero" aria-label={`The pot with ${PARTNER}`}>
            <div className="top"><span>The pot you share</span><span className="pair" aria-hidden="true"><span className="a">{PARTNER[0]}</span><span className="y">You</span></span></div>
            <div className="big num" style={{ fontSize: 'min(48px, 11vw)', marginTop: 6 }}>{kr(p.sharedBalance)}</div>
            <div className="sub">{p.sharedBalance < 0 ? 'more spent than put in' : 'left in the pot'}</div>
            <div className="sharebar" aria-hidden="true"><i style={{ flex: p.meTopupTotal || 0.0001, background: 'var(--on-you)' }} /><i style={{ flex: p.gfTopupTotal || 0.0001, background: 'var(--anna)' }} /></div>
            <div className="pace" style={{ border: 0, margin: 0, padding: 0 }}><span>You put in <b className="num">{kr(p.meTopupTotal, true)}</b></span><span>{PARTNER} put in <b className="num">{kr(p.gfTopupTotal, true)}</b></span></div>
          </section>
          <div className="panel" style={{ marginTop: 12, padding: 16 }}>
            <p className="owes">Your part of <span className="num">{kr(p.sharedExpenseTotal, true)}</span> spent together is <em className="num">{kr(p.userEffectiveShare, true)}</em></p>
            <p className="note" style={{ padding: '6px 0 0' }}>{p.totalTopupTotal ? `It follows what you each put in: ${p.myPct} of every 100 kr. is yours.` : 'Nothing was put in yet, so it’s split half and half.'} Nobody types a ratio.</p>
          </div>
          <h2 className="sec">Spent together</h2>
          <div className="panel">{cats.length ? cats.map(([id, s]) => { const c = m.byId.get(id); return c ? (
            <Link className="hb" key={id} href={`/transactions?shared=1&cat=${id}`}><span className="nm"><Icon name={c.icon} />{c.name}</span><span className="v">{kr(s, true)}</span><span className="track mkb-split" aria-hidden="true"><i style={{ width: `${(100 * s * p.userShareRatio / max).toFixed(1)}%` }} /><i className="a" style={{ left: `${(100 * s * p.userShareRatio / max).toFixed(1)}%`, width: `${(100 * s * (1 - p.userShareRatio) / max).toFixed(1)}%` }} /></span></Link>
          ) : null }) : <div className="empty">Nothing spent together yet.</div>}</div>
          {cats.length > 0 && <div className="legend" style={{ margin: '10px 4px 0' }}><span><i style={{ background: 'var(--you-mark)' }} />Your part</span><span><i style={{ background: 'var(--anna)' }} />{PARTNER}’s part</span></div>}
        </div><div>
          <h2 className="sec">Into the pot</h2>
          <div className="panel">{tops.length ? <div className="bubbles">{tops.slice(0, 12).map((t) => (
            <button key={t.id} className={`bub ${t.shared_participant === 'gf' ? 'a' : 'y'}`} onClick={() => open(t)}><b className="num">{kr(t.amount_minor, true)}</b><span>{t.shared_participant === 'gf' ? `${PARTNER} moved in` : 'You moved in'}, {shortDate(t.occurred_on)}</span></button>
          ))}</div> : <div className="empty">No top-ups {per === 'cycle' ? 'this cycle' : 'yet'}.</div>}</div>
          <h2 className="sec">Latest together <Link href="/transactions?shared=1">All</Link></h2>
          <div className="panel">{recent.length ? recent.slice(0, 8).map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />) : <div className="empty">Nothing yet.</div>}</div>
        </div></div>
      )}
    </>
  )
}

export default function Page(): React.JSX.Element {
  return <Gate skeleton={<><Header title="Shared" /><div className="panel"><SkRows n={5} /></div></>}>{(m) => <Shared m={m} />}</Gate>
}

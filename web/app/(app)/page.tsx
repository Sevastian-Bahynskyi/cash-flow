'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { CycleCard } from '@/components/CycleCard'
import { Meter, StatePill, budgetState } from '@/components/Marks'
import { goneShare, stateOf } from '@/components/marks-a/pace'
import { Gate, NavRow, SkRows, StatusLine, SyncLine, TxRow, useDetail, Empty } from '@/components/ui'
import { useStore } from '@/lib/data/store'
import type { Model } from '@/lib/data/model'
import { pot } from '@/lib/data/pot'
import { transactionBalance } from '@/lib/domain/balance'
import { kr, plus } from '@/lib/fmt'
import { PARTNER } from '@/lib/partner'

function Avatar(): React.JSX.Element {
  const { tables } = useStore()
  const p = tables?.profile
  const initial = (p?.display_name ?? 'You').trim()[0]?.toUpperCase() ?? 'Y'
  return (
    <Link href="/profile" className="iconbtn phoneonly" aria-label="Profile and settings">
      {p?.avatar_url ? <img src={p.avatar_url} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{initial}</span>}
    </Link>
  )
}

function NewAccount({ m }: { m: Model }): React.JSX.Element {
  return (
    <div className="cols"><div>
      <section className="newcard"><h2>Your first cycle starts on payday</h2><p>Cashflow counts from one salary to the next. The cycle starts when your salary arrives from the bank.</p></section>
      <div className="panel steps3"><div><b>1</b><span>Your bank syncs</span></div><div><b>2</b><span>Set a budget per category</span></div><div><b>3</b><span>Check the Inbox now and then</span></div></div>
    </div><div>
      <h2 className="sec">With {PARTNER}</h2><div className="panel"><div className="empty"><b>Nothing shared yet</b>Money you both move into the pot, and what you spend from it, shows here.</div></div>
    </div></div>
  )
}

function Home({ m }: { m: Model }): React.JSX.Element {
  const open = useDetail()
  const [per, setPer] = useState<'cycle' | 'year' | 'all'>('cycle')
  const c = m.current
  if (!m.hasSalary && !m.tx.length) return <NewAccount m={m} />
  const b = m.budgetsOf(c)
  const prev = m.budgetsOf(m.prevOf(c))
  const over = b.list.filter((x) => x.left < 0)
  const share = goneShare(m, c)
  const ahead = b.list.filter((x) => x.left >= 0 && budgetState(x.spent, x.amount, share) === 'ahead')
  const p = pot(b.rows)
  const latest = [...m.tx].reverse().slice(0, 5)
  const yearRows = m.tx.filter((r) => r.occurred_on.slice(0, 4) === m.today.slice(0, 4))
  const bal = transactionBalance(per === 'cycle' ? b.rows : per === 'year' ? yearRows : m.tx)
  return (
    <div className="cols">
      <div>
        <CycleCard m={m} />
        <div className="panel" style={{ marginTop: 8 }}>
          {b.allMine > 0 && <NavRow href="/where" icon="where" name="Where it went" sub={`${kr(b.allMine, true)} spent${prev.allMine ? `, ${kr(Math.abs(b.allMine - prev.allMine), true)} ${b.allMine >= prev.allMine ? 'more' : 'less'} than ${m.prevOf(c)?.name}` : ''}`} />}
          {b.list.length > 0 && <NavRow href="/budgets" icon="budgets" name="Budgets" sub={`${b.list.length} categories, ${kr(Math.max(0, b.left), true)} left`} />}
        </div>
        {!b.list.length && c?.real && <div className="panel" style={{ marginTop: 8 }}><NavRow href="/budgets" icon="budgets" name="Set your budgets" sub="Then the card shows what is left to spend" /></div>}
        {(over.length > 0 || ahead.length > 0) && <>
          <h2 className="sec">Needs a look</h2>
          {over.length > 0 && <div className="alert"><Link className="row" href={`/budgets?cat=${over[0]!.id}`}><span className="who cat"><Icon name={over[0]!.cat!.icon} /></span><span><div className="nm">{over[0]!.cat!.name}</div><div className="meta num">{kr(over[0]!.spent, true)} of {kr(over[0]!.amount, true)}</div></span><span className="amt ovq">{kr(-over[0]!.left, true)} over</span></Link></div>}
          {(over.length > 1 || ahead.length > 0) && <div className="panel mka-lines" style={{ marginTop: 8 }}>{[...over.slice(1), ...ahead].map((x) => (
            <Link className="row" key={x.id} href={`/budgets?cat=${x.id}`}><span className="who cat"><Icon name={x.cat!.icon} /></span><span style={{ minWidth: 0 }}><div className="nm">{x.cat!.name}</div><div className="meta num">{kr(x.spent, true)} of {kr(x.amount, true)}</div><Meter spent={x.spent} amount={x.amount} daysGoneShare={share} /></span><StatePill left={x.left} st={stateOf(x.spent, x.amount, share)} /></Link>
          ))}</div>}
        </>}
        <h2 className="sec">Balance</h2>
        <div className="panel" style={{ padding: 16 }}>
          <div className="hrow"><div className="seg" role="group" aria-label="Period">{(['cycle', 'year', 'all'] as const).map((k) => <button key={k} aria-pressed={per === k} onClick={() => setPer(k)}>{k === 'cycle' ? 'Cycle' : k === 'year' ? 'Year' : 'All time'}</button>)}</div>
            <b className="num" style={{ fontSize: 20, fontWeight: 500, color: bal > 0 ? 'var(--in)' : undefined }}>{bal > 0 ? plus(bal, true) : kr(bal, true)}</b></div>
          <p className="note" style={{ padding: '8px 0 0' }}>Money in minus your spending and what you moved to the pot.</p>
        </div>
      </div>
      <div>
        <h2 className="sec">With {PARTNER}</h2>
        {p.totalTopupTotal || p.sharedExpenseTotal ? (
          <>
            <div className="panel"><Link className="pot" href="/shared">
              <span className="pair" aria-hidden="true"><span className="a">{PARTNER[0]}</span><span className="y">You</span></span>
              <span><span className="v num">{kr(p.sharedBalance)}</span><p>left in the pot you share with {PARTNER}</p></span>
              <span className="potlines">
                <div><span>{PARTNER} moved in</span><b className="num">{kr(p.gfTopupTotal, true)}</b></div>
                <div><span>You moved in</span><b className="num">{kr(p.meTopupTotal, true)}</b></div>
                <div><span>Spent together</span><b className="num">{kr(p.sharedExpenseTotal, true)}</b></div>
                <div><span>Your part, from what you put in</span><b className="num">{kr(p.userEffectiveShare, true)}</b></div>
              </span></Link></div>
            <p className="note">Money moved into the pot is not your spending. Your part counts once you spend it together.</p>
          </>
        ) : <div className="panel"><div className="empty"><b>Nothing in the pot this cycle</b>Top-ups and shared spending with {PARTNER} show here.</div></div>}
        <h2 className="sec">Latest <Link href="/transactions">All transactions</Link></h2>
        <div className="panel">{latest.length ? latest.map((t) => <TxRow key={t.id} t={t} m={m} onOpen={open} />) : <Empty title="No transactions yet" />}</div>
      </div>
    </div>
  )
}

export default function Page(): React.JSX.Element {
  const { tables } = useStore()
  const label = tables ? undefined : 'Cycle'
  return (
    <Gate skeleton={<><Header title="Cycle" right={<Avatar />} /><div className="hero"><span className="sk" style={{ height: 64, width: '60%', opacity: .3 }} /></div><div className="panel" style={{ marginTop: 12 }}><SkRows n={4} /></div></>}>
      {(m) => <>
        <Header title={label ?? (m.current ? `${m.current.name} cycle` : 'Cashflow')} big={m.current ? `Your ${m.current.name} cycle` : 'Welcome'} aside={m.current && m.payday ? `${m.daysLeft} days to payday` : undefined} right={<Avatar />} />
        <StatusLine />
        <SyncLine />
        <Home m={m} />
      </>}
    </Gate>
  )
}

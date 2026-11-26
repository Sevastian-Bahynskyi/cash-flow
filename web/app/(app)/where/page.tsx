'use client'

import { useMemo, useState } from 'react'
import { Header } from '@/components/Header'
import { Icon } from '@/components/Icon'
import { Empty, Gate, SkRows, StatusLine } from '@/components/ui'
import { Underline } from '@/components/Marks'
import type { Model } from '@/lib/data/model'
import { addDays, daysBetween, kr, parseYmd, plus, shortDate, todayYmd, ymd } from '@/lib/fmt'
import type { TransactionRow } from '@/lib/data/types'

type Per = 'week' | 'cycle' | 'year'
type Win = { start: string; endEx: string; label: string; prevLabel: string; prev: { start: string; endEx: string } | null }

/** One window of time for each period, `back` steps into the past (Dashboard's weekly, monthly and yearly). */
function windowFor(m: Model, per: Per, back: number): Win | null {
  const today = todayYmd()
  if (per === 'cycle') {
    const i = m.cycles.findIndex((c) => c.id === m.current?.id) - back
    const c = m.cycles[i], p = m.cycles[i - 1]
    if (!c) return null
    return { start: c.startOn, endEx: c.endOnExclusive ?? addDays(today, 1), label: `${c.name} cycle`, prevLabel: p ? p.name : '', prev: p ? { start: p.startOn, endEx: p.endOnExclusive ?? c.startOn } : null }
  }
  if (per === 'week') {
    const d = parseYmd(today); const mon = addDays(today, -((d.getDay() + 6) % 7) - 7 * back)
    return { start: mon, endEx: addDays(mon, 7), label: back === 0 ? 'This week' : `Week of ${shortDate(mon)}`, prevLabel: 'the week before', prev: { start: addDays(mon, -7), endEx: mon } }
  }
  const y = parseYmd(today).getFullYear() - back
  return { start: `${y}-01-01`, endEx: `${y + 1}-01-01`, label: String(y), prevLabel: String(y - 1), prev: { start: `${y - 1}-01-01`, endEx: `${y}-01-01` } }
}

const SHADES = [1, 0.72, 0.5, 0.34, 0.22]
/** 100 squares, each one kr. in every 100 spent: the top five categories in one ink from dark to light, the rest grey (the Expo dashboard's waffle). */
function Waffle({ list, spent }: { list: { cat?: { id: string; name: string }; s: number }[]; spent: number }): React.JSX.Element {
  const top = list.slice(0, 5)
  const raw = top.map((x) => (100 * x.s) / spent)
  const n = raw.map(Math.floor)
  // Largest remainders get the leftover squares, so the five add up the way the percentages read.
  let rest = Math.round(raw.reduce((a, v) => a + v, 0)) - n.reduce((a, v) => a + v, 0)
  for (const i of raw.map((v, i) => ({ i, r: v - n[i]! })).sort((a, b) => b.r - a.r).map((x) => x.i)) { if (rest-- <= 0) break; n[i]!++ }
  const cells = n.flatMap((c, i) => Array.from({ length: c }, () => i))
  return (
    <div className="panel waffle">
      <div className="grid" role="img" aria-label={top.map((x, i) => `${x.cat?.name}: ${n[i]} of every 100 kr.`).join(', ')}>
        {Array.from({ length: 100 }, (_, k) => <i key={k} style={cells[k] === undefined ? undefined : { background: 'var(--you)', opacity: SHADES[cells[k]!] }} />)}
      </div>
      <div className="legend">{top.map((x, i) => <span key={x.cat?.id}><i style={{ background: 'var(--you)', opacity: SHADES[i] }} />{x.cat?.name} {n[i]}</span>)}{list.length > 5 && <span><i style={{ background: 'var(--surface-2)' }} />Everything else</span>}</div>
    </div>
  )
}

function Where({ m }: { m: Model }): React.JSX.Element {
  const [per, setPer] = useState<Per>('cycle')
  const [back, setBack] = useState(0)
  const w = windowFor(m, per, back)
  const first = m.tx[0]?.occurred_on ?? todayYmd()
  const canBack = Boolean(w && w.start > first && windowFor(m, per, back + 1))
  const data = useMemo(() => {
    if (!w) return null
    const inW = (r: TransactionRow, a: string, b: string): boolean => r.occurred_on >= a && r.occurred_on < b
    const rows = m.tx.filter((r) => inW(r, w.start, w.endEx))
    const prevRows = w.prev ? m.tx.filter((r) => inW(r, w.prev!.start, w.prev!.endEx)) : []
    const by = (L: TransactionRow[]): Map<string, number> => { const o = new Map<string, number>(); for (const r of L) for (const x of m.portions(r)) { const p = m.parentOf(x.category_id); if (p && x.minor) o.set(p.id, (o.get(p.id) ?? 0) + x.minor) } return o }
    const now = by(rows), was = by(prevRows)
    const list = [...now.entries()].map(([id, s]) => ({ cat: m.byId.get(id), s, l: was.get(id) ?? 0 })).filter((x) => x.cat).sort((a, b) => b.s - a.s)
    const spent = list.reduce((a, x) => a + x.s, 0), lastSpent = [...was.values()].reduce((a, v) => a + v, 0)
    const income = rows.filter((r) => r.kind === 'income' && !m.isTransfer(r.category_id)).reduce((a, r) => a + r.amount_minor, 0)
    const moved = rows.filter((r) => r.kind === 'expense' && (r.is_shared_topup || r.movement === 'moved' || r.movement === 'topup' || m.isTransfer(r.category_id)) && r.shared_participant !== 'gf').reduce((a, r) => a + r.amount_minor, 0)
    // Running cash position: money in minus everything that left your account, day by day.
    const days = Math.max(1, daysBetween(w.start, w.endEx < addDays(todayYmd(), 1) ? w.endEx : addDays(todayYmd(), 1)))
    const run: number[] = []; let acc = 0
    for (let i = 0; i < days; i++) { const d = addDays(w.start, i); for (const r of rows) if (r.occurred_on === d) acc += r.personal_effect_minor ?? (r.kind === 'income' ? r.amount_minor : -m.mine(r)); run.push(acc) }
    const sharedMine = rows.filter((r) => r.shared).reduce((a, r) => a + m.mine(r), 0)
    return { list, spent, lastSpent, income, moved, run, sharedMine }
  }, [m, w])

  const seg = (
    <div className="hrow" style={{ margin: '0 0 12px', flexWrap: 'wrap', gap: 8 }}>
      <div className="seg" role="group" aria-label="Period">{(['week', 'cycle', 'year'] as const).map((k) => <button key={k} aria-pressed={per === k} onClick={() => { setPer(k); setBack(0) }}>{k === 'week' ? 'Week' : k === 'cycle' ? 'Cycle' : 'Year'}</button>)}</div>
      <div className="cyclepick"><button className="iconbtn" disabled={!canBack} onClick={() => setBack((b) => b + 1)} aria-label="Earlier"><Icon name="back" /></button><b>{w?.label ?? ''}</b><button className="iconbtn" disabled={back === 0} onClick={() => setBack((b) => b - 1)} aria-label="Later"><Icon name="chev" /></button></div>
    </div>
  )
  if (!w || !data) return <>{seg}<div className="panel"><Empty title="Nothing yet" /></div></>
  const { list, spent, lastSpent, income, moved, run, sharedMine } = data
  // Your part of shared spending was paid from the pot you already moved money into: count it once.
  const leftOver = income - (spent - sharedMine) - moved
  const diff = spent - lastSpent
  const max = Math.max(1, ...list.map((x) => Math.max(x.s, x.l)))
  const cmp = Boolean(w.prev && lastSpent)
  const word = (v: number): string => v > 0 ? `${kr(v, true)} more` : v < 0 ? `${kr(-v, true)} less` : 'the same'
  const top2 = list.slice(0, 2).map((x, i) => (i ? x.cat!.name.toLowerCase() : x.cat!.name))
  const grew = [...list].sort((a, b) => (b.s - b.l) - (a.s - a.l))[0]
  const W = 320, H = 110, mn = Math.min(0, ...run), mx = Math.max(1, ...run)
  const X = (i: number): number => run.length < 2 ? W / 2 : 4 + (W - 8) * i / (run.length - 1), Y = (v: number): number => 6 + (H - 12) * (1 - (v - mn) / (mx - mn || 1))
  return (
    <div style={{ maxWidth: 760 }}>
      {seg}
      {!spent ? <div className="panel"><Empty title={`Nothing spent in ${w.label.toLowerCase().startsWith('this') ? w.label.toLowerCase() : w.label}`} sub={w.prev ? `The comparison with ${w.prevLabel} starts with the first transaction.` : undefined} /></div> : <>
        <p className="answer mkb-answer">{top2.join(' and ')} took most of it.{w.prev && lastSpent ? <> <em><Underline>{kr(Math.abs(diff), true)} {diff >= 0 ? 'more' : 'less'}</Underline></em> than {w.prevLabel} in all.</> : null}</p>
        <p className="lede">{kr(spent, true)} spent{w.prev ? `, ${kr(lastSpent, true)} in ${w.prevLabel}` : ''}.{grew && grew.s > grew.l && lastSpent ? ` ${grew.cat!.name} grew the most: ${word(grew.s - grew.l)}.` : ''}</p>
        <Waffle list={list} spent={spent} />
        <div className="panel" style={{ marginTop: 8 }}>{list.map((x) => (
          <div className="hb" key={x.cat!.id}>
            <span className="nm"><Icon name={x.cat!.icon} />{x.cat!.name}</span><span className="v">{kr(x.s, true)}</span>
            <span className="track" aria-hidden="true">
              {/* Past last period's tick the bar is ink-hatched: more than last (MARKS.md). */}
              <i style={{ width: `${(100 * (cmp ? Math.min(x.s, x.l) : x.s) / max).toFixed(1)}%` }} />
              {cmp && x.s > x.l && <i className="hatch mkb-more" style={{ left: `${(100 * x.l / max).toFixed(1)}%`, width: `${(100 * (x.s - x.l) / max).toFixed(1)}%` }} />}
              {x.l > 0 && <u style={{ left: `calc(${(100 * x.l / max).toFixed(1)}% - 1px)` }} />}
            </span>
            {w.prev && <span className="d">{!x.l ? `Nothing in ${w.prevLabel}` : x.s === x.l ? `The same as ${w.prevLabel}` : <><b>{word(x.s - x.l)}</b> than {w.prevLabel}, {kr(x.l, true)}</>}</span>}
            <span className="d mkb-quiet">{Math.round(100 * x.s / spent)} of every 100 kr. spent</span>
          </div>
        ))}</div>
        {w.prev && <div className="legend" style={{ margin: '10px 4px 0' }}><span><i style={{ background: 'var(--you)' }} />{w.label}</span><span><i style={{ background: 'var(--ink)', width: 3, height: 12 }} />{w.prevLabel}</span>{cmp && <span><i className="hatch" style={{ background: 'var(--ink)', width: 18, height: 10 }} />More than {w.prevLabel}</span>}</div>}
        <p className="note">Your part of shared expenses counts. Not counted as spending: {kr(moved, true)} moved to the pot, to savings or between accounts.</p>
      </>}
      <h2 className="sec" style={{ marginTop: 32 }}>Money in and out</h2>
      <div className="panel">
        <div className="flowrow"><span>Money in</span><b style={{ color: 'var(--in)' }}>{plus(income, true)}</b></div>
        <div className="flowrow"><span>Your spending</span><b>{kr(spent, true)}</b></div>
        <div className="flowrow"><span>Moved, not spent</span><b style={{ color: 'var(--ink-2)', fontWeight: 400 }}>{kr(moved, true)}</b></div>
        <div className="flowrow"><span>Left over</span><b>{leftOver > 0 ? plus(leftOver, true) : kr(leftOver, true)}</b></div>
      </div>
      {run.length > 1 && (
        <div className="chart" style={{ marginTop: 8 }}>
          <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Cash position through ${w.label}`}>
            <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" />
            <path d={run.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--you-text)" strokeWidth={2.2} strokeLinejoin="round" />
            <text x={0} y={H + 14} fontSize={10} fill="var(--ink-3)">{shortDate(w.start)}</text>
            <text x={W} y={H + 14} fontSize={10} fill="var(--ink-3)" textAnchor="end">{shortDate(ymd(new Date(Math.min(parseYmd(addDays(w.endEx, -1)).getTime(), Date.now()))))}</text>
          </svg>
          <div className="legend"><span><i style={{ background: 'var(--you-text)' }} />Cash position through the period</span></div>
        </div>
      )}
    </div>
  )
}

export default function Page(): React.JSX.Element {
  return (
    <Gate skeleton={<><Header title="Where it went" /><div className="panel"><SkRows n={6} /></div></>}>
      {(m) => <><Header title="Where it went" big="Where it went" back /><StatusLine /><Where m={m} /></>}
    </Gate>
  )
}

import { kr } from '@/lib/fmt'

// Hand-drawn marks (owner, 26 Nov: "hand drawn lines [...] to identify something"). Each mark has one
// meaning, the same on every screen (docs/redesign/MARKS.md). Strokes are jittered with a fixed seed,
// so a mark never "boils" between renders; colour comes from the CSS around it (currentColor).

/** Small seeded random: the same seed draws the same stroke every time. */
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** A rough line from (x1,y1) to (x2,y2): a slight bow and wobble, like a pen stroke. */
export function roughPath(x1: number, y1: number, x2: number, y2: number, seed = 1, wobble = 1.2): string {
  const r = rnd(seed)
  const j = (): number => (r() - 0.5) * wobble
  const mx = (x1 + x2) / 2 + j() * 2, my = (y1 + y2) / 2 + j() * 2
  return `M${(x1 + j()).toFixed(1)} ${(y1 + j()).toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${(x2 + j()).toFixed(1)} ${(y2 + j()).toFixed(1)}`
}

/** A rough underline under a number or a word: the one thing to look at on a screen. */
export function Underline({ children, seed = 3 }: { children: React.ReactNode; seed?: number }): React.JSX.Element {
  return (
    <span className="mk-under">
      {children}
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
        <path d={roughPath(2, 5, 98, 4, seed, 2.4)} />
        <path d={roughPath(8, 6.5, 90, 5.5, seed + 7, 2)} opacity=".55" />
      </svg>
    </span>
  )
}

/** A rough check: a budget kept to the end of its cycle, or something done. */
export function Check({ size = 18, seed = 5 }: { size?: number; seed?: number }): React.JSX.Element {
  const r = rnd(seed)
  const j = (): number => (r() - 0.5) * 1.4
  return (
    <svg className="mk-check" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={`M${4 + j()} ${13 + j()} Q${7 + j()} ${15 + j()} ${9.5 + j()} ${19 + j()} Q${13 + j()} ${11 + j()} ${21 + j()} ${4.5 + j()}`} />
    </svg>
  )
}

/** A rough ring around something small (today, payday). */
export function Ring({ size = 30, seed = 9 }: { size?: number; seed?: number }): React.JSX.Element {
  const r = rnd(seed)
  const pts = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2.15 - 1.2, rad = 11 + (r() - 0.5) * 1.6
    return `${(12 + Math.cos(a) * rad).toFixed(1)} ${(12 + Math.sin(a) * rad * 0.82).toFixed(1)}`
  })
  return <svg className="mk-ring" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={`M${pts[0]} T${pts.slice(1).join(' T')}`} /></svg>
}

export type BudgetState = 'ok' | 'ahead' | 'over' | 'none'
/**
 * Where a budget stands: over its line, ahead of the days (spent a bigger share of it than the share
 * of the cycle gone, with a small margin), or on track. Pace only warns once a tenth of the budget is used.
 */
export function budgetState(spent: number, amount: number, daysGoneShare: number): BudgetState {
  if (!amount) return 'none'
  if (spent > amount) return 'over'
  if (spent === amount) return 'ok' // used up exactly: not over, and nothing left to be ahead with
  const used = spent / amount
  return used >= 0.1 && used > daysGoneShare + 0.08 ? 'ahead' : 'ok'
}

/**
 * A budget meter: solid up to what is spent, with today's hand-drawn tick. Past the tick the bar is
 * hatched in the ahead colour; over the line the whole bar is red and hatched (the owner's sketch).
 */
export function Meter({ spent, amount, daysGoneShare, seed = 1 }: { spent: number; amount: number; daysGoneShare: number; seed?: number }): React.JSX.Element | null {
  if (!amount) return null
  const st = budgetState(spent, amount, daysGoneShare)
  const used = Math.min(1, spent / amount)
  const tick = Math.min(1, Math.max(0, daysGoneShare))
  const solid = st === 'ahead' ? tick : used
  return (
    <span className={`mk-meter ${st}`} aria-hidden="true">
      <i className="mk-fill" style={{ width: `${(100 * solid).toFixed(1)}%` }} />
      {st === 'ahead' && <i className="mk-hatch" style={{ left: `${(100 * tick).toFixed(1)}%`, width: `${(100 * (used - tick)).toFixed(1)}%` }} />}
      {st === 'over' && <i className="mk-hatch" style={{ left: 0, width: '100%' }} />}
      {st !== 'over' && <svg className="mk-tick" style={{ left: `calc(${(100 * tick).toFixed(1)}% - 4px)` }} viewBox="0 0 8 16"><path d={roughPath(4, 1, 4, 15, seed, 1.6)} /></svg>}
    </span>
  )
}

/** The words that go with a state: colour never speaks alone (copy.md § In and out). */
export function StatePill({ left, st }: { left: number; st: BudgetState }): React.JSX.Element {
  const v = kr(Math.abs(left), true)
  if (st === 'over') return <span className="pill ov">{v} over</span>
  if (st === 'ahead') return <span className="pill ahead">{v} left, ahead</span>
  if (st === 'none') return <span className="pill zero">No budget</span>
  return left === 0 ? <span className="pill zero">Used up</span> : <span className="pill">{v} left</span>
}

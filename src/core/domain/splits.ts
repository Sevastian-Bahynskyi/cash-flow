// One purchase cut into parts: each part has its own category and is yours or shared with the partner.
// The rest keeps the row's own category and whose. Pure; integer minor units.

export type Part = { category_id: string | null; gross: number; shared: boolean }
export type Portion = Part & { minor: number }

const sum = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0)

/** The split-off parts, then the rest. Parts that outgrow the row (its amount changed on booking) shrink to fit. */
export function partsOf(r: { category_id: string | null; amount_minor: number; shared: boolean }, splits: readonly { category_id: string; amount_minor: number; shared: boolean }[]): Part[] {
  const used = sum(splits.map((x) => x.amount_minor))
  const k = used > r.amount_minor ? r.amount_minor / Math.max(1, used) : 1
  const parts = splits.map((x) => ({ category_id: x.category_id, gross: Math.round(x.amount_minor * k), shared: x.shared }))
  return [...parts, { category_id: r.category_id, gross: r.amount_minor - sum(parts.map((p) => p.gross)), shared: r.shared }]
}

/**
 * What each part costs. Personal: a shared part at my share (`ratio`), a part of mine in full, less what people paid back
 * (spread over the parts alike). Shared: the joint account's cost, every shared part in full.
 */
export function costOf(parts: readonly Part[], scope: 'personal' | 'shared', ratio: number, back = 0): Portion[] {
  if (scope === 'shared') return parts.map((p) => ({ ...p, minor: p.shared ? p.gross : 0 }))
  const base = parts.map((p) => (p.shared ? Math.round(p.gross * ratio) : p.gross))
  const total = sum(base)
  const v = Math.max(0, total - back)
  const out = parts.map((p, i) => ({ ...p, minor: total ? Math.round(((base[i] ?? 0) * v) / total) : 0 }))
  // the rest takes the rounding, so the parts always add up
  const last = out[out.length - 1]
  if (last) last.minor = v - sum(out.slice(0, -1).map((p) => p.minor))
  return out
}

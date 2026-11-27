import type { Model } from '@/core/data/model'
import { countryName, isPurchase } from '@/core/domain/trips'
import type { Pt } from './cluster'

// Where a row with only a country goes (manual history has no coordinates): roughly the middle of the country.
const CENTRE: Record<string, [number, number]> = {
  DK: [56.0, 10.0], SE: [59.6, 16.0], NO: [60.5, 9.0], FI: [62.0, 25.5], IS: [64.9, -18.6], DE: [51.2, 10.4], NL: [52.2, 5.3], BE: [50.6, 4.6],
  LU: [49.8, 6.1], FR: [46.6, 2.4], ES: [40.2, -3.6], PT: [39.6, -8.0], IT: [42.8, 12.5], GR: [39.1, 22.0], AT: [47.6, 14.1], CH: [46.8, 8.2],
  PL: [52.1, 19.4], CZ: [49.8, 15.5], SK: [48.7, 19.5], HU: [47.2, 19.4], SI: [46.1, 14.8], HR: [45.1, 15.2], RO: [45.9, 24.9], BG: [42.7, 25.5],
  UA: [49.0, 31.4], LT: [55.2, 23.9], LV: [56.9, 24.6], EE: [58.6, 25.0], IE: [53.2, -8.2], GB: [52.8, -1.6], US: [39.8, -98.6], CA: [50.0, -96.0],
  MX: [23.6, -102.5], TR: [39.0, 35.2], CY: [35.1, 33.4], MT: [35.9, 14.4], ME: [42.7, 19.3], AL: [41.2, 20.2], RS: [44.0, 20.9], BA: [43.9, 17.7],
  MK: [41.6, 21.7], MD: [47.4, 28.4], GE: [42.3, 43.4], AE: [24.0, 54.0], EG: [26.8, 30.8], MA: [31.8, -7.1], TH: [15.9, 101.0], JP: [36.2, 138.3],
  CN: [35.9, 104.2], KR: [36.5, 127.9], IN: [21.0, 78.0], AU: [-25.3, 133.8], NZ: [-41.0, 174.0], BR: [-14.2, -51.9], AR: [-38.4, -63.6],
  ZA: [-30.6, 22.9], SG: [1.35, 103.82], ID: [-2.5, 118.0], VN: [14.1, 108.3],
}

type Off = { on: string; minor: number }
type Row = Model['tx'][number]
export type Points = { pts: Pt[]; online: Off[]; unplaced: Off[]; rows: Map<string, Row> }

/** Every purchase with what it cost you, sorted into the map, online, and not placed yet. */
export function pointsOf(m: Model): Points {
  const pts: Pt[] = [], online: Off[] = [], unplaced: Off[] = []
  const rows = new Map<string, Row>()
  for (const t of m.tx) {
    if (!isPurchase(t)) continue
    const minor = m.mine(t)
    if (minor <= 0) continue
    const p = m.placeOf(t)
    if (p?.online) { online.push({ on: t.occurred_on, minor }); continue }
    const at: [number, number] | undefined = p?.lat != null && p.lng != null ? [p.lat, p.lng] : p?.country_iso ? CENTRE[p.country_iso] : undefined
    if (!p || !at) { unplaced.push({ on: t.occurred_on, minor }); continue }
    rows.set(t.id, t)
    pts.push({ id: t.id, lat: at[0], lng: at[1], minor, on: t.occurred_on, country: p.country_iso, countryName: countryName(p.country_iso), city: p.lat != null ? p.city : null })
  }
  return { pts, online, unplaced, rows }
}

/** 'YYYY-MM' of a date. */
export const monthOf = (d: string): string => d.slice(0, 7)
export const nextMonth = (ym: string): string => {
  const [y = 1970, mo = 1] = ym.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}
/** Every month from the first to the last, inclusive. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = []
  for (let ym = first; ym <= last && out.length < 600; ym = nextMonth(ym)) out.push(ym)
  return out
}

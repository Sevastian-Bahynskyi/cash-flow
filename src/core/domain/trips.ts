// Trips: while one runs, purchases abroad count in the Travel categories. Pure; dates are YYYY-MM-DD.
// Home is Aarhus, Denmark. A trip with no country (or DK) is a trip inside Denmark: shops away from Aarhus count.

export const HOME = 'DK'
/** The owner's home city (Aarhus); a trip inside Denmark counts shops further than 30 km from it. */
const HOME_AT: [number, number] = [56.1572, 10.2107]
const kmFrom = ([a, b]: [number, number], lat: number, lng: number): number => {
  const r = Math.PI / 180, x = (lng - b) * r * Math.cos(((lat + a) / 2) * r), y = (lat - a) * r
  return Math.sqrt(x * x + y * y) * 6371
}

export type TripRow = { id: string; user_id: string; name: string; country_iso: string | null; start_on: string; end_on: string | null; created_at: string }
export type PlaceRow = { key: string; country_iso: string | null; city: string | null; lat: number | null; lng: number | null; online: boolean }
type Cat = { id: string; name: string; parent_id: string | null }
export type TripTx = {
  id: string; name: string; kind: string; occurred_on: string; category_id: string | null; amount_minor: number
  merchant_key?: string | null; country_iso: string | null; movement?: string | null; reason_source?: string | null
  counterparty_person_id?: string | null; is_shared_topup?: boolean; trip_exclude?: boolean; trip_include?: boolean; status?: string | null; place_key?: string | null
}

/** The key places are stored by. Keep in step with supabase/functions/_shared/places.ts placeKey. */
export const placeKey = (t: { place_key?: string | null; merchant_key?: string | null; name: string }): string => (t.place_key || t.merchant_key || t.name).trim().toLowerCase()

/** Where a purchase happened: the row's own country (manual entries) wins over the merchant's place. */
export const placeOf = (t: TripTx, places: ReadonlyMap<string, PlaceRow>): PlaceRow | null => {
  const p = places.get(placeKey(t)) ?? null
  if (t.country_iso && (!p || p.country_iso !== t.country_iso)) return { key: placeKey(t), country_iso: t.country_iso, city: null, lat: null, lng: null, online: false }
  return p
}

const NOT_SPEND = new Set(['moved', 'topup', 'person', 'ignore', 'income', 'refund'])
/** A purchase that a trip could be about: money out to a shop. */
export const isPurchase = (t: TripTx): boolean => t.kind === 'expense' && t.status !== 'void' && !t.is_shared_topup && !t.counterparty_person_id && !NOT_SPEND.has(t.movement ?? '')

const covers = (trip: TripRow, date: string, today: string): boolean => date >= trip.start_on && date <= (trip.end_on ?? today)
export const tripOn = (trips: readonly TripRow[], date: string, today: string): TripRow | null => trips.find((tr) => covers(tr, date, today)) ?? null
export const isDomestic = (trip: TripRow): boolean => !trip.country_iso || trip.country_iso === HOME

// Which parent goes to which Travel child, by name (categories are named, not fixed ids).
const TO_TRAVEL: [RegExp, RegExp][] = [
  [/^(food|groceries|restaurants?|coffee)$/i, /^food$/i],
  [/^transport$/i, /^transport$/i],
  [/^shopping$/i, /^shopping$/i],
  [/^(entertainment|leisure|fun|sport)$/i, /^entertainment$/i],
]

/** The Travel category a category maps to on a trip (the child's own name first, then its parent's), or null when it stays. */
export const travelCategoryFor = (cats: readonly Cat[], categoryId: string | null): string | null => {
  if (!categoryId) return null
  const byId = new Map(cats.map((c) => [c.id, c]))
  const c = byId.get(categoryId)
  if (!c) return null
  const parent = c.parent_id ? byId.get(c.parent_id) : c
  const travel = cats.find((x) => !x.parent_id && /^travel$/i.test(x.name))
  if (!travel || !parent || parent.id === travel.id) return null
  const rule = TO_TRAVEL.find(([from]) => from.test(c.name)) ?? TO_TRAVEL.find(([from]) => from.test(parent.name))
  // Travel without that child still collects it.
  return rule ? cats.find((x) => x.parent_id === travel.id && rule[1].test(x.name))?.id ?? travel.id : null
}

/** A category under Travel (flights, hotels...). */
const isTravel = (cats: readonly Cat[], categoryId: string | null): boolean => {
  const c = cats.find((x) => x.id === categoryId)
  const p = c?.parent_id ? cats.find((x) => x.id === c.parent_id) : c
  return Boolean(p && /^travel$/i.test(p.name))
}

/**
 * Rows as the screens see them: purchases during a trip carry its id, and the ones it is about move to the Travel
 * child of their category. Your own picks (reason_source 'you') and rows marked "not part of the trip" stay put.
 */
export function applyTrips<T extends TripTx>(rows: readonly T[], trips: readonly TripRow[], places: ReadonlyMap<string, PlaceRow>, cats: readonly Cat[], today: string): (T & { trip_id?: string; home_category_id?: string | null })[] {
  if (!trips.length) return rows as T[]
  const memo = new Map<string, string | null>()
  const travelOf = (id: string | null): string | null => { const k = id ?? ''; if (!memo.has(k)) memo.set(k, travelCategoryFor(cats, id)); return memo.get(k)! }
  return rows.map((t) => {
    if (!isPurchase(t) || t.trip_exclude) return t
    const trip = tripOn(trips, t.occurred_on, today)
    if (!trip) return t
    const place = placeOf(t, places)
    // Away: bought abroad (or, on a trip inside Denmark, at a known shop), already Travel (flights, hotels), or added by hand.
    const away = t.trip_include || isTravel(cats, t.category_id) || (isDomestic(trip) ? Boolean(place && !place.online && place.lat !== null && place.lng !== null && kmFrom(HOME_AT, place.lat, place.lng) > 30) : Boolean(place?.country_iso && place.country_iso !== HOME))
    if (!away) return t
    const travel = t.reason_source === 'you' ? null : travelOf(t.category_id)
    return travel ? { ...t, trip_id: trip.id, home_category_id: t.category_id, category_id: travel } : { ...t, trip_id: trip.id }
  })
}

const DAY = 86_400_000
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)

type Abroad = { country: string; on: string; minor: number }
const abroadRows = (rows: readonly TripTx[], places: ReadonlyMap<string, PlaceRow>, cost: (t: TripTx) => number = (t) => t.amount_minor): Abroad[] => rows.flatMap((t) => {
  if (!isPurchase(t)) return []
  const c = placeOf(t, places)?.country_iso
  return c && c !== HOME ? [{ country: c, on: t.occurred_on, minor: cost(t) }] : []
})
const mostCommon = (xs: readonly string[]): string => {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]![0]
}

/** "Are you in Spain?": 2+ purchases abroad in the last 3 days and no trip covering today. */
export function abroadNow(rows: readonly TripTx[], places: ReadonlyMap<string, PlaceRow>, trips: readonly TripRow[], today: string): { country: string; since: string; count: number } | null {
  if (tripOn(trips, today, today)) return null
  const recent = abroadRows(rows, places).filter((a) => a.on >= addDays(today, -2) && a.on <= today && !tripOn(trips, a.on, today))
  if (recent.length < 2) return null
  return { country: mostCommon(recent.map((a) => a.country)), since: recent.map((a) => a.on).sort()[0]!, count: recent.length }
}

/** "Back home?": an open trip abroad whose last purchase abroad was 2+ days before a purchase at home. */
export function backHome(trip: TripRow, rows: readonly TripTx[], places: ReadonlyMap<string, PlaceRow>, today: string): string | null {
  if (trip.end_on || isDomestic(trip)) return null
  const inTrip = rows.filter((t) => isPurchase(t) && t.occurred_on >= trip.start_on)
  const lastAway = abroadRows(inTrip, places).map((a) => a.on).sort().at(-1) ?? trip.start_on
  const homeAfter = inTrip.some((t) => t.occurred_on > lastAway && placeOf(t, places)?.country_iso === HOME)
  return homeAfter && today >= addDays(lastAway, 2) ? lastAway : null
}

export type PastTrip = { country: string; start_on: string; end_on: string; count: number; minor: number }
/** Earlier stays abroad not yet saved as trips: 3+ purchases abroad, gaps of at most 3 days, newest first. `cost` = what a row cost you. */
export function pastTrips(rows: readonly TripTx[], places: ReadonlyMap<string, PlaceRow>, trips: readonly TripRow[], today: string, cost?: (t: TripTx) => number): PastTrip[] {
  const xs = abroadRows(rows, places, cost).filter((a) => !tripOn(trips, a.on, today) && a.on < addDays(today, -2)).sort((a, b) => a.on.localeCompare(b.on))
  const out: PastTrip[] = []
  let group: Abroad[] = []
  const flush = () => {
    if (group.length >= 3) out.push({ country: mostCommon(group.map((a) => a.country)), start_on: group[0]!.on, end_on: group.at(-1)!.on, count: group.length, minor: group.reduce((s, a) => s + a.minor, 0) })
    group = []
  }
  for (const a of xs) {
    if (group.length && a.on > addDays(group.at(-1)!.on, 3)) flush()
    group.push(a)
  }
  flush()
  return out.reverse()
}

// Country names without relying on Intl.DisplayNames (not in every engine).
const NAMES: Record<string, string> = {
  DK: 'Denmark', SE: 'Sweden', NO: 'Norway', FI: 'Finland', IS: 'Iceland', DE: 'Germany', NL: 'Netherlands', BE: 'Belgium', LU: 'Luxembourg',
  FR: 'France', ES: 'Spain', PT: 'Portugal', IT: 'Italy', GR: 'Greece', AT: 'Austria', CH: 'Switzerland', PL: 'Poland', CZ: 'Czechia',
  SK: 'Slovakia', HU: 'Hungary', SI: 'Slovenia', HR: 'Croatia', RO: 'Romania', BG: 'Bulgaria', UA: 'Ukraine', LT: 'Lithuania', LV: 'Latvia',
  EE: 'Estonia', IE: 'Ireland', GB: 'United Kingdom', US: 'United States', CA: 'Canada', MX: 'Mexico', TR: 'Türkiye', CY: 'Cyprus', MT: 'Malta',
  ME: 'Montenegro', AL: 'Albania', RS: 'Serbia', BA: 'Bosnia and Herzegovina', MK: 'North Macedonia', MD: 'Moldova', GE: 'Georgia',
  AE: 'United Arab Emirates', EG: 'Egypt', MA: 'Morocco', TH: 'Thailand', JP: 'Japan', CN: 'China', KR: 'South Korea', IN: 'India',
  AU: 'Australia', NZ: 'New Zealand', BR: 'Brazil', AR: 'Argentina', ZA: 'South Africa', SG: 'Singapore', ID: 'Indonesia', VN: 'Vietnam',
}
export const countryName = (iso: string | null | undefined): string => (iso ? NAMES[iso] ?? iso : 'Denmark')
/** The flag emoji of an ISO country code. */
export const flag = (iso: string | null | undefined): string => (iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '')

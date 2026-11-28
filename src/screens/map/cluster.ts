// Spending map clustering. Pure, no imports, so `node scripts/check-cluster.ts` can test it.
// Zoomed out a glow per country, closer a glow per city (places are city centres, so nothing finer); glows that would overlap merge into the bigger one.

export type Pt = { id: string; lat: number; lng: number; minor: number; on: string; country: string | null; countryName: string; city: string | null }
export type Level = 'country' | 'city'
export type Cam = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
export type Cluster = { id: string; lat: number; lng: number; minor: number; ids: string[]; names: string[]; country: string | null; level: Level; size: number }

export const levelOf = (latitudeDelta: number): Level => (latitudeDelta > 7 ? 'country' : 'city')
/** The closest the map zooms: places are city centres, so a street view would only pretend to know more. */
export const MIN_SPAN = 0.3

const MIN = 46
const MAX = 128
/** Glow diameter in points: the area grows with the money (square-root scale). */
export const glowSize = (minor: number, max: number): number => MIN + (MAX - MIN) * Math.sqrt(Math.max(0, minor) / Math.max(1, max))

const keyOf = (p: Pt, level: Level): string => (level === 'country' ? `c:${p.country ?? '?'}` : `t:${p.country ?? '?'}|${p.city ?? ''}`)
const nameOf = (p: Pt, level: Level): string => (level === 'country' ? p.countryName : p.city ?? p.countryName)

// money per spot (city centre) inside a group; the glow sits on the spot with the most, never between two (in the sea)
type Acc = Cluster & { spots: Map<string, { lat: number; lng: number; minor: number }> }

/** The glows for a camera on a map of w × h points. */
export function clusters(pts: readonly Pt[], cam: Cam, w: number, h: number): Cluster[] {
  const level = levelOf(cam.latitudeDelta)
  const groups = new Map<string, Acc>()
  for (const p of pts) {
    const k = keyOf(p, level)
    const g: Acc = groups.get(k) ?? { id: k, lat: 0, lng: 0, minor: 0, ids: [], names: [nameOf(p, level)], country: p.country, level, size: 0, spots: new Map() }
    const sk = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`
    const spot = g.spots.get(sk) ?? { lat: p.lat, lng: p.lng, minor: 0 }
    spot.minor += p.minor
    g.spots.set(sk, spot)
    g.minor += p.minor
    g.ids.push(p.id)
    groups.set(k, g)
  }
  const list = [...groups.values()].map((g) => {
    const top = [...g.spots.values()].reduce((a, b) => (b.minor > a.minor ? b : a))
    return { ...g, lat: top.lat, lng: top.lng }
  })
  list.sort((a, b) => b.minor - a.minor || a.id.localeCompare(b.id))
  const max = list[0]?.minor ?? 1
  const px = (c: { lat: number; lng: number }): [number, number] => [((c.lng - cam.longitude) / cam.longitudeDelta) * w, ((cam.latitude - c.lat) / cam.latitudeDelta) * h]
  const kept: (Acc & { x: number; y: number; s: number })[] = []
  for (const g of list) {
    const [x, y] = px(g)
    const s = glowSize(g.minor, max)
    const near = kept.find((k) => Math.hypot(k.x - x, k.y - y) < (k.s + s) * 0.4)
    if (!near) { kept.push({ ...g, x, y, s }); continue }
    near.minor += g.minor
    near.ids.push(...g.ids)
    for (const n of g.names) if (!near.names.includes(n)) near.names.push(n)
  }
  const top = Math.max(1, ...kept.map((k) => k.minor))
  return kept.map(({ id, lat, lng, minor, ids, names, country }) => ({ id, lat, lng, minor, ids, names, country, level, size: glowSize(minor, top) }))
}

/**
 * A camera that shows these points on a map of w × h points (the band between the overlays: MapKit fits inside mapPadding),
 * keeping `keep` points at the bottom free (the Apple Maps logo and Legal sit there).
 * shortcut: degrees are treated as flat apart from the cos(latitude) stretch, fine below ~60° of latitude.
 */
export function fitRegion(pts: readonly { lat: number; lng: number }[], w: number, h: number, keep = 0): Cam {
  if (!pts.length) return { latitude: 55.2, longitude: 10.5, latitudeDelta: 6, longitudeDelta: 6 }
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng)
  const [s, n, wst, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const mid = (s + n) / 2
  const cos = Math.max(0.2, Math.cos((mid * Math.PI) / 180))
  const spanLat = Math.max(MIN_SPAN, (n - s) * 1.35)
  const spanLng = Math.max(MIN_SPAN, (e - wst) * 1.35)
  // the latitude span the map really shows: what the points need vertically, or what their width forces
  const free = Math.max(0.5, (h - keep) / h)
  const latitudeDelta = Math.min(150, Math.max(spanLat / free, spanLng * (h / w) * cos))
  const longitudeDelta = Math.min(360, (latitudeDelta * (w / h)) / cos)
  // centre south of the points, so they sit above the kept strip
  return { latitude: mid - (latitudeDelta * keep) / (2 * h), longitude: (wst + e) / 2, latitudeDelta, longitudeDelta }
}

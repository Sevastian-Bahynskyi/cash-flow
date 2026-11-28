// Self-check for the map clustering: node scripts/check-cluster.ts
import assert from 'node:assert/strict'
import { clusters, fitRegion, glowSize, levelOf, type Pt } from '../src/screens/map/cluster.ts'

const pt = (id: string, lat: number, lng: number, minor: number, country: string, city: string): Pt =>
  ({ id, lat, lng, minor, on: '2026-11-01', country, countryName: country, city })
const pts = [
  pt('a1', 56.1572, 10.2107, 10_000, 'DK', 'Aarhus'),
  pt('a2', 56.1572, 10.2107, 5_000, 'DK', 'Aarhus'),
  pt('c1', 55.6761, 12.5683, 4_000, 'DK', 'Copenhagen'),
  pt('b1', 41.3874, 2.1686, 30_000, 'ES', 'Barcelona'),
]

assert.equal(levelOf(40), 'country')
assert.equal(levelOf(3), 'city')
assert.equal(levelOf(0.05), 'city', 'no finer than a city: places are city centres')
assert.equal(glowSize(0, 100), 46)
assert.equal(glowSize(100, 100), 128)
assert.equal(glowSize(25, 100), (46 + 128) / 2, 'square-root scale: a quarter of the money, half way in size')

// Europe: one glow per country, Denmark's sum of everything there
const world = clusters(pts, { latitude: 50, longitude: 8, latitudeDelta: 30, longitudeDelta: 30 }, 390, 844)
assert.deepEqual(world.map((c) => [c.id, c.minor]), [['c:ES', 30_000], ['c:DK', 19_000]])
// Denmark's glow sits on its biggest city, not between Aarhus and Copenhagen in the sea
assert.deepEqual([world[1]!.lat, world[1]!.lng], [56.1572, 10.2107])
assert.ok(world[0]!.size > world[1]!.size)

// Denmark: Aarhus and Copenhagen apart
const dk = clusters(pts, { latitude: 56, longitude: 11, latitudeDelta: 3, longitudeDelta: 3 }, 390, 844)
assert.deepEqual(dk.filter((c) => c.country === 'DK').map((c) => c.names[0]), ['Aarhus', 'Copenhagen'])

// zoomed right in on Aarhus: still one glow for the city, the Copenhagen one off to the side
const aarhus = clusters(pts, { latitude: 56.158, longitude: 10.205, latitudeDelta: 0.3, longitudeDelta: 0.3 }, 390, 844)
assert.deepEqual(aarhus.filter((c) => c.country === 'DK').map((c) => [c.names[0], c.minor]), [['Aarhus', 15_000], ['Copenhagen', 4_000]])

// on a small map the two Danish cities would overlap: they merge into the bigger one
const small = clusters(pts, { latitude: 56, longitude: 11, latitudeDelta: 6.9, longitudeDelta: 6.9 }, 100, 100)
const dkm = small.find((c) => c.country === 'DK')!
assert.deepEqual([dkm.names, dkm.minor, dkm.lat], [['Aarhus', 'Copenhagen'], 19_000, 56.1572])

// a camera for one place centres on it
const one = fitRegion([{ lat: 41.3874, lng: 2.1686 }], 390, 420)
assert.equal(one.latitude, 41.3874)
assert.ok(one.latitudeDelta >= 0.3 && one.latitudeDelta < 0.5, 'one city: as close as the map goes, no closer')
const kept = fitRegion([{ lat: 41.3874, lng: 2.1686 }], 390, 420, 70)
assert.ok(kept.latitude < 41.3874, 'a kept strip at the bottom puts the place higher up')
const all = fitRegion(pts, 390, 420)
assert.ok(all.latitudeDelta > 56.16 - 41.38, 'all points fit')
console.log('map clustering ok')

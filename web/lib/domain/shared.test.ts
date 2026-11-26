import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMyCostByTransactionId, computeSharedCycle, shareForCycle, type ShareRow, type ShareSpan } from './shared.ts'

const row = (id: string, occurred_on: string, amount_minor: number, extra: Partial<ShareRow> = {}): ShareRow =>
  ({ id, kind: 'expense', amount_minor, occurred_on, shared: false, is_shared_topup: false, shared_participant: null, ...extra })
const topup = (id: string, day: string, amount: number, who: 'me' | 'gf') => row(id, day, amount, { is_shared_topup: true, shared_participant: who, movement: 'topup' })
const oct: ShareSpan = { id: 'oct', startOn: '2026-10-01', endOnExclusive: '2026-11-01' }
const nov: ShareSpan = { id: 'nov', startOn: '2026-11-01', endOnExclusive: null }

test('share = my top-ups / all top-ups in the cycle', () => {
  const rows = [topup('t1', '2026-11-02', 60_000, 'me'), topup('t2', '2026-11-03', 40_000, 'gf'), topup('old', '2026-10-05', 10_000, 'gf')]
  assert.deepEqual(shareForCycle(rows, nov, '2026-11-26'), { ratio: 0.6, source: 'cycle', meTopupMinor: 60_000, totalTopupMinor: 100_000 })
})

test('no top-ups in the cycle: trailing 90 days, then 0.5; void top-ups never count', () => {
  const rows = [topup('t1', '2026-10-05', 30_000, 'me'), topup('t2', '2026-10-06', 10_000, 'gf'), { ...topup('v', '2026-11-04', 50_000, 'gf'), status: 'void' }]
  assert.deepEqual(shareForCycle(rows, nov, '2026-11-26'), { ratio: 0.75, source: 'trailing90', meTopupMinor: 30_000, totalTopupMinor: 40_000 })
  assert.equal(shareForCycle([], nov, '2026-11-26').source, 'default')
  assert.equal(shareForCycle([], nov, '2026-11-26').ratio, 0.5)
})

test('my cost: share of joint spending, nothing for top-ups and own moves, full personal spending', () => {
  const rows = [
    topup('t1', '2026-11-02', 60_000, 'me'),
    topup('t2', '2026-11-02', 40_000, 'gf'),
    row('joint', '2026-11-05', 40_000, { shared: true, movement: 'spend' }),
    row('octjoint', '2026-10-05', 10_000, { shared: true }),
    row('mine', '2026-11-06', 12_345),
    row('moved', '2026-11-06', 50_000, { movement: 'moved' }),
    row('void', '2026-11-06', 50_000, { status: 'void' }),
    row('pay', '2026-11-01', 2_000_000, { kind: 'income' }),
  ]
  const cost = computeMyCostByTransactionId(rows, [oct, nov], '2026-11-26')
  assert.equal(cost.get('joint'), 24_000)
  assert.equal(cost.get('octjoint'), 5_000) // October has no top-ups and none in the 90 days before: 0.5
  assert.equal(cost.get('mine'), 12_345)
  for (const id of ['t1', 't2', 'moved', 'void', 'pay']) assert.equal(cost.get(id), 0, id)
})

test('computeSharedCycle unchanged', () => {
  const r = computeSharedCycle([{ amount_minor: 600, shared_participant: 'me' }, { amount_minor: 400, shared_participant: 'gf' }], [{ amount_minor: 500 }])
  assert.equal(r.userShareRatio, 0.6)
  assert.equal(r.userEffectiveShare, 300)
})

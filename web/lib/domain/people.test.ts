import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalId, owedBalances, paybackSuggestions, type PeopleTx, type PersonInput } from './people.ts'

const people: PersonInput[] = [
  { id: 'friend', name: 'Test Friend', kind: 'settle_up', opening_balance_minor: 0, alias_of: null },
  { id: 'friend-short', name: 'Test Fr', kind: 'settle_up', opening_balance_minor: 0, alias_of: 'friend' },
  { id: 'partner', name: 'Test Partner', kind: 'partner', opening_balance_minor: -100_000, alias_of: null },
  { id: 'family', name: 'Test Family', kind: 'family', opening_balance_minor: 0, alias_of: null },
]
const tx = (id: string, kind: PeopleTx['kind'], amount_minor: number, occurred_on: string, counterparty_person_id: string | null = null, extra: Partial<PeopleTx> = {}): PeopleTx =>
  ({ id, kind, amount_minor, occurred_on, counterparty_person_id, ...extra })

test('aliases count for the canonical person', () => {
  assert.equal(canonicalId(people, 'friend-short'), 'friend')
  assert.equal(canonicalId(people, 'friend'), 'friend')
  assert.equal(canonicalId([{ id: 'x', name: 'X', kind: 'settle_up', opening_balance_minor: 0, alias_of: 'gone' }], 'x'), 'x')
})

test('owed balances: settle-up transfers move the balance, partner keeps the opening balance, family never moves', () => {
  const txs = [
    tx('a', 'expense', 30_000, '2026-11-01', 'friend'),
    tx('b', 'income', 10_000, '2026-11-03', 'friend-short'),
    tx('c', 'expense', 50_000, '2026-11-04', 'partner'),
    tx('d', 'expense', 20_000, '2026-11-05', 'family'),
    tx('e', 'expense', 99_000, '2026-11-06', 'friend', { status: 'void' }),
  ]
  const byId = new Map(owedBalances(people, txs).map((b) => [b.person_id, b]))
  assert.equal(byId.get('friend')?.balance_minor, 20_000)
  assert.equal(byId.get('friend')?.lastOn, '2026-11-03')
  assert.equal(byId.get('partner')?.balance_minor, -100_000)
  assert.equal(byId.has('family'), false)
  assert.equal(byId.has('friend-short'), false)
})

test('payback: a single expense paid back in full or half within 7 days', () => {
  const txs = [
    tx('shop', 'expense', 40_000, '2026-11-01'),
    tx('far', 'expense', 40_000, '2026-10-20'),
    tx('pay-full', 'income', 40_100, '2026-11-05', 'friend-short'),
    tx('pay-half', 'income', 20_000, '2026-11-06', 'friend'),
  ]
  const s = paybackSuggestions(people, txs)
  const full = s.find((x) => x.payment_transaction_id === 'pay-full')
  assert.deepEqual([full?.ratio, full?.person_id, full?.items], [1, 'friend', [{ expense_transaction_id: 'shop', amount_minor: 40_000 }]])
  const half = s.find((x) => x.payment_transaction_id === 'pay-half')
  assert.deepEqual([half?.ratio, half?.items[0]?.amount_minor], [0.5, 20_000])
  assert.equal(s.some((x) => x.items.some((i) => i.expense_transaction_id === 'far')), false)
})

test('payback: a sum of up to 3 expenses; taken expenses and person transfers are skipped; beyond ±2 kr no match', () => {
  const txs = [
    tx('e1', 'expense', 10_000, '2026-11-01'),
    tx('e2', 'expense', 15_000, '2026-11-02'),
    tx('e3', 'expense', 5_000, '2026-11-02'),
    tx('mp', 'expense', 30_000, '2026-11-02', 'friend'),
    tx('pay', 'income', 30_000, '2026-11-03', 'friend'),
    tx('miss', 'income', 77_700, '2026-11-03', 'friend'),
  ]
  const best = paybackSuggestions(people, txs).filter((x) => x.payment_transaction_id === 'pay')[0]
  assert.deepEqual(best?.items.map((i) => i.expense_transaction_id).sort(), ['e1', 'e2', 'e3'])
  assert.equal(paybackSuggestions(people, txs).some((x) => x.payment_transaction_id === 'miss'), false)
  assert.equal(paybackSuggestions(people, txs, new Set(['e1'])).some((x) => x.payment_transaction_id === 'pay' && x.ratio === 1), false)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount } from './fmt.ts'

test('parseAmount reads typed amounts as integer minor units', () => {
  assert.equal(parseAmount('1500'), 150000)
  assert.equal(parseAmount('89,50'), 8950)
  assert.equal(parseAmount('89.5'), 8950)
  assert.equal(parseAmount('1.234,56'), 123456)
  assert.equal(parseAmount('1,234.56'), 123456)
  assert.equal(parseAmount(' 12 kr.'), 1200)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('abc'), null)
  assert.equal(parseAmount('-5'), null)
  assert.equal(parseAmount('9999999999'), null)
})

test('typedAmount keeps what was typed, in the locale format', async () => {
  const { typedAmount } = await import('./fmt.ts')
  const dec = new Intl.NumberFormat(undefined).formatToParts(1.5).find((p) => p.type === 'decimal')?.value
  assert.ok(typedAmount('12,', 'DKK').includes(`12${dec}`))
  assert.ok(typedAmount('12,5', 'DKK').includes(`12${dec}5`))
  assert.ok(!typedAmount('', 'DKK').includes(`${dec}`) || typedAmount('', 'DKK').includes('0'))
})

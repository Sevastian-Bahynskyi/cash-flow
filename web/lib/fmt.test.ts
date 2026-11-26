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

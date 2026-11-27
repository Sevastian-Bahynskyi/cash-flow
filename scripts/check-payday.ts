// Self-check for the payday rule: node scripts/check-payday.ts
import assert from 'node:assert/strict';
import { nextPayday, paydayIn } from '../src/core/domain/payday.ts';

const cases: [number, number, string][] = [
  [2026, 10, '2026-11-27'], // Mon 30 Nov is the last banking day
  [2026, 9, '2026-10-29'], // weekend at the end
  [2026, 7, '2026-08-28'],
  [2026, 4, '2026-05-28'],
  [2026, 11, '2026-12-29'], // banks close on 31 Dec
  [2027, 2, '2027-03-30'], // Easter Monday is 29 Mar
  [2027, 0, '2027-01-28'],
];
for (const [y, m, want] of cases) assert.equal(paydayIn(y, m), want, `${y}-${m + 1}`);
assert.equal(nextPayday('2026-11-27'), '2026-12-29');
assert.equal(nextPayday('2026-12-29'), '2027-01-28');
assert.equal(nextPayday('2026-12-02'), '2026-12-29');
console.log('payday ok');

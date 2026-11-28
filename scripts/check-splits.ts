// Self-check for split purchases: node scripts/check-splits.ts
import assert from 'node:assert/strict';
import { costOf, partsOf } from '../src/core/domain/splits.ts';

const minors = (xs: { minor: number }[]) => xs.map((x) => x.minor);
const own = { category_id: 'shop', amount_minor: 1000, shared: false };
const joint = { ...own, shared: true };

// no parts: the whole row
assert.deepEqual(minors(costOf(partsOf(own, []), 'personal', 0.5)), [1000]);
// joint row at 0.6 with a 300 gift of mine: I pay the gift in full and my share of the rest
const gift = [{ category_id: 'gift', amount_minor: 300, shared: false }];
assert.deepEqual(minors(costOf(partsOf(joint, gift), 'personal', 0.6)), [300, 420]);
assert.deepEqual(minors(costOf(partsOf(joint, gift), 'shared', 0.6)), [0, 700]);
// own row with 400 shared groceries at half
const groc = [{ category_id: 'groc', amount_minor: 400, shared: true }];
assert.deepEqual(minors(costOf(partsOf(own, groc), 'personal', 0.5)), [200, 600]);
assert.deepEqual(minors(costOf(partsOf(own, groc), 'shared', 0.5)), [400, 0]);
// parts bigger than the row shrink to fit; the rest is 0
const big = partsOf(own, [{ category_id: 'a', amount_minor: 700, shared: false }, { category_id: 'b', amount_minor: 500, shared: false }]);
assert.equal(big.reduce((a, p) => a + p.gross, 0), 1000);
assert.equal(big[2]?.gross, 0);
console.log('splits ok');

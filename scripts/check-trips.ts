// Self-check for trips and debts: node scripts/check-trips.ts
import assert from 'node:assert/strict';
import { abroadNow, applyTrips, backHome, pastTrips, travelCategoryFor, type PlaceRow, type TripRow } from '../src/core/domain/trips.ts';
import { applyEvent, eventKindFor } from '../src/core/domain/debts.ts';

const cats = [
  { id: 'food', name: 'Food', parent_id: null }, { id: 'groc', name: 'Groceries', parent_id: 'food' },
  { id: 'bills', name: 'Bills', parent_id: null }, { id: 'travel', name: 'Travel', parent_id: null },
  { id: 'tfood', name: 'Food', parent_id: 'travel' }, { id: 'tstay', name: 'Stay', parent_id: 'travel' },
];
assert.equal(travelCategoryFor(cats, 'groc'), 'tfood');
assert.equal(travelCategoryFor(cats, 'bills'), null);
assert.equal(travelCategoryFor(cats, 'tstay'), null);

const places = new Map<string, PlaceRow>([
  ['mercadona', { key: 'mercadona', country_iso: 'ES', city: 'Barcelona', lat: 41.4, lng: 2.2, online: false }],
  ['netto', { key: 'netto', country_iso: 'DK', city: 'Aarhus', lat: 56.2, lng: 10.2, online: false }],
  ['norlys', { key: 'norlys', country_iso: null, city: null, lat: null, lng: null, online: true }],
]);
const row = (id: string, name: string, on: string, category_id = 'groc', extra = {}) => ({ id, name, kind: 'expense', occurred_on: on, category_id, amount_minor: 1000, country_iso: null, movement: 'spend', ...extra });
const trip: TripRow = { id: 'tr', user_id: 'u', name: 'Barcelona', country_iso: 'ES', start_on: '2026-08-04', end_on: null, created_at: '' };
const rows = [row('a', 'Mercadona', '2026-08-05'), row('b', 'Netto', '2026-08-05'), row('c', 'Norlys', '2026-08-05', 'bills'), row('d', 'Mercadona', '2026-08-06', 'groc', { reason_source: 'you' }), row('e', 'Mercadona', '2026-08-06', 'groc', { trip_exclude: true })];
const got = applyTrips(rows, [trip], places, cats, '2026-08-10');
assert.deepEqual(got.map((r) => [r.id, r.category_id, (r as { trip_id?: string }).trip_id ?? null]), [['a', 'tfood', 'tr'], ['b', 'groc', null], ['c', 'bills', null], ['d', 'groc', 'tr'], ['e', 'groc', null]]);

// Abroad now: two purchases in Spain in the last 3 days, no trip.
assert.deepEqual(abroadNow([row('x', 'Mercadona', '2026-09-01'), row('y', 'Mercadona', '2026-09-02')], places, [], '2026-09-02'), { country: 'ES', since: '2026-09-01', count: 2 });
assert.equal(abroadNow([row('x', 'Mercadona', '2026-09-02')], places, [], '2026-09-02'), null);
// Back home: last purchase abroad on the 6th, Netto on the 8th.
assert.equal(backHome(trip, [row('a', 'Mercadona', '2026-08-06'), row('b', 'Netto', '2026-08-08')], places, '2026-08-08'), '2026-08-06');
assert.equal(backHome(trip, [row('a', 'Mercadona', '2026-08-06')], places, '2026-08-08'), null);
// Past trips: 3 purchases abroad with small gaps, then a lone one far later.
const past = pastTrips([row('1', 'Mercadona', '2026-03-01'), row('2', 'Mercadona', '2026-03-03'), row('3', 'Mercadona', '2026-03-06'), row('4', 'Mercadona', '2026-05-01')], places, [], '2026-09-01');
assert.deepEqual(past.map((p) => [p.country, p.start_on, p.end_on, p.count]), [['ES', '2026-03-01', '2026-03-06', 3]]);

// Debts: money in grows a loan, money out repays it; undo restores.
assert.equal(eventKindFor('loan', { kind: 'income' }), 'borrowed');
assert.equal(eventKindFor('owed', { kind: 'expense' }), 'lent');
const d = applyEvent({ principal_minor: 1000, remaining_minor: 1000 }, 'loan', 'borrowed', 500);
assert.deepEqual(d, { principal_minor: 1500, remaining_minor: 1500, status: 'open' });
const paid = applyEvent(d, 'loan', 'repaid', 1500);
assert.deepEqual(paid, { principal_minor: 1500, remaining_minor: 0, status: 'closed' });
assert.deepEqual(applyEvent(paid, 'loan', 'repaid', 1500, true), { principal_minor: 1500, remaining_minor: 1500, status: 'open' });
// Inside Denmark: Copenhagen counts, Aarhus does not.
const cph = new Map<string, PlaceRow>([['cafe', { key: 'cafe', country_iso: 'DK', city: 'Copenhagen', lat: 55.68, lng: 12.57, online: false }], ['netto', places.get('netto')!]]);
const home: TripRow = { ...trip, id: 'dk', country_iso: null };
assert.deepEqual(applyTrips([row('a', 'Cafe', '2026-08-05'), row('b', 'Netto', '2026-08-05')], [home], cph, cats, '2026-08-10').map((r) => r.category_id), ['tfood', 'groc']);
console.log('trips and debts ok');

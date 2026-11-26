import { assertEquals } from "jsr:@std/assert@1";
import { type LinkBankRow, linkHistory, type LinkManualRow } from "./link-history.ts";

const manual = (id: string, over: Partial<LinkManualRow> = {}): LinkManualRow => ({
  id,
  kind: "expense",
  amount_minor: 10000,
  original_amount_minor: 10000,
  currency_code: "DKK",
  occurred_on: "2026-11-10",
  ...over,
});
const bank = (id: string, over: Partial<LinkBankRow> = {}): LinkBankRow => ({
  id,
  amount_minor: -10000,
  currency: "DKK",
  date: "2026-11-10",
  ...over,
});
const pairs = (links: { transaction_id: string; bank_transaction_id: string }[]) =>
  links.map((l) => `${l.transaction_id}>${l.bank_transaction_id}`).sort();

Deno.test("link: exact amount same day links", () => {
  assertEquals(pairs(linkHistory([manual("m1")], [bank("b1")])), ["m1>b1"]);
});

Deno.test("link: same sign only (expense never links to a credit)", () => {
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: 10000 })]), []);
  assertEquals(linkHistory([manual("m1", { kind: "income" })], [bank("b1")]), []);
  assertEquals(pairs(linkHistory([manual("m1", { kind: "income" })], [bank("b1", { amount_minor: 10000 })])), ["m1>b1"]);
});

Deno.test("link: date window is -2..+5 days (bank minus manual)", () => {
  const cases: [string, boolean][] = [
    ["2026-11-07", false], // -3
    ["2026-11-08", true], // -2
    ["2026-11-15", true], // +5
    ["2026-11-16", false], // +6
  ];
  for (const [date, linked] of cases) {
    assertEquals(linkHistory([manual("m1")], [bank("b1", { date })]).length, linked ? 1 : 0, date);
  }
});

Deno.test("link: amount within ±3% links (FX), beyond does not", () => {
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: -10300 })]).length, 1);
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: -9700 })]).length, 1);
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: -10301 })]).length, 0);
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: -9699 })]).length, 0);
});

Deno.test("link: EUR manual row links to EUR bank row by original amount", () => {
  const m = manual("m1", { currency_code: "EUR", original_amount_minor: 1200, amount_minor: 8952 });
  assertEquals(pairs(linkHistory([m], [bank("b1", { currency: "EUR", amount_minor: -1200 })])), ["m1>b1"]);
  // EUR manual against the DKK leg compares the converted amount
  assertEquals(pairs(linkHistory([m], [bank("b2", { amount_minor: -8952 })])), ["m1>b2"]);
});

Deno.test("link: one-to-one, never two manual rows on one bank row", () => {
  const links = linkHistory([manual("m1"), manual("m2")], [bank("b1")]);
  assertEquals(links.length, 1);
  const twoBank = linkHistory([manual("m1"), manual("m2")], [bank("b1"), bank("b2", { date: "2026-11-11" })]);
  assertEquals(new Set(twoBank.map((l) => l.bank_transaction_id)).size, twoBank.length);
  assertEquals(new Set(twoBank.map((l) => l.transaction_id)).size, twoBank.length);
  assertEquals(twoBank.length, 2);
});

Deno.test("link: best score wins (exact beats FX, closer date beats farther)", () => {
  const exactFar = bank("exact", { date: "2026-11-14" });
  const fxNear = bank("fx", { amount_minor: -10100 });
  assertEquals(pairs(linkHistory([manual("m1")], [fxNear, exactFar])), ["m1>exact"]);
  const near = bank("near", { date: "2026-11-11" });
  const far = bank("far", { date: "2026-11-13" });
  assertEquals(pairs(linkHistory([manual("m1")], [far, near])), ["m1>near"]);
});

Deno.test("link: greedy keeps the globally best pair when two manual rows want one bank row", () => {
  // m1 is 3 days from b1, m2 same day as b1; b2 only fits m1
  const links = linkHistory(
    [manual("m1", { occurred_on: "2026-11-07" }), manual("m2")],
    [bank("b1"), bank("b2", { date: "2026-11-06" })],
  );
  assertEquals(pairs(links), ["m1>b2", "m2>b1"]);
});

Deno.test("link: deterministic regardless of input order", () => {
  const ms = [manual("m1"), manual("m2"), manual("m3", { amount_minor: 5000, original_amount_minor: 5000 })];
  const bs = [bank("b1"), bank("b2", { date: "2026-11-12" }), bank("b3", { amount_minor: -5000 })];
  assertEquals(pairs(linkHistory(ms, bs)), pairs(linkHistory([...ms].reverse(), [...bs].reverse())));
});

Deno.test("link: zero-amount holds never link", () => {
  assertEquals(linkHistory([manual("m1")], [bank("b1", { amount_minor: 0 })]), []);
});

// Unit cases the fixture-world tests (engine_test.ts) do not reach. All names, cards and amounts are invented.
import { assertEquals } from "jsr:@std/assert@1";
import { aiLabel, parseAiResults } from "./ai.ts";
import { type BankTx, type CategoryRef, classify, type Ctx, findCategory, merchantKey, parseAuditSuggestion } from "./engine.ts";

const tree: [string, string | null][] = [
  ["Food", null], ["Groceries", "Food"], ["Restaurants", "Food"], ["Travel", null], ["Food", "Travel"], ["Transport", null],
  ["Shopping", null], ["Income", null], ["Refund", "Income"], ["Transfers", null], ["Transfer", "Transfers"], ["MobilePay", "Transfers"],
];
const categories: CategoryRef[] = tree.map(([name, parent], i) => ({ id: `c${i}`, name, parent_id: parent ? `c${tree.findIndex(([n, p]) => n === parent && p === null)}` : null }));
const cat = (name: string, parent: string | null = null): string => findCategory(categories, name, parent) ?? "missing";

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  now: "2026-11-26", categories, rules: [], memory: [], people: [], ownerLabels: new Map(), ownCardSuffixes: ["1111"], ...over,
});
const tx = (over: Partial<BankTx>): BankTx => ({
  id: "t1", account_role: "personal", bank: "lunar", amount_minor: -5000, currency: "DKK", booking_date: "2026-11-20",
  creditor_name: null, debtor_name: null, remittance: null, mcc: null, bank_code: null, ...over,
});
const one = (c: Ctx, t: BankTx) => {
  const l = classify(c, [t]).get(t.id);
  if (!l) throw new Error("no label");
  return l;
};

Deno.test("category names resolve with the Travel parent", () => {
  assertEquals(cat("Food"), "c0");
  assertEquals(cat("Food", "Travel"), "c4");
  assertEquals(parseAuditSuggestion("Travel>Food via pattern"), { name: "Food", parent: "Travel" });
  assertEquals(parseAuditSuggestion("null / block"), null);
});

Deno.test("rule audit: a fixed key gets the suggested category; a blocked rail is skipped and the merchant after * is used", () => {
  const rules = [
    { pattern: "dsb", kind: "expense" as const, category_id: cat("Travel"), canonical_merchant: "DSB", is_blocked: false },
    { pattern: "klarna", kind: "expense" as const, category_id: cat("Shopping"), canonical_merchant: "Klarna", is_blocked: false },
  ];
  assertEquals(one(ctx({ rules }), tx({ creditor_name: "DSB APP" })).category_id, cat("Transport"));
  assertEquals(merchantKey("Klarna*Fake Shop"), "fake shop");
  const rail = one(ctx({ rules }), tx({ creditor_name: "Klarna*Fake Shop" }));
  assertEquals([rail.merchant_key, rail.category_id], ["fake shop", null]);
});

Deno.test("people: a name variant counts for its canonical person", () => {
  const people = [
    { id: "p1", name: "Test Friendly", normalized_name: "test friendly", kind: "settle_up" as const, alias_of: null },
    { id: "p2", name: "Test Friend", normalized_name: "test friend", kind: "settle_up" as const, alias_of: "p1" },
  ];
  const l = one(ctx({ people }), tx({ creditor_name: "MobilePay Test Friend", mcc: "4829" }));
  assertEquals([l.movement, l.counterparty_person_id, l.category_id], ["person", "p1", cat("MobilePay", "Transfers")]);
});

Deno.test("own moves: a Lunar card top-up paired with a joint TOPUP is the owner's joint top-up, counted once", () => {
  const out = tx({ id: "out", creditor_name: "Revolut**2222*", remittance: "Revolut**2222*", amount_minor: -30000, booking_date: "2026-11-10" });
  const into = tx({ id: "in", bank: "revolut", account_role: "joint", amount_minor: 30000, booking_date: "2026-11-11", remittance: "Apple Pay Top-Up by *2222", bank_code: "TOPUP" });
  const other = tx({ id: "gf", bank: "revolut", account_role: "joint", amount_minor: 20000, booking_date: "2026-11-11", remittance: "Apple Pay Top-Up by *8888", bank_code: "TOPUP" });
  const labels = classify(ctx(), [out, into, other]);
  assertEquals([labels.get("out")?.movement, labels.get("out")?.is_shared_topup], ["topup", false]);
  assertEquals([labels.get("in")?.is_shared_topup, labels.get("in")?.shared_participant, labels.get("in")?.shared], [true, "me", false]);
  assertEquals(labels.get("gf")?.shared_participant, "gf");
});

Deno.test("unknown rows wait for AI and only ask inside the 30-day window", () => {
  const fresh = one(ctx(), tx({ creditor_name: "Zzq Unknown Place" }));
  const old = one(ctx(), tx({ creditor_name: "Zzq Unknown Place", booking_date: "2026-09-01" }));
  assertEquals([fresh.category_id, fresh.reason_source, fresh.needs_review], [null, "ai", true]);
  assertEquals(old.needs_review, false);
});

Deno.test("AI output: unknown ids and categories are dropped", () => {
  const text = 'noise {"results":[{"id":"t1","categoryId":"c1","name":"Shop","reason":"Grocery chain","confidence":0.9},{"id":"x","categoryId":"c1"},{"id":"t1","categoryId":"zz"}]}';
  assertEquals(parseAiResults(text, new Set(["t1"]), new Set(["c1"])).length, 1);
  assertEquals(parseAiResults("not json", new Set(["t1"]), new Set(["c1"])), []);
});

Deno.test("aiLabel: >= 0.8 applies quietly, below goes to the Inbox, failure keeps the deterministic label", async () => {
  const rows = [tx({ id: "a", creditor_name: "Zzq Alpha" }), tx({ id: "b", creditor_name: "Zzq Beta" }), tx({ id: "k", creditor_name: "DSB" })];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [
      { id: "a", categoryId: cat("Groceries", "Food"), name: "Alpha", reason: "Grocery shop", confidence: 0.92 },
      { id: "b", categoryId: cat("Restaurants", "Food"), name: "Beta", reason: "Probably a cafe", confidence: 0.5 },
    ] }) } }] })));
  try {
    const labels = await aiLabel(ctx({ rules: [{ pattern: "dsb", kind: "expense", category_id: cat("Transport"), canonical_merchant: "DSB", is_blocked: false }] }), rows, "fake-key");
    assertEquals([labels.get("a")?.category_id, labels.get("a")?.needs_review, labels.get("a")?.reason_source], [cat("Groceries", "Food"), false, "ai"]);
    assertEquals([labels.get("b")?.category_id, labels.get("b")?.needs_review], [cat("Restaurants", "Food"), true]);
    assertEquals(labels.get("k")?.reason_source, "rule");
    globalThis.fetch = (): Promise<Response> => Promise.resolve(new Response("down", { status: 503 }));
    const failed = await aiLabel(ctx(), rows.slice(0, 1), "fake-key");
    assertEquals([failed.get("a")?.category_id, failed.get("a")?.needs_review], [null, true]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

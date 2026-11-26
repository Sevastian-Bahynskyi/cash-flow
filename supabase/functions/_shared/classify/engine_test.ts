import { assert, assertEquals } from "jsr:@std/assert@1";
import { toLedgerRow } from "../sync/ledger.ts";
import { DUMPS, FAMILY, FRIEND, loadDump, OWN_CARD_SUFFIXES, OWNER, PARTNER } from "../fixtures/world.ts";
import { type BankTx, type CategoryRef, classify, type Ctx, deriveOwnerLabels, type Label, merchantKey } from "./engine.ts";

// Fake category tree with the production system names (ids invented).
const tree: [string, string | null][] = [
  ["Food", null], ["Groceries", "Food"], ["Restaurants", "Food"], ["Coffee", "Food"],
  ["Income", null], ["Salary", "Income"], ["Benefits", "Income"], ["Refund", "Income"],
  ["Transfers", null], ["Transfer", "Transfers"], ["MobilePay", "Transfers"], ["Top up", "Transfers"],
  ["Bills", null], ["Entertainment", null], ["Other", null], ["Family & Care", null], ["Girlfriend", "Family & Care"],
];
const categories: CategoryRef[] = [];
for (const [name, parent] of tree) {
  categories.push({ id: `cat-${name.toLowerCase().replace(/\W+/g, "-")}`, name, parent_id: parent ? categories.find((c) => c.name === parent)?.id ?? null : null });
}
const id = (name: string): string => categories.find((c) => c.name === name)?.id ?? `missing:${name}`;

const person = (pid: string, name: string, kind: Ctx["people"][number]["kind"]) => ({
  id: pid, name, normalized_name: merchantKey(name), kind, alias_of: null,
});

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  now: "2026-11-26",
  categories,
  rules: [],
  memory: [],
  people: [
    person("p-self", OWNER.name, "self"),
    person("p-partner", PARTNER.name, "partner"),
    person("p-family", FAMILY.name, "family"),
    person("p-friend", FRIEND.name, "settle_up"),
  ],
  ownerLabels: new Map(),
  ownCardSuffixes: OWN_CARD_SUFFIXES,
  ...over,
});

const BANK: Record<keyof typeof DUMPS, { bank: string; role: BankTx["account_role"] }> = {
  lunar: { bank: "lunar", role: "personal" },
  revolutPersonal: { bank: "revolut", role: "personal" },
  revolutEur: { bank: "revolut", role: "personal" },
  joint: { bank: "revolut", role: "joint" },
  savings: { bank: "revolut", role: "savings" },
};

// All fixture rows as the sync passes them to the classifier; id = "<dump>:<index>".
const allTxs = async (): Promise<BankTx[]> => {
  const out: BankTx[] = [];
  for (const [key, file] of Object.entries(DUMPS) as [keyof typeof DUMPS, string][]) {
    const dump = await loadDump(file);
    for (const [i, raw] of dump.raw.entries()) {
      const row = await toLedgerRow(raw);
      out.push({
        id: `${key}:${i}`,
        account_role: BANK[key].role,
        bank: BANK[key].bank,
        amount_minor: row.amount_minor,
        currency: row.currency,
        booking_date: row.transaction_date ?? row.booking_date ?? row.value_date ?? "",
        creditor_name: row.creditor_name,
        debtor_name: row.debtor_name,
        remittance: row.remittance,
        mcc: row.mcc,
        bank_code: row.bank_code,
      });
    }
  }
  return out;
};

const find = (txs: BankTx[], dump: keyof typeof DUMPS, pred: (t: BankTx) => boolean): BankTx => {
  const t = txs.find((x) => x.id.startsWith(`${dump}:`) && pred(x));
  if (!t) throw new Error(`fixture row missing in ${dump}`);
  return t;
};
const labelOf = (labels: Map<string, Label>, t: BankTx): Label => {
  const l = labels.get(t.id);
  if (!l) throw new Error(`no label for ${t.id}`);
  return l;
};
const rem = (s: string) => (t: BankTx) => (t.remittance ?? "").includes(s);

Deno.test("classify: every fixture row gets a label with a reason", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  assertEquals(labels.size, txs.length);
  for (const l of labels.values()) assert(l.reason.length > 0);
});

Deno.test("classify: deterministic (same input, same output)", async () => {
  const txs = await allTxs();
  assertEquals([...classify(ctx(), txs)], [...classify(ctx(), [...txs])]);
});

Deno.test("rung 0: 0.00 rows and temporary holds are ignored", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  for (const t of txs.filter((x) => x.amount_minor === 0)) assertEquals(labelOf(labels, t).movement, "ignore", t.id);
});

Deno.test("rung 1: Lunar 'Revolut**NNNN' out and Revolut TOPUP in are both 'moved'", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  assertEquals(labelOf(labels, find(txs, "lunar", (t) => /revolut/i.test(t.creditor_name ?? ""))).movement, "moved");
  const topup = labelOf(labels, find(txs, "revolutPersonal", (t) => t.bank_code === "TOPUP"));
  assertEquals(topup.movement, "moved");
  assertEquals(topup.is_shared_topup, false);
});

Deno.test("rung 1: joint top-ups attributed by card suffix (own -> me, other -> gf)", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  const mine = labelOf(labels, find(txs, "joint", (t) => t.bank_code === "TOPUP" && rem("*9001")(t)));
  const hers1 = labelOf(labels, find(txs, "joint", (t) => t.bank_code === "TOPUP" && rem("*7001")(t)));
  assertEquals([mine.movement, mine.is_shared_topup, mine.shared_participant], ["topup", true, "me"]);
  assertEquals([hers1.movement, hers1.is_shared_topup, hers1.shared_participant], ["topup", true, "gf"]);
  assertEquals(mine.shared, false); // transactions_topup_shape: a top-up row is never shared
});

Deno.test("rung 1: personal->joint TRANSFER is a 'me' top-up counted once (joint side only)", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  const out = labelOf(labels, find(txs, "revolutPersonal", (t) => t.bank_code === "TRANSFER" && rem("To MARA")(t)));
  const into = labelOf(labels, find(txs, "joint", (t) => t.bank_code === "TRANSFER" && t.amount_minor > 0));
  assertEquals(out.movement, "topup");
  assertEquals(into.movement, "topup");
  assertEquals(into.shared_participant, "me");
  assertEquals([out.is_shared_topup, into.is_shared_topup].filter(Boolean).length, 1, "share math must see this top-up once");
});

Deno.test("rung 1: 'To DKK' pocket exchange is moved", async () => {
  const txs = await allTxs();
  assertEquals(labelOf(classify(ctx(), txs), find(txs, "revolutPersonal", rem("To DKK"))).movement, "moved");
});

Deno.test("refund: joint CARD_REFUND (debtor = owner) is a refund, not a top-up", async () => {
  const txs = await allTxs();
  const l = labelOf(classify(ctx(), txs), find(txs, "joint", (t) => t.bank_code === "CARD_REFUND"));
  assertEquals(l.movement, "refund");
  assertEquals(l.is_shared_topup, false);
});

Deno.test("rung 2: salary and SU", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  const salary = labelOf(labels, find(txs, "lunar", rem("LØNOVERFØRSEL")));
  assertEquals([salary.movement, salary.is_salary, salary.category_id], ["income", true, id("Salary")]);
  const su = labelOf(labels, find(txs, "lunar", (t) => t.remittance === "SU"));
  assertEquals([su.movement, su.category_id], ["income", id("Benefits")]);
});

Deno.test("rung 3: people by kind; family always asks", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  const friendIn = labelOf(labels, find(txs, "lunar", rem(FRIEND.name)));
  assertEquals([friendIn.movement, friendIn.counterparty_person_id], ["person", "p-friend"]);
  const family = labelOf(labels, find(txs, "lunar", rem(FAMILY.name)));
  assertEquals([family.movement, family.needs_review, family.counterparty_person_id], ["person", true, "p-family"]);
});

Deno.test("rung 4..6: owner labels beat rules beat memory", async () => {
  const txs = await allTxs();
  const t = find(txs, "lunar", rem("Cafe Mockup"));
  const key = merchantKey(t.creditor_name ?? "");
  const nkey = merchantKey(t.remittance ?? "");
  const rule = { pattern: nkey, kind: "expense" as const, category_id: id("Coffee"), canonical_merchant: "Cafe Mockup", is_blocked: false };
  const memory = { normalized_merchant: nkey, kind: "expense" as const, category_id: id("Groceries"), canonical_merchant: null, support_ratio: 0.9 };
  const withAll = ctx({
    rules: [rule],
    memory: [memory],
    ownerLabels: new Map([[nkey, { category_id: id("Restaurants"), n: 3, total: 3 }], [key, { category_id: id("Restaurants"), n: 3, total: 3 }]]),
  });
  assertEquals(labelOf(classify(withAll, txs), t).reason_source, "you");
  assertEquals(labelOf(classify(withAll, txs), t).category_id, id("Restaurants"));
  const rulesMem = labelOf(classify(ctx({ rules: [rule], memory: [memory] }), txs), t);
  assertEquals([rulesMem.reason_source, rulesMem.category_id], ["rule", id("Coffee")]);
  const memOnly = labelOf(classify(ctx({ memory: [memory] }), txs), t);
  assertEquals([memOnly.reason_source, memOnly.category_id], ["memory", id("Groceries")]);
  const blocked = labelOf(classify(ctx({ rules: [{ ...rule, is_blocked: true }] }), txs), t);
  assert(blocked.reason_source !== "rule");
});

Deno.test("rung 8: MCC fallback with a short owner-facing reason", async () => {
  const txs = await allTxs();
  const l = labelOf(classify(ctx(), txs), find(txs, "lunar", rem("Grocer 42")));
  assertEquals([l.movement, l.reason_source, l.category_id], ["spend", "mcc", id("Groceries")]);
  assert(l.reason.includes("5411"));
});

Deno.test("refund rule: money back from a shop is a refund", async () => {
  const txs = await allTxs();
  const l = labelOf(classify(ctx(), txs), find(txs, "lunar", (t) => rem("Cafe Mockup")(t) && t.amount_minor > 0));
  assertEquals([l.movement, l.category_id], ["refund", id("Refund")]);
});

Deno.test("joint: everything shared except top-ups; paid_by from debtor name", async () => {
  const txs = await allTxs();
  const labels = classify(ctx(), txs);
  const mine = labelOf(labels, find(txs, "joint", (t) => t.bank_code === "CARD_PAYMENT" && t.debtor_name === OWNER.upper && t.amount_minor < 0));
  const hers = labelOf(labels, find(txs, "joint", (t) => t.bank_code === "CARD_PAYMENT" && t.debtor_name === PARTNER.upper));
  assertEquals([mine.shared, mine.paid_by], [true, "me"]);
  assertEquals([hers.shared, hers.paid_by], [true, "partner"]);
  for (const t of txs.filter((x) => x.account_role === "joint")) {
    const l = labelOf(labels, t);
    assertEquals(l.shared, !l.is_shared_topup, t.id);
  }
});

Deno.test("inbox policy: unsure rows older than 30 days never ask", async () => {
  const txs = await allTxs();
  const family = find(txs, "lunar", rem(FAMILY.name));
  const old = { ...family, id: "old", booking_date: "2026-10-01" };
  const labels = classify(ctx(), [family, old]);
  assertEquals(labelOf(labels, family).needs_review, true);
  const oldLabel = labelOf(labels, old);
  assertEquals(oldLabel.needs_review, false);
  assert(oldLabel.reason.length > 0, "reason kept");
});

Deno.test("owner labels: majority >= 0.7 of >= 2 rows, never Girlfriend", () => {
  const rows = (key: string, cats: string[]) => cats.map((c) => ({ merchant_key: key, category_id: id(c) }));
  const got = deriveOwnerLabels([
    ...rows("a", ["Coffee", "Coffee", "Coffee", "Food"]), // 0.75
    ...rows("b", ["Coffee", "Food"]), // 0.5
    ...rows("c", ["Coffee"]), // 1 seen
    ...rows("d", ["Girlfriend", "Girlfriend"]),
  ], categories);
  assertEquals([...got.keys()], ["a"]);
});

Deno.test("no personal facts in the engine: names and cards come only from ctx", async () => {
  const txs = await allTxs();
  const labels = classify(ctx({ people: [], ownCardSuffixes: [] }), txs);
  const t = find(txs, "joint", (x) => x.bank_code === "TOPUP" && rem("*9001")(x));
  assertEquals(labelOf(labels, t).shared_participant, "gf");
});

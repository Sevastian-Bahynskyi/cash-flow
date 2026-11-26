// Scores the classifier against the owner's hand labels on real data. Prints aggregates only; details go to <sp-dir>.
// Usage: deno run --node-modules-dir=none --allow-read --allow-write scripts/classify/eval.ts <sp-dir> <kit-dir> <facts.json> [now=2026-11-26]
//   <sp-dir>/prod/*.json        production export (categories, rules, memory, transfer_people, loans, transactions)
//   <sp-dir>/bank/<uid8>.json   Enable Banking dumps; <sp-dir>/accounts.json { uid8: { bank, role } }
//   <sp-dir>/links.json         manual <-> bank pairs from scripts/bank/link-dry-run.ts
//   <kit-dir>, <facts.json>     as for people-seed.ts (people kinds are simulated as if the seed ran)
// Scoring follows the labeling kit's evaluate.py. Leave-one-out: the owner-label rung never sees the row being scored.
import {
  classify,
  deriveOwnerLabels,
  knowledge,
  merchantKey,
  type AccountRole,
  type BankTx,
  type CategoryRef,
  type Ctx,
  type Label,
  type MemoryRef,
  type PersonRef,
  type RuleRef,
} from "../../supabase/functions/_shared/classify/engine.ts";
import { toLedgerRow } from "../../supabase/functions/_shared/sync/ledger.ts";
import type { EbTransaction } from "../../supabase/functions/_shared/enable-banking.ts";
import { buildPeopleSeed, type ExistingPerson, type Facts, type Loan } from "./people-seed.ts";

type ManualRow = { id: string; name: string; category_id: string; is_shared_topup: boolean };
type Link = { transaction_id: string; bank_account_uid8: string; ext_id: string };
type Account = { bank: string; role: AccountRole };

const [sp, kit, factsPath, nowArg] = Deno.args;
if (!sp || !kit || !factsPath) throw new Error("usage: eval.ts <sp-dir> <kit-dir> <facts.json> [now]");
const now = nowArg ?? "2026-11-26";
const read = async <T>(path: string): Promise<T> => JSON.parse(await Deno.readTextFile(path)) as T;

const categories = await read<CategoryRef[]>(`${sp}/prod/categories.json`);
const rules = await read<RuleRef[]>(`${sp}/prod/merchant_category_rules.json`);
const memory = (await read<MemoryRef[]>(`${sp}/prod/merchant_category_memory.json`)).map((m) => ({ ...m, support_ratio: m.support_ratio === null ? null : Number(m.support_ratio) }));
const manual = await read<ManualRow[]>(`${sp}/prod/transactions.json`);
const facts = await read<Facts>(factsPath);
const accounts = await read<Record<string, Account>>(`${sp}/accounts.json`);
const links = await read<Link[]>(`${sp}/links.json`);
const kitKnowledge = await read<{ merchants: { key: string; class: string }[] }>(`${kit}/knowledge.json`);

// People as they will be after people-seed.sql runs.
const seed = buildPeopleSeed(
  await read<ExistingPerson[]>(`${sp}/prod/transfer_people.json`),
  kitKnowledge.merchants.filter((m) => m.class === "person").map((m) => m.key),
  facts,
  await read<Loan[]>(`${sp}/prod/loans.json`),
);
const idOf = (p: { id: string | null; normalized_name: string }): string => p.id ?? `new:${p.normalized_name}`;
const people: PersonRef[] = seed.map((p) => ({
  id: idOf(p),
  name: p.name,
  normalized_name: p.normalized_name,
  kind: p.alias_of_name ? "settle_up" : p.kind,
  alias_of: p.alias_of_name ? idOf(seed.find((c) => c.normalized_name === p.alias_of_name) ?? { id: null, normalized_name: p.alias_of_name }) : null,
}));

// Bank rows, ids = <uid8>:<ext_id> as in links.json.
const txs: BankTx[] = [];
for (const [uid8, account] of Object.entries(accounts)) {
  const dump = await read<{ raw: EbTransaction[] }>(`${sp}/bank/${uid8}.json`);
  for (const raw of dump.raw) {
    const row = await toLedgerRow(raw);
    const date = row.booking_date ?? row.value_date ?? row.transaction_date;
    if (!date) continue;
    txs.push({
      id: `${uid8}:${row.ext_id}`, account_role: account.role, bank: account.bank, amount_minor: row.amount_minor, currency: row.currency,
      booking_date: date, creditor_name: row.creditor_name, debtor_name: row.debtor_name, remittance: row.remittance, mcc: row.mcc, bank_code: row.bank_code,
    });
  }
}
const txById = new Map(txs.map((t) => [t.id, t]));

const manualKeys = manual.map((r) => ({ id: r.id, merchant_key: merchantKey(r.name), category_id: r.category_id }));
const ctx: Ctx = {
  now, categories, rules, memory, people,
  ownerLabels: deriveOwnerLabels(manualKeys, categories),
  ownCardSuffixes: facts.own_card_suffixes,
};
const labels = classify(ctx, txs);

// Leave-one-out: re-derive the owner labels without the scored manual row; own moves keep their batch pairing.
const looLabel = (manualId: string, tx: BankTx, plain: Label): Label => {
  if (plain.reason_source === "transfer") return plain;
  const loo: Ctx = { ...ctx, ownerLabels: deriveOwnerLabels(manualKeys.filter((r) => r.id !== manualId), categories) };
  return classify(loo, [tx]).get(tx.id) ?? plain;
};

const byId = new Map(categories.map((c) => [c.id, c]));
const nameOf = (id: string | null): string => (id ? byId.get(id)?.name ?? "?" : "none");
// evaluate.py compares names: "Food" under Travel equals "Food"; the family is the parent's name, else the name.
const family = (id: string | null): string => { const c = id ? byId.get(id) : undefined; return c?.parent_id ? nameOf(c.parent_id) : nameOf(id); };
const manualById = new Map(manual.map((m) => [m.id, m]));
const publicKeys = new Set([...knowledge.merchants.map((m) => m.key), ...Object.keys(knowledge.mcc)]);

type Verdict = "exact" | "same_family" | "transfer_ok" | "transfer_diff" | "unlabeled" | "girlfriend_context" | "wrong";
const verdict = (label: Label, m: ManualRow): Verdict => {
  const owner = nameOf(m.category_id);
  if (label.movement === "moved" || label.movement === "topup") {
    return ["Transfer", "MobilePay", "Bills"].includes(owner) || m.is_shared_topup ? "transfer_ok" : "transfer_diff";
  }
  if (!label.category_id) return "unlabeled";
  if (nameOf(label.category_id) === owner) return "exact";
  if (family(label.category_id) === family(m.category_id)) return "same_family";
  if (owner === "Girlfriend") return "girlfriend_context";
  return "wrong";
};

const score = (pick: (l: Link, tx: BankTx, plain: Label) => Label) => {
  const counts = new Map<Verdict, number>();
  const misses = new Map<string, number>();
  const detail: { verdict: Verdict; source: string; engine: string; owner: string; key: string }[] = [];
  for (const l of links) {
    const tx = txById.get(`${l.bank_account_uid8}:${l.ext_id}`);
    const m = manualById.get(l.transaction_id);
    const plain = tx ? labels.get(tx.id) : undefined;
    if (!tx || !m || !plain) continue;
    const label = pick(l, tx, plain);
    const v = verdict(label, m);
    counts.set(v, (counts.get(v) ?? 0) + 1);
    if (v === "wrong" || v === "transfer_diff" || v === "unlabeled") {
      const key = `${label.reason_source} ${nameOf(label.category_id)} -> owner ${nameOf(m.category_id)} | ${publicKeys.has(label.merchant_key) ? label.merchant_key : "<private>"}`;
      misses.set(key, (misses.get(key) ?? 0) + 1);
    }
    detail.push({ verdict: v, source: label.reason_source, engine: nameOf(label.category_id), owner: nameOf(m.category_id), key: label.merchant_key });
  }
  const c = (v: Verdict): number => counts.get(v) ?? 0;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const good = c("exact") + c("same_family") + c("transfer_ok");
  const gf = c("girlfriend_context");
  return { counts, total, good, gf, misses, detail };
};

const pct = (a: number, b: number): string => `${b ? ((100 * a) / b).toFixed(2) : "0"}%`;
const report = (title: string, r: ReturnType<typeof score>) => {
  console.log(`${title}: linked ${r.total}, correct ${r.good} = ${pct(r.good, r.total)} | without Girlfriend-context rows: ${pct(r.good, r.total - r.gf)} (${r.gf} Girlfriend)`);
  console.log(`  ${[...r.counts].map(([k, v]) => `${k} ${v}`).join(", ")}`);
};
const plain = score((_l, _tx, p) => p);
const loo = score((l, tx, p) => looLabel(l.transaction_id, tx, p));
console.log(`bank rows ${txs.length} | manual ${manual.length} | links ${links.length} | owner labels ${ctx.ownerLabels.size}`);
report("plain", plain);
report("leave-one-out", loo);
console.log("top misses (leave-one-out):");
for (const [k, v] of [...loo.misses].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${v} ${k}`);

// Inbox for the last 30 days, by reason type.
const from = new Date(Date.parse(now) - 30 * 86_400_000).toISOString().slice(0, 10);
const recent = txs.filter((t) => t.booking_date >= from && t.booking_date <= now);
const inbox = recent.map((t) => ({ t, l: labels.get(t.id) })).filter((x): x is { t: BankTx; l: Label } => Boolean(x.l?.needs_review));
const kinds = new Map<string, number>();
const personKind = new Map(people.map((p) => [p.id, p.kind]));
for (const { l } of inbox) {
  const type = !l.category_id ? "no category (AI leftover)" : l.reason_source === "person" ? `person: ${personKind.get(l.counterparty_person_id ?? "") ?? "unknown name"}` : `low confidence: ${l.reason_source}`;
  kinds.set(type, (kinds.get(type) ?? 0) + 1);
}
console.log(`inbox ${from}..${now}: ${inbox.length} of ${recent.length} rows`);
for (const [k, v] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${v} ${k}`);
const leftovers = txs.filter((t) => { const l = labels.get(t.id); return l && !l.category_id && l.movement !== "ignore"; });
console.log(`AI leftovers: ${leftovers.length} of ${txs.length} total | ${leftovers.filter((t) => t.booking_date >= from).length} in the last 30 days`);
const sources = new Map<string, number>();
for (const l of labels.values()) sources.set(`${l.reason_source}/${l.movement}`, (sources.get(`${l.reason_source}/${l.movement}`) ?? 0) + 1);
console.log(`sources: ${[...sources].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);

await Deno.writeTextFile(`${sp}/eval-detail.json`, JSON.stringify({ plain: plain.detail, loo: loo.detail }));
console.log(`details: ${sp}/eval-detail.json`);

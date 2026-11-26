// Runs the real sync pipeline against the LOCAL stack with Enable Banking replaced by the dump files
// (no bank network), then verifies the owner's manual history survived. Prints counts only.
// Usage (after seed-local.ts):
//   deno run --node-modules-dir=none --allow-read --allow-net=127.0.0.1 --allow-env --allow-run=supabase \
//     scripts/bank/sync-local.ts <sp-dir> <bankmcp-bank.json>
import { createClient } from "npm:@supabase/supabase-js@2";
import type { EbClient, EbTransaction } from "../../supabase/functions/_shared/enable-banking.ts";
import { linkHistory } from "../../supabase/functions/_shared/link-history.ts";
import { classifyLabeler } from "../../supabase/functions/_shared/sync/label.ts";
import { effectiveDate } from "../../supabase/functions/_shared/sync/ledger.ts";
import { syncUser } from "../../supabase/functions/_shared/sync/run.ts";

const [sp, bankStatePath] = Deno.args;
if (!sp || !bankStatePath) throw new Error("usage: sync-local.ts <sp-dir> <bankmcp-bank.json>");

const status = new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).outputSync();
const local: { API_URL: string; SERVICE_ROLE_KEY: string } = JSON.parse(new TextDecoder().decode(status.stdout));
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(local.API_URL)) throw new Error("refusing to run: not a local stack");
Deno.env.delete("GROQ_API_KEY"); // AI stays off locally: leftovers keep the deterministic best guess.

const db = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Dump = {
  account: { uid: string; session_id: string; name: string | null; currency: string; cash_account_type: string | null; identification_hash: string };
  balances: { balance_amount: { amount: string; currency: string }; balance_type: string }[];
  raw: EbTransaction[];
};
const dumps: Dump[] = [];
for await (const entry of Deno.readDir(`${sp}/bank`)) {
  if (entry.name.endsWith(".json")) dumps.push(JSON.parse(await Deno.readTextFile(`${sp}/bank/${entry.name}`)));
}
const state: { sessions: Record<string, { id: string; bank: { name: string; country: string }; valid_until: string; status: string }> } =
  JSON.parse(await Deno.readTextFile(bankStatePath));
const dumpOf = (uid: string): Dump => {
  const dump = dumps.find((d) => d.account.uid === uid);
  if (!dump) throw new Error("unknown account uid");
  return dump;
};

const fakeEb: EbClient = {
  getSession: (sessionId) => {
    const session = Object.values(state.sessions).find((s) => s.id === sessionId);
    if (!session) return Promise.reject(new Error("unknown session"));
    return Promise.resolve({
      status: session.status,
      accounts: dumps.filter((d) => d.account.session_id === sessionId).map((d) => d.account.uid),
      aspsp: session.bank,
      access: { valid_until: session.valid_until },
    });
  },
  getAccountDetails: (uid) => Promise.resolve(dumpOf(uid).account),
  getBalances: (uid) => Promise.resolve(dumpOf(uid).balances),
  getTransactions: (uid, dateFrom) =>
    Promise.resolve(dumpOf(uid).raw.filter((r) => (r.booking_date ?? r.transaction_date ?? r.value_date ?? dateFrom) >= dateFrom)),
};

type TxRow = Record<string, unknown> & {
  id: string;
  source: string;
  kind: "expense" | "income";
  amount_minor: number;
  original_amount_minor: number;
  currency_code: string;
  occurred_on: string;
  is_salary: boolean;
  bank_transaction_id: string | null;
};

const selectAll = async <T>(table: string, columns: string, filter: Record<string, string>): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await db.from(table).select(columns).match(filter).order("id").range(from, from + 999)
      .overrideTypes<T[], { merge: false }>();
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
};

// The seeded owner (export keeps the production user id); other local users (tests) are left alone.
const exported: { user_id: string }[] = JSON.parse(await Deno.readTextFile(`${sp}/prod/transactions.json`));
const userId = exported[0]?.user_id;
if (!userId) throw new Error("empty export");
const { count: connections, error: connectionError } = await db.from("bank_connections").select("id", { count: "exact", head: true })
  .eq("user_id", userId);
if (connectionError || !connections) throw new Error("no bank connection: run seed-local.ts first");

const IGNORED = new Set(["bank_transaction_id", "updated_at"]);
const fingerprint = (row: TxRow): string =>
  JSON.stringify(Object.keys(row).filter((k) => !IGNORED.has(k)).sort().map((k) => [k, row[k]]));

const manualBefore = await selectAll<TxRow>("transactions", "*", { user_id: userId, source: "manual" });
const budgetsBefore = (await selectAll<{ id: string }>("budgets", "id", { user_id: userId })).length;

for (const pass of [1, 2]) {
  const run = await syncUser(db, fakeEb, classifyLabeler, userId, "cron", null);
  console.log(`run ${pass}: ok=${run.ok} accounts=${run.accounts} fetched=${run.fetched} inserted=${run.inserted}${run.error ? ` error=${run.error}` : ""}`);
}

const all = await selectAll<TxRow>("transactions", "*", { user_id: userId });
const manualAfter = all.filter((t) => t.source === "manual");
const mirrored = all.filter((t) => t.source === "bank");
const beforeById = new Map(manualBefore.map((t) => [t.id, t]));
const sum = (rows: TxRow[]): number => rows.reduce((total, t) => total + t.amount_minor, 0);
const changed = manualAfter.filter((t) => {
  const before = beforeById.get(t.id);
  return before && fingerprint(before) !== fingerprint(t);
});
const deleted = manualBefore.filter((t) => !manualAfter.some((a) => a.id === t.id));
const linkedManual = manualAfter.filter((t) => t.bank_transaction_id !== null);
const bankIds = all.flatMap((t) => (t.bank_transaction_id ? [t.bank_transaction_id] : []));
const cutoff = manualBefore.map((t) => t.occurred_on).sort().at(-1) ?? "";

// A mirrored row that would pair with an unlinked manual row is a likely double.
const unlinkedManual = manualAfter.filter((t) => t.bank_transaction_id === null);
const bankRows = await selectAll<{ id: string; amount_minor: number; currency: string; booking_date: string | null; value_date: string | null; transaction_date: string | null }>(
  "bank_transactions",
  "id, amount_minor, currency, booking_date, value_date, transaction_date",
  { user_id: userId },
);
const mirroredBankIds = new Set(mirrored.map((t) => t.bank_transaction_id));
const likelyDoubles = linkHistory(
  unlinkedManual,
  bankRows.filter((b) => mirroredBankIds.has(b.id)).flatMap((b) => {
    const date = effectiveDate(b);
    return date ? [{ id: b.id, amount_minor: b.amount_minor, currency: b.currency, date }] : [];
  }),
).length;

const budgetsAfter = (await selectAll<{ id: string }>("budgets", "id", { user_id: userId })).length;
const salaryAfter = all.filter((t) => t.is_salary && t.occurred_on > "2026-09-21").length;

console.log(`manual rows: before ${manualBefore.length}, after ${manualAfter.length}`);
console.log(`manual amount_minor sum equal: ${sum(manualBefore) === sum(manualAfter)}`);
console.log(`manual rows deleted: ${deleted.length}`);
console.log(`manual rows changed beyond bank_transaction_id: ${changed.length}`);
console.log(`manual rows linked: ${linkedManual.length}`);
console.log(`bank rows in ledger: ${bankRows.length}`);
console.log(`mirrored (source=bank) rows: ${mirrored.length}`);
console.log(`bank rows referenced twice: ${bankIds.length - new Set(bankIds).size}`);
console.log(`manual-linked bank rows also mirrored: ${linkedManual.filter((t) => mirroredBankIds.has(t.bank_transaction_id)).length}`);
console.log(`mirrored rows dated on/before last manual date: ${mirrored.filter((t) => t.occurred_on <= cutoff).length}`);
console.log(`mirrored rows pairing with an unlinked manual row: ${likelyDoubles}`);
console.log(`budgets: before ${budgetsBefore}, after ${budgetsAfter}`);
console.log(`salary rows after 2026-09-21: ${salaryAfter}`);

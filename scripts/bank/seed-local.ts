// Loads the private production export and Enable Banking dumps into the LOCAL stack only.
// Usage (after `supabase db reset --local`):
//   deno run --node-modules-dir=none --allow-read --allow-net=127.0.0.1 --allow-env --allow-run=supabase \
//     scripts/bank/seed-local.ts <sp-dir> <bankmcp-bank.json>
// <sp-dir>/prod/<table>.json (export, ids kept), <sp-dir>/bank/<uid8>.json (dumps).
// <bankmcp-bank.json>: BankMCP state file, read for each session's bank name, country and validity.
// Prints counts only.
import postgres from "npm:postgres@3.4.5";
import { accountRole } from "../../supabase/functions/_shared/sync/ledger.ts";

const [sp, bankStatePath] = Deno.args;
if (!sp || !bankStatePath) throw new Error("usage: seed-local.ts <sp-dir> <bankmcp-bank.json>");

const status = new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).outputSync();
const local: { API_URL: string; DB_URL: string; SERVICE_ROLE_KEY: string } = JSON.parse(new TextDecoder().decode(status.stdout));
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(local.API_URL) || !/@(127\.0\.0\.1|localhost):/.test(local.DB_URL)) {
  throw new Error("refusing to seed: not a local stack");
}

type Row = Record<string, unknown>;
const readTable = async (table: string): Promise<Row[]> => JSON.parse(await Deno.readTextFile(`${sp}/prod/${table}.json`));

const transactions = await readTable("transactions");
const userIds = new Set(transactions.map((t) => t.user_id));
const userId = transactions[0]?.user_id;
if (userIds.size !== 1 || typeof userId !== "string") throw new Error("expected exactly one user in the export");

const sql = postgres(local.DB_URL, { max: 1, onnotice: () => {} });
const [existing] = await sql<{ count: number }[]>`select count(*)::int as count from public.transactions`;
if ((existing?.count ?? 0) > 0) {
  await sql.end();
  throw new Error("local transactions not empty: run `supabase db reset --local` first");
}

// One fake local auth user that keeps the production user id, so every exported row stays valid.
const created = await fetch(`${local.API_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: { Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`, apikey: local.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ id: userId, email: "owner@cashflow.local", password: "local-only-password", email_confirm: true }),
});
if (!created.ok && created.status !== 422) throw new Error(`auth user create failed: ${created.status}`);
await created.body?.cancel();

// Exported tables in dependency order. Replica mode skips triggers (no budget copying, no
// protect-system checks) so the export lands exactly as it is in production.
const TABLES = [
  "categories",
  "category_overrides",
  "merchant_category_rules",
  "merchant_category_memory",
  "ai_category_rules",
  "transfer_people",
  "profiles",
  "transactions",
  "budgets",
  "budget_change_events",
  "loans",
  "loan_events",
  "receivables",
  "savings_accounts",
];

const counts: Record<string, number> = {};
await sql.begin(async (tx) => {
  // The local CLI stack does not apply Supabase's default table grants that production has.
  await tx`grant select, insert, update, delete on all tables in schema public to authenticated, service_role`;
  await tx`set local session_replication_role = replica`;
  // Local migrations seed their own system categories with other ids; production's replace them.
  await tx`delete from public.categories`;
  for (const table of TABLES) {
    const rows = await readTable(table);
    counts[table] = rows.length;
    if (rows.length === 0) continue;
    const insertable = await tx<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and is_generated = 'NEVER'`;
    const columns = Object.keys(rows[0] ?? {}).filter((c) => insertable.some((i) => i.column_name === c));
    await tx.unsafe(
      `insert into public.${table} (${columns.map((c) => `"${c}"`).join(", ")})
       select ${columns.map((c) => `"${c}"`).join(", ")} from json_populate_recordset(null::public.${table}, $1::text::json)`,
      [JSON.stringify(rows)],
    );
  }

  type Dump = { account: { uid: string; session_id: string; name: string | null; currency: string; cash_account_type: string | null; identification_hash: string } };
  const state: { sessions: Record<string, { id: string; bank: { name: string; country: string }; valid_until: string; status: string }> } =
    JSON.parse(await Deno.readTextFile(bankStatePath));
  const dumps: Dump[] = [];
  for await (const entry of Deno.readDir(`${sp}/bank`)) {
    if (entry.name.endsWith(".json")) dumps.push(JSON.parse(await Deno.readTextFile(`${sp}/bank/${entry.name}`)));
  }
  const connectionIds = new Map<string, string>();
  for (const sessionId of new Set(dumps.map((d) => d.account.session_id))) {
    const session = Object.values(state.sessions).find((s) => s.id === sessionId);
    if (!session) throw new Error("dump account without a BankMCP session");
    const [row] = await tx<{ id: string }[]>`
      insert into public.bank_connections (user_id, session_id, aspsp_name, aspsp_country, valid_until, status)
      values (${userId}, ${sessionId}, ${session.bank.name}, ${session.bank.country}, ${session.valid_until}, ${session.status})
      returning id`;
    if (row) connectionIds.set(sessionId, row.id);
  }
  for (const { account } of dumps) {
    await tx`
      insert into public.bank_accounts (user_id, connection_id, uid, identification_hash, name, currency, cash_account_type, role)
      values (${userId}, ${connectionIds.get(account.session_id) ?? null}, ${account.uid}, ${account.identification_hash},
              ${account.name}, ${account.currency}, ${account.cash_account_type}, ${accountRole(account)})`;
  }
  counts.bank_connections = connectionIds.size;
  counts.bank_accounts = dumps.length;
});
await sql.end();

for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);

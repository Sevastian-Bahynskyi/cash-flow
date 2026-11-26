// Integration: syncUser against the LOCAL stack with a fake Enable Banking client fed by the fixture dumps.
// Needs `supabase start` + new migrations applied. Refuses any non-local URL.
// Run: deno test -A supabase/functions/_shared/sync/run_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { EbClient, EbTransaction, PsuHeaders } from "../enable-banking.ts";
import { DUMPS, type EbDump, loadDump, OWN_CARD_SUFFIXES, OWNER, PARTNER } from "../fixtures/world.ts";
import { classify } from "../classify/engine.ts";
import { loadContext } from "../classify/context.ts";
import { type Labeler, syncUser } from "./run.ts";

const localEnv = async (): Promise<{ url: string; serviceKey: string }> => {
  let url = Deno.env.get("SUPABASE_URL");
  let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    const out = await new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).output();
    const status = JSON.parse(new TextDecoder().decode(out.stdout)) as { API_URL: string; SERVICE_ROLE_KEY: string };
    url = status.API_URL;
    serviceKey = status.SERVICE_ROLE_KEY;
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("refusing: not a local Supabase URL");
  return { url, serviceKey };
};

const { url, serviceKey } = await localEnv();
const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

const must = <T>(what: string, res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data`);
  return res.data;
};

// ---------- fake Enable Banking -----------------------------------------------------------
type FakeBank = {
  dumps: Map<string, EbDump>; // uid -> dump (mutable per test)
  aspsp: string;
  calls: { path: string; dateFrom?: string; psu: PsuHeaders }[];
};
const rowDate = (r: EbTransaction): string => r.booking_date ?? r.transaction_date ?? r.value_date ?? "";
const fakeClient = (bank: FakeBank): EbClient => ({
  getSession: (sessionId) => {
    bank.calls.push({ path: `session ${sessionId}`, psu: null });
    return Promise.resolve({
      status: "AUTHORIZED",
      accounts: [...bank.dumps.keys()],
      aspsp: { name: bank.aspsp, country: "DK" },
      access: { valid_until: "2027-01-01T00:00:00Z" },
    });
  },
  getAccountDetails: (uid) => {
    bank.calls.push({ path: `details ${uid}`, psu: null });
    const d = bank.dumps.get(uid);
    if (!d) return Promise.reject(new Error("unknown uid"));
    return Promise.resolve(d.account);
  },
  getBalances: (uid, psu) => {
    bank.calls.push({ path: `balances ${uid}`, psu });
    return Promise.resolve(bank.dumps.get(uid)?.balances ?? []);
  },
  getTransactions: (uid, dateFrom, psu) => {
    bank.calls.push({ path: `transactions ${uid}`, dateFrom, psu });
    return Promise.resolve((bank.dumps.get(uid)?.raw ?? []).filter((r) => rowDate(r) >= dateFrom));
  },
});

const noLabels: Labeler = () => Promise.resolve(new Map());
const realLabels: Labeler = async (client, userId, txs) => classify(await loadContext(client, userId), txs);

// ---------- per-test user ------------------------------------------------------------------
type World = { userId: string; bank: FakeBank; eb: EbClient; cleanup: () => Promise<void> };

const world = async (files: (keyof typeof DUMPS)[], aspsp = "Revolut"): Promise<World> => {
  const email = `bank-test-${crypto.randomUUID()}@example.invalid`;
  const created = await db.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const userId = created.data.user.id;
  const dumps = new Map<string, EbDump>();
  for (const f of files) {
    const d = structuredClone(await loadDump(DUMPS[f]));
    // unique uids and hashes per test run so parallel runs never collide
    d.account.uid = `${d.account.uid}-${userId.slice(0, 8)}`;
    d.account.identification_hash = `${d.account.identification_hash}-${userId.slice(0, 8)}`;
    dumps.set(d.account.uid, d);
  }
  must("connection", await db.from("bank_connections").insert({
    user_id: userId, session_id: `sess-${userId}`, aspsp_name: aspsp, aspsp_country: "DK",
  }).select("id").single());
  const bank: FakeBank = { dumps, aspsp, calls: [] };
  return {
    userId,
    bank,
    eb: fakeClient(bank),
    cleanup: async () => {
      // Budgets first: their change-tracking trigger cannot write events while the user row is being deleted.
      const { error: budgetError } = await db.from("budgets").delete().eq("user_id", userId);
      if (budgetError) throw new Error(`budgets cleanup: ${budgetError.message}`);
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser: ${error.message}`);
    },
  };
};

const systemCategory = async (name: string): Promise<string> =>
  must("category", await db.from("categories").select("id").eq("is_system", true).eq("name", name).limit(1).single<{ id: string }>()).id;

const count = async (table: string, userId: string, filter: Record<string, string | null> = {}): Promise<number> => {
  let q = db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  for (const [k, v] of Object.entries(filter)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const { count: n, error } = await q;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
};

type TxRow = {
  id: string; kind: string; amount_minor: number; occurred_on: string; name: string; category_id: string; shared: boolean;
  shared_participant: string | null; is_shared_topup: boolean; is_salary: boolean; currency_code: string;
  original_amount_minor: number; converted_amount_minor: number; fx_rate: number; bank_transaction_id: string | null;
  source: string; status: string; movement: string | null; budget_effect_minor: number;
};
const TX_COLS = "id, kind, amount_minor, occurred_on, name, category_id, shared, shared_participant, is_shared_topup, is_salary, currency_code, original_amount_minor, converted_amount_minor, fx_rate, bank_transaction_id, source, status, movement, budget_effect_minor";
const txs = async (userId: string): Promise<TxRow[]> =>
  must("txs", await db.from("transactions").select(TX_COLS).eq("user_id", userId).order("occurred_on").returns<TxRow[]>());

const nonZeroRows = (bank: FakeBank): number => [...bank.dumps.values()].flatMap((d) => d.raw).filter((r) => Number(r.transaction_amount.amount) !== 0).length;
const allRows = (bank: FakeBank): number => [...bank.dumps.values()].flatMap((d) => d.raw).length;

// ---------- tests ---------------------------------------------------------------------------
const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "sync: first run stores every row, mirrors every non-zero row once; re-sync is idempotent", ...opts, fn: async () => {
  const w = await world(["revolutPersonal", "revolutEur", "joint"]);
  try {
    const run1 = await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals(run1.error, null);
    assertEquals(run1.ok, true);
    assertEquals(await count("bank_transactions", w.userId), allRows(w.bank));
    assertEquals(await count("transactions", w.userId), nonZeroRows(w.bank));
    const run2 = await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals(run2.ok, true);
    assertEquals(run2.inserted, 0);
    assertEquals(await count("bank_transactions", w.userId), allRows(w.bank));
    assertEquals(await count("transactions", w.userId), nonZeroRows(w.bank));
    // cron never sends PSU headers; window after first sync = last booked - 7 days
    assert(w.bank.calls.every((c) => c.psu === null));
    const second = w.bank.calls.filter((c) => c.path.startsWith("transactions")).slice(-3);
    assert(second.every((c) => c.dateFrom && c.dateFrom > "2024-01-01"), "second run uses last_booked_on - 7");
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "sync: user trigger sends PSU headers; first sync starts 2024-01-01", ...opts, fn: async () => {
  const w = await world(["revolutEur"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "user", { ip: "192.0.2.1", userAgent: "test" });
    const tx = w.bank.calls.find((c) => c.path.startsWith("transactions"));
    assertEquals(tx?.dateFrom, "2024-01-01");
    assertEquals(tx?.psu?.ip, "192.0.2.1");
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "sync: EUR rows mirror as DKK at 7.46 with original kept", ...opts, fn: async () => {
  const w = await world(["revolutEur"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    const rows = await txs(w.userId);
    assertEquals(rows.length, 1); // the 0.00 hold is not mirrored
    const r = rows[0];
    assert(r);
    assertEquals([r.kind, r.currency_code, r.original_amount_minor, r.amount_minor, r.converted_amount_minor, Number(r.fx_rate)], ["expense", "EUR", 1200, 8952, 8952, 7.46]);
    assertEquals(r.budget_effect_minor, -8952);
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "link + cutoff: manual history links, labels untouched, older unlinked bank rows stay ledger-only", ...opts, fn: async () => {
  const w = await world(["lunar"], "Lunar");
  try {
    const girlfriend = await systemCategory("Girlfriend");
    const other = await systemCategory("Other");
    // Manual entry for the 184.50 grocery row (bank purchase date 2026-11-02), owner labelled it Girlfriend + shared.
    const manual = must("manual", await db.from("transactions").insert({
      user_id: w.userId, kind: "expense", amount_minor: 18450, occurred_on: "2026-11-01", name: "flowers", category_id: girlfriend,
      shared: false, currency_code: "DKK", original_amount_minor: 18450, converted_amount_minor: 18450, fx_rate: 1,
    }).select(TX_COLS).single<TxRow>());
    // Last manual row sets the history cutoff to 2026-11-06.
    must("manual2", await db.from("transactions").insert({
      user_id: w.userId, kind: "expense", amount_minor: 99, occurred_on: "2026-11-06", name: "cutoff", category_id: other,
      currency_code: "DKK", original_amount_minor: 99, converted_amount_minor: 99, fx_rate: 1,
    }).select("id").single());

    const run = await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals(run.ok, true, run.error ?? "");
    const after = (await txs(w.userId)).find((t) => t.id === manual.id);
    assert(after);
    assert(after.bank_transaction_id, "manual row linked");
    const { bank_transaction_id: _link, ...labelsAfter } = after;
    const { bank_transaction_id: _none, ...labelsBefore } = manual;
    assertEquals(labelsAfter, labelsBefore, "link changes nothing but bank_transaction_id");
    assertEquals(await count("transactions", w.userId, { source: "manual" }), 2, "no manual row deleted");

    const rows = await txs(w.userId);
    const mirrored = rows.filter((t) => t.source === "bank");
    assert(mirrored.every((t) => t.occurred_on > "2026-11-06"), "no bank mirror on or before the cutoff");
    assertEquals(new Set(rows.map((t) => t.bank_transaction_id).filter(Boolean)).size, rows.filter((t) => t.bank_transaction_id).length);
    // second run: still no doubles
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals((await txs(w.userId)).length, rows.length);
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "pending -> booked under a new entry_reference: mirror re-points, no double", ...opts, fn: async () => {
  const w = await world(["revolutPersonal"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    const dump = [...w.bank.dumps.values()][0];
    assert(dump);
    const pending = dump.raw.find((r) => r.status === "PDNG");
    assert(pending);
    const pendingRow = must("pending", await db.from("bank_transactions").select("id").eq("user_id", w.userId).eq("ext_id", pending.entry_reference ?? "").single<{ id: string }>());
    const before = (await txs(w.userId)).find((t) => t.bank_transaction_id === pendingRow.id);
    assertEquals(before?.status, "pending");

    dump.raw = dump.raw.filter((r) => r !== pending);
    dump.raw.push({ ...pending, entry_reference: "20000000-0000-4000-8000-00000000b00c", status: "BOOK", booking_date: "2026-11-21", value_date: "2026-11-21" });
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);

    const old = must("old", await db.from("bank_transactions").select("status, replaced_by").eq("id", pendingRow.id).single<{ status: string; replaced_by: string | null }>());
    assertEquals(old.status, "REPLACED");
    assert(old.replaced_by);
    const after = (await txs(w.userId)).filter((t) => t.id === before?.id);
    assertEquals(after[0]?.bank_transaction_id, old.replaced_by);
    assertEquals(after[0]?.status, "booked");
    assertEquals((await txs(w.userId)).length, nonZeroRows(w.bank), "no extra mirror for the booked row");
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "PDNG unseen for 10 days -> EXPIRED, mirror void with zero budget effect", ...opts, fn: async () => {
  const w = await world(["revolutPersonal"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    const dump = [...w.bank.dumps.values()][0];
    assert(dump);
    const pending = dump.raw.find((r) => r.status === "PDNG");
    assert(pending);
    dump.raw = dump.raw.filter((r) => r !== pending);
    const old = new Date(Date.now() - 11 * 86_400_000).toISOString();
    must("age", await db.from("bank_transactions").update({ last_seen_at: old }).eq("user_id", w.userId).eq("ext_id", pending.entry_reference ?? "").select("id"));
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    const row = must("expired", await db.from("bank_transactions").select("id, status").eq("user_id", w.userId).eq("ext_id", pending.entry_reference ?? "").single<{ id: string; status: string }>());
    assertEquals(row.status, "EXPIRED");
    const mirror = (await txs(w.userId)).find((t) => t.bank_transaction_id === row.id);
    assertEquals([mirror?.status, mirror?.budget_effect_minor], ["void", 0]);
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "PDNG seen 9 days ago is NOT expired while the bank still lists it", ...opts, fn: async () => {
  const w = await world(["revolutPersonal"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    await db.from("bank_transactions").update({ last_seen_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }).eq("user_id", w.userId).eq("status", "PDNG");
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals(await count("bank_transactions", w.userId, { status: "EXPIRED" }), 0);
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "re-consent: new uid for the same account maps by identification_hash (no new account, no doubles)", ...opts, fn: async () => {
  const w = await world(["revolutEur"]);
  try {
    await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    const [oldUid, dump] = [...w.bank.dumps.entries()][0] ?? [];
    assert(oldUid && dump);
    w.bank.dumps.delete(oldUid);
    dump.account.uid = `${oldUid}-renewed`;
    w.bank.dumps.set(dump.account.uid, dump);
    const run = await syncUser(db, w.eb, noLabels, w.userId, "cron", null);
    assertEquals(run.error, null);
    assertEquals(await count("bank_accounts", w.userId), 1);
    const acct = must("acct", await db.from("bank_accounts").select("uid").eq("user_id", w.userId).single<{ uid: string }>());
    assertEquals(acct.uid, dump.account.uid);
    assertEquals(await count("transactions", w.userId), nonZeroRows(w.bank));
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "service role stays inside the user: another user's rows untouched", ...opts, fn: async () => {
  const a = await world(["revolutEur"]);
  const b = await world(["revolutEur"]);
  try {
    await syncUser(db, b.eb, noLabels, b.userId, "cron", null);
    const before = [await count("bank_transactions", b.userId), await count("transactions", b.userId), await count("sync_runs", b.userId)];
    await syncUser(db, a.eb, noLabels, a.userId, "cron", null);
    assertEquals([await count("bank_transactions", b.userId), await count("transactions", b.userId), await count("sync_runs", b.userId)], before);
  } finally {
    await a.cleanup();
    await b.cleanup();
  }
}});

Deno.test({ name: "classifier context includes system categories (prod: 30 of 37 are system)", ...opts, fn: async () => {
  const w = await world([]);
  try {
    const ctx = await loadContext(db, w.userId);
    assert(ctx.categories.some((c) => c.name === "Salary"), "system category Salary visible to the classifier");
    assert(ctx.categories.some((c) => c.name === "Transfer"), "system category Transfer visible to the classifier");
  } finally {
    await w.cleanup();
  }
}});

Deno.test({ name: "full sync with the real classifier: joint top-ups insert; salaries fill each new cycle's budgets in date order", ...opts, fn: async () => {
  const w = await world(["lunar", "revolutPersonal", "joint"]);
  try {
    // People and cards the classifier reads (fake).
    for (const [name, kind] of [[OWNER.name, "self"], [PARTNER.name, "partner"]] as const) {
      must("person", await db.from("transfer_people").insert({ user_id: w.userId, name, normalized_name: name.toLowerCase(), kind }).select("id"));
    }
    must("profile", await db.from("profiles").upsert({ user_id: w.userId, own_card_suffixes: OWN_CARD_SUFFIXES }).select("user_id"));
    // Last manual cycle: a salary on 2026-09-30 with two budgets.
    const salaryCat = await systemCategory("Salary");
    const food = await systemCategory("Food");
    const bills = await systemCategory("Bills");
    const sep = must("sep salary", await db.from("transactions").insert({
      user_id: w.userId, kind: "income", amount_minor: 2500000, occurred_on: "2026-09-30", name: "salary", category_id: salaryCat,
      is_salary: true, currency_code: "DKK", original_amount_minor: 2500000, converted_amount_minor: 2500000, fx_rate: 1,
    }).select("id").single<{ id: string }>());
    must("budgets", await db.from("budgets").insert([
      { user_id: w.userId, category_id: food, salary_cycle_id: sep.id, amount_minor: 300000 },
      { user_id: w.userId, category_id: bills, salary_cycle_id: sep.id, amount_minor: 150000 },
    ]).select("id"));

    const run = await syncUser(db, w.eb, realLabels, w.userId, "cron", null);
    assertEquals(run.error, null);
    const rows = await txs(w.userId);
    const salaries = rows.filter((t) => t.is_salary && t.source === "bank");
    assertEquals(salaries.map((s) => s.occurred_on), ["2026-10-30", "2026-11-25"]);
    for (const s of salaries) {
      assertEquals(await count("budgets", w.userId, { salary_cycle_id: s.id }), 2, `budgets copied into cycle ${s.occurred_on}`);
      assertEquals(s.category_id, salaryCat, "salary mirrored under Income > Salary");
    }
    const topups = rows.filter((t) => t.is_shared_topup);
    assert(topups.length >= 3, "joint top-ups mirrored");
    assert(topups.every((t) => t.kind === "expense" && !t.shared && t.budget_effect_minor === 0));
    // Own moves never touch budgets.
    assert(rows.filter((t) => t.movement === "moved" || t.movement === "topup").every((t) => t.budget_effect_minor === 0));
  } finally {
    await w.cleanup();
  }
}});

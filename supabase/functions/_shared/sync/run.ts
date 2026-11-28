// One sync run for one user: Enable Banking -> bank ledger -> transactions.
// The service-role client is passed in; every query here is filtered by user_id.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { EbAccountDetails, EbClient, PsuHeaders } from "../enable-banking.ts";
import { personKeys, personMatcher, type PersonKind } from "../classify/engine.ts";
import { linkHistory } from "../link-history.ts";
import {
  accountRole,
  addDays,
  DAY_MS,
  effectiveDate,
  type LedgerStatus,
  matchPendingToBooked,
  pickBalance,
  copenhagenToday,
  type DatedRow,
  toLedgerRows,
  toMinor,
} from "./ledger.ts";

const FIRST_SYNC_FROM = "2024-01-01";
const PENDING_EXPIRY_DAYS = 10;
const PAGE = 1000;
const CHUNK = 200;

// Same shape as the classifier's BankTx (supabase/functions/_shared/classify).
export type BankTx = {
  id: string;
  account_role: "personal" | "joint" | "savings";
  bank: string;
  amount_minor: number;
  currency: string;
  booking_date: string;
  creditor_name: string | null;
  debtor_name: string | null;
  remittance: string | null;
  mcc: string | null;
  bank_code: string | null;
};

// The subset of the classifier's Label that is written to transactions.
export type MirrorLabel = {
  category_id: string | null;
  movement: "spend" | "income" | "moved" | "topup" | "person" | "refund" | "ignore";
  shared: boolean;
  paid_by: "me" | "partner" | null;
  is_salary: boolean;
  is_shared_topup: boolean;
  shared_participant: "me" | "gf" | null;
  counterparty_person_id: string | null;
  merchant_key: string;
  name: string;
  reason: string;
  reason_source: string;
  confidence: number;
  needs_review: boolean;
};

export type Labeler = (db: SupabaseClient, userId: string, txs: BankTx[]) => Promise<Map<string, MirrorLabel>>;

export type SyncRun = {
  id: string;
  trigger: "cron" | "user";
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  error: string | null;
  accounts: number;
  fetched: number;
  inserted: number;
};

type ConnectionRow = { id: string; session_id: string; aspsp_name: string };

type AccountRow = {
  id: string;
  connection_id: string;
  uid: string;
  identification_hash: string;
  currency: string;
  role: "personal" | "joint" | "savings";
  last_synced_at: string | null;
  last_booked_on: string | null;
};

type BankRow = {
  id: string;
  account_id: string;
  status: LedgerStatus;
  booking_date: string | null;
  value_date: string | null;
  transaction_date: string | null;
  amount_minor: number;
  currency: string;
  creditor_name: string | null;
  debtor_name: string | null;
  remittance: string | null;
  mcc: string | null;
  bank_code: string | null;
};

const BANK_ROW_COLUMNS =
  "id, account_id, status, booking_date, value_date, transaction_date, amount_minor, currency, creditor_name, debtor_name, remittance, mcc, bank_code";

// shortcut: fixed EUR->DKK rate (DKK is pegged within ±2.25%); switch to the bank's exchange_rate or a daily rate if a non-EUR currency appears.
const DKK_PER = { DKK: 1, EUR: 7.46 } as const;

const MIRROR_STATUS: Record<"BOOK" | "PDNG", "booked" | "pending"> = { BOOK: "booked", PDNG: "pending" };

type AmountRow = DatedRow & { amount_minor: number; currency: string };

// The bank's latest amount and date for a mirrored row; null for a currency without a rate.
const mirrorAmounts = (row: AmountRow) => {
  const rate = DKK_PER[row.currency as keyof typeof DKK_PER];
  if (rate === undefined) return null;
  const date = effectiveDate(row);
  const original = Math.abs(row.amount_minor);
  const converted = Math.round(original * rate);
  return { amount_minor: converted, original_amount_minor: original, converted_amount_minor: converted, ...(date ? { occurred_on: date } : {}) };
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

const fail = (what: string, error: { message: string } | null): void => {
  if (error) throw new Error(`${what}: ${error.message}`);
};

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// PostgREST caps a response at 1000 rows: page through.
const selectAll = async <T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0;; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    fail(what, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
};

const setMirrorStatus = async (
  db: SupabaseClient,
  userId: string,
  bankIds: string[],
  status: "booked" | "pending" | "void",
): Promise<void> => {
  for (const ids of chunks(bankIds, CHUNK)) {
    const { error } = await db.from("transactions").update({ status }).eq("user_id", userId).in("bank_transaction_id", ids);
    fail("transactions status", error);
  }
};

// Tips and FX settle after the hold: a bank-made row takes the booked amount. Hand-entered rows keep theirs.
const setMirrorAmounts = async (db: SupabaseClient, userId: string, bankId: string, row: AmountRow): Promise<void> => {
  const values = mirrorAmounts(row);
  if (!values) return;
  const { error } = await db.from("transactions").update(values).eq("user_id", userId).eq("source", "bank").eq("bank_transaction_id", bankId);
  fail("transactions amount", error);
};

// Accounts are keyed by identification_hash: a re-consent updates uid/connection, never duplicates.
export const upsertBankAccount = async (
  db: SupabaseClient,
  userId: string,
  connectionId: string,
  account: EbAccountDetails & { uid: string },
): Promise<AccountRow> => {
  const { data, error } = await db
    .from("bank_accounts")
    .upsert(
      {
        user_id: userId,
        connection_id: connectionId,
        uid: account.uid,
        identification_hash: account.identification_hash,
        name: account.name ?? null,
        currency: account.currency,
        cash_account_type: account.cash_account_type ?? null,
        role: accountRole(account),
      },
      { onConflict: "user_id,identification_hash" },
    )
    .select("id, connection_id, uid, identification_hash, currency, role, last_synced_at, last_booked_on")
    .single()
    .overrideTypes<AccountRow, { merge: false }>();
  fail("bank_accounts upsert", error);
  if (!data) throw new Error("bank_accounts upsert returned no row");
  return data;
};

// Maps the session's account uids to bank_accounts rows by identification_hash (uids change on re-consent).
const refreshConnection = async (
  db: SupabaseClient,
  eb: EbClient,
  userId: string,
  connection: ConnectionRow,
  accounts: AccountRow[],
): Promise<AccountRow[]> => {
  const session = await eb.getSession(connection.session_id);
  const { error } = await db
    .from("bank_connections")
    .update({ valid_until: session.access.valid_until, status: session.status })
    .eq("id", connection.id)
    .eq("user_id", userId);
  fail("bank_connections update", error);

  const result: AccountRow[] = [];
  for (const uid of session.accounts) {
    const known = accounts.find((a) => a.uid === uid);
    if (known) {
      result.push(known);
      continue;
    }
    // New uid: same account after re-consent (matched by hash, keeps its id and history) or a new account.
    const data = await upsertBankAccount(db, userId, connection.id, { uid, ...(await eb.getAccountDetails(uid)) });
    result.push(data);
  }
  return result;
};

type AccountOutcome = { fetched: number; inserted: number };

const syncAccount = async (
  db: SupabaseClient,
  eb: EbClient,
  userId: string,
  account: AccountRow,
  psu: PsuHeaders,
  today: string,
): Promise<AccountOutcome> => {
  const dateFrom = account.last_booked_on ? addDays(account.last_booked_on, -7) : FIRST_SYNC_FROM;
  const raw = await eb.getTransactions(account.uid, dateFrom, psu);
  const balances = await eb.getBalances(account.uid, psu);
  const nowIso = new Date().toISOString();

  const byExtId = new Map((await toLedgerRows(raw)).map((row) => [row.ext_id, row]));
  const fetched = [...byExtId.values()];

  const existing = new Map<string, { id: string; status: LedgerStatus }>();
  for (const extIds of chunks([...byExtId.keys()], CHUNK)) {
    const { data, error } = await db
      .from("bank_transactions")
      .select("id, ext_id, status")
      .eq("user_id", userId)
      .eq("account_id", account.id)
      .in("ext_id", extIds)
      .overrideTypes<{ id: string; ext_id: string; status: LedgerStatus }[], { merge: false }>();
    fail("bank_transactions select", error);
    for (const row of data ?? []) existing.set(row.ext_id, { id: row.id, status: row.status });
  }

  const insertedBooked: string[] = [];
  const statusChanges: { id: string; ext_id: string; status: "BOOK" | "PDNG" }[] = [];
  let inserted = 0;
  for (const rows of chunks(fetched, CHUNK)) {
    const payload = rows.map((row) => ({
      user_id: userId,
      account_id: account.id,
      ...row,
      // A replaced pending row stays replaced even if the bank still lists it.
      status: existing.get(row.ext_id)?.status === "REPLACED" ? "REPLACED" : row.status,
      last_seen_at: nowIso,
    }));
    const { data, error } = await db
      .from("bank_transactions")
      .upsert(payload, { onConflict: "account_id,ext_id" })
      .select("id, ext_id, status")
      .overrideTypes<{ id: string; ext_id: string; status: LedgerStatus }[], { merge: false }>();
    fail("bank_transactions upsert", error);
    for (const row of data ?? []) {
      const before = existing.get(row.ext_id);
      if (!before) {
        inserted += 1;
        if (row.status === "BOOK") insertedBooked.push(row.id);
      } else if (before.status !== row.status && (row.status === "BOOK" || row.status === "PDNG")) {
        statusChanges.push({ id: row.id, ext_id: row.ext_id, status: row.status });
      }
    }
  }

  // Same ext_id changed state (e.g. Revolut PDNG -> BOOK, or an expired row came back).
  for (const status of ["BOOK", "PDNG"] as const) {
    await setMirrorStatus(db, userId, statusChanges.filter((c) => c.status === status).map((c) => c.id), MIRROR_STATUS[status]);
  }
  for (const change of statusChanges) {
    const row = byExtId.get(change.ext_id);
    if (change.status === "BOOK" && row) await setMirrorAmounts(db, userId, change.id, row);
  }

  // Pending -> booked under a new ext_id: the mirrored row moves to the booked bank row.
  if (insertedBooked.length > 0) {
    const pending = await selectAll<BankRow>("pending select", (from, to) =>
      db.from("bank_transactions").select(BANK_ROW_COLUMNS).eq("user_id", userId).eq("account_id", account.id)
        .eq("status", "PDNG").order("id").range(from, to).overrideTypes<BankRow[], { merge: false }>());
    const booked: BankRow[] = [];
    for (const ids of chunks(insertedBooked, CHUNK)) {
      const { data, error } = await db.from("bank_transactions").select(BANK_ROW_COLUMNS).eq("user_id", userId).in("id", ids)
        .overrideTypes<BankRow[], { merge: false }>();
      fail("booked select", error);
      booked.push(...(data ?? []));
    }
    const bookedById = new Map(booked.map((row) => [row.id, row]));
    for (const match of matchPendingToBooked(pending, booked)) {
      const { error } = await db
        .from("bank_transactions")
        .update({ status: "REPLACED", replaced_by: match.bookedId })
        .eq("user_id", userId)
        .eq("id", match.pendingId);
      fail("pending replace", error);
      const { error: repointError } = await db
        .from("transactions")
        .update({ bank_transaction_id: match.bookedId, status: "booked" })
        .eq("user_id", userId)
        .eq("bank_transaction_id", match.pendingId);
      fail("transactions repoint", repointError);
      const bookedRow = bookedById.get(match.bookedId);
      if (bookedRow) await setMirrorAmounts(db, userId, match.bookedId, bookedRow);
    }
  }

  // Pending rows the bank stopped listing for 10 days never happened.
  const { data: expired, error: expireError } = await db
    .from("bank_transactions")
    .update({ status: "EXPIRED" })
    .eq("user_id", userId)
    .eq("account_id", account.id)
    .eq("status", "PDNG")
    .lt("last_seen_at", new Date(Date.parse(nowIso) - PENDING_EXPIRY_DAYS * DAY_MS).toISOString())
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  fail("pending expiry", expireError);
  await setMirrorStatus(db, userId, (expired ?? []).map((row) => row.id), "void");

  const bookedDates = fetched.filter((row) => row.status === "BOOK" && row.booking_date && row.booking_date <= today)
    .map((row) => row.booking_date as string);
  const lastBookedOn = [account.last_booked_on, ...bookedDates].filter((d): d is string => d !== null).sort().at(-1) ?? null;
  const balance = pickBalance(balances);
  const { error } = await db
    .from("bank_accounts")
    .update({
      balance_minor: balance ? toMinor(balance.balance_amount.amount) : null,
      balance_at: nowIso,
      last_synced_at: nowIso,
      last_booked_on: lastBookedOn,
      last_error: null,
    })
    .eq("user_id", userId)
    .eq("id", account.id);
  fail("bank_accounts update", error);

  return { fetched: fetched.length, inserted };
};

type ManualRow = {
  id: string;
  kind: "expense" | "income";
  amount_minor: number;
  original_amount_minor: number;
  currency_code: string;
  occurred_on: string;
};

const loadLiveBankRows = (db: SupabaseClient, userId: string): Promise<BankRow[]> =>
  selectAll<BankRow>("bank rows select", (from, to) =>
    db.from("bank_transactions").select(BANK_ROW_COLUMNS).eq("user_id", userId).in("status", ["BOOK", "PDNG"])
      .order("id").range(from, to).overrideTypes<BankRow[], { merge: false }>());

const loadLinkedBankIds = async (db: SupabaseClient, userId: string): Promise<Set<string>> => {
  const rows = await selectAll<{ bank_transaction_id: string }>("linked select", (from, to) =>
    db.from("transactions").select("bank_transaction_id").eq("user_id", userId).not("bank_transaction_id", "is", null)
      .order("id").range(from, to).overrideTypes<{ bank_transaction_id: string }[], { merge: false }>());
  return new Set(rows.map((row) => row.bank_transaction_id));
};

// Pairs hand-entered rows with bank rows. Only writes bank_transaction_id; labels stay the owner's.
const linkManualHistory = async (db: SupabaseClient, userId: string): Promise<number> => {
  const manual = await selectAll<ManualRow>("manual select", (from, to) =>
    db.from("transactions").select("id, kind, amount_minor, original_amount_minor, currency_code, occurred_on")
      .eq("user_id", userId).eq("source", "manual").is("bank_transaction_id", null)
      .order("id").range(from, to).overrideTypes<ManualRow[], { merge: false }>());
  const linked = await loadLinkedBankIds(db, userId);
  const bank = (await loadLiveBankRows(db, userId))
    .filter((row) => !linked.has(row.id))
    .flatMap((row) => {
      const date = effectiveDate(row);
      return date ? [{ id: row.id, amount_minor: row.amount_minor, currency: row.currency, date }] : [];
    });

  const links = linkHistory(manual, bank);
  for (const batch of chunks(links, 20)) {
    await Promise.all(batch.map(async (link) => {
      const { error } = await db
        .from("transactions")
        .update({ bank_transaction_id: link.bank_transaction_id })
        .eq("user_id", userId)
        .eq("id", link.transaction_id)
        .is("bank_transaction_id", null);
      fail("link write", error);
    }));
  }
  return links.length;
};

const loadCategoryFallbacks = async (db: SupabaseClient): Promise<{ other: string; transfers: string }> => {
  const { data, error } = await db
    .from("categories")
    .select("id, name")
    .eq("is_system", true)
    .eq("level", 1)
    .in("name", ["Other", "Transfers"])
    .overrideTypes<{ id: string; name: string }[], { merge: false }>();
  fail("categories select", error);
  const other = data?.find((c) => c.name === "Other")?.id;
  const transfers = data?.find((c) => c.name === "Transfers")?.id;
  if (!other || !transfers) throw new Error("system categories Other/Transfers missing");
  return { other, transfers };
};

// Mirrors new bank rows into transactions, in date order (salary rows fire copy_previous_cycle_budgets).
// Rows dated on or before the last manual entry stay ledger-only unless linked: the manual row is their mirror.
const mirrorNewRows = async (
  db: SupabaseClient,
  userId: string,
  labeler: Labeler,
  accounts: Map<string, AccountRow & { bank: string }>,
): Promise<number> => {
  const { data: lastManual, error } = await db
    .from("transactions")
    .select("occurred_on")
    .eq("user_id", userId)
    .eq("source", "manual")
    .order("occurred_on", { ascending: false })
    .limit(1)
    .overrideTypes<{ occurred_on: string }[], { merge: false }>();
  fail("cutoff select", error);
  const cutoff = lastManual?.[0]?.occurred_on ?? null;

  const linked = await loadLinkedBankIds(db, userId);
  const rows = (await loadLiveBankRows(db, userId))
    .flatMap((row) => {
      const date = effectiveDate(row);
      const account = accounts.get(row.account_id);
      if (!date || !account || linked.has(row.id) || row.amount_minor === 0) return [];
      if (cutoff !== null && date <= cutoff) return [];
      // No rate for it: log it and leave it in the ledger, so the other rows still mirror.
      if (!(row.currency in DKK_PER)) {
        console.warn("[sync] row not mirrored: unsupported currency", { id: row.id, currency: row.currency });
        return [];
      }
      return [{ row, date, account }];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.row.id.localeCompare(b.row.id));
  if (rows.length === 0) return 0;

  const labels = await labeler(
    db,
    userId,
    rows.map(({ row, date, account }) => ({
      id: row.id,
      account_role: account.role,
      bank: account.bank,
      amount_minor: row.amount_minor,
      currency: row.currency,
      booking_date: date,
      creditor_name: row.creditor_name,
      debtor_name: row.debtor_name,
      remittance: row.remittance,
      mcc: row.mcc,
      bank_code: row.bank_code,
    })),
  );
  const fallback = await loadCategoryFallbacks(db);

  const inserts = rows.map(({ row, date }) => {
    const label = labels.get(row.id);
    const rate = DKK_PER[row.currency as keyof typeof DKK_PER];
    const original = Math.abs(row.amount_minor);
    const converted = Math.round(original * rate);
    // Old schema: a shared top-up is an 'expense' (personal money into the pot) and never 'shared'.
    const isTopup = label?.is_shared_topup === true;
    const kind = isTopup || row.amount_minor < 0 ? "expense" : "income";
    const movement = label?.movement ?? (row.amount_minor < 0 ? "spend" : "income");
    return {
      user_id: userId,
      source: "bank",
      status: row.status === "BOOK" ? "booked" : "pending",
      bank_transaction_id: row.id,
      kind,
      amount_minor: converted,
      occurred_on: date,
      name: label?.name || row.remittance || row.creditor_name || row.debtor_name || "Bank transaction",
      category_id: label?.category_id ??
        (["moved", "topup", "person"].includes(movement) ? fallback.transfers : fallback.other),
      shared: (label?.shared ?? false) && !isTopup,
      is_salary: (label?.is_salary ?? false) && kind === "income",
      is_shared_topup: isTopup,
      shared_participant: isTopup ? label?.shared_participant ?? null : null,
      currency_code: row.currency,
      original_amount_minor: original,
      converted_amount_minor: converted,
      fx_rate: rate,
      merchant_key: label?.merchant_key ?? null,
      movement,
      paid_by: label?.paid_by ?? null,
      reason: label?.reason ?? null,
      reason_source: label?.reason_source ?? null,
      confidence: label?.confidence ?? null,
      needs_review: label?.needs_review ?? true,
      counterparty_person_id: label?.counterparty_person_id ?? null,
    };
  });

  for (const batch of chunks(inserts, CHUNK)) {
    const { error: insertError } = await db.from("transactions").insert(batch);
    fail("transactions insert", insertError);
  }
  return inserts.length;
};

type PersonRow = { id: string; name: string; normalized_name: string; kind: PersonKind; alias_of: string | null };
type UnlinkedRow = { id: string; merchant_key: string };

// People added after their transfers were mirrored: link those rows (same matching as the classifier),
// and a plain spend in MobilePay/Transfer becomes money moved to that person, out of the Inbox. Linked rows are skipped next time.
const linkPeople = async (db: SupabaseClient, userId: string): Promise<number> => {
  const { data: people, error } = await db.from("transfer_people").select("id, name, normalized_name, kind, alias_of").eq("user_id", userId)
    .overrideTypes<PersonRow[], { merge: false }>();
  fail("people select", error);
  const match = personMatcher(people ?? []);
  const keys = [...new Set((people ?? []).flatMap(personKeys))];
  if (keys.length === 0) return 0;

  const rows: UnlinkedRow[] = [];
  for (const batch of chunks(keys, CHUNK)) {
    rows.push(...await selectAll<UnlinkedRow>("unlinked select", (from, to) =>
      db.from("transactions").select("id, merchant_key").eq("user_id", userId).is("counterparty_person_id", null)
        .in("merchant_key", batch).order("id").range(from, to).overrideTypes<UnlinkedRow[], { merge: false }>()));
  }
  const byPerson = new Map<string, string[]>();
  for (const row of rows) {
    const person = match(row.merchant_key);
    // Own accounts and ignored names are not people money moves to.
    if (!person || person.kind === "self" || person.kind === "ignore") continue;
    byPerson.set(person.id, [...(byPerson.get(person.id) ?? []), row.id]);
  }
  if (byPerson.size === 0) return 0;

  const { data: cats, error: catsError } = await db.from("categories").select("id").eq("is_system", true).in("name", ["MobilePay", "Transfer"])
    .overrideTypes<{ id: string }[], { merge: false }>();
  fail("categories select", catsError);
  const transferCats = (cats ?? []).map((c) => c.id);
  let linked = 0;
  for (const [personId, ids] of byPerson) {
    for (const batch of chunks(ids, CHUNK)) {
      const { error: linkError } = await db.from("transactions").update({ counterparty_person_id: personId })
        .eq("user_id", userId).is("counterparty_person_id", null).in("id", batch);
      fail("people link", linkError);
      linked += batch.length;
      if (transferCats.length === 0) continue;
      const { error: moveError } = await db.from("transactions").update({ movement: "person", needs_review: false })
        .eq("user_id", userId).eq("movement", "spend").in("category_id", transferCats).in("id", batch);
      fail("people movement", moveError);
    }
  }
  return linked;
};

const RUN_COLUMNS = "id, trigger, started_at, finished_at, ok, error, accounts, fetched, inserted";
const ABANDONED_AFTER_MS = 10 * 60 * 1000;

const latestOtherRun = async (db: SupabaseClient, userId: string, notId: string | null): Promise<SyncRun | null> => {
  let query = db.from("sync_runs").select(RUN_COLUMNS).eq("user_id", userId);
  if (notId) query = query.neq("id", notId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1)
    .overrideTypes<SyncRun[], { merge: false }>();
  fail("sync_runs select", error);
  return data?.[0] ?? null;
};

// Claims the user's run slot atomically: a partial unique index allows one unfinished run per user,
// so parallel callers hit the bank once. With throttleMs, a run started within that window wins too.
const claimRun = async (
  db: SupabaseClient,
  userId: string,
  trigger: "cron" | "user",
  throttleMs: number,
): Promise<{ claimed: string } | { busy: SyncRun }> => {
  // A run whose function was killed mid-way must not block the user forever.
  const { error: abandonError } = await db
    .from("sync_runs")
    .update({ finished_at: new Date().toISOString(), ok: false, error: "abandoned" })
    .eq("user_id", userId)
    .is("finished_at", null)
    .lt("started_at", new Date(Date.now() - ABANDONED_AFTER_MS).toISOString());
  fail("sync_runs abandon", abandonError);

  const { data: run, error } = await db
    .from("sync_runs")
    .insert({ user_id: userId, trigger })
    .select("id, started_at")
    .single()
    .overrideTypes<{ id: string; started_at: string }, { merge: false }>();
  if (error?.code === "23505") {
    const running = await latestOtherRun(db, userId, null);
    if (!running) throw new Error("sync_runs: slot taken but no run found");
    return { busy: running };
  }
  fail("sync_runs insert", error);
  if (!run) throw new Error("sync_runs insert returned no row");

  if (throttleMs > 0) {
    const previous = await latestOtherRun(db, userId, run.id);
    if (previous && Date.parse(run.started_at) - Date.parse(previous.started_at) < throttleMs) {
      // Our claim row is only a lock: drop it and report the recent run instead.
      const { error: dropError } = await db.from("sync_runs").delete().eq("user_id", userId).eq("id", run.id);
      fail("sync_runs drop claim", dropError);
      return { busy: previous };
    }
  }
  return { claimed: run.id };
};

export const syncUser = async (
  db: SupabaseClient,
  eb: EbClient,
  labeler: Labeler,
  userId: string,
  trigger: "cron" | "user",
  psu: PsuHeaders,
  throttleMs = 0,
): Promise<SyncRun & { throttled: boolean }> => {
  const today = copenhagenToday();
  const claim = await claimRun(db, userId, trigger, throttleMs);
  if ("busy" in claim) return { ...claim.busy, throttled: true };
  const run = { id: claim.claimed };

  let accountCount = 0;
  let fetched = 0;
  let inserted = 0;
  const errors: string[] = [];
  try {
    const { data: connections, error: connectionsError } = await db
      .from("bank_connections")
      .select("id, session_id, aspsp_name")
      .eq("user_id", userId)
      .overrideTypes<ConnectionRow[], { merge: false }>();
    fail("bank_connections select", connectionsError);
    const { data: storedAccounts, error: accountsError } = await db
      .from("bank_accounts")
      .select("id, connection_id, uid, identification_hash, currency, role, last_synced_at, last_booked_on")
      .eq("user_id", userId)
      .overrideTypes<AccountRow[], { merge: false }>();
    fail("bank_accounts select", accountsError);

    const accounts = new Map<string, AccountRow & { bank: string }>();
    for (const account of storedAccounts ?? []) {
      const connection = connections?.find((c) => c.id === account.connection_id);
      accounts.set(account.id, { ...account, bank: (connection?.aspsp_name ?? "").toLowerCase() });
    }

    let anyFirstSync = false;
    for (const connection of connections ?? []) {
      let live: AccountRow[];
      try {
        live = await refreshConnection(db, eb, userId, connection, storedAccounts ?? []);
      } catch (error) {
        const message = errorMessage(error);
        errors.push(message);
        const { error: markError } = await db.from("bank_accounts").update({ last_error: message })
          .eq("user_id", userId).eq("connection_id", connection.id);
        fail("bank_accounts error write", markError);
        continue;
      }
      for (const account of live) {
        accounts.set(account.id, { ...account, bank: connection.aspsp_name.toLowerCase() });
        accountCount += 1;
        try {
          const outcome = await syncAccount(db, eb, userId, account, psu, today);
          fetched += outcome.fetched;
          inserted += outcome.inserted;
          if (account.last_synced_at === null) anyFirstSync = true;
        } catch (error) {
          const message = errorMessage(error);
          errors.push(message);
          const { error: markError } = await db.from("bank_accounts").update({ last_error: message })
            .eq("user_id", userId).eq("id", account.id);
          fail("bank_accounts error write", markError);
        }
      }
    }

    if (anyFirstSync) await linkManualHistory(db, userId);
    await mirrorNewRows(db, userId, labeler, accounts);
    await linkPeople(db, userId);
  } catch (error) {
    errors.push(errorMessage(error));
  }

  const { data: finished, error: finishError } = await db
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: errors.length === 0,
      error: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
      accounts: accountCount,
      fetched,
      inserted,
    })
    .eq("id", run.id)
    .select(RUN_COLUMNS)
    .single()
    .overrideTypes<SyncRun, { merge: false }>();
  fail("sync_runs update", finishError);
  if (!finished) throw new Error("sync_runs update returned no row");
  return { ...finished, throttled: false };
};

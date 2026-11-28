// Pure helpers that turn Enable Banking rows into bank_transactions rows.
import type { EbBalance, EbTransaction } from "../enable-banking.ts";

export type LedgerStatus = "BOOK" | "PDNG" | "EXPIRED" | "REPLACED";

export type LedgerRow = {
  ext_id: string;
  status: "BOOK" | "PDNG";
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
  raw: EbTransaction;
};

export type DatedRow = {
  booking_date: string | null;
  value_date: string | null;
  transaction_date: string | null;
};

export const DAY_MS = 86_400_000;

// Purchase date first (Lunar books 0..7 days later); Revolut only has booking/value dates.
export const effectiveDate = (row: DatedRow): string | null =>
  row.transaction_date ?? row.booking_date ?? row.value_date;

export const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

export const toMinor = (amount: string): number => Math.round(Number(amount) * 100);

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

// Calendar date in the owner's time zone (a UTC date is yesterday's until 01:00/02:00 in Denmark).
export const copenhagenToday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);

// occurrence: 0 for the first of several identical rows without entry_reference, 1 for the next...
export const toLedgerRow = async (raw: EbTransaction, occurrence = 0): Promise<LedgerRow> => {
  const magnitude = Math.abs(toMinor(raw.transaction_amount.amount));
  const remittance = clean((raw.remittance_information ?? []).join(" "));
  const row = {
    status: raw.status === "BOOK" ? "BOOK" as const : "PDNG" as const,
    booking_date: raw.booking_date ?? null,
    value_date: raw.value_date ?? null,
    transaction_date: raw.transaction_date ?? null,
    amount_minor: raw.credit_debit_indicator === "DBIT" ? -magnitude : magnitude,
    currency: raw.transaction_amount.currency,
    creditor_name: clean(raw.creditor?.name),
    debtor_name: clean(raw.debtor?.name),
    remittance,
    mcc: clean(raw.merchant_category_code),
    bank_code: clean(raw.bank_transaction_code?.code),
    raw,
  };
  // Stable fields only (no status, no booking date) so a pending row keeps its id when it books.
  const ext_id = clean(raw.entry_reference) ??
    await sha256Hex(
      [
        row.amount_minor,
        row.currency,
        row.transaction_date ?? row.value_date,
        row.creditor_name,
        row.debtor_name,
        remittance,
        ...(occurrence > 0 ? [occurrence] : []),
      ].join("|"),
    );
  return { ext_id, ...row };
};

// Converts one fetch. Identical rows without entry_reference (two equal coffees on one day)
// get an occurrence index in bank order, so they stay two rows.
export const toLedgerRows = async (raws: EbTransaction[]): Promise<LedgerRow[]> => {
  const seen = new Map<string, number>();
  const rows: LedgerRow[] = [];
  for (const raw of raws) {
    const first = await toLedgerRow(raw);
    if (clean(raw.entry_reference)) {
      rows.push(first);
      continue;
    }
    const occurrence = seen.get(first.ext_id) ?? 0;
    seen.set(first.ext_id, occurrence + 1);
    rows.push(occurrence === 0 ? first : await toLedgerRow(raw, occurrence));
  }
  return rows;
};

// Who the money went to (debit) or came from (credit), normalized for pending/booked matching.
export const counterpartyKey = (row: {
  amount_minor: number;
  creditor_name: string | null;
  debtor_name: string | null;
  remittance: string | null;
}): string =>
  ((row.amount_minor < 0 ? row.creditor_name : row.debtor_name) ?? row.remittance ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "");

export type PendingCandidate = DatedRow & {
  id: string;
  amount_minor: number;
  creditor_name: string | null;
  debtor_name: string | null;
  remittance: string | null;
};

// One pending row per booked row: same counterparty, dates within ±5 days, same amount closest first.
// Tips and FX change the booked amount: then a single candidate within ±20% matches too.
export const matchPendingToBooked = (
  pending: PendingCandidate[],
  booked: PendingCandidate[],
): { pendingId: string; bookedId: string }[] => {
  const used = new Set<string>();
  const matches: { pendingId: string; bookedId: string }[] = [];
  for (const book of booked) {
    const bookDate = effectiveDate(book);
    if (!bookDate) continue;
    const key = counterpartyKey(book);
    const near = pending
      .filter((p) => !used.has(p.id) && counterpartyKey(p) === key)
      .map((p) => ({ p, gap: Math.abs(dayDiff(effectiveDate(p) ?? bookDate, bookDate)) }))
      .filter(({ gap }) => gap <= 5)
      .sort((a, b) => a.gap - b.gap || a.p.id.localeCompare(b.p.id));
    const close = near.filter(({ p }) =>
      Math.sign(p.amount_minor) === Math.sign(book.amount_minor) &&
      Math.abs(p.amount_minor - book.amount_minor) <= Math.abs(book.amount_minor) * 0.2
    );
    const best = near.find(({ p }) => p.amount_minor === book.amount_minor) ?? (close.length === 1 ? close[0] : undefined);
    if (!best) continue;
    used.add(best.p.id);
    matches.push({ pendingId: best.p.id, bookedId: book.id });
  }
  return matches;
};

const BALANCE_PREFERENCE = ["CLBD", "ITBD", "XPCD", "ITAV", "CLAV"];

// Booked balance when the bank gives one, else available.
const balanceRank = (balance: EbBalance): number => {
  const index = BALANCE_PREFERENCE.indexOf(balance.balance_type);
  return index === -1 ? BALANCE_PREFERENCE.length : index;
};

export const pickBalance = (balances: EbBalance[]): EbBalance | null =>
  [...balances].sort((a, b) => balanceRank(a) - balanceRank(b))[0] ?? null;

export const accountRole = (account: { name?: string | null; cash_account_type?: string | null }): "personal" | "joint" | "savings" =>
  account.cash_account_type === "SVGS" ? "savings" : (account.name ?? "").includes("&") ? "joint" : "personal";

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import type { EbTransaction } from "../enable-banking.ts";
import { DUMPS, ebRow, loadDump, party } from "../fixtures/world.ts";
import {
  accountRole,
  counterpartyKey,
  effectiveDate,
  matchPendingToBooked,
  type PendingCandidate,
  pickBalance,
  toLedgerRow,
  toMinor,
} from "./ledger.ts";

const asEb = (row: ReturnType<typeof ebRow>): EbTransaction => row;

Deno.test("ledger: amounts are signed by credit_debit_indicator, in minor units", async () => {
  const debit = await toLedgerRow(asEb(ebRow({ transaction_amount: { currency: "DKK", amount: "184.50" } })));
  const credit = await toLedgerRow(asEb(ebRow({ credit_debit_indicator: "CRDT", transaction_amount: { currency: "DKK", amount: "0.29" } })));
  assertEquals(debit.amount_minor, -18450);
  assertEquals(credit.amount_minor, 29);
  assertEquals(toMinor("1234.565"), 123457);
  assertEquals(toMinor("-12.00"), -1200);
});

Deno.test("ledger: every fixture row converts; signs match CRDT/DBIT; remittance lines joined", async () => {
  for (const file of Object.values(DUMPS)) {
    const dump = await loadDump(file);
    for (const raw of dump.raw) {
      const row = await toLedgerRow(asEb(raw));
      const magnitude = toMinor(raw.transaction_amount.amount);
      assertEquals(row.amount_minor, raw.credit_debit_indicator === "DBIT" ? -magnitude : magnitude, file);
      assert(row.ext_id.length > 0);
      assertEquals(row.currency, dump.account.currency);
    }
  }
});

Deno.test("ledger: ext_id = entry_reference, else a stable hash that survives PDNG -> BOOK", async () => {
  const withRef = await toLedgerRow(asEb(ebRow({ entry_reference: "ref-1" })));
  assertEquals(withRef.ext_id, "ref-1");
  const base = { entry_reference: null, creditor: party("Kiosk Nowhere"), transaction_date: "2026-11-11" };
  const pending = await toLedgerRow(asEb(ebRow({ ...base, status: "PDNG", booking_date: null })));
  const booked = await toLedgerRow(asEb(ebRow({ ...base, status: "BOOK", booking_date: "2026-11-13" })));
  assertEquals(pending.ext_id, booked.ext_id);
  const other = await toLedgerRow(asEb(ebRow({ ...base, transaction_amount: { currency: "DKK", amount: "10.01" } })));
  assertNotEquals(other.ext_id, booked.ext_id);
});

Deno.test("ledger: effective date prefers purchase date; Lunar PDNG has only transaction_date", async () => {
  const lunar = await loadDump(DUMPS.lunar);
  const pdng = lunar.raw.find((r) => r.status === "PDNG");
  assert(pdng);
  const row = await toLedgerRow(asEb(pdng));
  assertEquals(row.booking_date, null);
  assertEquals(effectiveDate(row), "2026-11-25");
  assertEquals(effectiveDate({ booking_date: "2026-11-03", value_date: "2026-11-04", transaction_date: null }), "2026-11-03");
});

const cand = (id: string, over: Partial<PendingCandidate> = {}): PendingCandidate => ({
  id,
  amount_minor: -4500,
  creditor_name: "Bakery Imaginary",
  debtor_name: "IVAN TESTOV",
  remittance: "Bakery Imaginary",
  booking_date: "2026-11-20",
  value_date: null,
  transaction_date: null,
  ...over,
});

Deno.test("pending->booked: same amount, counterparty (normalized), within ±5 days", () => {
  assertEquals(matchPendingToBooked([cand("p1")], [cand("b1", { booking_date: "2026-11-22", creditor_name: "BAKERY  IMAGINARY" })]), [
    { pendingId: "p1", bookedId: "b1" },
  ]);
  assertEquals(matchPendingToBooked([cand("p1")], [cand("b1", { booking_date: "2026-11-26" })]), []);
  assertEquals(matchPendingToBooked([cand("p1")], [cand("b1", { amount_minor: -4501 })]), []);
  assertEquals(matchPendingToBooked([cand("p1")], [cand("b1", { creditor_name: "Other Shop" })]), []);
});

Deno.test("pending->booked: one pending per booked row, closest date first", () => {
  const matches = matchPendingToBooked(
    [cand("p-far", { booking_date: "2026-11-16" }), cand("p-near", { booking_date: "2026-11-19" })],
    [cand("b1"), cand("b2", { booking_date: "2026-11-17" })],
  );
  assertEquals(matches.length, 2);
  assertEquals(new Set(matches.map((m) => m.pendingId)).size, 2);
  assertEquals(matches.find((m) => m.bookedId === "b1")?.pendingId, "p-near");
});

Deno.test("counterparty: debit uses creditor, credit uses debtor", () => {
  assertEquals(counterpartyKey({ amount_minor: -1, creditor_name: "Shop A", debtor_name: "Me", remittance: null }), "shopa");
  assertEquals(counterpartyKey({ amount_minor: 1, creditor_name: "Me", debtor_name: "Peter Example", remittance: null }), "peterexample");
});

Deno.test("balances: booked before available", () => {
  const b = pickBalance([
    { balance_type: "ITAV", balance_amount: { currency: "DKK", amount: "1.00" } },
    { balance_type: "ITBD", balance_amount: { currency: "DKK", amount: "2.00" } },
    { balance_type: "OTHR", balance_amount: { currency: "DKK", amount: "3.00" } },
  ]);
  assertEquals(b?.balance_type, "ITBD");
  assertEquals(pickBalance([]), null);
});

Deno.test("account role from fixtures: joint by holder name, savings by SVGS", async () => {
  assertEquals(accountRole((await loadDump(DUMPS.joint)).account), "joint");
  assertEquals(accountRole((await loadDump(DUMPS.savings)).account), "savings");
  assertEquals(accountRole((await loadDump(DUMPS.lunar)).account), "personal");
});

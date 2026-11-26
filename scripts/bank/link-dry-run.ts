// Link-history dry run on private exports. Prints counts only; writes pairs to <sp>/links.json.
// Usage: deno run --allow-read --allow-write scripts/bank/link-dry-run.ts <sp-dir>
//   <sp-dir>/prod/transactions.json  manual rows (production export)
//   <sp-dir>/bank/<uid8>.json         {account, balances, raw[]} Enable Banking dumps
import { linkHistory, type LinkBankRow, type LinkManualRow } from "../../supabase/functions/_shared/link-history.ts";
import { effectiveDate, toLedgerRows } from "../../supabase/functions/_shared/sync/ledger.ts";
import type { EbTransaction } from "../../supabase/functions/_shared/enable-banking.ts";

const sp = Deno.args[0];
if (!sp) throw new Error("usage: link-dry-run.ts <sp-dir>");

const manual: LinkManualRow[] = JSON.parse(await Deno.readTextFile(`${sp}/prod/transactions.json`));

const bank: LinkBankRow[] = [];
const extIdById = new Map<string, { uid8: string; ext_id: string }>();
for await (const entry of Deno.readDir(`${sp}/bank`)) {
  if (!entry.name.endsWith(".json")) continue;
  const uid8 = entry.name.replace(/\.json$/, "");
  const dump: { raw: EbTransaction[] } = JSON.parse(await Deno.readTextFile(`${sp}/bank/${entry.name}`));
  for (const row of await toLedgerRows(dump.raw)) {
    const date = effectiveDate(row);
    if (!date) continue;
    const id = `${uid8}:${row.ext_id}`;
    bank.push({ id, amount_minor: row.amount_minor, currency: row.currency, date });
    extIdById.set(id, { uid8, ext_id: row.ext_id });
  }
}

const links = linkHistory(manual, bank);

const countDuplicates = (ids: string[]): number => ids.length - new Set(ids).size;
const perAccount = new Map<string, number>();
for (const link of links) {
  const uid8 = extIdById.get(link.bank_transaction_id)?.uid8 ?? "?";
  perAccount.set(uid8, (perAccount.get(uid8) ?? 0) + 1);
}

console.log(`manual total: ${manual.length}`);
console.log(`linked: ${links.length}`);
console.log(`unlinked: ${manual.length - links.length}`);
console.log(`bank rows claimed twice: ${countDuplicates(links.map((l) => l.bank_transaction_id))}`);
console.log(`manual rows linked twice: ${countDuplicates(links.map((l) => l.transaction_id))}`);
for (const [uid8, count] of [...perAccount].sort()) console.log(`  account ${uid8}: ${count}`);

await Deno.writeTextFile(
  `${sp}/links.json`,
  JSON.stringify(
    links.map((link) => {
      const ref = extIdById.get(link.bank_transaction_id);
      return { transaction_id: link.transaction_id, bank_account_uid8: ref?.uid8, ext_id: ref?.ext_id };
    }),
  ),
);
console.log(`pairs written: ${sp}/links.json`);

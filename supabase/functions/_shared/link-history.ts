// Pairs the owner's hand-entered transactions with bank rows. Pure: the caller only writes
// transactions.bank_transaction_id for each pair; labels are never touched and nothing is deleted.

export type LinkManualRow = {
  id: string;
  kind: "expense" | "income";
  amount_minor: number; // DKK base
  original_amount_minor: number; // in currency_code
  currency_code: string;
  occurred_on: string;
};

export type LinkBankRow = {
  id: string;
  amount_minor: number; // signed, account currency
  currency: string;
  date: string; // effective date (purchase date when the bank gives one)
};

export type HistoryLink = { transaction_id: string; bank_transaction_id: string };

const FX_TOLERANCE = 0.03;
const MIN_DAYS = -2;
const MAX_DAYS = 5;
const DAY_MS = 86_400_000;

// Manual amount in the bank row's currency, or null when they cannot be compared.
const manualAmountIn = (manual: LinkManualRow, currency: string): number | null => {
  if (manual.currency_code === currency) return manual.original_amount_minor;
  if (currency === "DKK") return manual.amount_minor;
  return null;
};

// Lower is better. Any exact amount beats any FX-tolerance match; then fewer days apart.
const score = (manual: LinkManualRow, bank: LinkBankRow): number | null => {
  if ((manual.kind === "expense") !== (bank.amount_minor < 0)) return null;
  const expected = manualAmountIn(manual, bank.currency);
  if (expected === null || expected <= 0) return null;
  const days = Math.round((Date.parse(bank.date) - Date.parse(manual.occurred_on)) / DAY_MS);
  if (days < MIN_DAYS || days > MAX_DAYS) return null;
  const actual = Math.abs(bank.amount_minor);
  const relative = Math.abs(actual - expected) / expected;
  if (relative > FX_TOLERANCE) return null;
  return (actual === expected ? 0 : 10 + relative * 100) + Math.abs(days);
};

export const linkHistory = (manual: LinkManualRow[], bank: LinkBankRow[]): HistoryLink[] => {
  const candidates: { score: number; manualId: string; bankId: string }[] = [];
  for (const m of manual) {
    for (const b of bank) {
      const s = score(m, b);
      if (s !== null) candidates.push({ score: s, manualId: m.id, bankId: b.id });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.manualId.localeCompare(b.manualId) || a.bankId.localeCompare(b.bankId));

  const usedManual = new Set<string>();
  const usedBank = new Set<string>();
  const links: HistoryLink[] = [];
  for (const c of candidates) {
    if (usedManual.has(c.manualId) || usedBank.has(c.bankId)) continue;
    usedManual.add(c.manualId);
    usedBank.add(c.bankId);
    links.push({ transaction_id: c.manualId, bank_transaction_id: c.bankId });
  }
  return links;
};

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { formatMinor, formatDateLabel } from '@/lib/format';

export type ExportFormat = 'pdf' | 'csv';

type CategoryJoin = { name: string | null; color: string | null } | null;

type RawExportRow = {
  id: string;
  occurred_on: string;
  name: string;
  comment: string | null;
  kind: 'expense' | 'income';
  amount_minor: number;
  converted_amount_minor: number;
  original_amount_minor: number;
  currency_code: string;
  shared: boolean;
  is_shared_topup: boolean;
  shared_participant: 'me' | 'gf' | null;
  categories: CategoryJoin | CategoryJoin[];
};

export type ExportRow = {
  id: string;
  occurredOn: string;
  name: string;
  kind: 'expense' | 'income';
  amountMinor: number; // DKK converted
  currencyCode: string;
  originalAmountMinor: number;
  shared: boolean;
  isSharedTopup: boolean;
  sharedParticipant: 'me' | 'gf' | null;
  categoryName: string;
  categoryColor: string;
};

const DEFAULT_CATEGORY_COLOR = '#7C5CFF';

const firstCategory = (value: CategoryJoin | CategoryJoin[]): CategoryJoin =>
  Array.isArray(value) ? value[0] ?? null : value;

export const fetchExportRows = async (
  startOn: string,
  endOn: string,
): Promise<ExportRow[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, occurred_on, name, comment, kind, amount_minor, converted_amount_minor, original_amount_minor, currency_code, shared, is_shared_topup, shared_participant, categories(name, color)',
    )
    .gte('occurred_on', startOn)
    .lte('occurred_on', endOn)
    .order('occurred_on', { ascending: true });

  if (error) throw error;

  return (data as RawExportRow[] | null ?? []).map((row) => {
    const category = firstCategory(row.categories);
    return {
      id: row.id,
      occurredOn: row.occurred_on,
      name: row.name,
      kind: row.kind,
      amountMinor: row.converted_amount_minor,
      currencyCode: row.currency_code,
      originalAmountMinor: row.original_amount_minor,
      shared: row.shared,
      isSharedTopup: row.is_shared_topup,
      sharedParticipant: row.shared_participant,
      categoryName: category?.name ?? (row.kind === 'income' ? 'Income' : 'Uncategorized'),
      categoryColor: category?.color ?? DEFAULT_CATEGORY_COLOR,
    };
  });
};

type Totals = { incomeMinor: number; expenseMinor: number; netMinor: number };

const computeTotals = (rows: readonly ExportRow[]): Totals => {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const row of rows) {
    if (row.kind === 'income') incomeMinor += row.amountMinor;
    else expenseMinor += row.amountMinor;
  }
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
};

const sharedLabel = (row: ExportRow): string => {
  if (row.isSharedTopup) return `Top-up (${row.sharedParticipant === 'gf' ? 'GF' : 'Me'})`;
  if (row.shared) return 'Shared';
  return 'Personal';
};

const fileStamp = (startOn: string, endOn: string): string => `${startOn}_to_${endOn}`;

// ---- CSV ----

const csvEscape = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const buildCsv = (rows: readonly ExportRow[]): string => {
  const header = [
    'Date',
    'Name',
    'Category',
    'Type',
    'Sharing',
    'Amount (DKK)',
    'Currency',
    'Original amount',
  ];
  const lines = rows.map((row) => {
    const signed = (row.kind === 'expense' ? -row.amountMinor : row.amountMinor) / 100;
    return [
      row.occurredOn,
      csvEscape(row.name),
      csvEscape(row.categoryName),
      row.kind,
      sharedLabel(row),
      signed.toFixed(2),
      row.currencyCode,
      (row.originalAmountMinor / 100).toFixed(2),
    ].join(',');
  });
  return [header.join(','), ...lines].join('\n');
};

// ---- PDF ----

const htmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const signedAmount = (row: ExportRow): string => {
  const sign = row.kind === 'expense' ? '-' : '+';
  return `${sign}${formatMinor(row.amountMinor)}`;
};

const buildHtml = (rows: readonly ExportRow[], startOn: string, endOn: string): string => {
  const totals = computeTotals(rows);
  const generatedOn = formatDateLabel(new Date().toISOString().slice(0, 10));

  const tableRows = rows
    .map((row) => {
      const color = row.categoryColor;
      const amountClass = row.kind === 'income' ? 'amount income' : 'amount expense';
      return `
        <tr>
          <td class="date">${htmlEscape(formatDateLabel(row.occurredOn))}</td>
          <td class="name">${htmlEscape(row.name)}</td>
          <td>
            <span class="pill" style="background:${color}22;color:${color};border:1px solid ${color}55;">
              ${htmlEscape(row.categoryName)}
            </span>
          </td>
          <td class="sharing">${htmlEscape(sharedLabel(row))}</td>
          <td class="${amountClass}">${htmlEscape(signedAmount(row))}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    color: #16161D; margin: 0; padding: 0 28px 40px; background: #ffffff;
  }
  .header {
    padding: 32px 0 20px; border-bottom: 3px solid #7C5CFF; margin-bottom: 24px;
  }
  .brand { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #7C5CFF; font-weight: 700; }
  .title { font-size: 28px; font-weight: 700; margin: 6px 0 2px; }
  .meta { font-size: 13px; color: #6b6b78; }
  .summary { display: flex; gap: 14px; margin-bottom: 28px; }
  .card {
    flex: 1; border-radius: 14px; padding: 16px 18px; background: #F5F5F7; border: 1px solid #ECECF1;
  }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8a8a98; font-weight: 600; }
  .card .value { font-size: 20px; font-weight: 700; margin-top: 6px; }
  .card.income .value { color: #1B9E63; }
  .card.expense .value { color: #D6315A; }
  .card.net .value { color: #16161D; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    color: #8a8a98; padding: 10px 8px; border-bottom: 2px solid #ECECF1;
  }
  tbody td { padding: 11px 8px; border-bottom: 1px solid #F0F0F4; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #FBFBFC; }
  td.date { white-space: nowrap; color: #6b6b78; }
  td.name { font-weight: 600; }
  td.sharing { color: #6b6b78; }
  .pill {
    display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  }
  td.amount { text-align: right; white-space: nowrap; font-weight: 700; font-variant-numeric: tabular-nums; }
  td.amount.income { color: #1B9E63; }
  td.amount.expense { color: #D6315A; }
  .empty { padding: 40px; text-align: center; color: #8a8a98; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">Cash Flow</div>
    <div class="title">Transaction export</div>
    <div class="meta">${htmlEscape(formatDateLabel(startOn))} – ${htmlEscape(formatDateLabel(endOn))} · generated ${htmlEscape(generatedOn)}</div>
  </div>

  <div class="summary">
    <div class="card income"><div class="label">Income</div><div class="value">${htmlEscape(formatMinor(totals.incomeMinor))}</div></div>
    <div class="card expense"><div class="label">Expense</div><div class="value">${htmlEscape(formatMinor(totals.expenseMinor))}</div></div>
    <div class="card net"><div class="label">Net</div><div class="value">${htmlEscape((totals.netMinor < 0 ? '-' : '+') + formatMinor(Math.abs(totals.netMinor)))}</div></div>
  </div>

  <table>
    <thead>
      <tr><th>Date</th><th>Name</th><th>Category</th><th>Sharing</th><th style="text-align:right;">Amount</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
};

// ---- Orchestration ----

export type ExportResult = { status: 'shared' | 'empty' | 'unavailable' };

/**
 * Build the export file for the range and hand it to the native share sheet.
 * Returns `empty` when there is nothing in range, `unavailable` when the
 * platform share sheet is not available.
 */
export const exportTransactions = async ({
  format,
  startOn,
  endOn,
}: {
  format: ExportFormat;
  startOn: string;
  endOn: string;
}): Promise<ExportResult> => {
  const rows = await fetchExportRows(startOn, endOn);
  if (rows.length === 0) return { status: 'empty' };

  const stamp = fileStamp(startOn, endOn);

  let uri: string;
  let mimeType: string;
  let dialogTitle: string;

  if (format === 'csv') {
    const csv = buildCsv(rows);
    const file = new File(Paths.cache, `cashflow-${stamp}.csv`);
    if (file.exists) file.delete();
    file.create();
    file.write(csv);
    uri = file.uri;
    mimeType = 'text/csv';
    dialogTitle = 'Export transactions (CSV)';
  } else {
    const { uri: pdfUri } = await Print.printToFileAsync({ html: buildHtml(rows, startOn, endOn) });
    uri = pdfUri;
    mimeType = 'application/pdf';
    dialogTitle = 'Export transactions (PDF)';
  }

  if (!(await Sharing.isAvailableAsync())) return { status: 'unavailable' };

  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'com.adobe.pdf' });
  return { status: 'shared' };
};

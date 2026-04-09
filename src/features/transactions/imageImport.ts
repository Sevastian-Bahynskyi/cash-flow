import { supabase, supabaseFunctionsUrl, supabasePublishableKey } from '@/lib/supabase';
import type { TransactionKind } from './types';

export type ImportedTransactionDraft = {
  id: string;
  kind: TransactionKind;
  name: string;
  amount: string;
  currencyCode: string;
  categoryId: string | null;
  comment: string;
  occurredOn: string;
};

type ImportResponse = {
  transactions?: {
    kind?: unknown;
    name?: unknown;
    amount?: unknown;
    currencyCode?: unknown;
    categoryId?: unknown;
    comment?: unknown;
    occurredOn?: unknown;
  }[];
  error?: string;
};

type ImportRequestOptions = {
  endpoint: 'parse-transaction-image' | 'parse-transaction-csv';
  body: Record<string, unknown>;
  categories: { id: string; parent: string; name: string }[];
  fallbackDate?: string;
  transportLabel: string;
  emptyMessage: string;
};

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

const normalizeCurrencyCode = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'DKK';
};

const normalizeKind = (value: unknown): TransactionKind =>
  value === 'income' ? 'income' : 'expense';

const normalizeOccurredOn = (value: unknown, fallback: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : fallback;
};

const normalizeAmount = (value: unknown): string | null => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim().replace(',', '.'))
        : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toFixed(2);
};

const normalizeName = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : 'Imported transaction';
};

const normalizeComment = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const buildDrafts = ({
  payload,
  categories,
  fallbackDate,
}: {
  payload: ImportResponse | null;
  categories: { id: string; parent: string; name: string }[];
  fallbackDate: string;
}): ImportedTransactionDraft[] => {
  const validCategoryIds = new Set(categories.map((category) => category.id));
  const rows = Array.isArray(payload?.transactions) ? payload.transactions : [];
  return rows
    .map((row, index): ImportedTransactionDraft | null => {
      const amount = normalizeAmount(row.amount);
      if (!amount) return null;
      const categoryId =
        typeof row.categoryId === 'string' && validCategoryIds.has(row.categoryId)
          ? row.categoryId
          : null;
      return {
        id: `${Date.now()}-${index}`,
        kind: normalizeKind(row.kind),
        name: normalizeName(row.name),
        amount,
        currencyCode: normalizeCurrencyCode(row.currencyCode),
        categoryId,
        comment: normalizeComment(row.comment),
        occurredOn: normalizeOccurredOn(row.occurredOn, fallbackDate),
      };
    })
    .filter((row): row is ImportedTransactionDraft => Boolean(row));
};

const importTransactions = async ({
  endpoint,
  body,
  categories,
  fallbackDate,
  transportLabel,
  emptyMessage,
}: ImportRequestOptions): Promise<{ drafts: ImportedTransactionDraft[]; error: string | null }> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return { drafts: [], error: 'You need to be signed in to import transactions.' };
  }

  if (!supabaseFunctionsUrl || !supabasePublishableKey) {
    return { drafts: [], error: `${transportLabel} import is not configured yet.` };
  }

  const today = fallbackDate ?? isoDate(new Date());

  try {
    const response = await fetch(`${supabaseFunctionsUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabasePublishableKey,
      },
      body: JSON.stringify({
        ...body,
        candidates: categories,
        today,
      }),
    });

    const payload = (await response.json().catch(() => null)) as ImportResponse | null;

    if (!response.ok) {
      return {
        drafts: [],
        error: payload?.error ?? `Could not analyze this ${transportLabel.toLowerCase()} right now.`,
      };
    }

    const drafts = buildDrafts({
      payload,
      categories,
      fallbackDate: today,
    });

    if (drafts.length === 0) {
      return { drafts: [], error: emptyMessage };
    }

    return { drafts, error: null };
  } catch (error) {
    return {
      drafts: [],
      error:
        error instanceof Error ? error.message : `Could not analyze this ${transportLabel.toLowerCase()} right now.`,
    };
  }
};

export const importTransactionsFromImage = async ({
  imageDataUrl,
  categories,
  fallbackDate,
}: {
  imageDataUrl: string;
  categories: { id: string; parent: string; name: string }[];
  fallbackDate?: string;
}): Promise<{ drafts: ImportedTransactionDraft[]; error: string | null }> => {
  return importTransactions({
    endpoint: 'parse-transaction-image',
    body: { imageDataUrl },
    categories,
    fallbackDate,
    transportLabel: 'Image',
    emptyMessage: 'No transactions were found in this image.',
  });
};

export const importTransactionsFromCsv = async ({
  csvText,
  fileName,
  categories,
  fallbackDate,
}: {
  csvText: string;
  fileName?: string | null;
  categories: { id: string; parent: string; name: string }[];
  fallbackDate?: string;
}): Promise<{ drafts: ImportedTransactionDraft[]; error: string | null }> =>
  importTransactions({
    endpoint: 'parse-transaction-csv',
    body: {
      csvText,
      fileName: fileName ?? null,
    },
    categories,
    fallbackDate,
    transportLabel: 'CSV',
    emptyMessage: 'No transactions were found in this CSV.',
  });

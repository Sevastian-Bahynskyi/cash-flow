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

export type SkippedImportedTransaction = {
  id: string;
  name: string;
  amount: string;
  currencyCode: string;
  occurredOn: string;
  reason: 'existing' | 'batch';
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

const toLoggableError = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const buildImportRequestMeta = ({
  endpoint,
  transportLabel,
  body,
  categoryCount,
  today,
}: {
  endpoint: ImportRequestOptions['endpoint'];
  transportLabel: string;
  body: Record<string, unknown>;
  categoryCount: number;
  today: string;
}) => ({
  endpoint,
  transportLabel,
  fileName: typeof body.fileName === 'string' ? body.fileName : null,
  csvLength: typeof body.csvText === 'string' ? body.csvText.length : null,
  bodyKeys: Object.keys(body),
  categoryCount,
  today,
});

const authImportErrorMessage = 'Your session expired or is invalid. Sign in again and retry the import.';

const isUnauthorizedImportResponse = ({
  status,
  payloadError,
  rawPayloadText,
}: {
  status: number;
  payloadError: string | undefined;
  rawPayloadText: string;
}): boolean => {
  if (status === 401) return true;

  const normalizedPayloadError = payloadError?.trim().toLowerCase() ?? '';
  if (normalizedPayloadError.includes('invalid jwt') || normalizedPayloadError.includes('unauthorized')) {
    return true;
  }

  const normalizedResponseText = rawPayloadText.trim().toLowerCase();
  return normalizedResponseText.includes('invalid jwt') || normalizedResponseText.includes('unauthorized');
};

const normalizeDuplicateName = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeCurrencyCode = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'DKK';
};

const normalizeCategoryName = (value: string): string => value.trim().toLowerCase();

const isTransferCategoryCandidate = (category: { parent: string; name: string }): boolean =>
  normalizeCategoryName(category.parent) === 'transfers';

const isSalaryCategoryCandidate = (category: { parent: string; name: string }): boolean =>
  normalizeCategoryName(category.parent) === 'income' && normalizeCategoryName(category.name) === 'salary';

const isOtherIncomeCategoryCandidate = (category: { parent: string; name: string }): boolean => {
  const normalizedName = normalizeCategoryName(category.name);
  return normalizeCategoryName(category.parent) === 'income' &&
    (normalizedName === 'other income' || normalizedName === 'others');
};

const isAllowedIncomeCategoryCandidate = (category: { parent: string; name: string }): boolean =>
  isSalaryCategoryCandidate(category) ||
  isTransferCategoryCandidate(category) ||
  isOtherIncomeCategoryCandidate(category);

const normalizeKind = (value: unknown): TransactionKind =>
  value === 'income' ? 'income' : 'expense';

const normalizeOccurredOn = (value: unknown, fallback: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : fallback;
};

const parseLocalizedAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const sanitized = trimmed
    .replace(/[\u00a0\u202f\s]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[^0-9,.'-]/g, '');

  if (!sanitized) return null;

  const negative = sanitized.startsWith('-');
  const unsigned = sanitized.replace(/-/g, '');
  if (!unsigned || !/\d/.test(unsigned)) return null;

  const lastDot = unsigned.lastIndexOf('.');
  const lastComma = unsigned.lastIndexOf(',');
  const lastSeparatorIndex = Math.max(lastDot, lastComma);

  let normalized = unsigned;
  if (lastSeparatorIndex >= 0) {
    const integerPart = unsigned.slice(0, lastSeparatorIndex);
    const fractionalPart = unsigned.slice(lastSeparatorIndex + 1);
    const separatorCount = (unsigned.match(/[.,]/g) ?? []).length;
    const looksLikeDecimal = fractionalPart.length > 0 && fractionalPart.length <= 2 && separatorCount >= 1;

    if (looksLikeDecimal) {
      normalized = `${integerPart.replace(/[.,']/g, '')}.${fractionalPart.replace(/[.,']/g, '')}`;
    } else {
      normalized = unsigned.replace(/[.,']/g, '');
    }
  } else {
    normalized = unsigned.replace(/'/g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(`${negative ? '-' : ''}${normalized}`);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
};

const normalizeAmount = (value: unknown): string | null => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? parseLocalizedAmount(value)
        : null;
  if (numeric === null || !Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric.toFixed(2);
};

const normalizeName = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : 'Imported transaction';
};

const normalizeComment = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const toAmountMinor = (value: string): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
};

const buildDrafts = ({
  payload,
  categories,
  fallbackDate,
  trustExpenseCategorySuggestions,
}: {
  payload: ImportResponse | null;
  categories: { id: string; parent: string; name: string }[];
  fallbackDate: string;
  trustExpenseCategorySuggestions: boolean;
}): ImportedTransactionDraft[] => {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const validCategoryIds = new Set(categories.map((category) => category.id));
  const otherIncomeCategoryId =
    categories.find((category) => isOtherIncomeCategoryCandidate(category))?.id ?? null;
  const rows = Array.isArray(payload?.transactions) ? payload.transactions : [];
  return rows
    .map((row, index): ImportedTransactionDraft | null => {
      const amount = normalizeAmount(row.amount);
      if (!amount) return null;
      const suggestedCategoryId =
        typeof row.categoryId === 'string' && validCategoryIds.has(row.categoryId)
          ? row.categoryId
          : null;
      const suggestedCategory = suggestedCategoryId ? categoriesById.get(suggestedCategoryId) ?? null : null;
      const categoryId =
        normalizeKind(row.kind) === 'income'
          ? suggestedCategory && isAllowedIncomeCategoryCandidate(suggestedCategory)
            ? suggestedCategory.id
            : otherIncomeCategoryId
          : trustExpenseCategorySuggestions
            ? suggestedCategoryId
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

const duplicateKeyForDraft = (row: ImportedTransactionDraft): string | null => {
  const amountMinor = toAmountMinor(row.amount);
  if (amountMinor === null) return null;
  return [
    normalizeDuplicateName(row.name),
    row.occurredOn.trim(),
    row.currencyCode.trim().toUpperCase(),
    String(amountMinor),
  ].join('|');
};

const fetchExistingDuplicateKeys = async (rows: ImportedTransactionDraft[]): Promise<Set<string>> => {
  const dates = [...new Set(rows.map((row) => row.occurredOn.trim()).filter(Boolean))];
  if (dates.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from('transactions')
    .select('name, occurred_on, currency_code, original_amount_minor')
    .in('occurred_on', dates);

  if (error || !data) return new Set<string>();

  const keys = new Set<string>();
  for (const row of data as {
    name: string | null;
    occurred_on: string | null;
    currency_code: string | null;
    original_amount_minor: number | null;
  }[]) {
    const normalizedName = normalizeDuplicateName(row.name ?? '');
    const occurredOn = row.occurred_on?.trim() ?? '';
    const currencyCode = row.currency_code?.trim().toUpperCase() ?? 'DKK';
    const amountMinor = typeof row.original_amount_minor === 'number' ? row.original_amount_minor : null;
    if (!normalizedName || !occurredOn || amountMinor === null || amountMinor <= 0) continue;
    keys.add([normalizedName, occurredOn, currencyCode, String(amountMinor)].join('|'));
  }

  return keys;
};

const dedupeDrafts = async (
  rows: ImportedTransactionDraft[],
): Promise<{ drafts: ImportedTransactionDraft[]; skippedDuplicates: SkippedImportedTransaction[] }> => {
  const existingKeys = await fetchExistingDuplicateKeys(rows);
  const batchKeys = new Set<string>();
  const drafts: ImportedTransactionDraft[] = [];
  const skippedDuplicates: SkippedImportedTransaction[] = [];

  for (const row of rows) {
    const key = duplicateKeyForDraft(row);
    if (!key) {
      drafts.push(row);
      continue;
    }

    if (existingKeys.has(key)) {
      skippedDuplicates.push({
        id: row.id,
        name: row.name,
        amount: row.amount,
        currencyCode: row.currencyCode,
        occurredOn: row.occurredOn,
        reason: 'existing',
      });
      continue;
    }

    if (batchKeys.has(key)) {
      skippedDuplicates.push({
        id: row.id,
        name: row.name,
        amount: row.amount,
        currencyCode: row.currencyCode,
        occurredOn: row.occurredOn,
        reason: 'batch',
      });
      continue;
    }

    batchKeys.add(key);
    drafts.push(row);
  }

  return { drafts, skippedDuplicates };
};

const importTransactions = async ({
  endpoint,
  body,
  categories,
  fallbackDate,
  transportLabel,
  emptyMessage,
}: ImportRequestOptions): Promise<{
  drafts: ImportedTransactionDraft[];
  skippedDuplicates: SkippedImportedTransaction[];
  error: string | null;
}> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return { drafts: [], skippedDuplicates: [], error: 'You need to be signed in to import transactions.' };
  }

  if (!supabaseFunctionsUrl || !supabasePublishableKey) {
    return { drafts: [], skippedDuplicates: [], error: `${transportLabel} import is not configured yet.` };
  }

  const today = fallbackDate ?? isoDate(new Date());
  const requestMeta = buildImportRequestMeta({
    endpoint,
    transportLabel,
    body,
    categoryCount: categories.length,
    today,
  });

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

    const rawPayloadText = await response.text();
    let payload: ImportResponse | null = null;
    if (rawPayloadText) {
      try {
        payload = JSON.parse(rawPayloadText) as ImportResponse;
      } catch (error) {
        console.warn('[transaction-import] Failed to parse edge function response as JSON.', {
          ...requestMeta,
          status: response.status,
          statusText: response.statusText,
          parseError: toLoggableError(error),
          responseBodyPreview: rawPayloadText.slice(0, 500),
        });
      }
    }

    if (!response.ok) {
      console.error('[transaction-import] Edge function returned an error response.', {
        ...requestMeta,
        status: response.status,
        statusText: response.statusText,
        payloadError: payload?.error ?? null,
        responseBodyPreview: rawPayloadText.slice(0, 500) || null,
      });

      const errorMessage = isUnauthorizedImportResponse({
        status: response.status,
        payloadError: payload?.error,
        rawPayloadText,
      })
        ? authImportErrorMessage
        : payload?.error ?? `Could not analyze this ${transportLabel.toLowerCase()} right now.`;

      return {
        drafts: [],
        skippedDuplicates: [],
        error: errorMessage,
      };
    }

    const rawDrafts = buildDrafts({
      payload,
      categories,
      fallbackDate: today,
      trustExpenseCategorySuggestions: endpoint === 'parse-transaction-image',
    });

    if (rawDrafts.length === 0) {
      return { drafts: [], skippedDuplicates: [], error: emptyMessage };
    }

    const { drafts, skippedDuplicates } = await dedupeDrafts(rawDrafts);

    return { drafts, skippedDuplicates, error: null };
  } catch (error) {
    console.error('[transaction-import] Request failed before a valid response was received.', {
      ...requestMeta,
      error: toLoggableError(error),
    });
    return {
      drafts: [],
      skippedDuplicates: [],
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
}): Promise<{
  drafts: ImportedTransactionDraft[];
  skippedDuplicates: SkippedImportedTransaction[];
  error: string | null;
}> => {
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
}): Promise<{
  drafts: ImportedTransactionDraft[];
  skippedDuplicates: SkippedImportedTransaction[];
  error: string | null;
}> =>
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

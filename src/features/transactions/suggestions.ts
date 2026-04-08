import { supabase } from '@/lib/supabase';
import { normalizePattern } from '@/lib/currency';
import type { TransactionRow } from './types';

export type SuggestedCategoryResult = {
  categoryId: string;
  confidence: number;
  source: 'memory' | 'history' | 'ai';
  patternKey: string;
};

type SuggestionHistoryRow = {
  name: string;
  category_id: string | null;
};

type AiRuleRow = {
  category_id: string | null;
  is_blocked: boolean;
};

type SuggestFunctionResponse = {
  categoryId: string | null;
  confidence?: number | null;
};

const txSelect =
  'id, user_id, kind, amount_minor, occurred_on, name, comment, category_id, country_iso, recurring, shared, shared_participant, is_shared_topup, is_salary, currency_code, original_amount_minor, converted_amount_minor, fx_rate, created_at, updated_at';

export const fetchAiRule = async (patternKey: string): Promise<AiRuleRow | null> => {
  const { data, error } = await supabase
    .from('ai_category_rules')
    .select('category_id, is_blocked')
    .eq('pattern_key', patternKey)
    .maybeSingle();

  if (error) return null;
  return (data ?? null) as AiRuleRow | null;
};

export const upsertAiRule = async ({
  patternKey,
  categoryId,
  isBlocked,
}: {
  patternKey: string;
  categoryId: string | null;
  isBlocked: boolean;
}): Promise<void> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return;

  await supabase.from('ai_category_rules').upsert(
    {
      user_id: userData.user.id,
      pattern_key: patternKey,
      category_id: isBlocked ? null : categoryId,
      is_blocked: isBlocked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,pattern_key' },
  );
};

const fetchSuggestionHistory = async (): Promise<SuggestionHistoryRow[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('name, category_id')
    .eq('kind', 'expense')
    .not('category_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(60);

  if (error || !data) return [];
  return data as SuggestionHistoryRow[];
};

// Local history suggestion: prefer exact normalized merchant-pattern matches,
// then fall back to fuzzy contains matches.
export const localSuggestCategory = async (
  nameQuery: string,
  historyRows?: SuggestionHistoryRow[],
): Promise<{ categoryId: string; confidence: number } | null> => {
  const q = nameQuery.trim();
  if (q.length < 2) return null;

  const rows = historyRows ?? (await fetchSuggestionHistory());
  if (rows.length === 0) return null;

  const exactPattern = normalizePattern(q);
  const exactCounts = new Map<string, number>();
  const fuzzyCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.category_id) continue;
    if (normalizePattern(row.name) === exactPattern) {
      exactCounts.set(row.category_id, (exactCounts.get(row.category_id) ?? 0) + 1);
    }
    if (row.name.toLowerCase().includes(q.toLowerCase())) {
      fuzzyCounts.set(row.category_id, (fuzzyCounts.get(row.category_id) ?? 0) + 1);
    }
  }

  const chooseBest = (counts: Map<string, number>): [string, number] | null => {
    let bestId: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) {
        bestId = id;
        bestCount = count;
      }
    }
    return bestId ? [bestId, bestCount] : null;
  };

  const exact = chooseBest(exactCounts);
  if (exact) {
    return {
      categoryId: exact[0],
      confidence: exact[1] >= 3 ? 0.96 : 0.88,
    };
  }

  const fuzzy = chooseBest(fuzzyCounts);
  if (!fuzzy) return null;

  return {
    categoryId: fuzzy[0],
    confidence: fuzzy[1] >= 3 ? 0.78 : 0.66,
  };
};

export const fetchRecentTransactionSuggestions = async (
  nameQuery: string,
): Promise<TransactionRow[]> => {
  const q = nameQuery.trim();
  if (q.length < 1) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(txSelect)
    .ilike('name', `%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(6);

  if (error || !data) return [];
  return data as TransactionRow[];
};

export const fetchRecentCategoryIds = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('kind', 'expense')
    .not('category_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(12);

  if (error || !data) return [];

  const ids: string[] = [];
  for (const row of data as { category_id: string | null }[]) {
    if (row.category_id && !ids.includes(row.category_id)) ids.push(row.category_id);
  }
  return ids;
};

// Remote fallback. Invokes the suggest-category edge function with candidate
// categories. Returns null on any failure — must never block save.
export const remoteSuggestCategory = async (
  name: string,
  comment: string | null,
  candidates: { id: string; parent: string; name: string }[],
  historyRows: SuggestionHistoryRow[],
): Promise<{ categoryId: string; confidence: number } | null> => {
  try {
    const history = historyRows
      .filter((row): row is { name: string; category_id: string } => Boolean(row.category_id))
      .slice(0, 12)
      .map((row) => ({
        name: row.name,
        categoryId: row.category_id,
      }));

    const { data, error } = await supabase.functions.invoke<SuggestFunctionResponse>(
      'suggest-category',
      { body: { name, comment, candidates, history } },
    );
    if (error || !data?.categoryId) return null;
    return {
      categoryId: data.categoryId,
      confidence: Math.max(0, Math.min(1, data.confidence ?? 0.6)),
    };
  } catch {
    return null;
  }
};

// Fetch category ids used in the user's last 90 days, ordered by use count desc.
export const fetchFrequentCategoryIds = async (): Promise<string[]> => {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('kind', 'expense')
    .gte('occurred_on', sinceIso)
    .not('category_id', 'is', null);

  if (error || !data) return [];

  const counts = new Map<string, number>();
  for (const row of data as { category_id: string | null }[]) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
};

export const resolveSuggestedCategory = async (
  name: string,
  comment: string | null,
  candidates: { id: string; parent: string; name: string }[],
  options?: { preferRemote?: boolean },
): Promise<SuggestedCategoryResult | null> => {
  const patternKey = normalizePattern(name);
  if (patternKey.length < 2) return null;

  const rule = await fetchAiRule(patternKey);
  if (rule?.is_blocked) return null;
  if (rule?.category_id) {
    return {
      categoryId: rule.category_id,
      confidence: 1,
      source: 'memory',
      patternKey,
    };
  }

  const historyRows = await fetchSuggestionHistory();
  let remote: { categoryId: string; confidence: number } | null = null;

  if (options?.preferRemote) {
    remote = await remoteSuggestCategory(name, comment, candidates, historyRows);
    if (remote) {
      return {
        categoryId: remote.categoryId,
        confidence: remote.confidence,
        source: 'ai',
        patternKey,
      };
    }
  }

  const local = await localSuggestCategory(name, historyRows);
  if (local) {
    return {
      categoryId: local.categoryId,
      confidence: local.confidence,
      source: 'history',
      patternKey,
    };
  }

  if (!remote) {
    remote = await remoteSuggestCategory(name, comment, candidates, historyRows);
  }
  if (!remote) return null;

  return {
    categoryId: remote.categoryId,
    confidence: remote.confidence,
    source: 'ai',
    patternKey,
  };
};

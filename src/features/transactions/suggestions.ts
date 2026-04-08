import { supabase } from '@/lib/supabase';

// Local history suggestion: find the most frequently used category id
// among past transactions whose name matches the given query (case-insensitive).
// Returns null when there is no confident match.
export const localSuggestCategory = async (
  nameQuery: string,
): Promise<string | null> => {
  const q = nameQuery.trim();
  if (q.length < 2) return null;

  const { data, error } = await supabase
    .from('transactions')
    .select('category_id')
    .eq('kind', 'expense')
    .ilike('name', `%${q}%`)
    .not('category_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) return null;

  const counts = new Map<string, number>();
  for (const row of data as { category_id: string | null }[]) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }
  return bestId;
};

// Remote fallback. Invokes the suggest-category edge function with candidate
// categories. Returns null on any failure — must never block save.
export const remoteSuggestCategory = async (
  name: string,
  comment: string | null,
  candidates: { id: string; parent: string; name: string }[],
): Promise<string | null> => {
  try {
    const { data, error } = await supabase.functions.invoke<{ categoryId: string | null }>(
      'suggest-category',
      { body: { name, comment, candidates } },
    );
    if (error || !data) return null;
    return data.categoryId ?? null;
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

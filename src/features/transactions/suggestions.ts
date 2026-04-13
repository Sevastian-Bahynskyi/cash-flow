import { supabase, supabaseFunctionsUrl, supabasePublishableKey } from '@/lib/supabase';
import { reportDevError } from '@/lib/errors';
import { fetchTransferPeople } from '@/features/transfers/people';
import {
  formatMerchantCategorySource,
  normalizeMerchantContext,
  pickDeterministicRankedCandidate,
  resolveCuratedCategoryCandidate,
  resolveTransferPersonCandidate,
  type MerchantCategoryCandidate,
  type MerchantCategorySource,
  type MerchantSuggestionContext,
  type RankedMerchantCategoryCandidate,
} from './merchantIntelligence';
import type { TransactionKind, TransactionRow } from './types';

export type SuggestedCategoryResult = {
  categoryId: string;
  confidence: number;
  source: MerchantCategorySource;
  normalizedMerchant: string;
  canonicalMerchant: string | null;
  isSharedTopup: boolean;
};

export type SuggestCategoryCandidate = MerchantCategoryCandidate;

export type ImportCategorySuggestionRow = MerchantSuggestionContext & {
  id: string;
};

export type BatchSuggestedCategoryResult = SuggestedCategoryResult & {
  id: string;
};

export type MerchantRuleRow = {
  id: string;
  user_id: string;
  match_target: 'normalized_merchant' | 'raw_text' | 'bank_category' | 'sender' | 'receiver';
  match_type: 'exact' | 'prefix' | 'contains' | 'regex';
  pattern: string;
  kind: TransactionKind;
  canonical_merchant: string | null;
  category_id: string | null;
  is_shared_topup: boolean;
  is_blocked: boolean;
  priority: number;
  source: string;
  notes: string | null;
  updated_at: string;
};

type RankedCandidateRpcRow = {
  category_id?: unknown;
  source?: unknown;
  confidence?: unknown;
  normalized_merchant?: unknown;
  canonical_merchant?: unknown;
  is_shared_topup?: unknown;
  matched_pattern?: unknown;
  similarity?: unknown;
  observation_count?: unknown;
  support_ratio?: unknown;
  priority?: unknown;
};

type SuggestFunctionResponse = {
  categoryId: string | null;
  confidence?: number | null;
  isSharedTopup?: boolean | null;
  error?: string;
};

type BatchSuggestFunctionResponse = {
  results?: {
    id?: unknown;
    categoryId?: unknown;
    confidence?: unknown;
    isSharedTopup?: unknown;
  }[];
  error?: string;
};

type MerchantMemoryRow = {
  id: string;
  category_id: string;
  observation_count: number | null;
  support_ratio: number | string | null;
  canonical_merchant: string | null;
  sample_names: unknown;
  is_shared_topup: boolean;
};

const txSelect =
  'id, user_id, kind, amount_minor, occurred_on, name, comment, category_id, country_iso, recurring, shared, shared_participant, is_shared_topup, is_salary, currency_code, original_amount_minor, converted_amount_minor, fx_rate, created_at, updated_at';

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, value));

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const currentUserId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
};

const validCategoryIds = (candidates: readonly SuggestCategoryCandidate[]): Set<string> =>
  new Set(candidates.map((candidate) => candidate.id));

const toRankedCandidate = (row: RankedCandidateRpcRow): RankedMerchantCategoryCandidate | null => {
  const categoryId = typeof row.category_id === 'string' ? row.category_id : null;
  const source =
    row.source === 'rule' || row.source === 'memory_exact' || row.source === 'memory_fuzzy'
      ? row.source
      : null;
  if (!categoryId || !source) return null;

  return {
    categoryId,
    source,
    confidence: clampConfidence(toFiniteNumber(row.confidence) ?? 0),
    normalizedMerchant:
      typeof row.normalized_merchant === 'string' ? row.normalized_merchant : '',
    canonicalMerchant:
      typeof row.canonical_merchant === 'string' ? row.canonical_merchant : null,
    isSharedTopup: Boolean(row.is_shared_topup),
    matchedPattern:
      typeof row.matched_pattern === 'string' ? row.matched_pattern : null,
    similarity: toFiniteNumber(row.similarity),
    observationCount: toFiniteNumber(row.observation_count),
    supportRatio: toFiniteNumber(row.support_ratio),
    priority: toFiniteNumber(row.priority),
  };
};

const rankMerchantCandidates = async (
  context: MerchantSuggestionContext,
): Promise<RankedMerchantCategoryCandidate[]> => {
  const normalizedMerchant = normalizeMerchantContext(context);
  if (!normalizedMerchant) return [];

  const rpcResponse: {
    data: RankedCandidateRpcRow[] | null;
    error: unknown;
  } = await supabase.rpc('rank_transaction_category_candidates', {
    kind_input: context.kind,
    raw_text_input: context.rawText ?? context.name,
    normalized_merchant_input: normalizedMerchant,
    bank_category_input: context.bankCategory ?? null,
    sender_input: context.sender ?? null,
    receiver_input: context.receiver ?? null,
    limit_input: 6,
  });
  const { data, error } = rpcResponse;

  if (error) {
    reportDevError('merchant-ranking.rpc', error, { normalizedMerchant, kind: context.kind });
    return [];
  }

  return (data ?? [])
    .map(toRankedCandidate)
    .filter((row): row is RankedMerchantCategoryCandidate => Boolean(row));
};

type BatchRankedCandidateRpcRow = RankedCandidateRpcRow & { input_id?: unknown };

const rankMerchantCandidatesBatch = async (
  inputs: { id: string; context: MerchantSuggestionContext; normalizedMerchant: string }[],
): Promise<Map<string, RankedMerchantCategoryCandidate[]>> => {
  const result = new Map<string, RankedMerchantCategoryCandidate[]>();
  if (inputs.length === 0) return result;

  const inputsJson = inputs.map((input) => ({
    id: input.id,
    kind: input.context.kind,
    raw_text: input.context.rawText ?? input.context.name,
    normalized_merchant: input.normalizedMerchant,
    bank_category: input.context.bankCategory ?? null,
    sender: input.context.sender ?? null,
    receiver: input.context.receiver ?? null,
  }));

  const rpcResponse: {
    data: BatchRankedCandidateRpcRow[] | null;
    error: unknown;
  } = await supabase.rpc('rank_transaction_category_candidates_batch', {
    inputs_json: inputsJson,
    limit_input: 6,
  });
  const { data, error } = rpcResponse;

  if (error) {
    reportDevError('merchant-ranking.batch-rpc', error, { count: inputs.length });
    return result;
  }

  for (const row of data ?? []) {
    const inputId = typeof row.input_id === 'string' ? row.input_id : null;
    if (!inputId) continue;
    const candidate = toRankedCandidate(row);
    if (!candidate) continue;
    const existing = result.get(inputId) ?? [];
    existing.push(candidate);
    result.set(inputId, existing);
  }

  return result;
};

const buildDeterministicResolution = async ({
  context,
  candidates,
}: {
  context: MerchantSuggestionContext;
  candidates: readonly SuggestCategoryCandidate[];
}): Promise<{
  suggestion: SuggestedCategoryResult | null;
  rankedCandidates: RankedMerchantCategoryCandidate[];
  normalizedMerchant: string;
}> => {
  const normalizedMerchant = normalizeMerchantContext(context);
  if (!normalizedMerchant) {
    return { suggestion: null, rankedCandidates: [], normalizedMerchant: '' };
  }

  const curated = resolveCuratedCategoryCandidate({ context, candidates });
  if (curated) {
    return {
      suggestion: {
        categoryId: curated.categoryId,
        confidence: curated.confidence,
        source: curated.source,
        normalizedMerchant: curated.normalizedMerchant,
        canonicalMerchant: curated.canonicalMerchant,
        isSharedTopup: curated.isSharedTopup,
      },
      rankedCandidates: [],
      normalizedMerchant: curated.normalizedMerchant,
    };
  }

  const people = await fetchTransferPeople();
  const transferPerson = resolveTransferPersonCandidate({
    context,
    candidates,
    normalizedPeople: people.map((person) => person.normalized_name),
  });
  if (transferPerson) {
    return {
      suggestion: {
        categoryId: transferPerson.categoryId,
        confidence: transferPerson.confidence,
        source: transferPerson.source,
        normalizedMerchant: transferPerson.normalizedMerchant,
        canonicalMerchant: transferPerson.canonicalMerchant,
        isSharedTopup: transferPerson.isSharedTopup,
      },
      rankedCandidates: [],
      normalizedMerchant: transferPerson.normalizedMerchant,
    };
  }

  const rankedCandidates = await rankMerchantCandidates(context);
  const deterministic = pickDeterministicRankedCandidate(rankedCandidates);
  if (!deterministic) {
    return { suggestion: null, rankedCandidates, normalizedMerchant };
  }

  return {
    suggestion: {
      categoryId: deterministic.categoryId,
      confidence: deterministic.confidence,
      source: deterministic.source,
      normalizedMerchant: deterministic.normalizedMerchant,
      canonicalMerchant: deterministic.canonicalMerchant,
      isSharedTopup: deterministic.isSharedTopup,
    },
    rankedCandidates,
    normalizedMerchant,
  };
};

const buildFunctionHeaders = async (): Promise<Record<string, string> | null> => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    reportDevError(
      'suggest-category.session',
      sessionError ?? new Error('Missing Supabase session for edge function invoke.'),
    );
    return null;
  }

  if (!supabaseFunctionsUrl || !supabasePublishableKey) {
    reportDevError(
      'suggest-category.config',
      new Error('Missing Supabase function URL or publishable key for edge function calls.'),
    );
    return null;
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabasePublishableKey,
  };
};

const parseBatchSuggestResults = (
  payload: BatchSuggestFunctionResponse | null,
  categoryIds: ReadonlySet<string>,
): { id: string; categoryId: string; confidence: number; isSharedTopup: boolean }[] => {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const parsed: { id: string; categoryId: string; confidence: number; isSharedTopup: boolean }[] = [];

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : null;
    const categoryId = typeof row.categoryId === 'string' && categoryIds.has(row.categoryId) ? row.categoryId : null;
    if (!id || !categoryId) continue;

    parsed.push({
      id,
      categoryId,
      confidence:
        typeof row.confidence === 'number' && Number.isFinite(row.confidence)
          ? clampConfidence(row.confidence)
          : 0,
      isSharedTopup: Boolean(row.isSharedTopup),
    });
  }

  return parsed;
};

const remoteSuggestCategory = async ({
  context,
  candidates,
  rankedCandidates,
  normalizedMerchant,
}: {
  context: MerchantSuggestionContext;
  candidates: readonly SuggestCategoryCandidate[];
  rankedCandidates: readonly RankedMerchantCategoryCandidate[];
  normalizedMerchant: string;
}): Promise<{ categoryId: string; confidence: number; isSharedTopup: boolean } | null> => {
  const headers = await buildFunctionHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(`${supabaseFunctionsUrl}/suggest-category`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: context.kind,
        name: context.name,
        comment: context.comment ?? null,
        rawText: context.rawText ?? context.name,
        message: context.message ?? null,
        transactionType: context.transactionType ?? null,
        sender: context.sender ?? null,
        receiver: context.receiver ?? null,
        bankCategory: context.bankCategory ?? null,
        normalizedMerchant,
        candidates,
        deterministicCandidates: rankedCandidates,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      reportDevError(
        'suggest-category.remote.response',
        new Error(`Edge function request failed with ${response.status}.`),
        { responseText: responseText.slice(0, 300) },
      );
      return null;
    }

    const data = (await response.json()) as SuggestFunctionResponse;
    if (!data?.categoryId) return null;
    const confidence = clampConfidence(data.confidence ?? 0);
    if (confidence < 0.92) return null;
    return {
      categoryId: data.categoryId,
      confidence,
      isSharedTopup: Boolean(data.isSharedTopup),
    };
  } catch (error) {
    reportDevError('suggest-category.remote.unexpected', error);
    return null;
  }
};

const batchRemoteSuggestCategories = async ({
  rows,
  candidates,
}: {
  rows: (ImportCategorySuggestionRow & {
    normalizedMerchant: string;
    rankedCandidates: RankedMerchantCategoryCandidate[];
  })[];
  candidates: readonly SuggestCategoryCandidate[];
}): Promise<{ id: string; categoryId: string; confidence: number; isSharedTopup: boolean }[] | null> => {
  if (rows.length === 0) return [];

  const headers = await buildFunctionHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(`${supabaseFunctionsUrl}/suggest-category`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rows: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          comment: row.comment ?? null,
          rawText: row.rawText ?? row.name,
          message: row.message ?? null,
          transactionType: row.transactionType ?? null,
          sender: row.sender ?? null,
          receiver: row.receiver ?? null,
          bankCategory: row.bankCategory ?? null,
          normalizedMerchant: row.normalizedMerchant,
          deterministicCandidates: row.rankedCandidates,
        })),
        candidates,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      reportDevError(
        'suggest-category.batch.response',
        new Error(`Batched category request failed with ${response.status}.`),
        { responseText: responseText.slice(0, 300), rowCount: rows.length },
      );
      return null;
    }

    const payload = (await response.json()) as BatchSuggestFunctionResponse;
    return parseBatchSuggestResults(payload, validCategoryIds(candidates)).filter(
      (row) => row.confidence >= 0.92,
    );
  } catch (error) {
    reportDevError('suggest-category.batch.unexpected', error, { rowCount: rows.length });
    return null;
  }
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
  candidates: SuggestCategoryCandidate[],
  options?: {
    kind?: TransactionKind;
    preferRemote?: boolean;
    rawText?: string | null;
    message?: string | null;
    transactionType?: string | null;
    sender?: string | null;
    receiver?: string | null;
    bankCategory?: string | null;
  },
): Promise<SuggestedCategoryResult | null> => {
  const context: MerchantSuggestionContext = {
    kind: options?.kind ?? 'expense',
    name,
    comment,
    rawText: options?.rawText ?? name,
    message: options?.message ?? null,
    transactionType: options?.transactionType ?? null,
    sender: options?.sender ?? null,
    receiver: options?.receiver ?? null,
    bankCategory: options?.bankCategory ?? null,
  };

  const { suggestion, rankedCandidates, normalizedMerchant } = await buildDeterministicResolution({
    context,
    candidates,
  });
  if (suggestion) return suggestion;

  const remote = await remoteSuggestCategory({
    context,
    candidates,
    rankedCandidates,
    normalizedMerchant,
  });
  if (!remote) return null;

  return {
    categoryId: remote.categoryId,
    confidence: remote.confidence,
    source: 'ai',
    normalizedMerchant,
    canonicalMerchant: rankedCandidates[0]?.canonicalMerchant ?? normalizedMerchant,
    isSharedTopup: remote.isSharedTopup,
  };
};

export const resolveBatchCategoryResults = async ({
  rows,
  candidates,
}: {
  rows: ImportCategorySuggestionRow[];
  candidates: SuggestCategoryCandidate[];
}): Promise<BatchSuggestedCategoryResult[]> => {
  if (rows.length === 0 || candidates.length === 0) return [];

  const results: BatchSuggestedCategoryResult[] = [];

  const people = await fetchTransferPeople();
  const normalizedPeople = people.map((person) => person.normalized_name);

  const needsRanking: { id: string; context: MerchantSuggestionContext; normalizedMerchant: string }[] = [];

  for (const row of rows) {
    const context: MerchantSuggestionContext = {
      kind: row.kind,
      name: row.name,
      comment: row.comment ?? null,
      rawText: row.rawText ?? row.name,
      message: row.message ?? null,
      transactionType: row.transactionType ?? null,
      sender: row.sender ?? null,
      receiver: row.receiver ?? null,
      bankCategory: row.bankCategory ?? null,
    };

    const normalizedMerchant = normalizeMerchantContext(context);
    if (!normalizedMerchant) continue;

    const curated = resolveCuratedCategoryCandidate({ context, candidates });
    if (curated) {
      results.push({ id: row.id, ...curated });
      continue;
    }

    const transferPerson = resolveTransferPersonCandidate({
      context,
      candidates,
      normalizedPeople,
    });
    if (transferPerson) {
      results.push({ id: row.id, ...transferPerson });
      continue;
    }

    needsRanking.push({ id: row.id, context, normalizedMerchant });
  }

  const batchRanked = await rankMerchantCandidatesBatch(needsRanking);

  const unresolved: (ImportCategorySuggestionRow & {
    normalizedMerchant: string;
    rankedCandidates: RankedMerchantCategoryCandidate[];
  })[] = [];

  for (const input of needsRanking) {
    const rankedCandidates = batchRanked.get(input.id) ?? [];
    const deterministic = pickDeterministicRankedCandidate(rankedCandidates);

    if (deterministic) {
      results.push({
        id: input.id,
        categoryId: deterministic.categoryId,
        confidence: deterministic.confidence,
        source: deterministic.source,
        normalizedMerchant: deterministic.normalizedMerchant,
        canonicalMerchant: deterministic.canonicalMerchant,
        isSharedTopup: deterministic.isSharedTopup,
      });
      continue;
    }

    const row = rows.find((r) => r.id === input.id);
    if (row) {
      unresolved.push({
        ...row,
        normalizedMerchant: input.normalizedMerchant,
        rankedCandidates,
      });
    }
  }

  if (unresolved.length === 0) return results;

  const aiResults = await batchRemoteSuggestCategories({
    rows: unresolved,
    candidates,
  });
  if (!aiResults) return results;

  const aiById = new Map(aiResults.map((result) => [result.id, result]));
  for (const row of unresolved) {
    const ai = aiById.get(row.id);
    if (!ai) continue;

    results.push({
      id: row.id,
      categoryId: ai.categoryId,
      confidence: ai.confidence,
      source: 'ai',
      normalizedMerchant: row.normalizedMerchant,
      canonicalMerchant: row.rankedCandidates[0]?.canonicalMerchant ?? row.normalizedMerchant,
      isSharedTopup: ai.isSharedTopup,
    });
  }

  return results;
};

export const fetchMerchantRules = async (): Promise<MerchantRuleRow[]> => {
  const { data, error } = await supabase
    .from('merchant_category_rules')
    .select(
      'id, user_id, match_target, match_type, pattern, kind, canonical_merchant, category_id, is_shared_topup, is_blocked, priority, source, notes, updated_at',
    )
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    reportDevError('merchant-rules.fetch', error);
    return [];
  }

  return (data ?? []) as MerchantRuleRow[];
};

export const upsertMerchantRule = async ({
  kind,
  pattern,
  categoryId,
  canonicalMerchant,
  isBlocked,
  isSharedTopup,
  notes,
  priority = 300,
}: {
  kind: TransactionKind;
  pattern: string;
  categoryId: string | null;
  canonicalMerchant?: string | null;
  isBlocked: boolean;
  isSharedTopup: boolean;
  notes?: string | null;
  priority?: number;
}): Promise<boolean> => {
  const userId = await currentUserId();
  if (!userId) {
    reportDevError('merchant-rules.get-user', new Error('Could not resolve current user for rule update.'));
    return false;
  }

  const normalizedPattern = pattern.trim();
  if (normalizedPattern.length < 2) return false;

  const { error } = await supabase.from('merchant_category_rules').upsert(
    {
      user_id: userId,
      kind,
      match_target: 'normalized_merchant',
      match_type: 'exact',
      pattern: normalizedPattern,
      canonical_merchant: canonicalMerchant ?? normalizedPattern,
      category_id: isBlocked ? null : categoryId,
      is_shared_topup: isSharedTopup,
      is_blocked: isBlocked,
      priority,
      source: 'manual',
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind,match_target,match_type,pattern' },
  );
  if (error) {
    reportDevError('merchant-rules.upsert', error, { normalizedPattern, categoryId, isBlocked });
    return false;
  }
  return true;
};

export const deleteMerchantRule = async (ruleId: string): Promise<boolean> => {
  const { error } = await supabase.from('merchant_category_rules').delete().eq('id', ruleId);
  if (error) {
    reportDevError('merchant-rules.delete', error, { ruleId });
    return false;
  }
  return true;
};

export const saveMerchantMemoryObservation = async ({
  context,
  categoryId,
  isSharedTopup,
  occurredOn,
}: {
  context: MerchantSuggestionContext;
  categoryId: string;
  isSharedTopup: boolean;
  occurredOn: string;
}): Promise<void> => {
  const userId = await currentUserId();
  if (!userId) return;

  const normalizedMerchant = normalizeMerchantContext(context);
  if (normalizedMerchant.length < 2) return;

  const { data: existing, error: existingError }: { data: MerchantMemoryRow | null; error: unknown } = await supabase
    .from('merchant_category_memory')
    .select(
      'id, category_id, observation_count, support_ratio, canonical_merchant, sample_names, is_shared_topup',
    )
    .eq('kind', context.kind)
    .eq('normalized_merchant', normalizedMerchant)
    .maybeSingle();

  if (existingError) {
    reportDevError('merchant-memory.fetch', existingError, { normalizedMerchant, kind: context.kind });
    return;
  }

  const sampleNames = Array.from(
    new Set<string>([
      context.rawText ?? context.name,
      ...(Array.isArray(existing?.sample_names)
        ? existing.sample_names.filter((value): value is string => typeof value === 'string')
        : []),
    ]),
  )
    .filter((value) => value.trim().length > 0)
    .slice(0, 4);

  if (!existing) {
    const { error } = await supabase.from('merchant_category_memory').insert({
      user_id: userId,
      kind: context.kind,
      normalized_merchant: normalizedMerchant,
      canonical_merchant: normalizedMerchant,
      category_id: categoryId,
      is_shared_topup: isSharedTopup,
      observation_count: 1,
      support_ratio: 1,
      sample_names: sampleNames,
      last_seen_on: occurredOn,
      source: 'app',
    });
    if (error) {
      reportDevError('merchant-memory.insert', error, { normalizedMerchant, kind: context.kind });
    }
    return;
  }

  if (existing.category_id !== categoryId) {
    return;
  }

  const nextObservationCount = (existing.observation_count ?? 0) + 1;
  const priorSupportCount = Math.max(
    1,
    Math.round((toFiniteNumber(existing.support_ratio) ?? 1) * Math.max(existing.observation_count ?? 1, 1)),
  );
  const nextSupportRatio = clampConfidence((priorSupportCount + 1) / nextObservationCount);

  const { error } = await supabase
    .from('merchant_category_memory')
    .update({
      observation_count: nextObservationCount,
      support_ratio: nextSupportRatio,
      sample_names: sampleNames,
      last_seen_on: occurredOn,
      is_shared_topup: isSharedTopup || Boolean(existing.is_shared_topup),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (error) {
    reportDevError('merchant-memory.update', error, { normalizedMerchant, kind: context.kind });
  }
};

export { formatMerchantCategorySource };

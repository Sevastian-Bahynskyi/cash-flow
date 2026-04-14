import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  applyCategoryOverrides,
  buildCategoryMeta,
  getCategoryMetaDisplayColor,
} from '@/features/categories/helpers';
import type { CategoryOverrideRow, CategoryRow } from '@/features/categories/types';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import type { TransactionDraft, TransactionRow } from '@/features/transactions/types';
import { runDetached } from '@/lib/async';
import { getErrorMessage, reportDevError } from '@/lib/errors';
import { formatDateLabel, formatMinor } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MotionScope } from '@/ui/MotionScope';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';

const PAGE_SIZE = 20;
const DELETE_CHUNK_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 250;
const DEBUG_BUILD_TAG = 'personal-history-v2-2026-04-13';
const TRANSACTION_SELECT =
  'id, user_id, kind, amount_minor, occurred_on, name, comment, category_id, country_iso, recurring, shared, shared_participant, is_shared_topup, is_salary, currency_code, original_amount_minor, converted_amount_minor, fx_rate, created_at, updated_at';

type HistoryItem = {
  row: TransactionRow;
  categoryLabel: string;
  categoryColor: string;
  categoryIcon: string;
};

type HistorySection = {
  title: string;
  data: HistoryItem[];
};

type HistoryFilters = {
  startOn: string | null;
  endOnExclusive: string | null;
  kind: 'income' | 'expense' | null;
  parentLabel: string | null;
  sharedOnly: boolean;
  includeShared: boolean;
};

const EMPTY_IDS: readonly string[] = [];

const pushHistoryDebug = (payload: Record<string, unknown>): void => {
  fetch('http://127.0.0.1:7401/ingest/3868ff3d-2d0f-4946-999c-a38c9c4e1bb0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '41e759' },
    body: JSON.stringify({
      sessionId: '41e759',
      runId: 'personal-history-load-debug',
      ...payload,
      timestamp: Date.now(),
    }),
  }).catch(() => { });
};

const applySharedScopeFilter = <T,>(queryBuilder: T, filters: HistoryFilters): T => {
  const query = queryBuilder as unknown as {
    eq: (col: string, value: boolean) => T;
    or: (filter: string) => T;
  };

  if (filters.sharedOnly) {
    return query.or('shared.eq.true,is_shared_topup.eq.true');
  }

  if (filters.includeShared) {
    return queryBuilder;
  }

  return query.eq('shared', false);
};

const pad2 = (value: string): string => value.padStart(2, '0');

const escapePostgrestValue = (value: string): string =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');

const buildSearchTerms = (query: string): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalizedDots = trimmed.replace(/\//g, '.');
  const terms = new Set<string>([trimmed]);

  const ddMmYyyyMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(normalizedDots);
  if (ddMmYyyyMatch) {
    const day = ddMmYyyyMatch[1] ?? '';
    const month = ddMmYyyyMatch[2] ?? '';
    const year = ddMmYyyyMatch[3] ?? '';
    const resolvedYear = year.length === 2 ? `20${year}` : year;
    terms.add(`${resolvedYear}-${pad2(month)}-${pad2(day)}`);
  }

  const yyyyMmDdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (yyyyMmDdMatch) {
    const year = yyyyMmDdMatch[1] ?? '';
    const month = yyyyMmDdMatch[2] ?? '';
    const day = yyyyMmDdMatch[3] ?? '';
    terms.add(`${year}-${pad2(month)}-${pad2(day)}`);
  }

  const ddMmMatch = /^(\d{1,2})\.(\d{1,2})$/.exec(normalizedDots);
  if (ddMmMatch) {
    const day = ddMmMatch[1] ?? '';
    const month = ddMmMatch[2] ?? '';
    terms.add(`-${pad2(month)}-${pad2(day)}`);
  }

  const mmYyyyMatch = /^(\d{1,2})\.(\d{4})$/.exec(normalizedDots);
  if (mmYyyyMatch) {
    const month = mmYyyyMatch[1] ?? '';
    const year = mmYyyyMatch[2] ?? '';
    terms.add(`${year}-${pad2(month)}`);
  }

  if (/^\d{4}$/.test(trimmed)) {
    terms.add(`${trimmed}-`);
  }

  return [...terms];
};

const buildTransactionSearchFilter = (
  query: string,
  matchedCategoryIds: readonly string[] = [],
): string | null => {
  const terms = buildSearchTerms(query);
  if (terms.length === 0 && matchedCategoryIds.length === 0) return null;

  const clauses: string[] = [];

  if (matchedCategoryIds.length > 0) {
    const ids = matchedCategoryIds
      .filter((value) => /^[0-9a-fA-F-]{36}$/.test(value))
      .slice(0, 25)
      .join(',');
    if (ids.length > 0) clauses.push(`category_id.in.(${ids})`);
  }

  for (const term of terms) {
    const escaped = escapePostgrestValue(term);
    clauses.push(`name.ilike.%${escaped}%`, `comment.ilike.%${escaped}%`);

    if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
      clauses.push(`occurred_on.eq.${term}`);
      continue;
    }

    const yearPrefix = /^(\d{4})-$/.exec(term);
    if (yearPrefix) {
      const year = yearPrefix[1] ?? '';
      const nextYear = String(Number(year) + 1);
      clauses.push(`occurred_on.gte.${year}-01-01`, `occurred_on.lt.${nextYear}-01-01`);
      continue;
    }

    const yearMonth = /^(\d{4})-(\d{2})$/.exec(term);
    if (yearMonth) {
      const year = yearMonth[1] ?? '';
      const month = yearMonth[2] ?? '';
      const monthNumber = Number(month);
      if (Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
        const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
        const nextMonthYear = monthNumber === 12 ? String(Number(year) + 1) : year;
        const nextMonth = String(nextMonthNumber).padStart(2, '0');
        clauses.push(`occurred_on.gte.${year}-${month}-01`, `occurred_on.lt.${nextMonthYear}-${nextMonth}-01`);
      }
    }
  }

  const filter = clauses.join(',');

  // #region agent log
  fetch('http://127.0.0.1:7401/ingest/3868ff3d-2d0f-4946-999c-a38c9c4e1bb0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '41e759' },
    body: JSON.stringify({
      sessionId: '41e759',
      runId: 'post-fix-candidate',
      hypothesisId: 'H1',
      location: 'PersonalHistoryScreen.tsx:buildTransactionSearchFilter',
      message: 'Built search filter with date-safe clauses',
      data: {
        query,
        termsCount: terms.length,
        clausesCount: clauses.length,
        hasOccurredOnEq: filter.includes('occurred_on.eq.'),
        hasOccurredOnGte: filter.includes('occurred_on.gte.'),
        hasOccurredOnLt: filter.includes('occurred_on.lt.'),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => { });
  // #endregion

  return filter;
};

const toDuplicateDraft = (row: TransactionRow): TransactionDraft => ({
  kind: row.kind,
  amount_minor: row.converted_amount_minor,
  original_amount_minor: row.original_amount_minor,
  currency_code: row.currency_code,
  category_id: row.category_id,
  name: row.name,
  comment: row.comment,
  occurred_on: row.occurred_on,
  recurring: row.recurring,
  shared: row.shared,
  shared_participant: row.shared_participant,
  is_salary: row.is_salary,
  is_shared_topup: row.is_shared_topup,
  country_iso: row.country_iso,
});

const displayAmountForRow = (row: TransactionRow): string =>
  row.currency_code !== 'DKK' && row.original_amount_minor > 0
    ? `${formatMinor(row.converted_amount_minor, 'DKK')} · ${formatMinor(row.original_amount_minor, row.currency_code)}`
    : formatMinor(row.amount_minor, 'DKK');

const mergeUniqueTransactions = (
  current: readonly TransactionRow[],
  incoming: readonly TransactionRow[],
): TransactionRow[] => {
  if (incoming.length === 0) return [...current];
  const seen = new Set(current.map((row) => row.id));
  const next = [...current];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    next.push(row);
  }
  return next;
};

const loadCategories = async (): Promise<CategoryRow[]> => {
  const [categoriesRes, overridesRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, user_id, parent_id, name, level, is_system, icon, color')
      .order('level', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('category_overrides')
      .select('id, user_id, category_id, name, icon, updated_at'),
  ]);

  if (categoriesRes.error) throw categoriesRes.error;
  if (overridesRes.error) throw overridesRes.error;

  return applyCategoryOverrides(
    (categoriesRes.data ?? []) as CategoryRow[],
    (overridesRes.data ?? []) as CategoryOverrideRow[],
  );
};

const applySearchFilter = <T,>(
  queryBuilder: T,
  searchQuery: string,
  matchedCategoryIds: readonly string[],
): T => {
  const searchFilter = buildTransactionSearchFilter(searchQuery, matchedCategoryIds);
  if (!searchFilter) return queryBuilder;

  return (queryBuilder as { or: (filter: string) => T }).or(searchFilter);
};

const applyBaseFilters = <T,>(queryBuilder: T, filters: HistoryFilters): T => {
  let query = queryBuilder as unknown as {
    gte: (col: string, value: string) => typeof queryBuilder;
    lt: (col: string, value: string) => typeof queryBuilder;
    eq: (col: string, value: string) => typeof queryBuilder;
  };

  if (filters.startOn) query = query.gte('occurred_on', filters.startOn) as unknown as typeof query;
  if (filters.endOnExclusive) query = query.lt('occurred_on', filters.endOnExclusive) as unknown as typeof query;
  if (filters.kind) query = query.eq('kind', filters.kind) as unknown as typeof query;

  return query as unknown as T;
};

const loadTransactionPage = async (
  offset: number,
  searchQuery: string,
  matchedCategoryIds: readonly string[],
  filters: HistoryFilters,
): Promise<TransactionRow[]> => {
  const startedAt = Date.now();
  let query = supabase
    .from('transactions')
    .select(TRANSACTION_SELECT);

  query = applySharedScopeFilter(query, filters);

  query = applyBaseFilters(query, filters);
  query = applySearchFilter(query, searchQuery, matchedCategoryIds);

  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    // #region agent log
    fetch('http://127.0.0.1:7401/ingest/3868ff3d-2d0f-4946-999c-a38c9c4e1bb0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '41e759' },
      body: JSON.stringify({
        sessionId: '41e759',
        runId: 'post-fix-candidate',
        hypothesisId: 'H1',
        location: 'PersonalHistoryScreen.tsx:loadTransactionPage:error',
        message: 'Transaction page query failed',
        data: {
          offset,
          searchQuery,
          code: (error as { code?: string }).code ?? null,
          message: (error as { message?: string }).message ?? null,
          elapsedMs: Date.now() - startedAt,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => { });
    // #endregion
    throw error;
  }

  // #region agent log
  fetch('http://127.0.0.1:7401/ingest/3868ff3d-2d0f-4946-999c-a38c9c4e1bb0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '41e759' },
    body: JSON.stringify({
      sessionId: '41e759',
      runId: 'post-fix-candidate',
      hypothesisId: 'H3',
      location: 'PersonalHistoryScreen.tsx:loadTransactionPage:success',
      message: 'Transaction page query succeeded',
      data: {
        offset,
        searchQueryLength: searchQuery.length,
        rows: (data ?? []).length,
        elapsedMs: Date.now() - startedAt,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => { });
  // #endregion

  return (data ?? []) as TransactionRow[];
};

const loadMatchingTransactionIds = async (
  searchQuery: string,
  matchedCategoryIds: readonly string[],
  filters: HistoryFilters,
): Promise<string[]> => {
  let query = supabase
    .from('transactions')
    .select('id');

  query = applySharedScopeFilter(query, filters);

  query = applyBaseFilters(query, filters);
  query = applySearchFilter(query, searchQuery, matchedCategoryIds);

  const { data, error } = await query
    .order('occurred_on', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
};

const deleteTransactionIds = async (ids: readonly string[]): Promise<void> => {
  for (let index = 0; index < ids.length; index += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + DELETE_CHUNK_SIZE);
    const { error } = await supabase.from('transactions').delete().in('id', chunk);
    if (error) throw error;
  }
};

function PersonalHistorySkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.skeletonSection}>
          <SkeletonBlock width={110} height={12} radius={radius.sm} />
          <View style={styles.skeletonList}>
            {[0, 1].map((row) => (
              <SkeletonCard key={`${section}-${row}`} padding={spacing.md}>
                <View style={styles.skeletonRow}>
                  <SkeletonBlock width={42} height={42} radius={radius.md} />
                  <View style={styles.skeletonCopy}>
                    <SkeletonBlock width={row === 0 ? '54%' : '62%'} height={16} />
                    <SkeletonBlock width="38%" height={12} radius={radius.sm} />
                  </View>
                  <SkeletonBlock width={72} height={16} />
                </View>
              </SkeletonCard>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const PersonalHistoryRow = memo(function PersonalHistoryRow({
  item,
  onEdit,
  onDuplicate,
  onDelete,
  selectionMode,
  selected,
  onToggleSelect,
}: {
  item: HistoryItem;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (row: TransactionRow) => void;
}) {
  const { row } = item;
  const isNeutralSharedTopup = row.is_shared_topup;

  const openActions = (): void => {
    if (selectionMode) {
      onToggleSelect(row);
      return;
    }

    Alert.alert(row.name, undefined, [
      { text: 'Edit', onPress: () => onEdit(row) },
      { text: 'Duplicate', onPress: () => onDuplicate(row) },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        row.kind === 'income' && styles.rowIncomeOutline,
        selectionMode && styles.rowSelectable,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      onPress={() => {
        if (selectionMode) {
          onToggleSelect(row);
          return;
        }
        onEdit(row);
      }}
      onLongPress={openActions}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${item.categoryColor}22` }]}>
        <CategoryIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text
            style={[
              styles.amount,
              isNeutralSharedTopup
                ? styles.amountNeutral
                : row.kind === 'income'
                  ? styles.amountIncome
                  : styles.amountExpense,
            ]}
          >
            {isNeutralSharedTopup ? '' : row.kind === 'income' ? '+' : '-'}
            {displayAmountForRow(row)}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {item.categoryLabel}
        </Text>
        {row.comment ? (
          <Text style={styles.comment} numberOfLines={1}>
            {row.comment}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {row.is_salary ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Salary</Text>
            </View>
          ) : null}
          {row.recurring ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Recurring</Text>
            </View>
          ) : null}
          {row.shared ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Shared expense</Text>
            </View>
          ) : null}
          {row.is_shared_topup ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                Shared top-up
                {row.shared_participant ? (
                  <Text style={row.shared_participant === 'gf' ? styles.chipTextGf : styles.chipTextMe}>
                    {` · ${row.shared_participant === 'gf' ? 'GF' : 'Me'}`}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {selectionMode ? (
        <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorActive]}>
          {selected ? <MaterialCommunityIcons name="check" size={14} color={colors.text} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
});

export default function PersonalHistoryScreen() {
  const composer = useComposer();
  const params = useLocalSearchParams<{
    startOn?: string;
    endOnExclusive?: string;
    kind?: string;
    parentLabel?: string;
    shared?: string;
    includeShared?: string;
  }>();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [motionRun, setMotionRun] = useState(0);
  const requestVersionRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const skipNextComposerRefreshRef = useRef(false);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7401/ingest/3868ff3d-2d0f-4946-999c-a38c9c4e1bb0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '41e759' },
      body: JSON.stringify({
        sessionId: '41e759',
        runId: 'post-fix-verify',
        hypothesisId: 'H6',
        location: 'PersonalHistoryScreen.tsx:mount',
        message: 'PersonalHistoryScreen mounted',
        data: { tag: DEBUG_BUILD_TAG },
        timestamp: Date.now(),
      }),
    }).catch(() => { });
    // #endregion
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  const categoryMeta = useMemo(() => buildCategoryMeta(categories), [categories]);
  const filters = useMemo<HistoryFilters>(() => {
    const startOn = typeof params.startOn === 'string' && params.startOn.trim() ? params.startOn.trim() : null;
    const endOnExclusive =
      typeof params.endOnExclusive === 'string' && params.endOnExclusive.trim()
        ? params.endOnExclusive.trim()
        : null;
    const kind =
      params.kind === 'income' || params.kind === 'expense' ? params.kind : null;
    const parentLabel =
      typeof params.parentLabel === 'string' && params.parentLabel.trim() ? params.parentLabel.trim() : null;
    const sharedOnly =
      params.shared === '1' ||
      params.shared === 'true';
    const includeShared =
      params.includeShared === '1' ||
      params.includeShared === 'true';
    return { startOn, endOnExclusive, kind, parentLabel, sharedOnly, includeShared };
  }, [params.endOnExclusive, params.includeShared, params.kind, params.parentLabel, params.shared, params.startOn]);
  const matchedCategoryIds = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q.length < 2) return EMPTY_IDS;

    // Avoid treating pure date queries as category queries.
    if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(q) || /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(q)) {
      return EMPTY_IDS;
    }

    const out: string[] = [];
    for (const row of categories) {
      const label = categoryMeta[row.id]?.label ?? row.name;
      if (label.toLowerCase().includes(q)) out.push(row.id);
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  }, [categories, categoryMeta, debouncedQuery]);
  const scopedCategoryIds = useMemo(() => {
    if (!filters.parentLabel) return matchedCategoryIds;
    const target = filters.parentLabel.trim().toLowerCase();
    const ids: string[] = [];
    for (const row of categories) {
      const meta = categoryMeta[row.id];
      const parentLabel = meta?.parentName?.trim() ? meta.parentName : meta?.name ?? row.name;
      if (parentLabel.trim().toLowerCase() === target) ids.push(row.id);
    }
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }, [categories, categoryMeta, filters.parentLabel, matchedCategoryIds]);
  const scopedCategoryIdsKey = useMemo(() => scopedCategoryIds.join(','), [scopedCategoryIds]);
  const stableScopedCategoryIds = useMemo<readonly string[]>(
    () => (scopedCategoryIdsKey.length > 0 ? scopedCategoryIdsKey.split(',') : EMPTY_IDS),
    [scopedCategoryIdsKey],
  );

  const reload = useCallback(
    async (showSkeleton = false): Promise<void> => {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      if (showSkeleton) setIsInitialLoading(true);
      setIsLoadingMore(false);
      setError(null);

      pushHistoryDebug({
        hypothesisId: 'reload-start',
        location: 'PersonalHistoryScreen.tsx:reload:start',
        message: 'Starting history reload',
        data: {
          requestVersion,
          showSkeleton,
          debouncedQuery,
          filters,
          scopedCategoryIds: stableScopedCategoryIds,
        },
      });

      try {
        const [nextCategories, firstPage] = await Promise.all([
          loadCategories(),
          loadTransactionPage(0, debouncedQuery, stableScopedCategoryIds, filters),
        ]);

        if (requestVersionRef.current !== requestVersion) return;

        setCategories(nextCategories);
        setTransactions(firstPage);
        setNextOffset(firstPage.length);
        setHasMore(firstPage.length === PAGE_SIZE);

        pushHistoryDebug({
          hypothesisId: 'reload-success',
          location: 'PersonalHistoryScreen.tsx:reload:success',
          message: 'History reload succeeded',
          data: {
            requestVersion,
            rows: firstPage.length,
            hasMore: firstPage.length === PAGE_SIZE,
          },
        });
      } catch (loadError) {
        if (requestVersionRef.current !== requestVersion) return;
        reportDevError('personal-history.reload', loadError, {
          searchQuery: debouncedQuery,
        });
        setError(getErrorMessage(loadError, 'Failed to load personal history.'));
        setTransactions([]);
        setNextOffset(0);
        setHasMore(false);

        pushHistoryDebug({
          hypothesisId: 'reload-error',
          location: 'PersonalHistoryScreen.tsx:reload:error',
          message: 'History reload failed',
          data: {
            requestVersion,
            error: getErrorMessage(loadError, 'Failed to load personal history.'),
          },
        });
      } finally {
        if (requestVersionRef.current === requestVersion) {
          setIsInitialLoading(false);

          pushHistoryDebug({
            hypothesisId: 'reload-final',
            location: 'PersonalHistoryScreen.tsx:reload:finally',
            message: 'History reload finalized',
            data: {
              requestVersion,
              showSkeleton,
              isLatest: true,
            },
          });
        }
      }
    },
    [debouncedQuery, filters, stableScopedCategoryIds],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (isInitialLoading || isLoadingMore || !hasMore) return;
    const requestVersion = requestVersionRef.current;
    const startOffset = nextOffset;
    setIsLoadingMore(true);

    pushHistoryDebug({
      hypothesisId: 'load-more-start',
      location: 'PersonalHistoryScreen.tsx:loadMore:start',
      message: 'Loading older history page',
      data: {
        requestVersion,
        startOffset,
        debouncedQuery,
        filters,
        scopedCategoryIds: stableScopedCategoryIds,
      },
    });

    try {
      const page = await loadTransactionPage(startOffset, debouncedQuery, stableScopedCategoryIds, filters);
      if (requestVersionRef.current !== requestVersion) return;

      setTransactions((current) => mergeUniqueTransactions(current, page));
      setNextOffset(startOffset + page.length);
      setHasMore(page.length === PAGE_SIZE);

      pushHistoryDebug({
        hypothesisId: 'load-more-success',
        location: 'PersonalHistoryScreen.tsx:loadMore:success',
        message: 'Older page loaded',
        data: {
          requestVersion,
          startOffset,
          pageRows: page.length,
          hasMore: page.length === PAGE_SIZE,
        },
      });
    } catch (loadError) {
      if (requestVersionRef.current !== requestVersion) return;
      reportDevError('personal-history.load-more', loadError, {
        offset: startOffset,
        searchQuery: debouncedQuery,
      });
      setError(getErrorMessage(loadError, 'Failed to load older transactions.'));

      pushHistoryDebug({
        hypothesisId: 'load-more-error',
        location: 'PersonalHistoryScreen.tsx:loadMore:error',
        message: 'Older page failed',
        data: {
          requestVersion,
          startOffset,
          error: getErrorMessage(loadError, 'Failed to load older transactions.'),
        },
      });
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setIsLoadingMore(false);
      }
    }
  }, [debouncedQuery, filters, hasMore, isInitialLoading, isLoadingMore, nextOffset, stableScopedCategoryIds]);

  useEffect(() => {
    runDetached(
      reload(!hasLoadedOnceRef.current),
      hasLoadedOnceRef.current ? 'personal-history.reload' : 'personal-history.initial-load',
    );
    hasLoadedOnceRef.current = true;
  }, [reload]);

  useEffect(() => {
    if (composer.refreshKey > 0) {
      if (skipNextComposerRefreshRef.current) {
        skipNextComposerRefreshRef.current = false;
        return;
      }
      runDetached(reload(false), 'personal-history.refresh');
    }
  }, [composer.refreshKey, reload]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    setIsSelectingAll(false);
  }, [debouncedQuery]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasQuery = debouncedQuery.length > 0;
  const isSearchPending = query.trim() !== debouncedQuery;
  const shouldShowSkeleton = isInitialLoading;

  const sections = useMemo<HistorySection[]>(() => {
    const grouped = new Map<string, HistoryItem[]>();
    for (const row of transactions) {
      const meta = row.category_id ? categoryMeta[row.category_id] : null;
      const parentOnlyLabel =
        meta?.parentName?.trim() ? meta.parentName : meta?.name?.trim() ? meta.name : null;
      const categoryLabel = row.category_id
        ? parentOnlyLabel ?? 'Uncategorized'
        : row.kind === 'income'
          ? 'Income'
          : 'Uncategorized';
      const categoryColor = row.category_id
        ? getCategoryMetaDisplayColor(categoryMeta[row.category_id], row.kind)
        : row.kind === 'income'
          ? colors.success
          : colors.accent;
      const categoryIcon = row.category_id
        ? categoryMeta[row.category_id]?.icon ?? 'cash'
        : row.kind === 'income'
          ? 'bank-outline'
          : 'cash';
      const current = grouped.get(row.occurred_on) ?? [];
      current.push({
        row,
        categoryLabel,
        categoryColor,
        categoryIcon,
      });
      grouped.set(row.occurred_on, current);
    }

    return [...grouped.entries()].map(([date, items]) => ({
      title: formatDateLabel(date),
      data: items,
    }));
  }, [categoryMeta, transactions]);

  const deleteTransaction = async (row: TransactionRow): Promise<void> => {
    await Haptics.selectionAsync();
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', row.id);
    if (deleteError) throw deleteError;

    setTransactions((current) => current.filter((item) => item.id !== row.id));
    setSelectedIds((current) => current.filter((id) => id !== row.id));
    setNextOffset((current) => Math.max(0, current - 1));
    skipNextComposerRefreshRef.current = true;
    composer.bumpRefresh();
  };

  const deleteSelectedTransactions = async (): Promise<void> => {
    if (selectedIds.length === 0) return;

    await Haptics.selectionAsync();
    await deleteTransactionIds(selectedIds);

    const loadedIds = new Set(transactions.map((row) => row.id));
    const hasUnknownSelections = selectedIds.some((id) => !loadedIds.has(id));

    if (!hasUnknownSelections) {
      const selectedSet = new Set(selectedIds);
      setTransactions((current) => current.filter((row) => !selectedSet.has(row.id)));
      setNextOffset((current) => Math.max(0, current - selectedSet.size));
    } else {
      await reload(false);
    }

    setSelectionMode(false);
    setSelectedIds([]);
    skipNextComposerRefreshRef.current = true;
    composer.bumpRefresh();
  };

  const onRefresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await reload(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSelectRow = (row: TransactionRow): void => {
    runDetached(Haptics.selectionAsync(), 'personal-history.toggle-select.haptics');
    setSelectedIds((current) =>
      current.includes(row.id)
        ? current.filter((id) => id !== row.id)
        : [...current, row.id],
    );
  };

  const selectAllMatching = async (): Promise<void> => {
    setIsSelectingAll(true);
    try {
      const ids = await loadMatchingTransactionIds(debouncedQuery, stableScopedCategoryIds, filters);
      setSelectedIds(ids);
    } catch (selectAllError) {
      reportDevError('personal-history.select-all', selectAllError, {
        searchQuery: debouncedQuery,
      });
      setError(getErrorMessage(selectAllError, 'Failed to select matching transactions.'));
    } finally {
      setIsSelectingAll(false);
    }
  };

  const confirmDeleteSelected = (): void => {
    if (selectedIds.length === 0) return;

    Alert.alert(
      `Delete ${selectedIds.length} transaction${selectedIds.length === 1 ? '' : 's'}?`,
      hasQuery
        ? 'This will permanently delete the selected matching transactions.'
        : 'This will permanently delete the selected transactions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            runDetached(deleteSelectedTransactions(), 'personal-history.delete-selected');
          },
        },
      ],
    );
  };

  const footer = isLoadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.textMuted} />
      <Text style={styles.footerText}>Loading older transactions...</Text>
    </View>
  ) : hasMore && transactions.length > 0 ? (
    <Pressable
      style={({ pressed }) => [styles.footerButton, pressed && styles.footerButtonPressed]}
      onPress={() => runDetached(loadMore(), 'personal-history.load-more.tap')}
    >
      <Text style={styles.footerButtonText}>Load older transactions</Text>
    </Pressable>
  ) : transactions.length > 0 ? (
    <View style={styles.footer}>
      <Text style={styles.footerText}>No older transactions to load.</Text>
    </View>
  ) : null;

  return (
    <MotionScope value={motionRun}>
      <View style={styles.container}>
        <ScreenHeader
          title={filters.sharedOnly ? 'Shared history' : 'Personal history'}
          subtitle={filters.sharedOnly ? 'Full shared transaction timeline' : 'Full personal transaction timeline'}
          back
          actions={
            transactions.length > 0 || selectionMode
              ? [
                {
                  icon: selectionMode ? 'close' : 'checkbox-multiple-blank-outline',
                  onPress: () => {
                    runDetached(Haptics.selectionAsync(), 'personal-history.toggle-selection-mode.haptics');
                    setSelectionMode((current) => {
                      const next = !current;
                      if (!next) setSelectedIds([]);
                      return next;
                    });
                  },
                  tone: selectionMode ? 'accent' : 'default',
                },
              ]
              : undefined
          }
        />

        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by date, name or notes"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {isSearchPending ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          {!isSearchPending && query.trim().length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {selectionMode ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionLabel}>
              {selectedIds.length} selected
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.selectionButton,
                  (isSelectingAll || isInitialLoading) && styles.selectionButtonDisabled,
                  pressed && !isSelectingAll && !isInitialLoading && styles.selectionButtonPressed,
                ]}
                onPress={() => runDetached(selectAllMatching(), 'personal-history.select-all')}
                disabled={isSelectingAll || isInitialLoading}
              >
                {isSelectingAll ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={styles.selectionButtonText}>Select all</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.selectionButton,
                  selectedIds.length === 0 && styles.selectionButtonDisabled,
                  pressed && selectedIds.length > 0 && styles.selectionButtonPressed,
                ]}
                onPress={confirmDeleteSelected}
                disabled={selectedIds.length === 0}
              >
                <Text style={[styles.selectionButtonText, styles.selectionButtonTextDanger]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not refresh personal history</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {shouldShowSkeleton ? (
          <PersonalHistorySkeleton />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.row.id}
            stickySectionHeadersEnabled
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
            contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <PersonalHistoryRow
                item={item}
                selectionMode={selectionMode}
                selected={selectedIdSet.has(item.row.id)}
                onToggleSelect={toggleSelectRow}
                onEdit={(row) => composer.openEdit(row)}
                onDuplicate={(row) => composer.openCreate(toDuplicateDraft(row))}
                onDelete={(row) => {
                  runDetached(deleteTransaction(row), 'personal-history.delete-transaction');
                }}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.itemGap} />}
            SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
            ListFooterComponent={footer}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  {hasQuery
                    ? 'No transactions match this search'
                    : filters.sharedOnly
                      ? 'No shared transactions yet'
                      : 'No personal transactions yet'}
                </Text>
                <Text style={styles.emptyText}>
                  {hasQuery
                    ? 'Try a broader date, name, or notes search.'
                    : filters.sharedOnly
                      ? 'Add a shared expense or top-up and your full shared history will show up here by date.'
                      : 'Add your first transaction and your full history will show up here by date.'}
                </Text>
              </View>
            }
            onEndReachedThreshold={0.45}
            onEndReached={() => {
              if (!hasMore || isLoadingMore) return;
              runDetached(loadMore(), 'personal-history.load-more.end');
            }}
          />
        )}
      </View>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 4 },
  emptyContainer: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 4 },
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: 0,
  },
  selectionBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectionLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectionButton: {
    minWidth: 86,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionButtonPressed: { opacity: 0.86 },
  selectionButtonDisabled: { opacity: 0.45 },
  selectionButtonText: { ...typography.label, color: colors.text, fontWeight: '600' },
  selectionButtonTextDanger: { color: colors.danger },
  errorCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(255,92,122,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.32)',
  },
  errorTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  errorText: { ...typography.body, color: colors.textMuted },
  skeletonWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  skeletonSection: { gap: spacing.sm },
  skeletonList: { gap: spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonCopy: { flex: 1, gap: spacing.xs },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  rowIncomeOutline: {
    borderWidth: 1,
    borderColor: colors.success,
  },
  rowSelectable: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  rowPressed: { opacity: 0.85 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  amount: { ...typography.body, color: colors.text },
  amountNeutral: { color: colors.textMuted, fontWeight: '600' },
  amountIncome: { color: colors.success, fontWeight: '700' },
  amountExpense: { color: colors.danger, fontWeight: '700' },
  meta: { ...typography.label, color: colors.textMuted },
  comment: { ...typography.body, color: colors.textMuted },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  selectionIndicator: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { ...typography.label, color: colors.textMuted },
  chipTextMe: { color: '#60A5FA', fontWeight: '600' },
  chipTextGf: { color: '#F472B6', fontWeight: '600' },
  sectionGap: { height: spacing.md },
  itemGap: { height: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyText: { ...typography.body, color: colors.textMuted },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerText: { ...typography.label, color: colors.textMuted },
  footerButton: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  footerButtonPressed: { opacity: 0.85 },
  footerButtonText: { ...typography.label, color: colors.text, fontWeight: '600' },
});

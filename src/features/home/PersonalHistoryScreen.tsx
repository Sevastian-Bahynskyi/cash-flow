import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import {
  applyCategoryOverrides,
  buildCategoryMeta,
  getCategoryMetaDisplayColor,
} from '@/features/categories/helpers';
import type { CategoryOption, CategoryOverrideRow, CategoryRow } from '@/features/categories/types';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import type { TransactionDraft, TransactionKind, TransactionRow } from '@/features/transactions/types';
import { runDetached } from '@/lib/async';
import { getErrorMessage, reportDevError } from '@/lib/errors';
import { formatDateLabel, formatMinor } from '@/lib/format';
import { buildSalaryCycles, findCycleFor, type SalaryTxn } from '@/lib/cycles';
import { supabase } from '@/lib/supabase';
import { MotionScope } from '@/ui/MotionScope';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { ErrorCard } from '@/ui/ErrorCard';
import { SelectionIndicator } from '@/ui/SelectionIndicator';
import { SearchField } from '@/ui/SearchField';
import { useMotionRefresh } from '@/ui/useMotionRefresh';
import { SharedParticipantChip } from '@/features/shared/SharedParticipantChip';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';

const PAGE_SIZE = 20;
const DELETE_CHUNK_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 250;
const WIDE_HISTORY_BREAKPOINT = 900;
const DEBUG_BUILD_TAG = 'personal-history-v2-2026-04-13';

type HistoryItem = {
  row: TransactionRow;
  categoryLabel: string;
  categoryColor: string;
  categoryIcon: string;
};

type FlatHistoryItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'row'; key: string; item: HistoryItem };

type HistoryFilters = {
  startOn: string | null;
  endOnExclusive: string | null;
  kind: 'income' | 'expense' | null;
  parentLabel: string | null;
  sharedOnly: boolean;
  includeShared: boolean;
};

const EMPTY_IDS: readonly string[] = [];

const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toIsoDate(parseIsoDate(value)) === value;
};

const parseScopedIdsFromParams = (
  categoryIdsParam?: string,
  categoryIdParam?: string,
): readonly string[] => {
  const fromList = typeof categoryIdsParam === 'string'
    ? categoryIdsParam
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    : [];
  if (fromList.length > 0) return [...new Set(fromList)].sort((a, b) => a.localeCompare(b));

  const single = typeof categoryIdParam === 'string' ? categoryIdParam.trim() : '';
  if (single.length === 0) return EMPTY_IDS;
  return [single];
};

const computeScopedIds = (
  cats: CategoryRow[],
  parentLabel: string | null,
  explicitScopedIds: readonly string[],
): readonly string[] => {
  if (explicitScopedIds.length > 0) {
    const validIds = new Set(cats.map((row) => row.id));
    return explicitScopedIds.filter((id) => validIds.has(id));
  }
  if (!parentLabel) return EMPTY_IDS;
  const meta = buildCategoryMeta(cats);
  const target = parentLabel.trim().toLowerCase();
  const ids: string[] = [];
  for (const row of cats) {
    const m = meta[row.id];
    const label = m?.parentName?.trim() ? m.parentName : m?.name ?? row.name;
    if (label.trim().toLowerCase() === target) ids.push(row.id);
  }
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
};

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

type SearchTransactionsRpcArgs = {
  p_query: string | null;
  p_kind: TransactionKind | null;
  p_start_on: string | null;
  p_end_on_exclusive: string | null;
  p_shared_only: boolean;
  p_include_shared: boolean;
  p_scoped_category_ids: string[] | null;
  p_limit: number;
  p_offset: number;
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

const getDisplayMinorAmount = (row: TransactionRow): number =>
  row.currency_code !== 'DKK' && row.original_amount_minor > 0
    ? row.converted_amount_minor
    : row.amount_minor;

const getPersonalNetMinorAmount = (row: TransactionRow): number => {
  const displayMinor = getDisplayMinorAmount(row);
  if (!row.shared && typeof row.personal_effect_minor === 'number') return row.personal_effect_minor;
  if (row.kind === 'income') return displayMinor;
  if (row.shared && !row.is_shared_topup) return 0;
  if (row.is_shared_topup && row.shared_participant === 'gf') return 0;
  return -displayMinor;
};

const buildPersonalExpenseMinorByTransactionId = (
  rows: readonly TransactionRow[],
): Map<string, number> => {
  const orderedRows = [...rows].sort((left, right) => {
    if (left.occurred_on !== right.occurred_on) return left.occurred_on.localeCompare(right.occurred_on);
    if (left.created_at !== right.created_at) return left.created_at.localeCompare(right.created_at);
    return left.id.localeCompare(right.id);
  });

  const out = new Map<string, number>();
  let meTopupBeforeMinor = 0;
  let gfTopupBeforeMinor = 0;

  for (const row of orderedRows) {
    if (row.kind !== 'expense') {
      out.set(row.id, 0);
      continue;
    }

    if (row.is_shared_topup) {
      out.set(row.id, row.shared_participant === 'gf' ? 0 : row.amount_minor);
    } else if (row.shared) {
      const denom = meTopupBeforeMinor + gfTopupBeforeMinor;
      const ratio = denom === 0 ? 0.5 : meTopupBeforeMinor / denom;
      out.set(row.id, Math.round(row.amount_minor * ratio));
    } else if (typeof row.personal_effect_minor === 'number') {
      out.set(row.id, Math.max(0, -row.personal_effect_minor));
    } else {
      out.set(row.id, row.amount_minor);
    }

    if (row.is_shared_topup) {
      if (row.shared_participant === 'gf') gfTopupBeforeMinor += row.amount_minor;
      else meTopupBeforeMinor += row.amount_minor;
    }
  }

  return out;
};

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

const loadSalaryTransactions = async (): Promise<SalaryTxn[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, occurred_on')
    .eq('is_salary', true)
    .order('occurred_on', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SalaryTxn[];
};

const buildSearchTransactionsRpcArgs = (
  searchQuery: string,
  offset: number,
  scopedCategoryIds: readonly string[],
  filters: HistoryFilters,
): SearchTransactionsRpcArgs => ({
  p_query: searchQuery.trim() ? searchQuery.trim() : null,
  p_kind: filters.kind,
  p_start_on: filters.startOn,
  p_end_on_exclusive: filters.endOnExclusive,
  p_shared_only: filters.sharedOnly,
  p_include_shared: filters.includeShared,
  p_scoped_category_ids: scopedCategoryIds.length > 0 ? [...scopedCategoryIds] : null,
  p_limit: PAGE_SIZE,
  p_offset: offset,
});

const loadTransactionPage = async (
  offset: number,
  searchQuery: string,
  scopedCategoryIds: readonly string[],
  filters: HistoryFilters,
): Promise<TransactionRow[]> => {
  const startedAt = Date.now();
  const rpcArgs = buildSearchTransactionsRpcArgs(searchQuery, offset, scopedCategoryIds, filters);
  const rpcResult = (await supabase.rpc('search_transactions_v1', rpcArgs)) as {
    data: unknown;
    error: unknown;
  };
  const error = rpcResult.error;
  const rows = Array.isArray(rpcResult.data) ? (rpcResult.data as TransactionRow[]) : [];

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
          rpcArgs,
          code: (error as { code?: string } | null)?.code ?? null,
          message: (error as { message?: string } | null)?.message ?? null,
          elapsedMs: Date.now() - startedAt,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => { });
    // #endregion
    throw error instanceof Error ? error : new Error(getErrorMessage(error, 'Transaction page query failed.'));
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
        rpcArgs,
        rows: rows.length,
        elapsedMs: Date.now() - startedAt,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => { });
  // #endregion

  return rows;
};

const loadFilteredNetTotalMinor = async (
  searchQuery: string,
  scopedCategoryIds: readonly string[],
  filters: HistoryFilters,
): Promise<number> => {
  const loadAllPages = async (
    query: string,
    ids: readonly string[],
  ): Promise<TransactionRow[]> => {
    let pageOffset = 0;
    const rows: TransactionRow[] = [];
    for (; ;) {
      const page = await loadTransactionPage(pageOffset, query, ids, filters);
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      pageOffset += page.length;
    }
    return rows;
  };

  const matchedRows = await loadAllPages(searchQuery, scopedCategoryIds);
  if (matchedRows.length === 0) return 0;

  const hasSharedRows = matchedRows.some((row) => row.kind === 'expense' && (row.shared || row.is_shared_topup));
  if (!hasSharedRows) {
    return matchedRows.reduce((sum, row) => sum + getPersonalNetMinorAmount(row), 0);
  }

  // Shared ratio at transaction time depends on top-ups that may be outside current category/query scope.
  const contextRows = await loadAllPages('', EMPTY_IDS);
  const personalExpenseByTransactionId = buildPersonalExpenseMinorByTransactionId(contextRows);

  let totalMinor = 0;

  for (const row of matchedRows) {
    if (!row.shared && typeof row.personal_effect_minor === 'number') {
      totalMinor += row.personal_effect_minor;
      continue;
    }

    if (row.kind === 'income') {
      totalMinor += getDisplayMinorAmount(row);
      continue;
    }

    if (row.shared || row.is_shared_topup) {
      totalMinor -= personalExpenseByTransactionId.get(row.id) ?? 0;
      continue;
    }

    totalMinor -= getDisplayMinorAmount(row);
  }

  return totalMinor;
};

const deleteTransactionIds = async (ids: readonly string[]): Promise<void> => {
  for (let index = 0; index < ids.length; index += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + DELETE_CHUNK_SIZE);
    const { error } = await supabase.from('transactions').delete().in('id', chunk);
    if (error) throw error;
  }
};

type BulkTransactionUpdate = {
  occurred_on?: string;
  category_id?: string;
  shared?: boolean;
  shared_participant?: 'me' | null;
  is_shared_topup?: false;
};

const updateTransactionIds = async (
  ids: readonly string[],
  values: BulkTransactionUpdate,
): Promise<void> => {
  for (let index = 0; index < ids.length; index += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + DELETE_CHUNK_SIZE);
    const { error } = await supabase.from('transactions').update(values).in('id', chunk);
    if (error) throw error;
  }
};

type TransactionActionMeta = Pick<TransactionRow, 'id' | 'kind' | 'shared' | 'is_shared_topup'>;

const loadTransactionActionMeta = async (
  ids: readonly string[],
): Promise<TransactionActionMeta[]> => {
  const rows: TransactionActionMeta[] = [];
  for (let index = 0; index < ids.length; index += DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + DELETE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('transactions')
      .select('id, kind, shared, is_shared_topup')
      .in('id', chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as TransactionActionMeta[]));
  }
  return rows;
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
  onMove,
  selectionMode,
  selected,
  onToggleSelect,
  wide,
  salaryCycleLabel,
}: {
  item: HistoryItem;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
  onMove: (row: TransactionRow) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (row: TransactionRow) => void;
  wide: boolean;
  salaryCycleLabel: string;
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
      ...(!row.is_shared_topup
        ? [{ text: row.shared ? 'Move to personal' : 'Move to shared', onPress: () => onMove(row) }]
        : []),
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const rowContent = (
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
      {wide ? <Text style={styles.wideDate}>{row.occurred_on}</Text> : null}
      <View style={[styles.iconWrap, { backgroundColor: `${item.categoryColor}22` }]}>
        <CategoryIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          {!wide ? (
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
          ) : null}
        </View>
        {!wide ? <Text style={styles.meta} numberOfLines={1}>{item.categoryLabel}</Text> : null}
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
                  <SharedParticipantChip participant={row.shared_participant} />
                ) : null}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {wide ? (
        <>
          <Text style={styles.wideCategory} numberOfLines={1}>{item.categoryLabel}</Text>
          <Text
            style={[
              styles.amount,
              styles.wideAmount,
              isNeutralSharedTopup
                ? styles.amountNeutral
                : row.kind === 'income'
                  ? styles.amountIncome
                  : styles.amountExpense,
            ]}
            numberOfLines={1}
          >
            {isNeutralSharedTopup ? '' : row.kind === 'income' ? '+' : '-'}
            {displayAmountForRow(row)}
          </Text>
          <Text style={styles.wideScope}>{row.shared ? 'Shared' : 'Personal'}</Text>
          <Text style={styles.wideCycle} numberOfLines={1}>{salaryCycleLabel}</Text>
        </>
      ) : null}
      {selectionMode ? <SelectionIndicator active={selected} /> : null}
    </Pressable>
  );

  return (
    <Swipeable
      enabled={!selectionMode && !row.is_shared_topup}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          style={({ pressed }) => [styles.swipeMoveAction, pressed && styles.rowPressed]}
          onPress={() => onMove(row)}
        >
          <Text style={styles.swipeMoveText}>{row.shared ? 'Personal' : 'Shared'}</Text>
        </Pressable>
      )}
    >
      {rowContent}
    </Swipeable>
  );
});

export default function PersonalHistoryScreen() {
  const composer = useComposer();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_HISTORY_BREAKPOINT;
  const params = useLocalSearchParams<{
    startOn?: string;
    endOnExclusive?: string;
    kind?: string;
    parentLabel?: string;
    categoryId?: string;
    categoryIds?: string;
    shared?: string;
    includeShared?: string;
  }>();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [salaryTransactions, setSalaryTransactions] = useState<SalaryTxn[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [bulkCategoryPickerOpen, setBulkCategoryPickerOpen] = useState(false);
  const [bulkCategoryKind, setBulkCategoryKind] = useState<TransactionKind>('expense');
  const [bulkDatePickerOpen, setBulkDatePickerOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(toIsoDate(new Date()));
  const [bulkWebDate, setBulkWebDate] = useState(toIsoDate(new Date()));
  const [bulkWebDateError, setBulkWebDateError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filteredNetTotalMinor, setFilteredNetTotalMinor] = useState(0);
  const [isFilteredTotalLoading, setIsFilteredTotalLoading] = useState(false);
  const motionRun = useMotionRefresh();
  const requestVersionRef = useRef(0);
  const totalRequestVersionRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const skipNextComposerRefreshRef = useRef(false);
  const loadMoreInProgressRef = useRef(false);
  const nextOffsetRef = useRef(0);

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
  const salaryCycles = useMemo(() => buildSalaryCycles(salaryTransactions), [salaryTransactions]);
  const explicitScopedCategoryIds = useMemo(
    () => parseScopedIdsFromParams(params.categoryIds, params.categoryId),
    [params.categoryId, params.categoryIds],
  );
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
  const hardScopedCategoryIds = useMemo(() => {
    return computeScopedIds(categories, filters.parentLabel, explicitScopedCategoryIds);
  }, [categories, explicitScopedCategoryIds, filters.parentLabel]);

  const reload = useCallback(
    async (showSkeleton = false): Promise<void> => {
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      const isSearchReload = debouncedQuery.length > 0;
      if (showSkeleton || isSearchReload) setIsInitialLoading(true);
      setIsLoadingMore(false);
      setHasMore(false);
      nextOffsetRef.current = 0;
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
        },
      });

      try {
        const [nextCategories, nextSalaryTransactions] = await Promise.all([
          loadCategories(),
          loadSalaryTransactions(),
        ]);
        if (requestVersionRef.current !== requestVersion) return;

        const freshScopedIds = computeScopedIds(nextCategories, filters.parentLabel, explicitScopedCategoryIds);

        const firstPage = await loadTransactionPage(
          0,
          debouncedQuery,
          freshScopedIds,
          filters,
        );
        if (requestVersionRef.current !== requestVersion) return;

        const hasMoreRows = firstPage.length === PAGE_SIZE;

        setCategories(nextCategories);
        setSalaryTransactions(nextSalaryTransactions);
        setTransactions(firstPage);
        nextOffsetRef.current = firstPage.length;
        setHasMore(hasMoreRows);

        pushHistoryDebug({
          hypothesisId: 'reload-success',
          location: 'PersonalHistoryScreen.tsx:reload:success',
          message: 'History reload succeeded',
          data: {
            requestVersion,
            rows: firstPage.length,
            hasMore: hasMoreRows,
            isSearchReload,
          },
        });
      } catch (loadError) {
        if (requestVersionRef.current !== requestVersion) return;
        reportDevError('personal-history.reload', loadError, {
          searchQuery: debouncedQuery,
        });
        setError(getErrorMessage(loadError, 'Failed to load personal history.'));
        setTransactions([]);
        nextOffsetRef.current = 0;
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

    [debouncedQuery, explicitScopedCategoryIds, filters],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (isInitialLoading || loadMoreInProgressRef.current || !hasMore) return;
    loadMoreInProgressRef.current = true;
    const requestVersion = requestVersionRef.current;
    const startOffset = nextOffsetRef.current;
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
        hardScopedCategoryIds,
      },
    });

    try {
      const page = await loadTransactionPage(
        startOffset,
        debouncedQuery,
        hardScopedCategoryIds,
        filters,
      );
      if (requestVersionRef.current !== requestVersion) return;

      setTransactions((current) => mergeUniqueTransactions(current, page));
      nextOffsetRef.current = startOffset + page.length;
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
        loadMoreInProgressRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [
    debouncedQuery,
    filters,
    hardScopedCategoryIds,
    hasMore,
    isInitialLoading,
  ]);

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
    setBulkActionsOpen(false);
  }, [debouncedQuery]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasQuery = debouncedQuery.length > 0;
  const hasActiveFilter =
    hasQuery ||
    filters.startOn !== null ||
    filters.endOnExclusive !== null ||
    filters.kind !== null ||
    filters.parentLabel !== null ||
    filters.sharedOnly ||
    filters.includeShared;
  const isSearchPending = query.trim() !== debouncedQuery;
  const shouldShowSkeleton = isInitialLoading;

  useEffect(() => {
    if (!hasActiveFilter) {
      setIsFilteredTotalLoading(false);
      setFilteredNetTotalMinor(0);
      return;
    }

    if (isInitialLoading) {
      setIsFilteredTotalLoading(true);
      return;
    }

    const requestVersion = totalRequestVersionRef.current + 1;
    totalRequestVersionRef.current = requestVersion;
    setIsFilteredTotalLoading(true);

    runDetached(
      (async () => {
        try {
          const totalMinor = await loadFilteredNetTotalMinor(
            debouncedQuery,
            hardScopedCategoryIds,
            filters,
          );
          if (totalRequestVersionRef.current !== requestVersion) return;
          setFilteredNetTotalMinor(totalMinor);
        } catch (totalError) {
          if (totalRequestVersionRef.current !== requestVersion) return;
          reportDevError('personal-history.filtered-total', totalError, {
            searchQuery: debouncedQuery,
          });
          setFilteredNetTotalMinor(
            transactions.reduce((sum, row) => sum + getPersonalNetMinorAmount(row), 0),
          );
        } finally {
          if (totalRequestVersionRef.current === requestVersion) {
            setIsFilteredTotalLoading(false);
          }
        }
      })(),
      'personal-history.filtered-total',
    );
  }, [
    debouncedQuery,
    filters,
    hardScopedCategoryIds,
    hasActiveFilter,
    isInitialLoading,
    transactions,
  ]);

  const flatData = useMemo<FlatHistoryItem[]>(() => {
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
      current.push({ row, categoryLabel, categoryColor, categoryIcon });
      grouped.set(row.occurred_on, current);
    }

    const result: FlatHistoryItem[] = [];
    for (const [date, items] of grouped.entries()) {
      if (!wide) result.push({ type: 'header', key: `h-${date}`, title: formatDateLabel(date) });
      for (const item of items) {
        result.push({ type: 'row', key: item.row.id, item });
      }
    }
    return result;
  }, [categoryMeta, transactions, wide]);

  const deleteTransaction = async (row: TransactionRow): Promise<void> => {
    await Haptics.selectionAsync();
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', row.id);
    if (deleteError) throw deleteError;

    setTransactions((current) => current.filter((item) => item.id !== row.id));
    setSelectedIds((current) => current.filter((id) => id !== row.id));
    nextOffsetRef.current = Math.max(0, nextOffsetRef.current - 1);
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
      nextOffsetRef.current = Math.max(0, nextOffsetRef.current - selectedSet.size);
    } else {
      await reload(false);
    }

    setSelectionMode(false);
    setSelectedIds([]);
    skipNextComposerRefreshRef.current = true;
    composer.bumpRefresh();
  };

  const finishBulkUpdate = async (): Promise<void> => {
    await reload(false);
    setSelectionMode(false);
    setSelectedIds([]);
    skipNextComposerRefreshRef.current = true;
    composer.bumpRefresh();
  };

  const applyBulkUpdate = async (
    values: BulkTransactionUpdate,
    errorMessage: string,
  ): Promise<void> => {
    if (selectedIds.length === 0) return;
    setIsApplyingBulkAction(true);
    setError(null);
    try {
      await Haptics.selectionAsync();
      await updateTransactionIds(selectedIds, values);
      await finishBulkUpdate();
    } catch (updateError) {
      reportDevError('personal-history.bulk-update', updateError, { selectedCount: selectedIds.length });
      setError(errorMessage);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const confirmBulkDate = (date: string): void => {
    setBulkDatePickerOpen(false);
    runDetached(
      applyBulkUpdate({ occurred_on: date }, 'Could not update selected dates.'),
      'personal-history.bulk-date',
    );
  };

  const openBulkDatePicker = (): void => {
    if (selectedIds.length === 0) return;
    const firstSelectedDate = transactions.find((row) => selectedIdSet.has(row.id))?.occurred_on;
    const nextDate = firstSelectedDate ?? toIsoDate(new Date());
    setBulkDate(nextDate);
    setBulkWebDate(nextDate);
    setBulkWebDateError(null);
    setBulkDatePickerOpen(true);
  };

  const onBulkDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (event.type === 'dismissed') {
      if (Platform.OS === 'android') setBulkDatePickerOpen(false);
      return;
    }
    if (!selected) return;
    const nextDate = toIsoDate(selected);
    setBulkDate(nextDate);
    if (Platform.OS === 'android') confirmBulkDate(nextDate);
  };

  const openBulkCategoryPicker = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    setIsApplyingBulkAction(true);
    try {
      const rows = await loadTransactionActionMeta(selectedIds);
      const kinds = new Set(rows.map((row) => row.kind));
      if (kinds.size !== 1) {
        Alert.alert(
          'Mixed transaction types',
          'Select only expenses or only income before replacing category. Date and move actions still work with mixed selection.',
        );
        return;
      }
      setBulkCategoryKind(rows[0]?.kind ?? 'expense');
      setBulkCategoryPickerOpen(true);
    } catch (metaError) {
      reportDevError('personal-history.bulk-category-meta', metaError, { selectedCount: selectedIds.length });
      setError('Could not prepare category edit.');
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const confirmBulkCategory = (option: CategoryOption): void => {
    setBulkCategoryPickerOpen(false);
    const label = option.parentName === option.name ? option.name : `${option.parentName} · ${option.name}`;
    Alert.alert(
      `Set category for ${selectedIds.length} transaction${selectedIds.length === 1 ? '' : 's'}?`,
      `Current categories will be replaced with ${label}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set category',
          onPress: () => {
            runDetached(
              applyBulkUpdate({ category_id: option.id }, 'Could not update selected categories.'),
              'personal-history.bulk-category',
            );
          },
        },
      ],
    );
  };

  const moveTransaction = async (row: TransactionRow): Promise<void> => {
    if (row.is_shared_topup) {
      Alert.alert('Shared top-ups cannot be moved', 'Top-ups affect shared contribution calculations.');
      return;
    }
    const destinationShared = !row.shared;
    const values: BulkTransactionUpdate = destinationShared
      ? { shared: true, shared_participant: 'me' }
      : { shared: false, shared_participant: null, is_shared_topup: false };
    try {
      await Haptics.selectionAsync();
      await updateTransactionIds([row.id], values);
      setTransactions((current) => current.map((item) => (
        item.id === row.id ? { ...item, ...values } : item
      )));
      skipNextComposerRefreshRef.current = true;
      composer.bumpRefresh();
    } catch (moveError) {
      reportDevError('personal-history.move-transaction', moveError, { transactionId: row.id });
      setError('Could not move transaction.');
    }
  };

  const confirmMoveTransaction = (row: TransactionRow): void => {
    if (row.is_shared_topup) {
      Alert.alert('Shared top-ups cannot be moved', 'Top-ups affect shared contribution calculations.');
      return;
    }
    const destination = row.shared ? 'personal' : 'shared';
    Alert.alert(`Move to ${destination}?`, row.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: () => runDetached(moveTransaction(row), 'personal-history.move-transaction'),
      },
    ]);
  };

  const moveSelectedTransactions = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    const destinationShared = !filters.sharedOnly;
    setIsApplyingBulkAction(true);
    setError(null);
    try {
      const rows = await loadTransactionActionMeta(selectedIds);
      const topupCount = rows.filter((row) => row.is_shared_topup).length;
      if (topupCount > 0) {
        Alert.alert(
          'Shared top-ups cannot be moved',
          `Remove ${topupCount} shared top-up${topupCount === 1 ? '' : 's'} from selection first.`,
        );
        return;
      }
      await Haptics.selectionAsync();
      await updateTransactionIds(
        selectedIds,
        destinationShared
          ? { shared: true, shared_participant: 'me' }
          : { shared: false, shared_participant: null, is_shared_topup: false },
      );
      await finishBulkUpdate();
    } catch (moveError) {
      reportDevError('personal-history.move-selected', moveError, { selectedCount: selectedIds.length });
      setError('Could not move selected transactions.');
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const confirmMoveSelected = (): void => {
    if (selectedIds.length === 0) return;
    const destination = filters.sharedOnly ? 'personal' : 'shared';
    Alert.alert(
      `Move ${selectedIds.length} transaction${selectedIds.length === 1 ? '' : 's'} to ${destination}?`,
      'Selected transactions will keep their date, amount, name, and category.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: () => runDetached(moveSelectedTransactions(), 'personal-history.move-selected'),
        },
      ],
    );
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

  const shortcutDeleteRef = useRef(confirmDeleteSelected);
  shortcutDeleteRef.current = confirmDeleteSelected;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as { tagName?: string } | null;
      const isTextInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (event.key === 'Escape' && selectionMode) {
        event.preventDefault();
        setSelectionMode(false);
        setSelectedIds([]);
        return;
      }
      if (isTextInput) return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectionMode && selectedIds.length > 0) {
        event.preventDefault();
        shortcutDeleteRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds.length, selectionMode]);

  const footer = useMemo(() => (
    <View style={styles.footer}>
      {isLoadingMore ? (
        <>
          <ActivityIndicator color={colors.textMuted} />
          <Text style={styles.footerText}>Loading older transactions...</Text>
        </>
      ) : hasMore && transactions.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.footerButton, pressed && styles.footerButtonPressed]}
          onPress={() => runDetached(loadMore(), 'personal-history.load-more.tap')}
        >
          <Text style={styles.footerButtonText}>Load older transactions</Text>
        </Pressable>
      ) : transactions.length > 0 ? (
        <Text style={styles.footerText}>No older transactions to load.</Text>
      ) : null}
    </View>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [hasMore, isLoadingMore, transactions.length]);

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
                  icon: selectionMode ? 'xmark' : 'check',
                  onPress: () => {
                    runDetached(Haptics.selectionAsync(), 'personal-history.toggle-selection-mode.haptics');
                    setSelectionMode((current) => {
                      const next = !current;
                      if (!next) {
                        setSelectedIds([]);
                        setBulkActionsOpen(false);
                      }
                      return next;
                    });
                  },
                  tone: selectionMode ? 'accent' : 'default',
                  accessibilityLabel: selectionMode ? 'Exit selection mode' : 'Select transactions',
                },
              ]
              : undefined
          }
        />

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by date, name or notes"
          isLoading={isSearchPending}
          style={{ marginBottom: spacing.md }}
        />

        {hasActiveFilter ? (
          <Text style={styles.filteredSummaryText}>
            {isFilteredTotalLoading
              ? 'Filtered total: calculating...'
              : `Filtered total: ${formatMinor(filteredNetTotalMinor, 'DKK')}`}
          </Text>
        ) : null}

        {selectionMode ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionLabel}>
              {selectedIds.length} selected
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.selectionButton,
                styles.selectionButtonPrimary,
                (selectedIds.length === 0 || isApplyingBulkAction) && styles.selectionButtonDisabled,
                pressed && selectedIds.length > 0 && !isApplyingBulkAction && styles.selectionButtonPressed,
              ]}
              onPress={() => setBulkActionsOpen(true)}
              disabled={selectedIds.length === 0 || isApplyingBulkAction}
            >
              {isApplyingBulkAction ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.selectionButtonText}>Edit selected</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <ErrorCard
            title="Could not refresh personal history"
            style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
          >
            <Text style={styles.errorText}>{error}</Text>
          </ErrorCard>
        ) : null}

        {shouldShowSkeleton ? (
          <PersonalHistorySkeleton />
        ) : (
          <>
            {wide && flatData.length > 0 ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.wideDate]}>Date</Text>
                <Text style={[styles.tableHeaderText, styles.tableTransactionColumn]}>Transaction</Text>
                <Text style={[styles.tableHeaderText, styles.wideCategory]}>Category</Text>
                <Text style={[styles.tableHeaderText, styles.wideAmount]}>Amount</Text>
                <Text style={[styles.tableHeaderText, styles.wideScope]}>Scope</Text>
                <Text style={[styles.tableHeaderText, styles.wideCycle]}>Salary cycle</Text>
              </View>
            ) : null}
            <FlatList
            data={flatData}
            keyExtractor={(item) => item.key}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
            contentContainerStyle={flatData.length === 0 ? styles.emptyContainer : styles.listContent}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{item.title}</Text>
                  </View>
                );
              }
              return (
                <View style={styles.rowWrap}>
                  <PersonalHistoryRow
                    item={item.item}
                    selectionMode={selectionMode}
                    selected={selectedIdSet.has(item.item.row.id)}
                    onToggleSelect={toggleSelectRow}
                    onEdit={(row) => composer.openEdit(row)}
                    onDuplicate={(row) => composer.openCreate(toDuplicateDraft(row))}
                    onDelete={(row) => {
                      runDetached(deleteTransaction(row), 'personal-history.delete-transaction');
                    }}
                    onMove={confirmMoveTransaction}
                    wide={wide}
                    salaryCycleLabel={findCycleFor(salaryCycles, item.item.row.occurred_on)?.label ?? 'Before salary cycles'}
                  />
                </View>
              );
            }}
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
            removeClippedSubviews={false}
            onEndReachedThreshold={0.2}
            onEndReached={() => {
              if (!hasMore) return;
              runDetached(loadMore(), 'personal-history.load-more.end');
            }}
            />
          </>
        )}

        <CategorySheet
          visible={bulkCategoryPickerOpen}
          onClose={() => setBulkCategoryPickerOpen(false)}
          onSelect={confirmBulkCategory}
          kind={bulkCategoryKind}
        />

        <Modal
          visible={bulkActionsOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setBulkActionsOpen(false)}
        >
          <View style={styles.bulkActionOverlay}>
            <Pressable style={styles.bulkActionBackdrop} onPress={() => setBulkActionsOpen(false)} />
            <View style={styles.bulkActionSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.bulkActionTitle}>
                Edit {selectedIds.length} transaction{selectedIds.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.bulkActionSubtitle}>Choose one change to apply to the selection.</Text>
              <View style={styles.bulkActionList}>
                <Pressable
                  style={({ pressed }) => [styles.bulkActionRow, pressed && styles.selectionButtonPressed]}
                  onPress={() => {
                    setBulkActionsOpen(false);
                    openBulkDatePicker();
                  }}
                >
                  <View style={styles.bulkActionIcon}>
                    <FontAwesome6 name="calendar" size={18} color={colors.accentAlt} />
                  </View>
                  <View style={styles.bulkActionCopy}>
                    <Text style={styles.bulkActionRowTitle}>Change date</Text>
                    <Text style={styles.bulkActionRowMeta}>Set one date for every selected transaction</Text>
                  </View>
                  <FontAwesome6 name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bulkActionRow, pressed && styles.selectionButtonPressed]}
                  onPress={() => {
                    setBulkActionsOpen(false);
                    runDetached(openBulkCategoryPicker(), 'personal-history.open-bulk-category');
                  }}
                >
                  <View style={styles.bulkActionIcon}>
                    <FontAwesome6 name="tag" size={18} color={colors.accentAlt} />
                  </View>
                  <View style={styles.bulkActionCopy}>
                    <Text style={styles.bulkActionRowTitle}>Change category</Text>
                    <Text style={styles.bulkActionRowMeta}>Replace the current category</Text>
                  </View>
                  <FontAwesome6 name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bulkActionRow, pressed && styles.selectionButtonPressed]}
                  onPress={() => {
                    setBulkActionsOpen(false);
                    confirmMoveSelected();
                  }}
                >
                  <View style={styles.bulkActionIcon}>
                    <FontAwesome6 name="right-left" size={18} color={colors.accentAlt} />
                  </View>
                  <View style={styles.bulkActionCopy}>
                    <Text style={styles.bulkActionRowTitle}>
                      {filters.sharedOnly ? 'Move to personal' : 'Move to shared'}
                    </Text>
                    <Text style={styles.bulkActionRowMeta}>Keep amount, date, name and category</Text>
                  </View>
                  <FontAwesome6 name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.bulkActionRow, pressed && styles.selectionButtonPressed]}
                  onPress={() => {
                    setBulkActionsOpen(false);
                    confirmDeleteSelected();
                  }}
                >
                  <View style={[styles.bulkActionIcon, styles.bulkActionIconDanger]}>
                    <FontAwesome6 name="trash-can" size={18} color={colors.danger} />
                  </View>
                  <View style={styles.bulkActionCopy}>
                    <Text style={[styles.bulkActionRowTitle, styles.bulkActionDanger]}>Delete</Text>
                    <Text style={styles.bulkActionRowMeta}>Permanently remove selected transactions</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={bulkDatePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setBulkDatePickerOpen(false)}
        >
          <View style={styles.bulkDateOverlay}>
            <Pressable style={styles.bulkDateBackdrop} onPress={() => setBulkDatePickerOpen(false)} />
            <View style={styles.bulkDateCard}>
              <View style={styles.sheetHandle} />
              <Text style={styles.bulkDateTitle}>Change date</Text>
              <Text style={styles.bulkActionSubtitle}>
                Apply one date to {selectedIds.length} selected transaction{selectedIds.length === 1 ? '' : 's'}.
              </Text>
              {Platform.OS === 'web' ? (
                <>
                  <TextInput
                    value={bulkWebDate}
                    onChangeText={(value) => {
                      setBulkWebDate(value);
                      setBulkWebDateError(null);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.bulkDateInput}
                  />
                  {bulkWebDateError ? <Text style={styles.bulkDateError}>{bulkWebDateError}</Text> : null}
                </>
              ) : (
                <View style={styles.bulkDatePickerSurface}>
                  <DateTimePicker
                    value={parseIsoDate(bulkDate)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    themeVariant="dark"
                    textColor={colors.text}
                    accentColor={colors.accentAlt}
                    onChange={onBulkDateChange}
                    style={styles.bulkDatePicker}
                  />
                </View>
              )}
              {Platform.OS !== 'android' ? (
                <View style={styles.bulkDateActions}>
                  <Pressable
                    style={({ pressed }) => [styles.bulkDateButton, pressed && styles.selectionButtonPressed]}
                    onPress={() => setBulkDatePickerOpen(false)}
                  >
                    <Text style={styles.bulkDateButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.bulkDateButton, styles.bulkDateButtonPrimary, pressed && styles.selectionButtonPressed]}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (!isValidIsoDate(bulkWebDate)) {
                          setBulkWebDateError('Use YYYY-MM-DD.');
                          return;
                        }
                        confirmBulkDate(bulkWebDate);
                        return;
                      }
                      confirmBulkDate(bulkDate);
                    }}
                  >
                    <Text style={[styles.bulkDateButtonText, styles.bulkDateButtonTextPrimary]}>Apply date</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: spacing.xxl * 4 },
  emptyContainer: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 4 },
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
  selectionButton: {
    minWidth: 108,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionButtonPrimary: { backgroundColor: colors.accent },
  selectionButtonPressed: { opacity: 0.86 },
  selectionButtonDisabled: { opacity: 0.45 },
  selectionButtonText: { ...typography.label, color: colors.text, fontWeight: '600' },
  filteredSummaryText: {
    ...typography.label,
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    opacity: 0.9,
  },
  errorText: { ...typography.body, color: colors.textMuted },
  skeletonWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  skeletonSection: { gap: spacing.sm },
  skeletonList: { gap: spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonCopy: { flex: 1, gap: spacing.xs },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  rowWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  swipeMoveAction: {
    width: 104,
    marginBottom: 0,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeMoveText: { ...typography.label, color: colors.text, fontWeight: '700' },
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
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { ...typography.label, color: colors.textMuted },
  tableHeader: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tableHeaderText: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tableTransactionColumn: { flex: 1 },
  wideDate: { ...typography.label, color: colors.textMuted, width: 92 },
  wideScope: { ...typography.label, color: colors.textMuted, width: 74 },
  wideCycle: { ...typography.label, color: colors.textMuted, width: 118 },
  wideCategory: { ...typography.label, color: colors.textMuted, width: 132 },
  wideAmount: { width: 148, textAlign: 'right' },
  bulkActionOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bulkActionBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000099' },
  bulkActionSheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  bulkActionTitle: { ...typography.h2, color: colors.text },
  bulkActionSubtitle: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md },
  bulkActionList: { gap: spacing.xs },
  bulkActionRow: {
    minHeight: 68,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bulkActionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: `${colors.accentAlt}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkActionIconDanger: { backgroundColor: `${colors.danger}18` },
  bulkActionCopy: { flex: 1, gap: 2 },
  bulkActionRowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  bulkActionRowMeta: { ...typography.label, color: colors.textMuted },
  bulkActionDanger: { color: colors.danger },
  bulkDateOverlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bulkDateBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000099' },
  bulkDateCard: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  bulkDateTitle: { ...typography.h2, color: colors.text },
  bulkDatePickerSurface: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  bulkDatePicker: { width: '100%' },
  bulkDateInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bulkDateError: { ...typography.label, color: colors.danger },
  bulkDateActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  bulkDateButton: {
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkDateButtonPrimary: { backgroundColor: colors.accent },
  bulkDateButtonText: { ...typography.label, color: colors.text, fontWeight: '600' },
  bulkDateButtonTextPrimary: { color: colors.text },
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
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

const PAGE_SIZE = 40;
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
      .select('id, user_id, parent_id, name, level, is_system, icon, color'),
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

const loadTransactionPage = async (offset: number): Promise<TransactionRow[]> => {
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_SELECT)
    .eq('shared', false)
    .order('occurred_on', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;
  return (data ?? []) as TransactionRow[];
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

function PersonalHistoryRow({
  item,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: HistoryItem;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
}) {
  const { row } = item;

  const openActions = (): void => {
    Alert.alert(row.name, undefined, [
      { text: 'Edit', onPress: () => onEdit(row) },
      { text: 'Duplicate', onPress: () => onDuplicate(row) },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => onEdit(row)} onLongPress={openActions}>
      <View style={[styles.iconWrap, { backgroundColor: `${item.categoryColor}22` }]}>
        <CategoryIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.amount}>{displayAmountForRow(row)}</Text>
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
          {row.is_shared_topup ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>Top-up</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function PersonalHistoryScreen() {
  const composer = useComposer();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [motionRun, setMotionRun] = useState(0);
  const requestVersionRef = useRef(0);

  const reload = useCallback(async (showSkeleton = false): Promise<void> => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    if (showSkeleton) setIsInitialLoading(true);
    setIsLoadingMore(false);
    setError(null);

    try {
      const [nextCategories, firstPage] = await Promise.all([
        loadCategories(),
        loadTransactionPage(0),
      ]);

      if (requestVersionRef.current !== requestVersion) return;

      setCategories(nextCategories);
      setTransactions(firstPage);
      setNextOffset(firstPage.length);
      setHasMore(firstPage.length === PAGE_SIZE);
    } catch (loadError) {
      if (requestVersionRef.current !== requestVersion) return;
      reportDevError('personal-history.reload', loadError);
      setError(getErrorMessage(loadError, 'Failed to load personal history.'));
      setTransactions([]);
      setNextOffset(0);
      setHasMore(false);
    } finally {
      if (requestVersionRef.current === requestVersion && showSkeleton) {
        setIsInitialLoading(false);
      }
    }
  }, []);

  const loadMore = useCallback(async (): Promise<void> => {
    if (isInitialLoading || isLoadingMore || !hasMore) return;
    const requestVersion = requestVersionRef.current;
    const startOffset = nextOffset;
    setIsLoadingMore(true);

    try {
      const page = await loadTransactionPage(startOffset);
      if (requestVersionRef.current !== requestVersion) return;

      setTransactions((current) => mergeUniqueTransactions(current, page));
      setNextOffset(startOffset + page.length);
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      if (requestVersionRef.current !== requestVersion) return;
      reportDevError('personal-history.load-more', loadError, { offset: startOffset });
      setError(getErrorMessage(loadError, 'Failed to load older transactions.'));
    } finally {
      if (requestVersionRef.current === requestVersion) {
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, isInitialLoading, isLoadingMore, nextOffset]);

  useEffect(() => {
    runDetached(reload(true), 'personal-history.initial-load');
  }, [reload]);

  useEffect(() => {
    if (composer.refreshKey > 0) {
      runDetached(reload(), 'personal-history.refresh');
    }
  }, [composer.refreshKey, reload]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

  const categoryMeta = useMemo(() => buildCategoryMeta(categories), [categories]);

  const sections = useMemo<HistorySection[]>(() => {
    const grouped = new Map<string, HistoryItem[]>();
    for (const row of transactions) {
      const categoryLabel = row.category_id
        ? categoryMeta[row.category_id]?.label ?? 'Uncategorized'
        : row.kind === 'income'
          ? 'Income'
          : 'Uncategorized';
      const categoryColor = row.category_id
        ? getCategoryMetaDisplayColor(categoryMeta[row.category_id], row.kind)
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
    if (!deleteError) composer.bumpRefresh();
  };

  const onRefresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await reload();
    } finally {
      setIsRefreshing(false);
    }
  };

  const footer = isLoadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.textMuted} />
      <Text style={styles.footerText}>Loading older transactions...</Text>
    </View>
  ) : hasMore && transactions.length > 0 ? (
    <Pressable style={({ pressed }) => [styles.footerButton, pressed && styles.footerButtonPressed]} onPress={() => runDetached(loadMore(), 'personal-history.load-more.tap')}>
      <Text style={styles.footerButtonText}>Load older transactions</Text>
    </Pressable>
  ) : null;

  return (
    <MotionScope value={motionRun}>
      <View style={styles.container}>
        <ScreenHeader title="Personal history" subtitle="Full personal transaction timeline" back />

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not refresh personal history</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isInitialLoading ? (
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
                onEdit={(row) => composer.openEdit(row)}
                onDuplicate={(row) => composer.openCreate(toDuplicateDraft(row))}
                onDelete={(row) => {
                  runDetached(deleteTransaction(row), 'personal-history.deleteTransaction');
                }}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.itemGap} />}
            SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
            ListFooterComponent={footer}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No personal transactions yet</Text>
                <Text style={styles.emptyText}>
                  Add your first transaction and your full history will show up here by date.
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

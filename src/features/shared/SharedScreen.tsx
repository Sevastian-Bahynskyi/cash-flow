import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useOverview } from '@/features/overview/useOverview';
import { useComposer } from '@/features/transactions/ComposerContext';
import { TransactionList } from '@/features/transactions/TransactionList';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { FilterChips } from '@/ui/FilterChips';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatMinor, formatPercent } from '@/lib/format';
import type { SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'current' | 'previous';

const filterOptions = [
  { label: 'Current cycle', value: 'current' },
  { label: 'Previous', value: 'previous' },
] as const satisfies readonly { label: string; value: RangeFilter }[];

const cycleMatch = (row: TransactionRow, cycle: SalaryCycle | null): boolean => {
  if (!cycle) return false;
  const afterStart = row.occurred_on >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

export default function SharedScreen() {
  const data = useOverview();
  const composer = useComposer();
  const [filter, setFilter] = useState<RangeFilter>('current');
  const [refreshing, setRefreshing] = useState(false);
  const [motionRun, setMotionRun] = useState(0);

  useEffect(() => {
    if (composer.refreshKey > 0) void data.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.refreshKey]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

  const selectedCycle = filter === 'current' ? data.activeCycle : data.previousCycle;
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);

  const cycleTransactions = useMemo(() => {
    const rows = data.transactions.filter((row) => cycleMatch(row, selectedCycle));
    return [...rows].sort((a, b) => {
      if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
      return b.occurred_on.localeCompare(a.occurred_on);
    });
  }, [data.transactions, selectedCycle]);

  const sharedExpenses = cycleTransactions.filter((row) => row.shared);
  const topups = cycleTransactions.filter((row) => row.is_shared_topup);
  const combined = [...topups, ...sharedExpenses].sort((a, b) => {
    if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
    return b.occurred_on.localeCompare(a.occurred_on);
  });

  const itemList = combined.slice(0, 10).map((row) => ({
    row,
    categoryLabel: row.is_shared_topup
      ? 'Shared top-up'
      : row.category_id
        ? categoryMeta[row.category_id]?.label ?? 'Shared'
        : 'Shared',
    categoryColor: row.category_id ? categoryMeta[row.category_id]?.color ?? colors.accent : colors.accent,
    categoryIcon: row.category_id ? categoryMeta[row.category_id]?.icon ?? 'account-group-outline' : 'cash-plus',
  }));

  const sharedSpendByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of sharedExpenses) {
      if (!row.category_id) continue;
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
    }
    return [...totals.entries()]
      .map(([categoryId, spentMinor]) => ({
        categoryId,
        spentMinor,
        label: categoryMeta[categoryId]?.label ?? 'Category',
        color: categoryMeta[categoryId]?.color ?? colors.accent,
      }))
      .sort((a, b) => b.spentMinor - a.spentMinor)
      .slice(0, 5);
  }, [categoryMeta, sharedExpenses]);

  const sharedSpendTotal = sharedExpenses.reduce((sum, row) => sum + row.amount_minor, 0);
  const userTopupTotal = topups.reduce((sum, row) => sum + row.amount_minor, 0);
  const partnerInferred = Math.max(sharedSpendTotal - userTopupTotal, 0);
  const denominator = userTopupTotal + partnerInferred;
  const ratio = denominator === 0 ? 0.5 : userTopupTotal / denominator;
  const userEffectiveShare = Math.round(sharedSpendTotal * ratio);
  const sharedBalance = userTopupTotal - userEffectiveShare;

  const deleteTransaction = async (row: TransactionRow): Promise<void> => {
    const { error } = await supabase.from('transactions').delete().eq('id', row.id);
    if (!error) composer.bumpRefresh();
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MotionScope value={motionRun}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
      >
        <ScreenHeader title="Shared" subtitle="Fairness and shared spend" />

      <MotionView direction="right" distance={210} delayMs={90} rotateFrom={8}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Shared balance</Text>
          <Text style={styles.heroAmount}>{formatMinor(sharedBalance)}</Text>
          <View style={styles.heroStats}>
            <MotionView direction="up" distance={90} delayMs={210}>
              <View style={styles.heroStatChip}>
                <Text style={styles.heroStatLabel}>Cycle</Text>
                <Text style={styles.heroStatValue}>{selectedCycle?.label ?? 'Not set'}</Text>
              </View>
            </MotionView>
            <MotionView direction="left" distance={120} delayMs={270}>
              <View style={styles.heroStatChip}>
                <Text style={styles.heroStatLabel}>Ratio</Text>
                <Text style={styles.heroStatValue}>
                  {formatPercent(ratio)} · {formatPercent(1 - ratio)}
                </Text>
              </View>
            </MotionView>
          </View>
          <Pressable
            style={styles.heroButton}
            onPress={() =>
              composer.openCreate({
                kind: 'expense',
                is_shared_topup: true,
                name: 'Shared top-up',
              })
            }
          >
            <Text style={styles.heroButtonText}>Top up</Text>
          </Pressable>
        </View>
      </MotionView>

      <FilterChips value={filter} options={filterOptions} onChange={setFilter} />

      {data.loading && combined.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.metricMeta}>Loading the shared dashboard...</Text>
        </View>
      ) : null}

      {!selectedCycle ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>No cycle yet</Text>
          <Text style={styles.explainer}>
            Add a salary income first to activate shared fairness.
          </Text>
        </View>
      ) : null}

      {data.error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not refresh shared data</Text>
          <Text style={styles.metricMeta}>{data.error}</Text>
        </View>
      ) : null}

      <View style={styles.metricsRow}>
        <MotionView style={styles.metricMotion} direction="left" distance={150} delayMs={180}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Contributed</Text>
            <Text style={styles.metricAmount}>{formatMinor(userTopupTotal)}</Text>
          </View>
        </MotionView>
        <MotionView style={styles.metricMotion} direction="right" distance={150} delayMs={220}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Spent</Text>
            <Text style={styles.metricAmount}>{formatMinor(sharedSpendTotal)}</Text>
          </View>
        </MotionView>
      </View>

      <View style={styles.metricsRow}>
        <MotionView style={styles.metricMotion} direction="left" distance={165} delayMs={260}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Your share</Text>
            <Text style={styles.metricAmount}>{formatMinor(userEffectiveShare)}</Text>
            <Text style={styles.metricMeta}>{formatPercent(ratio)}</Text>
          </View>
        </MotionView>
        <MotionView style={styles.metricMotion} direction="right" distance={165} delayMs={300}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>GF share</Text>
            <Text style={styles.metricAmount}>{formatMinor(sharedSpendTotal - userEffectiveShare)}</Text>
            <Text style={styles.metricMeta}>current cycle</Text>
          </View>
        </MotionView>
      </View>

      <MotionView direction="left" distance={150} delayMs={320}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ratio</Text>
          <View style={styles.ratioLegend}>
            <Text style={styles.ratioPill}>You {formatPercent(ratio)}</Text>
            <Text style={styles.ratioPill}>GF {formatPercent(1 - ratio)}</Text>
          </View>
          <ProgressBar value={ratio} color={colors.accent} />
          <Text style={styles.metricMeta}>Updated by top-ups in the active cycle.</Text>
        </View>
      </MotionView>

      <MotionView direction="right" distance={145} delayMs={360}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top-ups</Text>
          <View style={styles.timelineList}>
            {topups.length === 0 ? (
              <Text style={styles.metricMeta}>No top-ups in this cycle yet.</Text>
            ) : (
              topups.map((row) => (
                <View key={row.id} style={styles.timelineRow}>
                  <Text style={styles.timelineLabel}>{row.name}</Text>
                  <Text style={styles.timelineAmount}>{formatMinor(row.amount_minor)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </MotionView>

      <MotionView direction="left" distance={155} delayMs={400}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top shared categories</Text>
          <View style={styles.timelineList}>
            {sharedSpendByCategory.length === 0 ? (
              <Text style={styles.metricMeta}>No shared spending in this range yet.</Text>
            ) : (
              sharedSpendByCategory.map((item) => (
                <View key={item.categoryId} style={styles.categoryRow}>
                  <View style={styles.categoryHead}>
                    <Text style={styles.timelineLabel}>{item.label}</Text>
                    <Text style={styles.timelineAmount}>{formatMinor(item.spentMinor)}</Text>
                  </View>
                  <ProgressBar value={sharedSpendTotal === 0 ? 0 : item.spentMinor / sharedSpendTotal} color={item.color} />
                </View>
              ))
            )}
          </View>
        </View>
      </MotionView>

        <TransactionList
          title="Shared history"
          items={itemList}
          emptyLabel="Shared expenses and top-ups for this cycle will appear here."
          onEdit={(row) => composer.openEdit(row)}
          onDuplicate={(row) =>
            composer.openCreate({
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
            })
          }
          onDelete={(row) => {
            void deleteTransaction(row);
          }}
        />
      </ScrollView>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  hero: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { ...typography.amount, color: colors.text },
  heroStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.xs },
  heroStatChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    gap: 2,
  },
  heroStatLabel: { ...typography.label, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  heroStatValue: { ...typography.label, color: colors.text, fontWeight: '600' },
  heroButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  heroButtonText: { ...typography.label, color: colors.text },
  metricsRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  metricMotion: { flex: 1 },
  metricCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  metricLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricAmount: { ...typography.h2, color: colors.text },
  metricMeta: { ...typography.label, color: colors.textMuted },
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  errorCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: 'rgba(255,92,122,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.32)',
  },
  errorTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  explainer: { ...typography.body, color: colors.text },
  ratioLegend: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  ratioPill: {
    ...typography.label,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  timelineList: { gap: spacing.sm },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineLabel: { ...typography.body, color: colors.text, flex: 1, marginRight: spacing.md },
  timelineAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
  categoryRow: { gap: spacing.sm },
  categoryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});

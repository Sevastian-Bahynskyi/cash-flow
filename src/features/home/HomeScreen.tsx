import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverview, type BudgetAlert } from '@/features/overview/useOverview';
import { useComposer } from '@/features/transactions/ComposerContext';
import { TransactionList } from '@/features/transactions/TransactionList';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { transactionBalance } from '@/lib/balance';
import { formatMinor, formatPercent } from '@/lib/format';
import { buildSalaryCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'cycle' | 'year' | 'all';

const cycleMatch = (row: TransactionRow, cycle: SalaryCycle | null): boolean => {
  if (!cycle) return false;
  const afterStart = row.occurred_on >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

export default function HomeScreen() {
  const router = useRouter();
  const data = useOverview();
  const composer = useComposer();
  const [filter, setFilter] = useState<RangeFilter>('cycle');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [motionRun, setMotionRun] = useState(0);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (composer.refreshKey > 0) void data.reload();
    // reload is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.refreshKey]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

  const cycles = useMemo(
    () => buildSalaryCycles(data.transactions.filter((row) => row.is_salary)),
    [data.transactions],
  );
  const cyclesWithTransactions = useMemo(
    () =>
      [...cycles]
        .filter((cycle) => data.transactions.some((row) => cycleMatch(row, cycle)))
        .reverse(),
    [cycles, data.transactions],
  );

  useEffect(() => {
    if (cyclesWithTransactions.length === 0) {
      setSelectedCycleId(null);
      return;
    }

    setSelectedCycleId((current) => {
      if (current && cyclesWithTransactions.some((cycle) => cycle.id === current)) return current;
      return data.activeCycle?.id ?? cyclesWithTransactions[0]?.id ?? null;
    });
  }, [cyclesWithTransactions, data.activeCycle?.id]);

  const selectedCycle =
    cyclesWithTransactions.find((cycle) => cycle.id === selectedCycleId) ??
    (() => {
      const activeCycle = data.activeCycle;
      if (activeCycle && cyclesWithTransactions.some((cycle) => cycle.id === activeCycle.id)) {
        return activeCycle;
      }
      return cyclesWithTransactions[0] ?? null;
    })();
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);
  const currentYearCycles = useMemo(
    () => cycles.filter((cycle) => cycle.label.endsWith(String(currentYear))),
    [currentYear, cycles],
  );
  const rangeTransactions = useMemo(() => {
    if (filter === 'year') {
      return data.transactions.filter((row) => {
        const cycle = findCycleFor(cycles, row.occurred_on);
        if (cycle) return cycle.label.endsWith(String(currentYear));
        return row.occurred_on.startsWith(`${currentYear}-`);
      });
    }
    if (filter === 'all') return data.transactions;
    return data.transactions.filter((row) => cycleMatch(row, selectedCycle));
  }, [currentYear, cycles, data.transactions, filter, selectedCycle]);
  const snapshotMinor = useMemo(() => transactionBalance(rangeTransactions), [rangeTransactions]);

  const personalTransactions = useMemo(() => {
    const base = rangeTransactions.filter((row) => !row.shared);
    return [...base].sort((a, b) => {
      if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
      return b.occurred_on.localeCompare(a.occurred_on);
    });
  }, [rangeTransactions]);

  const recentItems = personalTransactions.slice(0, 8).map((row) => ({
    row,
    categoryLabel: row.category_id ? categoryMeta[row.category_id]?.label ?? 'Uncategorized' : row.kind === 'income' ? 'Income' : 'Uncategorized',
    categoryColor: row.category_id ? categoryMeta[row.category_id]?.color ?? colors.accent : colors.accent,
    categoryIcon: row.category_id ? categoryMeta[row.category_id]?.icon ?? 'cash' : row.kind === 'income' ? 'bank-outline' : 'cash',
  }));

  const categorySpend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of personalTransactions) {
      if (row.kind !== 'expense' || row.is_shared_topup || !row.category_id) continue;
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
  }, [personalTransactions, categoryMeta]);

  const spendTotal = categorySpend.reduce((sum, item) => sum + item.spentMinor, 0);

  const filteredBudgetAlerts: BudgetAlert[] = useMemo(() => {
    if (filter !== 'cycle') return [];
    const targetCycle = selectedCycle;
    if (!targetCycle) return [];
    const totals = new Map<string, number>();
    for (const row of personalTransactions) {
      if (row.kind !== 'expense' || row.is_shared_topup || !row.category_id) continue;
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
    }
    return data.budgets
      .filter((budget) => budget.salary_cycle_id === targetCycle.id)
      .map((budget) => {
        const spentMinor = totals.get(budget.category_id) ?? 0;
        const ratio = spentMinor / budget.amount_minor;
        if (ratio < 0.8) return null;
        return {
          categoryId: budget.category_id,
          label: categoryMeta[budget.category_id]?.label ?? 'Category',
          spentMinor,
          amountMinor: budget.amount_minor,
          level: ratio >= 1 ? 'critical' : 'warning',
        } satisfies BudgetAlert;
      })
      .filter((value): value is BudgetAlert => value !== null)
      .sort((a, b) => b.spentMinor / b.amountMinor - a.spentMinor / a.amountMinor);
  }, [categoryMeta, data.budgets, filter, personalTransactions, selectedCycle]);

  const deleteTransaction = async (row: TransactionRow): Promise<void> => {
    await Haptics.selectionAsync();
    const { error } = await supabase.from('transactions').delete().eq('id', row.id);
    if (!error) composer.bumpRefresh();
  };

  const currentCycleLabel =
    filter === 'all'
      ? 'All time'
      : filter === 'year'
        ? `${currentYear}`
        : selectedCycle?.label ?? 'No salary cycle';

  const heroEyebrow =
    filter === 'all'
      ? 'All-time balance'
      : filter === 'year'
        ? 'Current year balance'
        : 'Cycle balance';

  const yearChipLabel = currentYearCycles.length > 0 ? `Current year` : `Current year`;

  const hints = [
    data.transactions.length === 0 ? 'Log your first transaction to wake up Home.' : null,
    data.budgets.length === 0 ? 'Set one budget to unlock warning states.' : null,
    data.shared.userTopupTotal === 0 ? 'One shared top-up unlocks the fairness view.' : null,
  ].filter((value): value is string => value !== null);

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
        <ScreenHeader
          title="Home"
          subtitle="Personal flow"
          actions={[
            { icon: 'bell-outline', onPress: () => router.push('/alerts') },
            { icon: 'brain', onPress: () => router.push('/ai-rules') },
            { icon: 'shape-outline', onPress: () => router.push('/categories') },
            { icon: 'target', onPress: () => router.push('/budgets') },
          ]}
        />

        <MotionView direction="left" distance={210} delayMs={90} rotateFrom={-9}>
          <LinearGradient colors={['#1F2438', '#101219', '#0B0B0F']} style={styles.hero}>
            <Text style={styles.heroEyebrow}>{heroEyebrow}</Text>
            <Text style={styles.heroAmount}>{formatMinor(snapshotMinor)}</Text>
            <View style={styles.heroStats}>
              <MotionView direction="up" distance={90} delayMs={220}>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatLabel}>Cycle</Text>
                  <Text style={styles.heroStatValue}>{currentCycleLabel}</Text>
                </View>
              </MotionView>
              <MotionView direction="right" distance={120} delayMs={280}>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatLabel}>Spend</Text>
                  <Text style={styles.heroStatValue}>
                    {formatMinor(categorySpend.reduce((sum, item) => sum + item.spentMinor, 0))}
                  </Text>
                </View>
              </MotionView>
            </View>
          </LinearGradient>
        </MotionView>

        {cyclesWithTransactions.length > 0 ? (
          <View style={styles.selectorBlock}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cycleCarousel}
            >
              {cyclesWithTransactions.map((cycle, index) => {
                const active = filter === 'cycle' && selectedCycle?.id === cycle.id;
                return (
                  <MotionView
                    key={cycle.id}
                    index={index}
                    direction={active ? 'down' : 'up'}
                    distance={70}
                    delayMs={120}
                    stepMs={55}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.cycleChip,
                        active && styles.cycleChipActive,
                        pressed && styles.cycleChipPressed,
                      ]}
                      onPress={() => {
                        setSelectedCycleId(cycle.id);
                        setFilter('cycle');
                      }}
                    >
                      <Text style={[styles.cycleChipText, active && styles.cycleChipTextActive]}>
                        {cycle.label}
                      </Text>
                    </Pressable>
                  </MotionView>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.filterRow}>
          <Pressable
            style={({ pressed }) => [
              styles.filterChip,
              filter === 'year' && styles.filterChipActive,
              pressed && styles.cycleChipPressed,
            ]}
            onPress={() => setFilter('year')}
          >
            <Text style={[styles.filterChipText, filter === 'year' && styles.filterChipTextActive]}>
              {yearChipLabel}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.filterChip,
              filter === 'all' && styles.filterChipActive,
              pressed && styles.cycleChipPressed,
            ]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
              All time
            </Text>
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          <MotionView style={styles.quickMotion} direction="left" distance={165} delayMs={170}>
            <Pressable style={styles.quickCard} onPress={() => router.push('/budgets')}>
              <MaterialCommunityIcons name="target" size={20} color={colors.accent} />
              <Text style={styles.quickTitle}>Budgets</Text>
            </Pressable>
          </MotionView>
          <MotionView style={styles.quickMotion} direction="right" distance={165} delayMs={230}>
            <Pressable style={styles.quickCard} onPress={() => router.push('/categories')}>
              <MaterialCommunityIcons name="shape-outline" size={20} color={colors.success} />
              <Text style={styles.quickTitle}>Categories</Text>
            </Pressable>
          </MotionView>
        </View>

        {data.loading && data.transactions.length === 0 ? (
          <View style={styles.section}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          </View>
        ) : null}

        {data.error ? (
          <View style={styles.section}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Something needs a refresh</Text>
              <Text style={styles.emptyText}>{data.error}</Text>
            </View>
          </View>
        ) : null}

        {filteredBudgetAlerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Budget pressure</Text>
            <View style={styles.sectionBody}>
              {filteredBudgetAlerts.map((alert, index) => {
                const ratio = alert.spentMinor / alert.amountMinor;
                const tone = alert.level === 'critical' ? colors.danger : '#F5B942';
                return (
                  <MotionView key={alert.categoryId} index={index} direction="right" distance={150} delayMs={210}>
                    <View style={styles.alertCard}>
                      <View style={styles.alertRow}>
                        <Text style={styles.alertTitle}>{alert.label}</Text>
                        <Text style={[styles.alertRatio, { color: tone }]}>{formatPercent(ratio)}</Text>
                      </View>
                      <Text style={styles.alertMeta}>
                        {formatMinor(alert.spentMinor)} of {formatMinor(alert.amountMinor)}
                      </Text>
                      <ProgressBar value={ratio} color={tone} />
                    </View>
                  </MotionView>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top categories</Text>
          <View style={styles.sectionBody}>
            {categorySpend.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No spending in this range yet.</Text>
              </View>
            ) : (
              categorySpend.map((item, index) => (
                <MotionView key={item.categoryId} index={index} direction="left" distance={145} delayMs={250}>
                  <View style={styles.categoryCard}>
                    <View style={styles.alertRow}>
                      <Text style={styles.categoryLabel}>{item.label}</Text>
                      <Text style={styles.categoryAmount}>{formatMinor(item.spentMinor)}</Text>
                    </View>
                    <ProgressBar value={spendTotal === 0 ? 0 : item.spentMinor / spendTotal} color={item.color} />
                  </View>
                </MotionView>
              ))
            )}
          </View>
        </View>

        {hints.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Helpful nudges</Text>
            <View style={styles.sectionBody}>
              {hints.map((hint, index) => (
                <MotionView key={hint} index={index} direction="down" distance={120} delayMs={290}>
                  <View style={styles.hintCard}>
                    <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.accent} />
                    <Text style={styles.hintText}>{hint}</Text>
                  </View>
                </MotionView>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.section, styles.sectionFlush]}>
          <TransactionList
            title="Recent personal activity"
            items={recentItems}
            emptyLabel="Log the first transaction to start building your personal history."
            onEdit={(row) => composer.openEdit(row)}
            onDuplicate={(row) => {
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
              });
            }}
            onDelete={(row) => {
              void deleteTransaction(row);
            }}
          />
        </View>
      </ScrollView>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroEyebrow: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { ...typography.amount, color: colors.text },
  heroStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.xs },
  heroStatChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 2,
  },
  heroStatLabel: { ...typography.label, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  heroStatValue: { ...typography.label, color: colors.text, fontWeight: '600' },
  selectorBlock: { gap: spacing.sm },
  cycleCarousel: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  cycleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cycleChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  cycleChipPressed: { opacity: 0.85 },
  cycleChipText: { ...typography.label, color: colors.textMuted },
  cycleChipTextActive: { color: colors.text },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: { ...typography.label, color: colors.textMuted },
  filterChipTextActive: { color: colors.text },
  quickRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  quickMotion: { flex: 1 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quickTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionFlush: { paddingHorizontal: 0 },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { gap: spacing.sm },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  alertTitle: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  alertRatio: { ...typography.body, fontWeight: '700' },
  alertMeta: { ...typography.label, color: colors.textMuted },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  errorCard: {
    backgroundColor: 'rgba(255,92,122,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.32)',
  },
  errorTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  emptyText: { ...typography.body, color: colors.textMuted },
  categoryCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  categoryLabel: { ...typography.body, color: colors.text, flex: 1 },
  categoryAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
  hintCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hintText: { ...typography.body, color: colors.text, flex: 1 },
});

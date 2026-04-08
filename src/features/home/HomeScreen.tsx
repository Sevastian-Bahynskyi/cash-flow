import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverview, type BudgetAlert } from '@/features/overview/useOverview';
import { useComposer } from '@/features/transactions/ComposerContext';
import { TransactionList } from '@/features/transactions/TransactionList';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { FilterChips } from '@/ui/FilterChips';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatMinor, formatPercent } from '@/lib/format';
import type { SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'current' | 'previous' | 'all';

const filterOptions = [
  { label: 'Current cycle', value: 'current' },
  { label: 'Previous', value: 'previous' },
  { label: 'All time', value: 'all' },
] as const satisfies readonly { label: string; value: RangeFilter }[];

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
  const [filter, setFilter] = useState<RangeFilter>('current');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (composer.refreshKey > 0) void data.reload();
    // reload is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.refreshKey]);

  const selectedCycle = filter === 'current' ? data.activeCycle : filter === 'previous' ? data.previousCycle : null;
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);

  const personalTransactions = useMemo(() => {
    const base = data.transactions.filter((row) => !row.shared);
    const filtered = filter === 'all' ? base : base.filter((row) => cycleMatch(row, selectedCycle));
    return [...filtered].sort((a, b) => {
      if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
      return b.occurred_on.localeCompare(a.occurred_on);
    });
  }, [data.transactions, filter, selectedCycle]);

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
    if (filter === 'all') return [];
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
      : selectedCycle?.label ?? 'No salary cycle';

  const hints = [
    data.transactions.length === 0 ? 'Log your first transaction to turn Home into a real dashboard.' : null,
    data.budgets.length === 0 ? 'Set one budget to unlock warning states before overspending becomes obvious.' : null,
    data.shared.userTopupTotal === 0 ? 'Your first shared top-up unlocks the shared fairness view.' : null,
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
    >
      <ScreenHeader
        title="Home"
        subtitle="Personal money, budgets, and recent spending"
        actions={[
          { icon: 'bell-outline', onPress: () => router.push('/alerts') },
          { icon: 'brain', onPress: () => router.push('/ai-rules') },
          { icon: 'shape-outline', onPress: () => router.push('/categories') },
          { icon: 'target', onPress: () => router.push('/budgets') },
        ]}
      />

      <LinearGradient colors={['#1F2438', '#101219', '#0B0B0F']} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Personal balance</Text>
        <Text style={styles.heroAmount}>{formatMinor(data.personalMinor)}</Text>
        <Text style={styles.heroMeta}>
          {currentCycleLabel} · cycle spend {formatMinor(categorySpend.reduce((sum, item) => sum + item.spentMinor, 0))}
        </Text>
      </LinearGradient>

      <FilterChips value={filter} options={filterOptions} onChange={setFilter} />

      <View style={styles.quickRow}>
        <Pressable style={styles.quickCard} onPress={() => router.push('/budgets')}>
          <MaterialCommunityIcons name="target" size={20} color={colors.accent} />
          <Text style={styles.quickTitle}>Budgets</Text>
          <Text style={styles.quickMeta}>Manage cycle targets</Text>
        </Pressable>
        <Pressable style={styles.quickCard} onPress={() => router.push('/categories')}>
          <MaterialCommunityIcons name="shape-outline" size={20} color={colors.success} />
          <Text style={styles.quickTitle}>Categories</Text>
          <Text style={styles.quickMeta}>Edit icons, colors, and structure</Text>
        </Pressable>
      </View>

      {data.loading && data.transactions.length === 0 ? (
        <View style={styles.section}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading your dashboard...</Text>
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
            {filteredBudgetAlerts.map((alert) => {
              const ratio = alert.spentMinor / alert.amountMinor;
              const tone = alert.level === 'critical' ? colors.danger : '#F5B942';
              return (
                <View key={alert.categoryId} style={styles.alertCard}>
                  <View style={styles.alertRow}>
                    <Text style={styles.alertTitle}>{alert.label}</Text>
                    <Text style={[styles.alertRatio, { color: tone }]}>{formatPercent(ratio)}</Text>
                  </View>
                  <Text style={styles.alertMeta}>
                    {formatMinor(alert.spentMinor)} of {formatMinor(alert.amountMinor)}
                  </Text>
                  <ProgressBar value={ratio} color={tone} />
                </View>
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
            categorySpend.map((item) => (
              <View key={item.categoryId} style={styles.categoryCard}>
                <View style={styles.alertRow}>
                  <Text style={styles.categoryLabel}>{item.label}</Text>
                  <Text style={styles.categoryAmount}>{formatMinor(item.spentMinor)}</Text>
                </View>
                <ProgressBar value={spendTotal === 0 ? 0 : item.spentMinor / spendTotal} color={item.color} />
              </View>
            ))
          )}
        </View>
      </View>

      {hints.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Helpful nudges</Text>
          <View style={styles.sectionBody}>
            {hints.map((hint) => (
              <View key={hint} style={styles.hintCard}>
                <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.accent} />
                <Text style={styles.hintText}>{hint}</Text>
              </View>
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
  heroMeta: { ...typography.body, color: colors.textMuted },
  quickRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quickTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  quickMeta: { ...typography.label, color: colors.textMuted },
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

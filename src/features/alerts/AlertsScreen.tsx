import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverview } from '@/features/overview/useOverview';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { scheduleWeeklySummary } from '@/lib/notifications';
import { formatMinor } from '@/lib/format';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';

const buildWeeklySummaryPreview = (
  categoryMeta: Record<string, { label: string }>,
  currentTransactions: ReturnType<typeof useOverview>['transactions'],
  previousTransactions: ReturnType<typeof useOverview>['transactions'],
  currentCycleId: string | null,
  previousCycleId: string | null,
  currentCycleRange: { startOn: string; endOnExclusive: string | null } | null,
  previousCycleRange: { startOn: string; endOnExclusive: string | null } | null,
  savingsMinor: number,
  openLoans: ReturnType<typeof useOverview>['openLoans'],
) => {
  const bucketTotals = (
    rows: typeof currentTransactions,
    range: { startOn: string; endOnExclusive: string | null } | null,
  ): Map<string, number> => {
    const totals = new Map<string, number>();
    if (!range) return totals;
    for (const row of rows) {
      if (row.kind !== 'expense' || row.shared || row.is_shared_topup || !row.category_id) continue;
      if (row.occurred_on < range.startOn) continue;
      if (range.endOnExclusive && row.occurred_on >= range.endOnExclusive) continue;
      totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor);
    }
    return totals;
  };

  const currentTotals = bucketTotals(currentTransactions, currentCycleRange);
  const previousTotals = bucketTotals(previousTransactions, previousCycleRange);
  const overspend = [...currentTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([categoryId, spentMinor]) => `${categoryMeta[categoryId]?.label ?? 'Category'} ${formatMinor(spentMinor)}`);

  let movementLabel = 'No previous-cycle comparison yet';
  let bestDelta = 0;
  const ids = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
  for (const categoryId of ids) {
    const delta = (currentTotals.get(categoryId) ?? 0) - (previousTotals.get(categoryId) ?? 0);
    if (Math.abs(delta) > Math.abs(bestDelta)) {
      bestDelta = delta;
      movementLabel = `${categoryMeta[categoryId]?.label ?? 'Category'} ${delta >= 0 ? 'up' : 'down'} ${formatMinor(Math.abs(delta))}`;
    }
  }

  const loansRemaining = openLoans.reduce((sum, loan) => sum + loan.remaining_minor, 0);
  const title = currentCycleId ? 'Weekly money summary' : 'Weekly check-in';
  const body = [
    overspend.length > 0 ? `Top spend: ${overspend.join(' · ')}` : 'No overspend categories yet.',
    previousCycleId ? `Biggest movement: ${movementLabel}` : 'Log another salary cycle to compare movement.',
    `Savings ${formatMinor(savingsMinor)} · Loans ${formatMinor(loansRemaining)}`,
  ].join(' ');

  return { title, body };
};

export default function AlertsScreen() {
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);

  const preview = useMemo(
    () =>
      buildWeeklySummaryPreview(
        categoryMeta,
        data.transactions,
        data.transactions,
        data.activeCycle?.id ?? null,
        data.previousCycle?.id ?? null,
        data.activeCycle,
        data.previousCycle,
        data.savingsMinor,
        data.openLoans,
      ),
    [categoryMeta, data.activeCycle, data.openLoans, data.previousCycle, data.savingsMinor, data.transactions],
  );

  const hints = [
    data.transactions.length === 0 ? 'Log your first transaction so alerts can become behavioral instead of empty.' : null,
    data.shared.userTopupTotal === 0 ? 'Your first shared top-up unlocks the fairness view and ratio explanation.' : null,
    data.budgets.length === 0 ? 'Set one budget to start getting calm warning states before overspending sneaks up.' : null,
  ].filter((value): value is string => value !== null);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const enableWeeklySummary = async (): Promise<void> => {
    setScheduling(true);
    try {
      await scheduleWeeklySummary(preview.title, preview.body);
    } finally {
      setScheduling(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
      >
        <ScreenHeader back title="Alerts" subtitle="Warnings, reminders, and weekly context" />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Weekly summary preview</Text>
          <Text style={styles.heroBody}>{preview.body}</Text>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, (pressed || scheduling) && styles.buttonPressed]}
            onPress={() => {
              void enableWeeklySummary();
            }}
            disabled={scheduling}
          >
            <Text style={styles.primaryButtonText}>{scheduling ? 'Scheduling...' : 'Enable weekly reminder'}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget alerts</Text>
          {data.budgetAlerts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nothing urgent right now. Budgets stay visible here once a category crosses 80%.</Text>
            </View>
          ) : (
            data.budgetAlerts.map((alert) => {
              const tone = alert.level === 'critical' ? colors.danger : '#F5B942';
              return (
                <View key={alert.categoryId} style={[styles.alertCard, { borderColor: `${tone}66` }]}>
                  <View style={styles.alertHead}>
                    <MaterialCommunityIcons
                      name={alert.level === 'critical' ? 'alert-circle' : 'alert-outline'}
                      size={18}
                      color={tone}
                    />
                    <Text style={styles.alertTitle}>
                      {categoryMeta[alert.categoryId]?.label ?? alert.label}
                    </Text>
                  </View>
                  <Text style={styles.alertMeta}>
                    {formatMinor(alert.spentMinor)} of {formatMinor(alert.amountMinor)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Helpful nudges</Text>
          {hints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Your setup is in a good place. This screen will stay quiet unless it has something useful to say.</Text>
            </View>
          ) : (
            hints.map((hint) => (
              <View key={hint} style={styles.hintCard}>
                <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.accent} />
                <Text style={styles.hintText}>{hint}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 3, gap: spacing.lg },
  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  heroTitle: { ...typography.h2, color: colors.text },
  heroBody: { ...typography.body, color: colors.textMuted },
  primaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { ...typography.label, color: colors.text, fontWeight: '700' },
  buttonPressed: { opacity: 0.86 },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  alertCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    gap: spacing.xs,
  },
  alertHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  alertTitle: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  alertMeta: { ...typography.label, color: colors.textMuted },
  hintCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  hintText: { ...typography.body, color: colors.text, flex: 1 },
});

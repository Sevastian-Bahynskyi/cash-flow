import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BarChart } from 'react-native-gifted-charts';
import { runDetached } from '@/lib/async';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ErrorCard } from '@/ui/ErrorCard';
import { HeroPagerArrows } from '@/ui/HeroPagerArrows';
import { useMotionRefresh } from '@/ui/useMotionRefresh';
import { FilterChips } from '@/ui/FilterChips';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { useProfile } from '@/features/profile/ProfileProvider';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatMinor, formatPercent } from '@/lib/format';
import { type DashboardRange, useDashboard } from './useDashboard';
import { ExpenseWaffleChart } from './ExpenseWaffleChart';

const rangeOptions = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
] as const satisfies readonly { label: string; value: DashboardRange }[];

function DashboardSkeleton() {
  return (
    <>
      <View style={styles.skeletonChipRow}>
        <SkeletonBlock width={92} height={36} radius={radius.pill} />
        <SkeletonBlock width={104} height={36} radius={radius.pill} />
        <SkeletonBlock width={92} height={36} radius={radius.pill} />
      </View>
      <SkeletonCard style={styles.summaryCard}>
        <SkeletonBlock width={118} height={12} radius={radius.sm} />
        <SkeletonBlock width="48%" height={46} radius={radius.md} />
        <SkeletonBlock width="64%" height={14} radius={radius.sm} />
      </SkeletonCard>
      <SkeletonCard style={styles.chartCard}>
        <SkeletonBlock width="32%" height={20} />
        <SkeletonBlock width="52%" height={12} radius={radius.sm} />
        <SkeletonBlock width="100%" height={220} radius={radius.md} />
      </SkeletonCard>
      <SkeletonCard style={styles.chartCard}>
        <SkeletonBlock width="32%" height={20} />
        <SkeletonBlock width="52%" height={12} radius={radius.sm} />
        {[0, 1, 2, 3].map((item) => (
          <View key={item} style={styles.skeletonCategoryRow}>
            <View style={styles.categoryHeading}>
              <SkeletonBlock width={32} height={32} radius={radius.md} />
              <SkeletonBlock width="36%" height={16} />
              <SkeletonBlock width={72} height={16} />
            </View>
            <SkeletonBlock width="100%" height={8} radius={radius.pill} />
          </View>
        ))}
      </SkeletonCard>
    </>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const profile = useProfile();
  const [range, setRange] = useState<DashboardRange>('monthly');
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [selectedExpenseIndex, setSelectedExpenseIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const motionRun = useMotionRefresh();
  const analytics = useDashboard(range, selectedWindowId);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const visibleContentWidth = Math.min(width, 1040) - spacing.lg * 4;
  const chartWidth = Math.max(240, visibleContentWidth - 64, analytics.chartWidth);
  const waffleSize = width < 390 ? 176 : 204;

  const cashFlowBarData = useMemo(
    () => analytics.buckets.map((bucket) => ({
      value: bucket.cashFlowMinor / 100,
      label: bucket.axisLabel,
      frontColor: bucket.cashFlowMinor >= 0 ? colors.success : colors.danger,
      labelTextStyle: styles.axisText,
      barBorderRadius: 6,
    })),
    [analytics.buckets],
  );

  useEffect(() => {
    setSelectedWindowId(null);
  }, [range]);

  useEffect(() => {
    setSelectedExpenseIndex(0);
  }, [analytics.categoryBreakdown]);

  const selectedWindowIndex = Math.max(
    0,
    analytics.windows.findIndex((window) => window.id === analytics.selectedWindowId),
  );
  const selectedExpenseCategory =
    analytics.categoryBreakdown[selectedExpenseIndex] ?? analytics.categoryBreakdown[0] ?? null;

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await analytics.reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MotionScope value={motionRun}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isWide && styles.contentDesktop]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => runDetached(onRefresh(), 'dashboard.refresh')}
            tintColor={colors.text}
          />
        }
      >
        <ScreenHeader
          title="Spending"
          subtitle="See where your money went"
          avatar={{ uri: profile.avatarUrl, onPress: () => router.push('/profile' as never) }}
        />

        {analytics.isInitialLoading ? <DashboardSkeleton /> : null}

        {!analytics.isInitialLoading ? (
          <>
            <FilterChips value={range} options={rangeOptions} onChange={setRange} />

            {analytics.error ? (
              <ErrorCard title="Spending needs a refresh">
                <Text style={styles.emptyText}>{analytics.error}</Text>
              </ErrorCard>
            ) : null}

            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryLabel}>Net cash flow</Text>
                  <Text
                    style={[
                      styles.summaryAmount,
                      { color: analytics.summary.cashFlowMinor >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {formatMinor(analytics.summary.cashFlowMinor)}
                  </Text>
                  <Text style={styles.summaryPeriod}>{analytics.rangeDescription}</Text>
                </View>
                {analytics.windows.length > 1 ? (
                  <HeroPagerArrows
                    prevDisabled={selectedWindowIndex <= 0}
                    nextDisabled={selectedWindowIndex >= analytics.windows.length - 1}
                    onPrev={() => {
                      const previous = analytics.windows[selectedWindowIndex - 1];
                      if (!previous) return;
                      setSelectedWindowId(previous.id);
                      Haptics.selectionAsync().catch(() => undefined);
                    }}
                    onNext={() => {
                      const next = analytics.windows[selectedWindowIndex + 1];
                      if (!next) return;
                      setSelectedWindowId(next.id);
                      Haptics.selectionAsync().catch(() => undefined);
                    }}
                  />
                ) : null}
              </View>
              <View style={styles.summaryFacts}>
                <View style={styles.summaryFact}>
                  <Text style={styles.summaryFactLabel}>Income</Text>
                  <Text style={[styles.summaryFactValue, { color: colors.success }]}>
                    {formatMinor(analytics.summary.incomeMinor)}
                  </Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryFact}>
                  <Text style={styles.summaryFactLabel}>Money out</Text>
                  <Text style={[styles.summaryFactValue, { color: colors.danger }]}>
                    {formatMinor(analytics.summary.outflowMinor)}
                  </Text>
                </View>
              </View>
            </View>

            {!analytics.hasTransactionsInRange ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No spending in this period</Text>
                <Text style={styles.emptyText}>Expenses will appear here after you add them.</Text>
              </View>
            ) : (
              <>
                <MotionView direction="up" distance={100} delayMs={120}>
                  <View style={styles.chartCard}>
                    <View>
                      <Text style={styles.cardTitle}>Cash flow over time</Text>
                      <Text style={styles.cardMeta}>Green means more came in. Red means more went out.</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                        <Text style={styles.legendText}>Positive net</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                        <Text style={styles.legendText}>Negative net</Text>
                      </View>
                    </View>
                    <BarChart
                      width={chartWidth}
                      height={220}
                      data={cashFlowBarData}
                      isAnimated
                      animationDuration={500}
                      maxValue={analytics.chartBounds.cashFlowMax}
                      mostNegativeValue={analytics.chartBounds.mostNegativeCashFlow}
                      noOfSections={3}
                      noOfSectionsBelowXAxis={3}
                      spacing={range === 'monthly' ? 18 : 34}
                      initialSpacing={12}
                      endSpacing={20}
                      barWidth={range === 'monthly' ? 12 : 18}
                      yAxisColor={colors.border}
                      xAxisColor={colors.border}
                      rulesColor="rgba(255,255,255,0.07)"
                      yAxisTextStyle={styles.axisText}
                      xAxisLabelTextStyle={styles.axisText}
                      yAxisLabelWidth={52}
                      disableScroll={chartWidth <= visibleContentWidth}
                      nestedScrollEnabled
                      formatYLabel={analytics.compactAxisValue}
                    />
                  </View>
                </MotionView>

                <MotionView direction="up" distance={100} delayMs={180}>
                  <View style={styles.chartCard}>
                    <View>
                      <Text style={styles.cardTitle}>Expense split</Text>
                      <Text style={styles.cardMeta}>Personal spending grouped by category.</Text>
                    </View>

                    {analytics.categoryBreakdown.length > 0 ? (
                      <View style={[styles.expenseLayout, isWide && styles.expenseLayoutWide]}>
                        <View style={styles.waffleColumn}>
                          <ExpenseWaffleChart
                            categories={analytics.categoryBreakdown}
                            selectedIndex={selectedExpenseIndex}
                            onSelect={setSelectedExpenseIndex}
                            size={waffleSize}
                          />
                          {selectedExpenseCategory ? (
                            <View style={styles.selectedCategory}>
                              <Text style={styles.selectedCategoryName}>{selectedExpenseCategory.label}</Text>
                              <Text style={styles.selectedCategoryAmount}>
                                {formatMinor(selectedExpenseCategory.amountMinor)} · {formatPercent(selectedExpenseCategory.share)}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.categoryList}>
                          {analytics.categoryBreakdown.map((category, index) => (
                            <Pressable
                              key={category.categoryId}
                              accessibilityRole="button"
                              accessibilityLabel={`Show ${category.label}`}
                              onPress={() => setSelectedExpenseIndex(index)}
                              style={({ pressed }) => [
                                styles.categoryRow,
                                index === selectedExpenseIndex && {
                                  backgroundColor: `${category.color}14`,
                                  borderColor: `${category.color}44`,
                                },
                                pressed && styles.categoryRowPressed,
                              ]}
                            >
                              <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}22` }]}>
                                <CategoryIcon name={category.icon} size={17} color={category.color} />
                              </View>
                              <View style={styles.categoryCopy}>
                                <Text style={styles.categoryLabel} numberOfLines={1}>{category.label}</Text>
                                <Text style={styles.categoryShare}>{formatPercent(category.share)}</Text>
                              </View>
                              <Text style={styles.categoryAmount}>{formatMinor(category.amountMinor)}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <View style={styles.emptyInset}>
                        <Text style={styles.emptyText}>No categorized expenses in this period.</Text>
                      </View>
                    )}
                  </View>
                </MotionView>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 4, paddingHorizontal: spacing.lg, gap: spacing.lg },
  contentDesktop: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: spacing.xl },
  skeletonChipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  summaryCopy: { flex: 1, gap: spacing.xs },
  summaryLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryAmount: { color: colors.text, fontSize: 40, lineHeight: 46, fontWeight: '700' },
  summaryPeriod: { ...typography.label, color: colors.textMuted },
  summaryFacts: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  summaryFact: { flex: 1, gap: 3 },
  summaryFactLabel: { ...typography.label, color: colors.textMuted },
  summaryFactValue: { ...typography.body, fontWeight: '700' },
  summaryDivider: { width: 1, height: 34, backgroundColor: colors.border, marginHorizontal: spacing.md },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...typography.body, color: colors.text, fontSize: 18, fontWeight: '700' },
  cardMeta: { ...typography.label, color: colors.textMuted, marginTop: 3 },
  axisText: { color: colors.textMuted, fontSize: 11 },
  legendRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill },
  legendText: { ...typography.label, color: colors.textMuted },
  expenseLayout: { gap: spacing.lg },
  expenseLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  waffleColumn: { alignItems: 'center', gap: spacing.md, minWidth: 240 },
  selectedCategory: { alignItems: 'center', gap: 2 },
  selectedCategoryName: { ...typography.body, color: colors.text, fontWeight: '700' },
  selectedCategoryAmount: { ...typography.label, color: colors.textMuted },
  categoryList: { flex: 1, gap: spacing.xs },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryRowPressed: { opacity: 0.82 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryCopy: { flex: 1, gap: 2 },
  categoryLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  categoryAmount: { ...typography.body, color: colors.text, fontWeight: '700' },
  categoryShare: { ...typography.label, color: colors.textMuted },
  skeletonCategoryRow: { gap: spacing.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  emptyInset: { paddingVertical: spacing.lg },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  emptyText: { ...typography.body, color: colors.textMuted },
});

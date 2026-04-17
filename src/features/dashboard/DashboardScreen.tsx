import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { runDetached } from '@/lib/async';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { HeroCard } from '@/ui/HeroCard';
import { ErrorCard } from '@/ui/ErrorCard';
import { HeroPagerArrows } from '@/ui/HeroPagerArrows';
import { useMotionRefresh } from '@/ui/useMotionRefresh';
import { FilterChips } from '@/ui/FilterChips';
import { ScreenHeader } from '@/ui/ScreenHeader';
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

function MetricCard({
  icon,
  label,
  value,
  tone = colors.text,
}: {
  icon: keyof typeof FontAwesome6.glyphMap;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <FontAwesome6 name={icon} size={18} color={tone} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <View style={styles.skeletonChipRow}>
        <SkeletonBlock width={92} height={36} radius={radius.pill} />
        <SkeletonBlock width={104} height={36} radius={radius.pill} />
        <SkeletonBlock width={92} height={36} radius={radius.pill} />
      </View>

      <SkeletonCard style={styles.heroSkeletonCard}>
        <SkeletonBlock width={118} height={12} radius={radius.sm} />
        <SkeletonBlock width="56%" height={48} radius={radius.md} />
        <SkeletonBlock width="72%" height={16} />
      </SkeletonCard>

      <View style={styles.section}>
        <View style={styles.metricsGrid}>
          {[0, 1, 2, 3].map((item) => (
            <SkeletonCard key={item} style={styles.metricCard}>
              <SkeletonBlock width={18} height={18} radius={radius.sm} />
              <SkeletonBlock width="44%" height={12} radius={radius.sm} />
              <SkeletonBlock width="64%" height={18} />
            </SkeletonCard>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SkeletonCard style={styles.chartCard}>
          <SkeletonBlock width="34%" height={18} />
          <SkeletonBlock width="62%" height={12} radius={radius.sm} />
          <SkeletonBlock width="100%" height={220} radius={radius.md} />
          <SkeletonBlock width="78%" height={12} radius={radius.sm} />
        </SkeletonCard>
      </View>

      <View style={styles.section}>
        <View style={styles.chartGrid}>
          <SkeletonCard style={styles.chartCard}>
            <SkeletonBlock width="36%" height={18} />
            <SkeletonBlock width="66%" height={12} radius={radius.sm} />
            <SkeletonBlock width="100%" height={260} radius={radius.md} />
          </SkeletonCard>

          <SkeletonCard style={styles.chartCard}>
            <SkeletonBlock width="42%" height={18} />
            <SkeletonBlock width="56%" height={12} radius={radius.sm} />
            <View style={styles.categoryList}>
              {[0, 1, 2, 3].map((item) => (
                <View key={item} style={styles.skeletonCategoryRow}>
                  <View style={styles.categoryLead}>
                    <SkeletonBlock width={32} height={32} radius={radius.md} />
                    <View style={styles.categoryCopy}>
                      <SkeletonBlock width="74%" height={16} />
                      <SkeletonBlock width="28%" height={12} radius={radius.sm} />
                    </View>
                  </View>
                  <SkeletonBlock width={72} height={16} />
                </View>
              ))}
            </View>
          </SkeletonCard>
        </View>
      </View>
    </>
  );
}

export default function DashboardScreen() {
  const [range, setRange] = useState<DashboardRange>('monthly');
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const motionRun = useMotionRefresh();
  const [selectedExpenseIndex, setSelectedExpenseIndex] = useState(0);
  const analytics = useDashboard(range, selectedWindowId);
  const { width } = useWindowDimensions();

  const contentWidth = Math.max(width - spacing.lg * 2 - spacing.md * 2, 280);
  const chartWidth = Math.max(contentWidth, analytics.chartWidth);

  const note = useMemo(() => {
    if (analytics.summary.topupMinor === 0) {
      return 'Cash flow includes income and all personal outflow for the selected window.';
    }
    return `Cash flow includes ${formatMinor(analytics.summary.topupMinor)} in shared top-ups.`;
  }, [analytics.summary.topupMinor]);

  useEffect(() => {
    setSelectedExpenseIndex(0);
  }, [analytics.categoryBreakdown]);

  useEffect(() => {
    setSelectedWindowId(null);
  }, [range]);

  const selectedExpenseCategory =
    analytics.categoryBreakdown[selectedExpenseIndex] ?? analytics.categoryBreakdown[0] ?? null;
  const selectedWindowIndex = Math.max(
    0,
    analytics.windows.findIndex((window) => window.id === analytics.selectedWindowId),
  );
  const waffleSize = width < 390 ? 176 : 204;

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
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => runDetached(onRefresh(), 'dashboard.refresh')}
            tintColor={colors.text}
          />
        }
      >
        <ScreenHeader title="Dashboard" subtitle="Weekly, monthly, yearly flow" />

        {analytics.isInitialLoading ? <DashboardSkeleton /> : null}

        {!analytics.isInitialLoading ? (
          <>
            <FilterChips value={range} options={rangeOptions} onChange={setRange} />

            <View style={styles.heroWrap}>
              <HeroCard
                eyebrow={analytics.rangeLabel}
                dateRange={analytics.rangeDescription}
                amount={formatMinor(analytics.summary.cashFlowMinor)}
              />

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

            {analytics.error ? (
              <View style={styles.section}>
                <ErrorCard title="Dashboard needs a refresh">
                  <Text style={styles.emptyText}>{analytics.error}</Text>
                </ErrorCard>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.metricsGrid}>
                <MotionView style={styles.metricMotion} direction="left" distance={130} delayMs={140}>
                  <MetricCard icon="money-bill-trend-up" label="Income" value={formatMinor(analytics.summary.incomeMinor)} tone={colors.success} />
                </MotionView>
                <MotionView style={styles.metricMotion} direction="right" distance={130} delayMs={180}>
                  <MetricCard icon="money-bill-wave" label="Outflow" value={formatMinor(analytics.summary.outflowMinor)} tone={colors.accentAlt} />
                </MotionView>
                <MotionView style={styles.metricMotion} direction="left" distance={130} delayMs={220}>
                  <MetricCard icon="chart-line" label="Net flow" value={formatMinor(analytics.summary.cashFlowMinor)} tone={analytics.summary.cashFlowMinor >= 0 ? colors.success : colors.danger} />
                </MotionView>
                <MotionView style={styles.metricMotion} direction="right" distance={130} delayMs={260}>
                  <MetricCard
                    icon="star"
                    label="Largest category"
                    value={analytics.summary.largestCategory ? analytics.summary.largestCategory.label : 'No expense data'}
                    tone={analytics.summary.largestCategory?.color ?? colors.text}
                  />
                </MotionView>
              </View>
            </View>

            {!analytics.hasTransactionsInRange ? (
              <View style={styles.section}>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No transactions in this window yet</Text>
                  <Text style={styles.emptyText}>
                    Log income or spending in this {range.slice(0, -2)} view to unlock the charts.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <MotionView direction="up" distance={145} delayMs={180}>
                    <View style={styles.chartCard}>
                      <View style={styles.chartHeader}>
                        <View>
                          <Text style={styles.cardTitle}>Cash flow</Text>
                          <Text style={styles.cardMeta}>{analytics.bucketUnitLabel} net movement across {analytics.rangeLabel.toLowerCase()}</Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: 'rgba(61,214,140,0.12)' }]}>
                          <Text style={[styles.badgeText, { color: colors.success }]}>
                            {analytics.summary.cashFlowMinor >= 0 ? 'Positive' : 'Caution'}
                          </Text>
                        </View>
                      </View>

                      <LineChart
                        width={chartWidth}
                        height={220}
                        data={analytics.cashFlowLineData}
                        areaChart
                        curved
                        isAnimated
                        animationDuration={700}
                        color={colors.accent}
                        startFillColor="rgba(124,92,255,0.34)"
                        endFillColor="rgba(124,92,255,0.04)"
                        startOpacity={0.5}
                        endOpacity={0.05}
                        mostNegativeValue={analytics.chartBounds.mostNegativeCashFlow}
                        maxValue={analytics.chartBounds.cashFlowMax}
                        noOfSections={4}
                        spacing={range === 'monthly' ? 28 : 48}
                        initialSpacing={12}
                        endSpacing={24}
                        yAxisColor={colors.border}
                        xAxisColor={colors.border}
                        rulesColor="rgba(255,255,255,0.08)"
                        yAxisTextStyle={styles.axisText}
                        xAxisLabelTextStyle={styles.axisText}
                        yAxisLabelWidth={52}
                        disableScroll={chartWidth <= contentWidth}
                        nestedScrollEnabled
                        hideDataPoints={false}
                        dataPointsRadius={4}
                        dataPointsColor={colors.accent}
                        formatYLabel={analytics.compactAxisValue}
                      />

                      <Text style={styles.chartFootnote}>{note}</Text>
                    </View>
                  </MotionView>
                </View>

                <View style={styles.section}>
                  <MotionView direction="right" distance={155} delayMs={210}>
                    <View style={styles.chartCard}>
                      <View style={styles.chartHeader}>
                        <View>
                          <Text style={styles.cardTitle}>Income vs outflow</Text>
                          <Text style={styles.cardMeta}>Bars show cash out, the line tracks income</Text>
                        </View>
                      </View>

                      <View style={styles.legendRow}>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: colors.accentAlt }]} />
                          <Text style={styles.legendText}>Outflow</Text>
                        </View>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                          <Text style={styles.legendText}>Income</Text>
                        </View>
                      </View>

                      <BarChart
                        width={chartWidth}
                        height={220}
                        data={analytics.expenseBarData}
                        showLine
                        lineData={analytics.incomeLineData}
                        lineConfig={{
                          color: colors.success,
                          thickness: 3,
                          curved: true,
                          isAnimated: true,
                          hideDataPoints: false,
                          dataPointsRadius: 4,
                          dataPointsColor: colors.success,
                        }}
                        isAnimated
                        animationDuration={700}
                        maxValue={analytics.chartBounds.incomeVsOutflowMax}
                        noOfSections={4}
                        spacing={range === 'monthly' ? 18 : 28}
                        initialSpacing={12}
                        endSpacing={24}
                        barWidth={range === 'monthly' ? 14 : 20}
                        roundedTop
                        roundedBottom={false}
                        yAxisColor={colors.border}
                        xAxisColor={colors.border}
                        rulesColor="rgba(255,255,255,0.08)"
                        yAxisTextStyle={styles.axisText}
                        xAxisLabelTextStyle={styles.axisText}
                        yAxisLabelWidth={52}
                        disableScroll={chartWidth <= contentWidth}
                        nestedScrollEnabled
                        formatYLabel={analytics.compactAxisValue}
                      />
                    </View>
                  </MotionView>
                </View>

                <View style={styles.section}>
                  <View style={styles.chartGrid}>
                    <MotionView style={styles.chartGridPrimary} direction="left" distance={150} delayMs={240}>
                      <View style={styles.chartCard}>
                        <Text style={styles.cardTitle}>Expense split</Text>
                        <Text style={styles.cardMeta}>
                          Personal expenses grouped by parent categories. Tap a block or row to inspect the amount.
                        </Text>

                        {analytics.categoryBreakdown.length > 0 ? (
                          <View style={styles.pieDetailRow}>
                            <ExpenseWaffleChart
                              categories={analytics.categoryBreakdown}
                              selectedIndex={selectedExpenseIndex}
                              onSelect={setSelectedExpenseIndex}
                              size={waffleSize}
                            />

                            {selectedExpenseCategory ? (
                              <View
                                style={[
                                  styles.pieSelectionCard,
                                  {
                                    backgroundColor: `${selectedExpenseCategory.color}14`,
                                    borderColor: `${selectedExpenseCategory.color}55`,
                                  },
                                ]}
                              >
                                <View style={styles.pieSelectionHead}>
                                  <View style={[styles.categoryIconWrap, styles.pieSelectionIconWrap, { backgroundColor: `${selectedExpenseCategory.color}22` }]}>
                                    <CategoryIcon
                                      name={selectedExpenseCategory.icon}
                                      size={16}
                                      color={selectedExpenseCategory.color}
                                    />
                                  </View>
                                  <Text style={styles.pieSelectionLabel}>Selected category</Text>
                                </View>
                                <Text style={styles.pieSelectionCategory}>{selectedExpenseCategory.label}</Text>
                                <Text style={styles.pieSelectionAmount}>{formatMinor(selectedExpenseCategory.amountMinor)}</Text>
                                <Text style={styles.pieSelectionMeta}>{formatPercent(selectedExpenseCategory.share)} of expenses</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : (
                          <View style={styles.emptyInset}>
                            <Text style={styles.emptyText}>No expense categories in this range yet.</Text>
                          </View>
                        )}
                      </View>
                    </MotionView>

                    <MotionView style={styles.chartGridSecondary} direction="right" distance={150} delayMs={270}>
                      <View style={styles.chartCard}>
                        <Text style={styles.cardTitle}>Where money went</Text>
                        <Text style={styles.cardMeta}>Top categories ranked by spend</Text>

                        {analytics.categoryBreakdown.length > 0 ? (
                          <View style={styles.categoryList}>
                            {analytics.categoryBreakdown.map((category, index) => (
                              <Pressable
                                key={category.categoryId}
                                accessibilityRole="button"
                                accessibilityLabel={`Show ${category.label}`}
                                onPress={() => setSelectedExpenseIndex(index)}
                                style={({ pressed }) => [
                                  styles.categoryRow,
                                  index === selectedExpenseIndex
                                    ? {
                                      backgroundColor: `${category.color}16`,
                                      borderColor: `${category.color}55`,
                                    }
                                    : null,
                                  pressed ? styles.categoryRowPressed : null,
                                ]}
                              >
                                <View style={styles.categoryLead}>
                                  <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}22` }]}>
                                    <CategoryIcon name={category.icon} size={18} color={category.color} />
                                  </View>
                                  <View style={styles.categoryCopy}>
                                    <Text style={styles.categoryLabel} numberOfLines={1}>
                                      {index + 1}. {category.label}
                                    </Text>
                                    <Text style={styles.categoryShare}>{formatPercent(category.share)}</Text>
                                  </View>
                                </View>
                                <Text style={styles.categoryAmount}>{formatMinor(category.amountMinor)}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : (
                          <View style={styles.emptyInset}>
                            <Text style={styles.emptyText}>Your category breakdown will appear here.</Text>
                          </View>
                        )}
                      </View>
                    </MotionView>
                  </View>
                </View>
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
  content: { paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  contentDesktop: { width: '100%', maxWidth: 1360, alignSelf: 'center', paddingHorizontal: spacing.xl },
  heroWrap: { marginHorizontal: spacing.lg },
  heroSkeletonCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  skeletonChipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, flexWrap: 'wrap' },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  metricsGrid: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  metricMotion: { width: '48%' },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { ...typography.body, fontSize: 18, fontWeight: '700' },
  chartGrid: { gap: spacing.md },
  chartGridPrimary: { flex: 1 },
  chartGridSecondary: { flex: 1 },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'flex-start' },
  cardTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  cardMeta: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexShrink: 1,
  },
  badgeText: { ...typography.label, fontWeight: '700', fontSize: 11 },
  axisText: { color: colors.textMuted, fontSize: 11 },
  chartFootnote: { ...typography.label, color: colors.textMuted },
  legendRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: radius.pill },
  legendText: { ...typography.label, color: colors.textMuted },
  pieDetailRow: { flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  pieSelectionCard: {
    flex: 1,
    minWidth: '100%',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  pieSelectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pieSelectionIconWrap: { width: 28, height: 28 },
  pieSelectionLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  pieSelectionCategory: { ...typography.body, color: colors.text, fontWeight: '700' },
  pieSelectionAmount: { ...typography.body, color: colors.text, fontSize: 18, fontWeight: '700' },
  pieSelectionMeta: { ...typography.label, color: colors.textMuted },
  categoryList: { gap: spacing.sm },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryRowPressed: { opacity: 0.86 },
  categoryLead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flex: 1 },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryCopy: { flex: 1, gap: 2 },
  categoryLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  categoryShare: { ...typography.label, color: colors.textMuted },
  categoryAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
  skeletonCategoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  emptyInset: { paddingVertical: spacing.lg },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  emptyText: { ...typography.body, color: colors.textMuted },
});

import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { runDetached } from '@/lib/async';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ErrorCard } from '@/ui/ErrorCard';
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

type CashFlowPoint = {
  valueMinor: number;
  incomeMinor: number;
  outflowMinor: number;
  label: string;
};

const rangeOptions = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
] as const satisfies readonly { label: string; value: DashboardRange }[];

function CashFlowTrend({
  points,
  selectedIndex,
  onSelect,
}: {
  points: readonly CashFlowPoint[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const viewWidth = 800;
  const viewHeight = 210;
  const plotTop = 14;
  const plotBottom = 170;
  const plotLeft = 12;
  const plotRight = 12;
  const values = [0, ...points.map((point) => point.valueMinor)];
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const rawRange = Math.max(1, maximum - minimum);
  const paddedMinimum = minimum - rawRange * 0.1;
  const paddedMaximum = maximum + rawRange * 0.1;
  const paddedRange = paddedMaximum - paddedMinimum;
  const plotWidth = viewWidth - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const xFor = (index: number): number =>
    plotLeft + (values.length === 1 ? 0 : (index / (values.length - 1)) * plotWidth);
  const yFor = (value: number): number =>
    plotTop + ((paddedMaximum - value) / paddedRange) * plotHeight;
  const zeroY = yFor(0);
  const linePath = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(value)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xFor(values.length - 1)} ${zeroY} L ${xFor(0)} ${zeroY} Z`;
  const endValue = values[values.length - 1] ?? 0;
  const tone = endValue >= 0 ? colors.success : colors.danger;
  const labelIndices = [...new Set([1, Math.ceil(points.length / 2), points.length])]
    .filter((index) => index > 0 && index <= points.length);
  const selectedPointIndex = Math.min(Math.max(selectedIndex + 1, 1), values.length - 1);
  const segmentWidth = values.length > 1 ? plotWidth / (values.length - 1) : plotWidth;

  return (
    <View style={styles.trendChart} accessibilityLabel="Running cash flow chart">
      <Svg width="100%" height={viewHeight} viewBox={`0 0 ${viewWidth} ${viewHeight}`}>
        <Defs>
          <LinearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone} stopOpacity="0.28" />
            <Stop offset="1" stopColor={tone} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line
          x1={plotLeft}
          x2={viewWidth - plotRight}
          y1={zeroY}
          y2={zeroY}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="5 6"
        />
        <Path d={areaPath} fill="url(#cashFlowFill)" />
        <Path d={linePath} fill="none" stroke={tone} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={xFor(values.length - 1)} cy={yFor(endValue)} r={6} fill={tone} />
        {points.length > 0 ? (
          <>
            <Line
              x1={xFor(selectedPointIndex)}
              x2={xFor(selectedPointIndex)}
              y1={plotTop}
              y2={plotBottom}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4 5"
            />
            <Circle
              cx={xFor(selectedPointIndex)}
              cy={yFor(values[selectedPointIndex] ?? 0)}
              r={7}
              fill={colors.surface}
              stroke={tone}
              strokeWidth={4}
            />
          </>
        ) : null}
        {labelIndices.map((index) => (
          <SvgText
            key={index}
            x={xFor(index)}
            y={200}
            fill={colors.textMuted}
            fontSize={12}
            textAnchor={index === 1 ? 'start' : index === points.length ? 'end' : 'middle'}
          >
            {points[index - 1]?.label}
          </SvgText>
        ))}
        {points.map((point, index) => {
          const pointIndex = index + 1;
          const regionStart = Math.max(plotLeft, xFor(pointIndex) - segmentWidth / 2);
          const regionEnd = Math.min(viewWidth - plotRight, xFor(pointIndex) + segmentWidth / 2);
          return (
            <Rect
              key={`${point.label}-${index}`}
              x={regionStart}
              y={plotTop}
              width={Math.max(1, regionEnd - regionStart)}
              height={plotHeight}
              fill="rgba(255,255,255,0.001)"
              onPress={() => onSelect(index)}
            />
          );
        })}
      </Svg>
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
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const motionRun = useMotionRefresh();
  const analytics = useDashboard(range, selectedWindowId);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const waffleSize = width < 390 ? 176 : 204;

  const cashFlowTrend = useMemo(
    () => {
      let runningMinor = 0;
      return analytics.buckets.map((bucket) => {
        runningMinor += bucket.cashFlowMinor;
        return {
          valueMinor: runningMinor,
          incomeMinor: bucket.incomeMinor,
          outflowMinor: bucket.outflowMinor,
          label: bucket.axisLabel || bucket.label,
        };
      });
    },
    [analytics.buckets],
  );

  useEffect(() => {
    setSelectedWindowId(null);
  }, [range]);

  useEffect(() => {
    setSelectedExpenseIndex(0);
  }, [analytics.categoryBreakdown]);

  useEffect(() => {
    setSelectedTrendIndex(Math.max(0, cashFlowTrend.length - 1));
  }, [analytics.selectedWindowId, cashFlowTrend.length, range]);

  const selectedWindowIndex = Math.max(
    0,
    analytics.windows.findIndex((window) => window.id === analytics.selectedWindowId),
  );
  const selectedExpenseCategory =
    analytics.categoryBreakdown[selectedExpenseIndex] ?? analytics.categoryBreakdown[0] ?? null;
  const selectedTrendPoint = cashFlowTrend[selectedTrendIndex] ?? cashFlowTrend[cashFlowTrend.length - 1] ?? null;

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
                  <View style={styles.summaryTopRow}>
                    <Text style={styles.summaryLabel}>Net cash flow</Text>
                    {analytics.windows.length > 1 ? (
                      <View style={styles.periodNavigation}>
                        <Pressable
                          accessibilityLabel="Previous period"
                          disabled={selectedWindowIndex <= 0}
                          style={({ pressed }) => [
                            styles.periodButton,
                            selectedWindowIndex <= 0 && styles.periodButtonDisabled,
                            pressed && styles.periodButtonPressed,
                          ]}
                          onPress={() => {
                            const previous = analytics.windows[selectedWindowIndex - 1];
                            if (!previous) return;
                            setSelectedWindowId(previous.id);
                            Haptics.selectionAsync().catch(() => undefined);
                          }}
                        >
                          <FontAwesome6 name="chevron-left" size={14} color={colors.text} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Next period"
                          disabled={selectedWindowIndex >= analytics.windows.length - 1}
                          style={({ pressed }) => [
                            styles.periodButton,
                            selectedWindowIndex >= analytics.windows.length - 1 && styles.periodButtonDisabled,
                            pressed && styles.periodButtonPressed,
                          ]}
                          onPress={() => {
                            const next = analytics.windows[selectedWindowIndex + 1];
                            if (!next) return;
                            setSelectedWindowId(next.id);
                            Haptics.selectionAsync().catch(() => undefined);
                          }}
                        >
                          <FontAwesome6 name="chevron-right" size={14} color={colors.text} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
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
                      <Text style={styles.cardTitle}>Cash position through the period</Text>
                      <Text style={styles.cardMeta}>Running income minus money out. The endpoint equals net cash flow.</Text>
                    </View>
                    {selectedTrendPoint ? (
                      <View style={styles.trendDetail}>
                        <View style={styles.trendDetailTop}>
                          <Text style={styles.trendDetailDate}>{selectedTrendPoint.label}</Text>
                          <Text
                            style={[
                              styles.trendDetailBalance,
                              { color: selectedTrendPoint.valueMinor >= 0 ? colors.success : colors.danger },
                            ]}
                          >
                            {formatMinor(selectedTrendPoint.valueMinor)}
                          </Text>
                        </View>
                        <Text style={styles.trendDetailMeta}>
                          Income {formatMinor(selectedTrendPoint.incomeMinor)} · Money out {formatMinor(selectedTrendPoint.outflowMinor)}
                        </Text>
                      </View>
                    ) : null}
                    <CashFlowTrend
                      points={cashFlowTrend}
                      selectedIndex={selectedTrendIndex}
                      onSelect={(index) => {
                        setSelectedTrendIndex(index);
                        Haptics.selectionAsync().catch(() => undefined);
                      }}
                    />
                    <Text style={styles.chartHint}>Tap or click anywhere on the line to inspect that point.</Text>
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
  summaryHeader: { gap: spacing.sm },
  summaryCopy: { flex: 1, gap: spacing.xs },
  summaryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryAmount: { color: colors.text, fontSize: 36, lineHeight: 42, fontWeight: '700' },
  summaryPeriod: { ...typography.label, color: colors.textMuted },
  periodNavigation: { flexDirection: 'row', gap: spacing.xs },
  periodButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodButtonDisabled: { opacity: 0.3 },
  periodButtonPressed: { opacity: 0.76 },
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
  trendDetail: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  trendDetailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  trendDetailDate: { ...typography.label, color: colors.textMuted },
  trendDetailBalance: { ...typography.body, fontWeight: '700' },
  trendDetailMeta: { ...typography.label, color: colors.textMuted },
  trendChart: { height: 210, width: '100%', overflow: 'hidden' },
  chartHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
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

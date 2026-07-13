import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
  const [refreshing, setRefreshing] = useState(false);
  const motionRun = useMotionRefresh();
  const analytics = useDashboard(range, selectedWindowId);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  useEffect(() => {
    setSelectedWindowId(null);
  }, [range]);

  const selectedWindowIndex = Math.max(
    0,
    analytics.windows.findIndex((window) => window.id === analytics.selectedWindowId),
  );

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
                  <Text style={styles.summaryLabel}>Total spent</Text>
                  <Text style={styles.summaryAmount}>{formatMinor(analytics.summary.expenseMinor)}</Text>
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
            </View>

            {!analytics.hasTransactionsInRange ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No spending in this period</Text>
                <Text style={styles.emptyText}>Expenses will appear here after you add them.</Text>
              </View>
            ) : (
              <MotionView direction="up" distance={100} delayMs={140}>
                <View style={styles.chartCard}>
                  <View>
                    <Text style={styles.cardTitle}>Spending by category</Text>
                    <Text style={styles.cardMeta}>Each bar shows its share of total spending.</Text>
                  </View>

                  {analytics.categoryBreakdown.length > 0 ? (
                    <View style={styles.categoryList} accessibilityRole="summary">
                      {analytics.categoryBreakdown.map((category) => (
                        <View key={category.categoryId} style={styles.categoryRow}>
                          <View style={styles.categoryHeading}>
                            <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}22` }]}>
                              <CategoryIcon name={category.icon} size={17} color={category.color} />
                            </View>
                            <Text style={styles.categoryLabel} numberOfLines={1}>{category.label}</Text>
                            <Text style={styles.categoryAmount}>{formatMinor(category.amountMinor)}</Text>
                          </View>
                          <View style={styles.barRow}>
                            <View style={styles.barTrack}>
                              <View
                                style={[
                                  styles.barFill,
                                  {
                                    backgroundColor: category.color,
                                    width: `${Math.max(category.share * 100, 2)}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.categoryShare}>{formatPercent(category.share)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyInset}>
                      <Text style={styles.emptyText}>No categorized expenses in this period.</Text>
                    </View>
                  )}
                </View>
              </MotionView>
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
  categoryList: { gap: spacing.lg },
  categoryRow: { gap: spacing.sm },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryLabel: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  categoryAmount: { ...typography.body, color: colors.text, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 40 },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  categoryShare: { ...typography.label, color: colors.textMuted, width: 44, textAlign: 'right' },
  skeletonCategoryRow: { gap: spacing.sm },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  emptyInset: { paddingVertical: spacing.lg },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  emptyText: { ...typography.body, color: colors.textMuted },
});

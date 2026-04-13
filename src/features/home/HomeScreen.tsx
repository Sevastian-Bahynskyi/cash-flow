import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useOverview, type BudgetAlert } from '@/features/overview/useOverview';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import { TransactionList } from '@/features/transactions/TransactionList';
import { buildCategoryMeta, getCategoryMetaDisplayColor } from '@/features/categories/helpers';
import { runDetached } from '@/lib/async';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { transactionBalance } from '@/lib/balance';
import { formatMinor, formatPercent } from '@/lib/format';
import { buildSalaryCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'cycle' | 'year' | 'all';

const toLocalIsoDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const cycleMatch = (row: TransactionRow, cycle: SalaryCycle | null): boolean => {
  if (!cycle) return false;
  const afterStart = row.occurred_on >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

function HomeSkeleton() {
  return (
    <>
      <SkeletonCard style={styles.heroSkeletonCard}>
        <SkeletonBlock width={112} height={12} radius={radius.sm} />
        <SkeletonBlock width="58%" height={48} radius={radius.md} />
        <View style={styles.skeletonHeroStats}>
          <SkeletonBlock width={108} height={46} radius={radius.pill} />
          <SkeletonBlock width={124} height={46} radius={radius.pill} />
        </View>
      </SkeletonCard>

      <View style={styles.selectorBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cycleCarousel}>
          {[108, 128, 116].map((width) => (
            <SkeletonBlock key={width} width={width} height={36} radius={radius.pill} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <SkeletonBlock width={116} height={36} radius={radius.pill} />
        <SkeletonBlock width={92} height={36} radius={radius.pill} />
      </View>

      <View style={styles.quickRow}>
        {[0, 1].map((item) => (
          <SkeletonCard key={item} style={styles.skeletonQuickCard}>
            <SkeletonBlock width={20} height={20} radius={radius.sm} />
            <SkeletonBlock width={item === 0 ? '52%' : '60%'} height={16} />
          </SkeletonCard>
        ))}
      </View>

      <View style={styles.section}>
        <SkeletonBlock width={108} height={12} radius={radius.sm} />
        <View style={styles.sectionBody}>
          {[0, 1, 2].map((item) => (
            <SkeletonCard key={item} padding={spacing.md}>
              <View style={styles.skeletonRow}>
                <SkeletonBlock width="54%" height={16} />
                <SkeletonBlock width={52} height={16} />
              </View>
              <SkeletonBlock width="72%" height={12} radius={radius.sm} />
              <SkeletonBlock width="100%" height={10} radius={radius.pill} />
            </SkeletonCard>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SkeletonBlock width={156} height={12} radius={radius.sm} />
        <View style={styles.sectionBody}>
          {[0, 1, 2, 3].map((item) => (
            <SkeletonCard key={item} padding={spacing.md}>
              <View style={styles.skeletonTransactionRow}>
                <SkeletonBlock width={42} height={42} radius={radius.md} />
                <View style={styles.skeletonTransactionCopy}>
                  <SkeletonBlock width="58%" height={16} />
                  <SkeletonBlock width="42%" height={12} radius={radius.sm} />
                </View>
                <SkeletonBlock width={74} height={18} />
              </View>
            </SkeletonCard>
          ))}
        </View>
      </View>
    </>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const data = useOverview();
  const composer = useComposer();
  const [filter, setFilter] = useState<RangeFilter>('cycle');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recentSelectionMode, setRecentSelectionMode] = useState(false);
  const [selectedRecentIds, setSelectedRecentIds] = useState<string[]>([]);
  const [motionRun, setMotionRun] = useState(0);
  const previousStreakDays = useRef(0);
  const currentYear = new Date().getFullYear();
  const scrollY = useSharedValue(0);
  const heroPulse = useSharedValue(0);
  const streakFloat = useSharedValue(0);
  const streakSparkle = useSharedValue(0);

  useEffect(() => {
    if (composer.refreshKey > 0) runDetached(data.reload(), 'home.reload');
    // reload is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.refreshKey]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

  useEffect(() => {
    cancelAnimation(heroPulse);
    cancelAnimation(streakFloat);
    cancelAnimation(streakSparkle);
    heroPulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    streakFloat.value = withRepeat(withTiming(1, { duration: 1150 }), -1, true);
    streakSparkle.value = withRepeat(withTiming(1, { duration: 1300 }), -1, true);

    return () => {
      cancelAnimation(heroPulse);
      cancelAnimation(streakFloat);
      cancelAnimation(streakSparkle);
    };
  }, [heroPulse, streakFloat, streakSparkle]);

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
    categoryColor: row.category_id ? getCategoryMetaDisplayColor(categoryMeta[row.category_id], row.kind) : colors.accent,
    categoryIcon: row.category_id ? categoryMeta[row.category_id]?.icon ?? 'cash' : row.kind === 'income' ? 'bank-outline' : 'cash',
  }));
  const hasAnyPersonalHistory = useMemo(
    () => data.transactions.some((row) => !row.shared),
    [data.transactions],
  );
  const selectedRecentCount = selectedRecentIds.length;
  const dailyPersonalCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data.transactions) {
      if (row.shared) continue;
      counts.set(row.occurred_on, (counts.get(row.occurred_on) ?? 0) + 1);
    }
    return counts;
  }, [data.transactions]);
  const streakDays = useMemo(() => {
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (dailyPersonalCount.has(toLocalIsoDay(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [dailyPersonalCount]);
  const streakProgress = Math.min(streakDays / 7, 1);
  const streakTier = streakDays >= 14 ? 'Legend' : streakDays >= 7 ? 'On fire' : streakDays >= 3 ? 'Building' : 'Warm-up';
  const todayCount = dailyPersonalCount.get(toLocalIsoDay(new Date())) ?? 0;

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
        color: getCategoryMetaDisplayColor(categoryMeta[categoryId], 'expense') ?? colors.accent,
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

  const deleteSelectedRecentTransactions = async (): Promise<void> => {
    if (selectedRecentIds.length === 0) return;
    await Haptics.selectionAsync();
    const { error } = await supabase.from('transactions').delete().in('id', selectedRecentIds);
    if (!error) {
      setSelectedRecentIds([]);
      setRecentSelectionMode(false);
      composer.bumpRefresh();
    }
  };

  const visibleRecentIdKey = recentItems.map((item) => item.row.id).join(',');
  useEffect(() => {
    const visibleRecentIds = new Set(visibleRecentIdKey.split(','));
    setSelectedRecentIds((current) => current.filter((id) => visibleRecentIds.has(id)));
  }, [visibleRecentIdKey]);

  useEffect(() => {
    if (!recentSelectionMode) {
      setSelectedRecentIds([]);
    }
  }, [recentSelectionMode]);

  useEffect(() => {
    if (recentItems.length === 0 && recentSelectionMode) {
      setRecentSelectionMode(false);
    }
  }, [recentItems.length, recentSelectionMode]);

  const toggleRecentSelection = (row: TransactionRow): void => {
    setSelectedRecentIds((current) =>
      current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
    );
  };

  const confirmDeleteSelectedRecentTransactions = (): void => {
    if (selectedRecentIds.length === 0) return;

    Alert.alert(
      `Delete ${selectedRecentIds.length} transaction${selectedRecentIds.length === 1 ? '' : 's'}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            runDetached(deleteSelectedRecentTransactions(), 'home.delete-selected-recent');
          },
        },
      ],
    );
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

  useEffect(() => {
    if (streakDays > previousStreakDays.current && streakDays >= 2) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    previousStreakDays.current = streakDays;
  }, [streakDays]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0, 220], [0, -34], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [0, 220], [1, 0.96], Extrapolation.CLAMP) },
    ],
  }));

  const heroGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(heroPulse.value, [0, 1], [0.1, 0.32]),
  }));

  const streakIconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(streakFloat.value, [0, 1], [0, -7]) }],
  }));

  const streakSparkOneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(streakSparkle.value, [0, 0.5, 1], [0.15, 0.8, 0.15]),
    transform: [{ translateX: interpolate(streakSparkle.value, [0, 1], [-6, 8]) }],
  }));

  const streakSparkTwoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(streakSparkle.value, [0, 0.5, 1], [0.7, 0.2, 0.7]),
    transform: [{ translateY: interpolate(streakSparkle.value, [0, 1], [2, -6]) }],
  }));

  return (
    <MotionScope value={motionRun}>
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
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

        {data.isInitialLoading ? <HomeSkeleton /> : null}

        {!data.isInitialLoading ? (
          <>
        <MotionView direction="left" distance={210} delayMs={90} rotateFrom={-9}>
          <Animated.View style={[styles.heroWrap, heroAnimatedStyle]}>
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
            <Animated.View pointerEvents="none" style={[styles.heroGlow, heroGlowStyle]} />
          </Animated.View>
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
                        void Haptics.selectionAsync();
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
            onPress={() => {
              setFilter('year');
              void Haptics.selectionAsync();
            }}
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
            onPress={() => {
              setFilter('all');
              void Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
              All time
            </Text>
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          <MotionView style={styles.quickMotion} direction="left" distance={165} delayMs={170}>
            <Pressable
              style={styles.quickCard}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push('/budgets');
              }}
            >
              <MaterialCommunityIcons name="target" size={20} color={colors.accent} />
              <Text style={styles.quickTitle}>Budgets</Text>
            </Pressable>
          </MotionView>
          <MotionView style={styles.quickMotion} direction="right" distance={165} delayMs={230}>
            <Pressable
              style={styles.quickCard}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push('/categories');
              }}
            >
              <MaterialCommunityIcons name="shape-outline" size={20} color={colors.success} />
              <Text style={styles.quickTitle}>Categories</Text>
            </Pressable>
          </MotionView>
        </View>

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Momentum streak</Text>
          <MotionView direction="up" distance={140} delayMs={230}>
            <View style={styles.streakCard}>
              <Animated.View style={[styles.streakSpark, styles.streakSparkOne, streakSparkOneStyle]} />
              <Animated.View style={[styles.streakSpark, styles.streakSparkTwo, streakSparkTwoStyle]} />
              <View style={styles.streakTopRow}>
                <Animated.View style={[styles.streakIconWrap, streakIconStyle]}>
                  <MaterialCommunityIcons name={streakDays >= 7 ? 'fire' : 'trending-up'} size={20} color={colors.accentAlt} />
                </Animated.View>
                <View style={styles.streakCopy}>
                  <Text style={styles.streakTitle}>{streakDays} day{streakDays === 1 ? '' : 's'} active</Text>
                  <Text style={styles.streakMeta}>{streakTier} · {todayCount} logged today</Text>
                </View>
              </View>
              <ProgressBar value={streakProgress} color={colors.accentAlt} />
              <View style={styles.streakBottomRow}>
                <Text style={styles.streakGoal}>Goal: 7-day streak</Text>
                <Pressable
                  style={({ pressed }) => [styles.streakAction, pressed && styles.cycleChipPressed]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    composer.openCreate();
                  }}
                >
                  <Text style={styles.streakActionText}>Log now</Text>
                </Pressable>
              </View>
            </View>
          </MotionView>
        </View>

        <View style={[styles.section, styles.sectionFlush]}>
          <TransactionList
            title="Recent personal activity"
            actions={
              recentSelectionMode
                ? [
                    { label: 'Cancel', onPress: () => setRecentSelectionMode(false), tone: 'muted' },
                    {
                      label: selectedRecentCount > 0 ? `Delete ${selectedRecentCount}` : 'Delete',
                      onPress: confirmDeleteSelectedRecentTransactions,
                      tone: 'danger',
                      disabled: selectedRecentCount === 0,
                    },
                  ]
                : [
                    ...(hasAnyPersonalHistory
                      ? [{ label: 'See more', onPress: () => router.push('/personal-history' as never), tone: 'accent' as const }]
                      : []),
                    ...(recentItems.length > 0
                      ? [{ label: 'Select', onPress: () => setRecentSelectionMode(true), tone: 'muted' as const }]
                      : []),
                  ]
            }
            items={recentItems}
            emptyLabel="Log the first transaction to start building your personal history."
            selectionMode={recentSelectionMode}
            selectedIds={selectedRecentIds}
            onToggleSelect={toggleRecentSelection}
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
              runDetached(deleteTransaction(row), 'home.delete-transaction');
            }}
          />
        </View>
          </>
        ) : null}
      </Animated.ScrollView>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  heroWrap: { marginHorizontal: spacing.lg },
  hero: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,92,255,0.16)',
  },
  heroEyebrow: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmount: { ...typography.amount, color: colors.text },
  heroStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.xs },
  heroSkeletonCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  skeletonHeroStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.xs },
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
  skeletonQuickCard: { flex: 1 },
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
  skeletonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  skeletonTransactionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skeletonTransactionCopy: { flex: 1, gap: spacing.xs },
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
  streakCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  streakTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,92,255,0.18)',
  },
  streakCopy: { flex: 1, gap: 2 },
  streakTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  streakMeta: { ...typography.label, color: colors.textMuted },
  streakBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  streakGoal: { ...typography.label, color: colors.textMuted },
  streakAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(124,92,255,0.2)',
  },
  streakActionText: { ...typography.label, color: colors.text, fontWeight: '700' },
  streakSpark: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,185,66,0.8)',
  },
  streakSparkOne: { top: 10, right: 14 },
  streakSparkTwo: { top: 26, right: 30 },
});

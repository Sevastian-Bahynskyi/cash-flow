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
import {
  buildCategoryMeta,
  getCategoryDisplayColor,
  getCategoryMetaDisplayColor,
} from '@/features/categories/helpers';
import { runDetached } from '@/lib/async';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { transactionBalance } from '@/lib/balance';
import { formatMinor, formatPercent } from '@/lib/format';
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'month' | 'year' | 'all';

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
  const [filter, setFilter] = useState<RangeFilter>('month');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recentSelectionMode, setRecentSelectionMode] = useState(false);
  const [selectedRecentIds, setSelectedRecentIds] = useState<string[]>([]);
  const [motionRun, setMotionRun] = useState(0);
  const currentYear = new Date().getFullYear();
  const scrollY = useSharedValue(0);
  const heroPulse = useSharedValue(0);
  const heroPagerRef = useRef<ScrollView | null>(null);
  const [heroPagerWidth, setHeroPagerWidth] = useState(0);

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
    heroPulse.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);

    return () => {
      cancelAnimation(heroPulse);
    };
  }, [heroPulse]);

  const cycles = useMemo(
    () => buildNavigableCycles(data.transactions),
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
    const todayIsoDay = toLocalIsoDay(new Date());
    if (cyclesWithTransactions.length === 0) {
      setSelectedCycleId(null);
      return;
    }

    setSelectedCycleId((current) => {
      if (current && cyclesWithTransactions.some((cycle) => cycle.id === current)) return current;
      return findCycleFor(cyclesWithTransactions, todayIsoDay)?.id ?? cyclesWithTransactions[0]?.id ?? null;
    });
  }, [cyclesWithTransactions]);

  const selectedCycle =
    cyclesWithTransactions.find((cycle) => cycle.id === selectedCycleId) ??
    findCycleFor(cyclesWithTransactions, toLocalIsoDay(new Date())) ??
    cyclesWithTransactions[0] ??
    null;
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);
  const currentYearCycles = useMemo(
    () => cycles.filter((cycle) => cycle.label.endsWith(String(currentYear))),
    [currentYear, cycles],
  );
  const selectedRange = useMemo(() => {
    if (filter === 'month') {
      return {
        startOn: selectedCycle?.startOn ?? null,
        endOnExclusive: selectedCycle?.endOnExclusive ?? null,
      };
    }
    if (filter === 'year') {
      return {
        startOn: `${currentYear}-01-01`,
        endOnExclusive: `${currentYear + 1}-01-01`,
      };
    }
    return {
      startOn: null,
      endOnExclusive: null,
    };
  }, [currentYear, filter, selectedCycle?.endOnExclusive, selectedCycle?.startOn]);
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
  const personalSpendMinor = useMemo(
    () =>
      personalTransactions.reduce((sum, row) => {
        if (row.kind !== 'expense' || row.is_shared_topup) return sum;
        return sum + row.amount_minor;
      }, 0),
    [personalTransactions],
  );

  const recentItems = personalTransactions.slice(0, 8).map((row) => {
    const meta = row.category_id ? categoryMeta[row.category_id] : null;
    const parentLabel =
      meta?.parentName?.trim() ? meta.parentName : meta?.name?.trim() ? meta.name : null;
    return {
      row,
      categoryLabel: row.category_id
        ? parentLabel ?? 'Uncategorized'
        : row.kind === 'income'
          ? 'Income'
          : 'Uncategorized',
      categoryColor: row.category_id
        ? getCategoryMetaDisplayColor(categoryMeta[row.category_id], row.kind)
        : row.kind === 'income'
          ? colors.success
          : colors.accent,
      categoryIcon: row.category_id
        ? categoryMeta[row.category_id]?.icon ?? 'cash'
        : row.kind === 'income'
          ? 'bank-outline'
          : 'cash',
    };
  });
  const hasAnyPersonalHistory = useMemo(
    () => data.transactions.some((row) => !row.shared),
    [data.transactions],
  );
  const selectedRecentCount = selectedRecentIds.length;
  const topCategoryTotals = useMemo(() => {
    const rowById = new Map(data.categories.map((row) => [row.id, row]));
    const byParent = new Map<
      string,
      {
        parentCategoryId: string | null;
        label: string;
        incomeMinor: number;
        expenseMinor: number;
        color: string;
      }
    >();

    for (const row of personalTransactions) {
      if (row.is_shared_topup) continue;

      const categoryId = row.category_id ?? null;
      const parentId = categoryId ? (rowById.get(categoryId)?.parent_id ?? categoryId) : null;
      const parentMeta = parentId ? categoryMeta[parentId] : null;
      const label = parentMeta?.name?.trim()
        ? parentMeta.name
        : row.kind === 'income'
          ? 'Income'
          : 'Uncategorized';
      const color = parentId
        ? getCategoryMetaDisplayColor(parentMeta, row.kind)
        : row.kind === 'income'
          ? colors.success
          : colors.accent;

      const key = parentId ?? label;
      const current =
        byParent.get(key) ?? {
          parentCategoryId: parentId,
          label,
          incomeMinor: 0,
          expenseMinor: 0,
          color,
        };
      if (row.kind === 'income') current.incomeMinor += row.amount_minor;
      else current.expenseMinor += row.amount_minor;
      byParent.set(key, current);
    }

      const items = [...byParent.values()].map((item) => {
      const netMinor = item.incomeMinor - item.expenseMinor;
      const absMinor = Math.abs(netMinor);
      const tone = netMinor >= 0 ? ('income' as const) : ('expense' as const);
      return {
        parentCategoryId: item.parentCategoryId,
        label: item.label,
        netMinor,
        absMinor,
        tone,
        color: getCategoryDisplayColor({
          kind: tone,
          parentName: item.label,
          name: item.label,
          parentColor: item.color,
          color: item.color,
        }),
      };
    });

    return items.sort((a, b) => b.absMinor - a.absMinor).slice(0, 5);
  }, [categoryMeta, personalTransactions]);

  const spendTotal = topCategoryTotals.reduce((sum, item) => sum + item.absMinor, 0);

  const filteredBudgetAlerts: BudgetAlert[] = useMemo(() => {
    if (filter !== 'month') return [];
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
        : selectedCycle?.label ?? 'No month';

  const heroEyebrow =
    filter === 'all'
      ? 'All-time balance'
      : filter === 'year'
        ? 'Current year balance'
        : 'Month balance';

  const yearChipLabel = currentYearCycles.length > 0 ? `Current year` : `Current year`;
  const heroRangeLabel = filter === 'year' || filter === 'all' ? 'Range' : 'Month';

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

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
          <View
            onLayout={(event) => {
              const next = Math.round(event.nativeEvent.layout.width);
              if (next > 0) setHeroPagerWidth(next);
            }}
          >
            {filter === 'month' && cyclesWithTransactions.length > 0 ? (
              <ScrollView
                ref={(node) => {
                  heroPagerRef.current = node;
                }}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(event) => {
                  if (heroPagerWidth <= 0) return;
                  const index = Math.round(event.nativeEvent.contentOffset.x / heroPagerWidth);
                  const cycle = cyclesWithTransactions[index];
                  if (!cycle) return;
                  setSelectedCycleId(cycle.id);
                  void Haptics.selectionAsync();
                }}
              >
                {cyclesWithTransactions.map((cycle) => {
                  const cycleTxns = data.transactions.filter((row) => cycleMatch(row, cycle));
                  const cycleBalance = transactionBalance(cycleTxns);
                  const cyclePersonalSpend = cycleTxns.reduce((sum, row) => {
                    if (row.kind !== 'expense') return sum;
                    if (row.shared || row.is_shared_topup) return sum;
                    return sum + row.amount_minor;
                  }, 0);
                  return (
                    <Animated.View
                      key={cycle.id}
                      style={[styles.heroWrap, heroAnimatedStyle, heroPagerWidth > 0 ? { width: heroPagerWidth } : null]}
                    >
                      <Pressable
                        style={({ pressed }) => [styles.heroPressable, pressed && styles.heroPressed]}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          const params = new URLSearchParams();
                          params.set('startOn', cycle.startOn);
                          if (cycle.endOnExclusive) params.set('endOnExclusive', cycle.endOnExclusive);
                          router.push((`/personal-history?${params.toString()}`) as never);
                        }}
                      >
                        <LinearGradient colors={['#1F2438', '#101219', '#0B0B0F']} style={styles.hero}>
                          <Text style={styles.heroEyebrow}>Month balance</Text>
                          <Text style={styles.heroAmount}>{formatMinor(cycleBalance)}</Text>
                          <View style={styles.heroStats}>
                            <MotionView direction="up" distance={90} delayMs={220}>
                              <View style={styles.heroStatChip}>
                                <Text style={styles.heroStatLabel}>Month</Text>
                                <Text style={styles.heroStatValue}>{cycle.label}</Text>
                              </View>
                            </MotionView>
                            <MotionView direction="right" distance={120} delayMs={280}>
                              <View style={styles.heroStatChip}>
                                <Text style={styles.heroStatLabel}>Spend</Text>
                                <Text style={styles.heroStatValue}>{formatMinor(cyclePersonalSpend)}</Text>
                              </View>
                            </MotionView>
                          </View>
                        </LinearGradient>
                        <Animated.View pointerEvents="none" style={[styles.heroGlow, heroGlowStyle]} />
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            ) : (
              <Animated.View style={[styles.heroWrap, heroAnimatedStyle]}>
                <Pressable
                  style={({ pressed }) => [styles.heroPressable, pressed && styles.heroPressed]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    const params = new URLSearchParams();
                    if (selectedRange.startOn) params.set('startOn', selectedRange.startOn);
                    if (selectedRange.endOnExclusive) {
                      params.set('endOnExclusive', selectedRange.endOnExclusive);
                    }
                    router.push((`/personal-history?${params.toString()}`) as never);
                  }}
                >
                  <LinearGradient colors={['#1F2438', '#101219', '#0B0B0F']} style={styles.hero}>
                    <Text style={styles.heroEyebrow}>{heroEyebrow}</Text>
                    <Text style={styles.heroAmount}>{formatMinor(snapshotMinor)}</Text>
                    <View style={styles.heroStats}>
                      <MotionView direction="up" distance={90} delayMs={220}>
                        <View style={styles.heroStatChip}>
                          <Text style={styles.heroStatLabel}>{heroRangeLabel}</Text>
                          <Text style={styles.heroStatValue}>{currentCycleLabel}</Text>
                        </View>
                      </MotionView>
                      <MotionView direction="right" distance={120} delayMs={280}>
                        <View style={styles.heroStatChip}>
                          <Text style={styles.heroStatLabel}>Spend</Text>
                          <Text style={styles.heroStatValue}>{formatMinor(personalSpendMinor)}</Text>
                        </View>
                      </MotionView>
                    </View>
                  </LinearGradient>
                  <Animated.View pointerEvents="none" style={[styles.heroGlow, heroGlowStyle]} />
                </Pressable>
              </Animated.View>
            )}

            {filter === 'month' && cyclesWithTransactions.length > 1 && heroPagerWidth > 0 ? (() => {
              const cycleIdx = Math.max(0, cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle?.id));
              const hasPrev = cycleIdx > 0;
              const hasNext = cycleIdx < cyclesWithTransactions.length - 1;
              return (
                <View pointerEvents="box-none" style={styles.heroArrows}>
                  {hasPrev ? (
                    <Pressable
                      style={({ pressed }) => [styles.heroArrow, pressed && styles.heroArrowPressed]}
                      onPress={() => {
                        const next = cyclesWithTransactions[cycleIdx - 1];
                        if (!next) return;
                        setSelectedCycleId(next.id);
                        heroPagerRef.current?.scrollTo({ x: (cycleIdx - 1) * heroPagerWidth, animated: true });
                        void Haptics.selectionAsync();
                      }}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
                    </Pressable>
                  ) : <View style={styles.heroArrowSpacer} />}
                  {hasNext ? (
                    <Pressable
                      style={({ pressed }) => [styles.heroArrow, pressed && styles.heroArrowPressed]}
                      onPress={() => {
                        const next = cyclesWithTransactions[cycleIdx + 1];
                        if (!next) return;
                        setSelectedCycleId(next.id);
                        heroPagerRef.current?.scrollTo({ x: (cycleIdx + 1) * heroPagerWidth, animated: true });
                        void Haptics.selectionAsync();
                      }}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
                    </Pressable>
                  ) : <View style={styles.heroArrowSpacer} />}
                </View>
              );
            })() : null}
          </View>
        </MotionView>

        <View style={styles.filterRow}>
          <Pressable
            style={({ pressed }) => [
              styles.filterChip,
              filter === 'month' && styles.filterChipActive,
              pressed && styles.cycleChipPressed,
            ]}
            onPress={() => {
              setFilter('month');
              void Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.filterChipText, filter === 'month' && styles.filterChipTextActive]}>
              Month
            </Text>
          </Pressable>
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
            {topCategoryTotals.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No spending in this range yet.</Text>
              </View>
            ) : (
              topCategoryTotals.map((item, index) => (
                <MotionView key={`${item.label}-${item.tone}`} index={index} direction="left" distance={145} delayMs={250}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${item.label} transactions`}
                    style={({ pressed }) => [styles.categoryCard, pressed && styles.cycleChipPressed]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      const params = new URLSearchParams();
                      if (selectedRange.startOn) params.set('startOn', selectedRange.startOn);
                      if (selectedRange.endOnExclusive) {
                        params.set('endOnExclusive', selectedRange.endOnExclusive);
                      }
                      params.set('kind', item.tone === 'income' ? 'income' : 'expense');
                      params.set('parentLabel', item.label);
                      router.push((`/personal-history?${params.toString()}`) as never);
                    }}
                  >
                    <View style={styles.alertRow}>
                      <Text style={styles.categoryLabel}>{item.label}</Text>
                      <Text
                        style={[
                          styles.categoryAmount,
                          { color: item.tone === 'income' ? colors.success : colors.danger },
                        ]}
                        numberOfLines={1}
                      >
                        {item.tone === 'income' ? '+' : '-'}
                        {formatMinor(Math.abs(item.netMinor))}
                      </Text>
                    </View>
                    <ProgressBar value={spendTotal === 0 ? 0 : item.absMinor / spendTotal} color={item.color} />
                  </Pressable>
                </MotionView>
              ))
            )}
          </View>
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
  heroWrap: { paddingHorizontal: spacing.lg },
  heroPressable: { borderRadius: radius.lg },
  heroPressed: { opacity: 0.92 },
  heroArrows: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroArrowSpacer: { width: 34 },
  heroArrow: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,11,15,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroArrowPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
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
});

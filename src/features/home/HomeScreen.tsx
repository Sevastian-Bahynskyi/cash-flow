import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
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
import { useOverview } from '@/features/overview/useOverview';
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
import { FilterChips } from '@/ui/FilterChips';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { TopCategoriesSection, type TopCategoryItem } from '@/ui/TopCategoriesSection';
import { HeroCard } from '@/ui/HeroCard';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { transactionBalance } from '@/lib/balance';
import { formatMinor } from '@/lib/format';
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'month' | 'year' | 'all';
const TOP_CATEGORIES_COLLAPSED_COUNT = 5;

const toLocalIsoDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const heroRangeDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const formatHeroCycleRange = (cycle: SalaryCycle, today: Date): string => {
  const startParts = cycle.startOn.split('-').map(Number);
  const endExclusiveParts = cycle.endOnExclusive
    ? cycle.endOnExclusive.split('-').map(Number)
    : [today.getFullYear(), today.getMonth() + 1, today.getDate()];

  const startYear = startParts[0] ?? 1970;
  const startMonth = startParts[1] ?? 1;
  const startDay = startParts[2] ?? 1;
  const endYear = endExclusiveParts[0] ?? today.getFullYear();
  const endMonth = endExclusiveParts[1] ?? today.getMonth() + 1;
  const endDay = endExclusiveParts[2] ?? today.getDate();
  const endBase = new Date(endYear, endMonth - 1, endDay);
  const endDate = cycle.endOnExclusive && endDay === 1
    ? new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate() - 1)
    : endBase;

  return `${heroRangeDate.format(new Date(startYear, startMonth - 1, startDay))} – ${heroRangeDate.format(endDate)}`;
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
  const [topCategoriesExpanded, setTopCategoriesExpanded] = useState(false);
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

  const recentActivityTransactions = useMemo(() => {
    const base = rangeTransactions.filter((row) => !row.is_shared_topup);
    return [...base].sort((a, b) => {
      if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
      return b.occurred_on.localeCompare(a.occurred_on);
    });
  }, [rangeTransactions]);

  const recentItems = recentActivityTransactions.slice(0, 8).map((row) => {
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
    () => data.transactions.some((row) => !row.is_shared_topup),
    [data.transactions],
  );
  const selectedRecentCount = selectedRecentIds.length;
  const topCategoryTotals = useMemo(() => {
    const rowById = new Map(data.categories.map((row) => [row.id, row]));
    const byParent = new Map<
      string,
      {
        parentCategoryId: string | null;
        scopedCategoryIds: Set<string>;
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
          scopedCategoryIds: new Set<string>(),
          label,
          incomeMinor: 0,
          expenseMinor: 0,
          color,
        };
      if (categoryId) current.scopedCategoryIds.add(categoryId);
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
        scopedCategoryIds: [...item.scopedCategoryIds].sort((a, b) => a.localeCompare(b)),
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

    return items.sort((a, b) => b.absMinor - a.absMinor);
  }, [categoryMeta, data.categories, personalTransactions]);

  const hasMoreTopCategories = topCategoryTotals.length > TOP_CATEGORIES_COLLAPSED_COUNT;
  const visibleTopCategoryTotals = topCategoriesExpanded
    ? topCategoryTotals
    : topCategoryTotals.slice(0, TOP_CATEGORIES_COLLAPSED_COUNT);
  const spendTotal = visibleTopCategoryTotals.reduce((sum, item) => sum + item.absMinor, 0);
  const topCategoryItems = useMemo<TopCategoryItem[]>(
    () =>
      visibleTopCategoryTotals.map((item) => ({
        id: item.label,
        label: item.label,
        categoryIds: item.scopedCategoryIds,
        amountLabel: `${item.tone === 'income' ? '+' : '-'}${formatMinor(Math.abs(item.netMinor))}`,
        amountColor: item.tone === 'income' ? colors.success : colors.danger,
        progress: spendTotal === 0 ? 0 : item.absMinor / spendTotal,
        color: item.color,
      })),
    [spendTotal, visibleTopCategoryTotals],
  );

  useEffect(() => {
    if (!hasMoreTopCategories && topCategoriesExpanded) {
      setTopCategoriesExpanded(false);
    }
  }, [hasMoreTopCategories, topCategoriesExpanded]);

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

  const heroEyebrow =
    filter === 'all'
      ? 'All-time balance'
      : filter === 'year'
        ? 'Current year balance'
        : 'Month balance';

  const yearChipLabel = currentYearCycles.length > 0 ? `Current year` : `Current year`;
  const filterOptions = [
    { label: 'Month', value: 'month' as const },
    { label: yearChipLabel, value: 'year' as const },
    { label: 'All time', value: 'all' as const },
  ];

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
            { icon: 'bell', onPress: () => router.push('/alerts') },
            { icon: 'brain', onPress: () => router.push('/ai-rules') }
          ]}
        />

        {data.isInitialLoading ? <HomeSkeleton /> : null}

        {!data.isInitialLoading ? (
          <>
            <FilterChips
              value={filter}
              options={filterOptions}
              onChange={(next) => {
                setFilter(next);
                Haptics.selectionAsync().catch(() => undefined);
              }}
            />

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
                      Haptics.selectionAsync().catch(() => undefined);
                    }}
                  >
                    {cyclesWithTransactions.map((cycle) => {
                      const cycleTxns = data.transactions.filter((row) => cycleMatch(row, cycle));
                      const cycleBalance = transactionBalance(cycleTxns);
                      return (
                        <Animated.View
                          key={cycle.id}
                          style={[styles.heroWrap, heroAnimatedStyle, heroPagerWidth > 0 ? { width: heroPagerWidth } : null]}
                        >
                          <Pressable
                            style={({ pressed }) => [styles.heroPressable, pressed && styles.heroPressed]}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => undefined);
                              router.push('/personal-history?includeShared=1' as never);
                            }}
                          >
                            <HeroCard
                              eyebrow="Month balance"
                              dateRange={formatHeroCycleRange(cycle, new Date())}
                              amount={formatMinor(cycleBalance)}
                            />
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
                        Haptics.selectionAsync().catch(() => undefined);
                        router.push('/personal-history?includeShared=1' as never);
                      }}
                    >
                      <HeroCard
                        eyebrow={heroEyebrow}
                        dateRange={filter === 'month' && selectedCycle ? formatHeroCycleRange(selectedCycle, new Date()) : undefined}
                        amount={formatMinor(snapshotMinor)}
                      />
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
                            Haptics.selectionAsync().catch(() => undefined);
                          }}
                        >
                          <FontAwesome6 name="chevron-left" size={24} color={colors.text} />
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
                            Haptics.selectionAsync().catch(() => undefined);
                          }}
                        >
                          <FontAwesome6 name="chevron-right" size={24} color={colors.text} />
                        </Pressable>
                      ) : <View style={styles.heroArrowSpacer} />}
                    </View>
                  );
                })() : null}
              </View>
            </MotionView>

            <View style={styles.quickRow}>
              <MotionView style={styles.quickMotion} direction="left" distance={165} delayMs={170}>
                <Pressable
                  style={styles.quickCard}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    router.push(selectedCycle ? `/budgets?cycleId=${encodeURIComponent(selectedCycle.id)}` : '/budgets');
                  }}
                >
                  <FontAwesome6 name="bullseye" size={20} color={colors.accent} />
                  <Text style={styles.quickTitle}>Budgets</Text>
                </Pressable>
              </MotionView>
              <MotionView style={styles.quickMotion} direction="right" distance={165} delayMs={230}>
                <Pressable
                  style={styles.quickCard}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    router.push('/categories');
                  }}
                >
                  <FontAwesome6 name="shapes" size={20} color={colors.success} />
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

            <TopCategoriesSection
              title="Top categories"
              items={topCategoryItems}
              emptyLabel="No spending in this range yet."
              actions={
                hasMoreTopCategories
                  ? [
                    {
                      label: topCategoriesExpanded ? 'See less' : 'See more',
                      onPress: () => {
                        setTopCategoriesExpanded((current) => !current);
                        Haptics.selectionAsync().catch(() => undefined);
                      },
                      tone: 'accent',
                    },
                  ]
                  : undefined
              }
              onPressItem={(item) => {
                Haptics.selectionAsync().catch(() => undefined);
                const source = topCategoryTotals.find((topCategory) => topCategory.label === item.label);
                const params = new URLSearchParams();
                params.set('kind', source?.tone === 'income' ? 'income' : 'expense');
                params.set('parentLabel', item.label);
                const scopedCategoryIds = source?.scopedCategoryIds ?? [];
                if (scopedCategoryIds.length > 0) {
                  params.set('categoryIds', scopedCategoryIds.join(','));
                }
                params.set('includeShared', '1');
                if (filter === 'month' && selectedCycle) {
                  params.set('startOn', selectedCycle.startOn);
                  if (selectedCycle.endOnExclusive) {
                    params.set('endOnExclusive', selectedCycle.endOnExclusive);
                  }
                } else if (filter === 'year') {
                  params.set('startOn', `${currentYear}-01-01`);
                  params.set('endOnExclusive', `${currentYear + 1}-01-01`);
                }
                router.push((`/personal-history?${params.toString()}`) as never);
              }}
            />

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
                        ? [{ label: 'See more', onPress: () => router.push('/personal-history?includeShared=1' as never), tone: 'accent' as const }]
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
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,92,255,0.16)',
  },
  heroSkeletonCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  skeletonHeroStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: spacing.xs },
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
});

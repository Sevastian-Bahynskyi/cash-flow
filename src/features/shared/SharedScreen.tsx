import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runDetached } from '@/lib/async';
import { useOverview } from '@/features/overview/useOverview';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import { TransactionList } from '@/features/transactions/TransactionList';
import { buildCategoryMeta, getCategoryDisplayColor, getCategoryMetaDisplayColor } from '@/features/categories/helpers';
import { MotionScope } from '@/ui/MotionScope';
import { MotionView } from '@/ui/MotionView';
import { FilterChips } from '@/ui/FilterChips';
import { FloatingActionButton } from '@/ui/FloatingActionButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { TopCategoriesSection } from '@/ui/TopCategoriesSection';
import { HeroCard } from '@/ui/HeroCard';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatMinor, formatPercent } from '@/lib/format';
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import { computeSharedCycle } from '@/lib/shared';
import type { TransactionRow } from '@/features/transactions/types';
import { supabase } from '@/lib/supabase';

type RangeFilter = 'month' | 'year' | 'all';

const ratioMeColor = '#60A5FA';
const ratioGfColor = '#F472B6';

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

function SharedRatioBar({ ratio }: { ratio: number }): ReactElement {
  const meShare = Math.max(0, Math.min(1, ratio));
  const gfShare = Math.max(0, Math.min(1, 1 - ratio));

  return (
    <View style={styles.ratioTrack}>
      <View style={[styles.ratioMeFill, { flex: meShare }]} />
      <View style={[styles.ratioGfFill, { flex: gfShare }]} />
    </View>
  );
}

const cycleMatch = (row: TransactionRow, cycle: SalaryCycle | null): boolean => {
  if (!cycle) return false;
  const afterStart = row.occurred_on >= cycle.startOn;
  const beforeEnd = cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive;
  return afterStart && beforeEnd;
};

function SharedSkeleton() {
  return (
    <>
      <SkeletonCard style={styles.skeletonHeroCard}>
        <SkeletonBlock width={108} height={12} radius={radius.sm} />
        <SkeletonBlock width="56%" height={48} radius={radius.md} />
        <SkeletonBlock width="72%" height={12} radius={radius.sm} />
      </SkeletonCard>

      <View style={styles.metricsRow}>
        {[0, 1].map((item) => (
          <SkeletonCard key={item} style={styles.metricCard}>
            <SkeletonBlock width="42%" height={12} radius={radius.sm} />
            <SkeletonBlock width="70%" height={26} radius={radius.md} />
            <SkeletonBlock width="32%" height={12} radius={radius.sm} />
          </SkeletonCard>
        ))}
      </View>

      <View style={styles.metricsRow}>
        {[0, 1].map((item) => (
          <SkeletonCard key={item} style={styles.metricCard}>
            <SkeletonBlock width="40%" height={12} radius={radius.sm} />
            <SkeletonBlock width="66%" height={26} radius={radius.md} />
            <SkeletonBlock width="30%" height={12} radius={radius.sm} />
          </SkeletonCard>
        ))}
      </View>

      <View style={styles.card}>
        <SkeletonBlock width={74} height={12} radius={radius.sm} />
        <View style={styles.timelineList}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={styles.skeletonTimelineRow}>
              <SkeletonBlock width="46%" height={16} />
              <SkeletonBlock width={68} height={16} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <SkeletonBlock width={124} height={12} radius={radius.sm} />
        <View style={styles.timelineList}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={styles.skeletonHistoryRow}>
              <SkeletonBlock width="62%" height={16} />
              <SkeletonBlock width="100%" height={10} radius={radius.pill} />
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

export default function SharedScreen() {
  const router = useRouter();
  const data = useOverview();
  const composer = useComposer();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<RangeFilter>('month');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [motionRun, setMotionRun] = useState(0);
  const heroPagerRef = useRef<ScrollView | null>(null);
  const [heroPagerWidth, setHeroPagerWidth] = useState(0);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (composer.refreshKey > 0) {
      runDetached(data.reload(), 'shared.reload');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.refreshKey]);

  useFocusEffect(
    useCallback(() => {
      setMotionRun((current) => current + 1);
    }, []),
  );

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
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);

  const scopedTransactions = useMemo(() => {
    if (filter === 'year') {
      const startOn = `${currentYear}-01-01`;
      const endOnExclusive = `${currentYear + 1}-01-01`;
      return data.transactions.filter((row) => row.occurred_on >= startOn && row.occurred_on < endOnExclusive);
    }
    if (filter === 'all') return data.transactions;
    return data.transactions.filter((row) => cycleMatch(row, selectedCycle));
  }, [currentYear, data.transactions, filter, selectedCycle]);

  const sortedScopedTransactions = useMemo(() => {
    const rows = [...scopedTransactions];
    return [...rows].sort((a, b) => {
      if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
      return b.occurred_on.localeCompare(a.occurred_on);
    });
  }, [scopedTransactions]);

  const sharedExpenses = sortedScopedTransactions.filter((row) => row.shared);
  const topups = sortedScopedTransactions.filter((row) => row.is_shared_topup);
  const combined = [...topups, ...sharedExpenses].sort((a, b) => {
    if (a.occurred_on === b.occurred_on) return b.updated_at.localeCompare(a.updated_at);
    return b.occurred_on.localeCompare(a.occurred_on);
  });

  const itemList = combined.slice(0, 8).map((row) => ({
    row,
    categoryLabel: row.is_shared_topup
      ? 'Shared top-up'
      : row.category_id
        ? categoryMeta[row.category_id]?.label ?? 'Shared'
        : 'Shared',
    categoryColor: row.category_id ? getCategoryMetaDisplayColor(categoryMeta[row.category_id], row.kind) : colors.accent,
    categoryIcon: row.category_id ? categoryMeta[row.category_id]?.icon ?? 'users' : 'money-bill-trend-up',
  }));

  const sharedTopCategoryTotals = useMemo(() => {
    const rowById = new Map(data.categories.map((row) => [row.id, row]));
    const byParent = new Map<
      string,
      {
        parentCategoryId: string | null;
        scopedCategoryIds: Set<string>;
        label: string;
        spentMinor: number;
        color: string;
      }
    >();

    for (const row of sharedExpenses) {
      const categoryId = row.category_id ?? null;
      const parentId = categoryId ? (rowById.get(categoryId)?.parent_id ?? categoryId) : null;
      const parentMeta = parentId ? categoryMeta[parentId] : null;
      const label = parentMeta?.name?.trim() ? parentMeta.name : 'Uncategorized';
      const color = parentId
        ? getCategoryDisplayColor({
          kind: 'expense',
          parentName: label,
          name: label,
          parentColor: parentMeta?.color,
          color: parentMeta?.color,
        })
        : colors.accent;

      const key = parentId ?? label;
      const current =
        byParent.get(key) ?? {
          parentCategoryId: parentId,
          scopedCategoryIds: new Set<string>(),
          label,
          spentMinor: 0,
          color,
        };

      if (categoryId) current.scopedCategoryIds.add(categoryId);
      current.spentMinor += row.amount_minor;
      byParent.set(key, current);
    }

    return [...byParent.values()]
      .map((item) => ({
        parentCategoryId: item.parentCategoryId,
        scopedCategoryIds: [...item.scopedCategoryIds].sort((a, b) => a.localeCompare(b)),
        label: item.label,
        spentMinor: item.spentMinor,
        color: getCategoryDisplayColor({
          kind: 'expense',
          parentName: item.label,
          name: item.label,
          parentColor: item.color,
          color: item.color,
        }),
      }))
      .sort((a, b) => b.spentMinor - a.spentMinor)
      .slice(0, 5);
  }, [categoryMeta, data.categories, sharedExpenses]);
  const sharedSpendTotal = sharedExpenses.reduce((sum, row) => sum + row.amount_minor, 0);
  const sharedTopCategoryItems = useMemo(
    () =>
      sharedTopCategoryTotals.map((item) => ({
        id: item.label,
        label: item.label,
        categoryIds: item.scopedCategoryIds,
        amountLabel: formatMinor(item.spentMinor),
        progress: sharedSpendTotal === 0 ? 0 : item.spentMinor / sharedSpendTotal,
        color: item.color,
      })),
    [sharedSpendTotal, sharedTopCategoryTotals],
  );
  const { meTopupTotal, gfTopupTotal, totalTopupTotal, userShareRatio: ratio, sharedBalance } = computeSharedCycle(
    topups.map((row) => ({ amount_minor: row.amount_minor, shared_participant: row.shared_participant })),
    sharedExpenses.map((row) => ({ amount_minor: row.amount_minor })),
  );

  const cycleSnapshotById = useMemo(() => {
    const out = new Map<string, { sharedBalance: number; ratio: number }>();
    for (const cycle of cyclesWithTransactions) {
      const rows = data.transactions.filter((row) => cycleMatch(row, cycle));
      const cycleSharedExpenses = rows.filter((row) => row.shared);
      const cycleTopups = rows.filter((row) => row.is_shared_topup);
      const snapshot = computeSharedCycle(
        cycleTopups.map((row) => ({ amount_minor: row.amount_minor, shared_participant: row.shared_participant })),
        cycleSharedExpenses.map((row) => ({ amount_minor: row.amount_minor })),
      );
      out.set(cycle.id, {
        sharedBalance: snapshot.sharedBalance,
        ratio: snapshot.userShareRatio,
      });
    }
    return out;
  }, [cyclesWithTransactions, data.transactions]);

  const deleteTransaction = async (row: TransactionRow): Promise<void> => {
    const { error } = await supabase.from('transactions').delete().eq('id', row.id);
    if (!error) composer.bumpRefresh();
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const fabBottom = Math.max(insets.bottom, spacing.md) + 56;
  const heroEyebrow =
    filter === 'all'
      ? 'All-time shared balance'
      : filter === 'year'
        ? 'Current year shared balance'
        : 'Month shared balance';
  const filterOptions = [
    { label: 'Month', value: 'month' as const },
    { label: 'Current year', value: 'year' as const },
    { label: 'All time', value: 'all' as const },
  ];
  const showCycleCarousel = filter === 'month' && cyclesWithTransactions.length > 0;

  const openSharedHistory = useCallback(
    (_startOn: string | null, _endOnExclusive: string | null): void => {
      runDetached(Haptics.selectionAsync(), 'shared.hero.open-history.haptics');
      router.push('/personal-history?shared=1' as never);
    },
    [router],
  );

  useEffect(() => {
    if (!showCycleCarousel || heroPagerWidth <= 0) return;
    const selectedIndex = Math.max(
      0,
      cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle?.id),
    );
    heroPagerRef.current?.scrollTo({ x: selectedIndex * heroPagerWidth, animated: false });
  }, [cyclesWithTransactions, heroPagerWidth, selectedCycle?.id, showCycleCarousel]);

  return (
    <MotionScope value={motionRun}>
      <View style={styles.container}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
        >
          <ScreenHeader title="Shared" subtitle="Fairness and shared spend" />

          {data.isInitialLoading ? <SharedSkeleton /> : null}

          {!data.isInitialLoading ? (
            <>
              <FilterChips
                value={filter}
                options={filterOptions}
                onChange={(next) => {
                  setFilter(next);
                  runDetached(Haptics.selectionAsync(), `shared.filter.${next}.haptics`);
                }}
              />

              <MotionView direction="right" distance={210} delayMs={90} rotateFrom={8}>
                <View
                  onLayout={(event) => {
                    const next = Math.round(event.nativeEvent.layout.width);
                    if (next > 0) setHeroPagerWidth(next);
                  }}
                >
                  {showCycleCarousel ? (
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
                        runDetached(Haptics.selectionAsync(), 'shared.carousel.swipe.haptics');
                      }}
                    >
                      {cyclesWithTransactions.map((cycle) => {
                        const snapshot = cycleSnapshotById.get(cycle.id);
                        const cycleBalance = snapshot?.sharedBalance ?? 0;
                        return (
                          <View
                            key={cycle.id}
                            style={[styles.heroWrap, heroPagerWidth > 0 ? { width: heroPagerWidth } : null]}
                          >
                            <Pressable
                              style={({ pressed }) => [styles.heroPressable, pressed && styles.heroPressablePressed]}
                              onPress={() => openSharedHistory(cycle.startOn, cycle.endOnExclusive)}
                            >
                              <HeroCard
                                eyebrow="Month shared balance"
                                dateRange={formatHeroCycleRange(cycle, new Date())}
                                amount={formatMinor(cycleBalance)}
                              />
                            </Pressable>
                          </View>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.heroWrap}>
                      <Pressable
                        style={({ pressed }) => [styles.heroPressable, pressed && styles.heroPressablePressed]}
                        onPress={() => openSharedHistory(selectedRange.startOn, selectedRange.endOnExclusive)}
                      >
                        <HeroCard
                          eyebrow={heroEyebrow}
                          dateRange={filter === 'month' && selectedCycle ? formatHeroCycleRange(selectedCycle, new Date()) : undefined}
                          amount={formatMinor(sharedBalance)}
                        />
                      </Pressable>
                    </View>
                  )}

                  {showCycleCarousel && cyclesWithTransactions.length > 1 && heroPagerWidth > 0 ? (() => {
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
                              runDetached(Haptics.selectionAsync(), 'shared.carousel.prev.haptics');
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
                              runDetached(Haptics.selectionAsync(), 'shared.carousel.next.haptics');
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

              {filter === 'month' && !selectedCycle ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>No cycle yet</Text>
                  <Text style={styles.explainer}>
                    Add a salary income first to activate shared fairness.
                  </Text>
                </View>
              ) : null}

              {data.error ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorTitle}>Could not refresh shared data</Text>
                  <Text style={styles.metricMeta}>{data.error}</Text>
                </View>
              ) : null}

              <View style={styles.metricsRow}>
                <MotionView style={styles.metricMotion} direction="left" distance={150} delayMs={180}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Contributed</Text>
                    <Text style={styles.metricAmount}>{formatMinor(totalTopupTotal)}</Text>
                  </View>
                </MotionView>
                <MotionView style={styles.metricMotion} direction="right" distance={150} delayMs={220}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Spent</Text>
                    <Text style={styles.metricAmount}>{formatMinor(sharedSpendTotal)}</Text>
                  </View>
                </MotionView>
              </View>

              <View style={styles.metricsRow}>
                <MotionView style={styles.metricMotion} direction="left" distance={165} delayMs={260}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>My Share</Text>
                    <Text style={styles.metricAmount}>{formatMinor(meTopupTotal)}</Text>
                    <Text style={styles.metricMeta}>{formatPercent(ratio)}</Text>
                  </View>
                </MotionView>
                <MotionView style={styles.metricMotion} direction="right" distance={165} delayMs={300}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>GF Share</Text>
                    <Text style={styles.metricAmount}>{formatMinor(gfTopupTotal)}</Text>
                    <Text style={styles.metricMeta}>{formatPercent(1 - ratio)}</Text>
                  </View>
                </MotionView>
              </View>

              <MotionView direction="left" distance={150} delayMs={320}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Ratio</Text>
                  <View style={styles.ratioLegend}>
                    <Text style={[styles.ratioPill, styles.ratioMePill]}>You {formatPercent(ratio)}</Text>
                    <Text style={[styles.ratioPill, styles.ratioGfPill]}>GF {formatPercent(1 - ratio)}</Text>
                  </View>
                  <SharedRatioBar ratio={ratio} />
                  <Text style={styles.metricMeta}>Updated by top-ups in this selected range.</Text>
                </View>
              </MotionView>

              <TopCategoriesSection
                title="Top shared categories"
                items={sharedTopCategoryItems}
                emptyLabel="No shared spending in this range yet."
                onPressItem={(item) => {
                  runDetached(Haptics.selectionAsync(), 'shared.top-categories.haptics');
                  const params = new URLSearchParams();
                  params.set('shared', '1');
                  params.set('parentLabel', item.label);
                  if (item.categoryIds && item.categoryIds.length > 0) {
                    params.set('categoryIds', item.categoryIds.join(','));
                  }
                  router.push((`/personal-history?${params.toString()}`) as never);
                }}
              />

              <TransactionList
                title="Recent shared activity"
                actions={[
                  {
                    label: 'See more',
                    tone: 'accent',
                    onPress: () => {
                      router.push('/personal-history?shared=1' as never);
                    },
                  },
                ]}
                items={itemList}
                emptyLabel="Shared expenses and top-ups for this selected range will appear here."
                onEdit={(row) => composer.openEdit(row)}
                onDuplicate={(row) =>
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
                  })
                }
                onDelete={(row) => {
                  runDetached(deleteTransaction(row), 'shared.deleteTransaction');
                }}
              />

              <MotionView direction="right" distance={145} delayMs={360}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Top-ups</Text>
                  <View style={styles.timelineList}>
                    {topups.length === 0 ? (
                      <Text style={styles.metricMeta}>No top-ups in this range yet.</Text>
                    ) : (
                      topups.map((row) => (
                        <View key={row.id} style={styles.timelineRow}>
                          <Text style={styles.timelineLabel}>
                            Shared top-up{' '}
                            <Text style={row.shared_participant === 'gf' ? styles.participantGf : styles.participantMe}>
                              · {row.shared_participant === 'gf' ? 'GF' : 'Me'}
                            </Text>
                            {' · '}
                            {row.name}
                          </Text>
                          <Text style={styles.timelineAmount}>{formatMinor(row.amount_minor)}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              </MotionView>
            </>
          ) : null}
        </ScrollView>
        <FloatingActionButton
          icon="user-plus"
          label="Shared"
          accessibilityLabel="Add shared transaction"
          onPress={() =>
            composer.openCreate({
              kind: 'expense',
              from_shared_screen: true,
            })
          }
          bottom={fabBottom}
          right={spacing.xl}
          backgroundColor={colors.accentAlt}
        />
      </View>
    </MotionScope>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 4, gap: spacing.lg },
  heroWrap: { paddingHorizontal: spacing.lg },
  heroPressable: { borderRadius: radius.lg },
  heroPressablePressed: { opacity: 0.9 },
  skeletonHeroCard: { marginHorizontal: spacing.lg, gap: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(124,92,255,0.18)',
  },
  filterChipPressed: { opacity: 0.86 },
  filterChipText: { ...typography.label, color: colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: colors.text },
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
  metricsRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  metricMotion: { flex: 1 },
  metricCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  metricLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricAmount: { ...typography.h2, color: colors.text },
  metricMeta: { ...typography.label, color: colors.textMuted },
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  errorCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: 'rgba(255,92,122,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.32)',
  },
  errorTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  explainer: { ...typography.body, color: colors.text },
  ratioLegend: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  ratioPill: {
    ...typography.label,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  ratioMePill: {
    color: ratioMeColor,
    backgroundColor: 'rgba(96,165,250,0.16)',
  },
  ratioGfPill: {
    color: ratioGfColor,
    backgroundColor: 'rgba(244,114,182,0.16)',
  },
  ratioTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
  },
  ratioMeFill: { backgroundColor: ratioMeColor },
  ratioGfFill: { backgroundColor: ratioGfColor },
  timelineList: { gap: spacing.sm },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeletonTimelineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  skeletonHistoryRow: { gap: spacing.sm },
  timelineLabel: { ...typography.body, color: colors.text, flex: 1, marginRight: spacing.md },
  participantMe: { color: ratioMeColor, fontWeight: '600' },
  participantGf: { color: ratioGfColor, fontWeight: '600' },
  timelineAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOverview } from '@/features/overview/useOverview';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { buildBudgetStateByCategory } from '@/features/budgets/helpers';
import type { BudgetState } from '@/features/budgets/helpers';
import { findIncomeParentIds, isIncomeCategoryRow } from '@/features/categories/rules';
import { runDetached } from '@/lib/async';
import { supabase } from '@/lib/supabase';
import { formatMinor, formatPercent } from '@/lib/format';
import { buildNavigableCycles, findCycleFor, type SalaryCycle } from '@/lib/cycles';
import type { BudgetRow } from '@/features/overview/useOverview';
import type { TransactionRow } from '@/features/transactions/types';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { SearchField } from '@/ui/SearchField';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import RichTextEditor, { RichTextDisplay } from '@/ui/RichTextEditor';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type BudgetDraft = {
  categoryId: string;
  label: string;
  icon: string;
  amount: string;
  notes: string;
  budgetId?: string;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toLocalIsoDay = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseMinor = (raw: string): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

const buildPersonalExpenseMinorByTransactionId = (
  rows: readonly TransactionRow[],
): Map<string, number> => {
  const orderedRows = [...rows].sort((left, right) => {
    if (left.occurred_on !== right.occurred_on) return left.occurred_on.localeCompare(right.occurred_on);
    if (left.created_at !== right.created_at) return left.created_at.localeCompare(right.created_at);
    return left.id.localeCompare(right.id);
  });

  const out = new Map<string, number>();
  let meTopupBeforeMinor = 0;
  let gfTopupBeforeMinor = 0;

  for (const row of orderedRows) {
    if (row.kind !== 'expense') {
      out.set(row.id, 0);
      continue;
    }

    if (row.is_shared_topup) {
      out.set(row.id, row.shared_participant === 'gf' ? 0 : row.amount_minor);
    } else if (row.shared) {
      const denom = meTopupBeforeMinor + gfTopupBeforeMinor;
      const ratio = denom === 0 ? 0.5 : meTopupBeforeMinor / denom;
      out.set(row.id, Math.round(row.amount_minor * ratio));
    } else if (typeof row.personal_effect_minor === 'number') {
      out.set(row.id, Math.max(0, -row.personal_effect_minor));
    } else {
      out.set(row.id, row.amount_minor);
    }

    if (row.is_shared_topup) {
      if (row.shared_participant === 'gf') gfTopupBeforeMinor += row.amount_minor;
      else meTopupBeforeMinor += row.amount_minor;
    }
  }

  return out;
};

function BudgetSkeleton() {
  return (
    <>
      <SkeletonCard style={styles.skeletonHeroCard}>
        <SkeletonBlock width="42%" height={24} radius={radius.md} />
        <SkeletonBlock width="100%" height={14} radius={radius.sm} />
        <SkeletonBlock width="78%" height={14} radius={radius.sm} />
      </SkeletonCard>

      <SkeletonCard style={styles.skeletonSearchCard} padding={spacing.md}>
        <View style={styles.skeletonSearchRow}>
          <SkeletonBlock width={18} height={18} radius={radius.pill} />
          <SkeletonBlock width="46%" height={16} />
        </View>
      </SkeletonCard>

      <View style={styles.section}>
        {[0, 1, 2, 3, 4].map((item) => (
          <SkeletonCard key={item} padding={spacing.md}>
            <View style={styles.skeletonBudgetRow}>
              <SkeletonBlock width={44} height={44} radius={radius.md} />
              <View style={styles.rowBody}>
                <View style={styles.rowHead}>
                  <SkeletonBlock width="52%" height={16} />
                  <SkeletonBlock width={74} height={14} radius={radius.sm} />
                </View>
                <SkeletonBlock width="66%" height={12} radius={radius.sm} />
                <SkeletonBlock width="100%" height={10} radius={radius.pill} />
              </View>
            </View>
          </SkeletonCard>
        ))}
      </View>
    </>
  );
}

export default function BudgetScreen() {
  const router = useRouter();
  const { cycleId } = useLocalSearchParams<{ cycleId?: string | string[] }>();
  const initialCycleId = Array.isArray(cycleId) ? cycleId[0] ?? null : cycleId ?? null;
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const amountInputRef = useRef<TextInput | null>(null);
  const [expandedParentIds, setExpandedParentIds] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const draftCategoryId = draft?.categoryId;

  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);
  const cycles = useMemo(() => buildNavigableCycles(data.transactions), [data.transactions]);
  const cyclesWithTransactions = useMemo(
    () =>
      [...cycles]
        .filter((cycle) =>
          data.transactions.some(
            (row) => row.occurred_on >= cycle.startOn && (cycle.endOnExclusive === null || row.occurred_on < cycle.endOnExclusive),
          ),
        )
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
      if (initialCycleId && cyclesWithTransactions.some((cycle) => cycle.id === initialCycleId)) return initialCycleId;
      return findCycleFor(cyclesWithTransactions, todayIsoDay)?.id ?? cyclesWithTransactions[0]?.id ?? null;
    });
  }, [cyclesWithTransactions, initialCycleId]);

  const selectedCycle: SalaryCycle | null =
    cyclesWithTransactions.find((cycle) => cycle.id === selectedCycleId) ??
    findCycleFor(cyclesWithTransactions, toLocalIsoDay(new Date())) ??
    cyclesWithTransactions[0] ??
    null;
  const budgetStates = useMemo(
    () => buildBudgetStateByCategory(data.categories, data.budgets, data.transactions, selectedCycle),
    [data.budgets, data.categories, data.transactions, selectedCycle],
  );
  const selectedCycleRows = useMemo<readonly TransactionRow[]>(
    () =>
      selectedCycle
        ? data.transactions.filter(
          (row) =>
            row.occurred_on >= selectedCycle.startOn &&
            (selectedCycle.endOnExclusive === null || row.occurred_on < selectedCycle.endOnExclusive),
        )
        : [],
    [data.transactions, selectedCycle],
  );
  const personalExpenseByTransactionId = useMemo<Map<string, number>>(
    () => buildPersonalExpenseMinorByTransactionId(selectedCycleRows),
    [selectedCycleRows],
  );
  const incomeParentIds = useMemo(() => findIncomeParentIds(data.categories), [data.categories]);
  const categoryById = useMemo(
    () => new Map(data.categories.map((category) => [category.id, category])),
    [data.categories],
  );
  const childIdsByParentId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const category of data.categories) {
      if (category.level === 2 && category.parent_id) {
        const current = map.get(category.parent_id) ?? [];
        current.push(category.id);
        map.set(category.parent_id, current);
      }
    }
    return map;
  }, [data.categories]);
  const isParentRollupCategory = useMemo(() => {
    return (categoryId: string): boolean => {
      const category = categoryById.get(categoryId);
      if (!category || category.level !== 1) return false;
      const childIds = childIdsByParentId.get(categoryId) ?? [];
      if (childIds.length === 0) return false;
      return category.name !== 'Other';
    };
  }, [categoryById, childIdsByParentId]);
  const expenseParentIds = useMemo(
    () => new Set(data.categories.filter((category) => category.level === 1 && !isIncomeCategoryRow(category, incomeParentIds)).map((category) => category.id)),
    [data.categories, incomeParentIds],
  );
  const parentByCategoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of data.categories) {
      if (category.level === 2 && category.parent_id) map.set(category.id, category.parent_id);
    }
    return map;
  }, [data.categories]);

  const selectedCycleBudgets = useMemo(
    () =>
      data.budgets.filter((budget) => {
        if (budget.salary_cycle_id !== selectedCycle?.id) return false;
        const category = categoryById.get(budget.category_id);
        return Boolean(category && !isIncomeCategoryRow(category, incomeParentIds));
      }),
    [categoryById, data.budgets, incomeParentIds, selectedCycle?.id],
  );

  const budgetByCategoryId = useMemo(
    () => new Map(selectedCycleBudgets.map((budget) => [budget.category_id, budget])),
    [selectedCycleBudgets],
  );

  const budgetStateByParentId = useMemo(() => {
    const out = new Map<string, BudgetState>();
    const parents = data.categories.filter((category) => category.level === 1 && !isIncomeCategoryRow(category, incomeParentIds));

    for (const parent of parents) {
      if (!isParentRollupCategory(parent.id)) {
        const direct = budgetStates[parent.id] ?? null;
        if (direct) out.set(parent.id, direct);
        continue;
      }

      const childIds = childIdsByParentId.get(parent.id) ?? [];

      const childBudgets = childIds
        .map((childId) => budgetStates[childId])
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
      const amountMinor = childBudgets.reduce((sum, budget) => sum + budget.amountMinor, 0);
      const spentMinor = childBudgets.reduce((sum, budget) => sum + budget.spentMinor, 0);
      const ratio = amountMinor === 0 ? 0 : spentMinor / amountMinor;

      out.set(parent.id, {
        categoryId: parent.id,
        amountMinor,
        spentMinor,
        ratio,
        tone: ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'neutral',
      });
    }

    return out;
  }, [budgetStates, childIdsByParentId, data.categories, incomeParentIds, isParentRollupCategory]);

  const totalSpentByCategoryId = useMemo(() => {
    if (!selectedCycle) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const row of selectedCycleRows) {
      if (row.kind !== 'expense' || row.is_shared_topup || !row.category_id) continue;
      out.set(row.category_id, (out.get(row.category_id) ?? 0) + row.amount_minor);
      const parentId = parentByCategoryId.get(row.category_id);
      if (parentId) out.set(parentId, (out.get(parentId) ?? 0) + row.amount_minor);
    }
    return out;
  }, [parentByCategoryId, selectedCycle, selectedCycleRows]);

  const mySpentByCategoryId = useMemo(() => {
    if (!selectedCycle) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const row of selectedCycleRows) {
      if (row.kind !== 'expense' || !row.category_id) continue;
      const mySpentMinor = personalExpenseByTransactionId.get(row.id) ?? 0;
      if (mySpentMinor <= 0) continue;
      out.set(row.category_id, (out.get(row.category_id) ?? 0) + mySpentMinor);
      const parentId = parentByCategoryId.get(row.category_id);
      if (parentId) out.set(parentId, (out.get(parentId) ?? 0) + mySpentMinor);
    }
    return out;
  }, [parentByCategoryId, personalExpenseByTransactionId, selectedCycle, selectedCycleRows]);

  const isEditableCategory = useMemo(() => {
    return (categoryId: string): boolean => {
      const category = categoryById.get(categoryId);
      if (!category || isIncomeCategoryRow(category, incomeParentIds)) return false;
      return !isParentRollupCategory(categoryId);
    };
  }, [categoryById, incomeParentIds, isParentRollupCategory]);

  const groupedRows = useMemo(() => {
    const parents = data.categories
      .filter((category) => category.level === 1 && !isIncomeCategoryRow(category, incomeParentIds))
      .sort((a, b) => a.name.localeCompare(b.name));

    return parents
      .map((parent) => {
        const children = parent.name === 'Other'
          ? []
          : data.categories
            .filter((category) => category.parent_id === parent.id)
            .sort((a, b) => a.name.localeCompare(b.name));
        const childIds = children.map((child) => child.id);
        const childRows = children.map((child) => ({
          category: child,
          label: categoryMeta[child.id]?.label ?? child.name,
          icon: child.icon,
          state: budgetStates[child.id] ?? null,
        }));
        const parentState = budgetStateByParentId.get(parent.id) ?? null;
        const hasBudget = parentState !== null && parentState.amountMinor > 0;
        return {
          parent,
          label: categoryMeta[parent.id]?.label ?? parent.name,
          icon: parent.icon,
          state: parentState,
          hasBudget,
          hasChildren: childIds.length > 0,
          children: childRows,
        };
      })
      .sort((a, b) => {
        if (a.hasBudget !== b.hasBudget) return Number(b.hasBudget) - Number(a.hasBudget);
        return a.label.localeCompare(b.label);
      });
  }, [budgetStateByParentId, budgetStates, categoryMeta, data.categories, incomeParentIds]);

  const cycleSalaryMinor = useMemo(() => {
    if (!selectedCycle) return 0;
    return data.transactions
      .filter(
        (row) =>
          row.kind === 'income' &&
          row.is_salary &&
          row.occurred_on >= selectedCycle.startOn &&
          (selectedCycle.endOnExclusive === null || row.occurred_on < selectedCycle.endOnExclusive),
      )
      .reduce((sum, row) => sum + row.amount_minor, 0);
  }, [data.transactions, selectedCycle]);

  const totalDefinedBudgetsMinor = useMemo(
    () =>
      selectedCycleBudgets.reduce((sum, budget) => {
        const category = categoryById.get(budget.category_id);
        if (!category) return sum;
        if (isParentRollupCategory(category.id)) return sum;
        return sum + budget.amount_minor;
      }, 0),
    [categoryById, isParentRollupCategory, selectedCycleBudgets],
  );

  const remainingAfterBudgetsMinor = cycleSalaryMinor - totalDefinedBudgetsMinor;

  const realAvailableMoneyMinor = useMemo(() => {
    if (!selectedCycle) return 0;
    const myCycleSpentMinor = selectedCycleRows.reduce(
      (sum, row) => sum + (personalExpenseByTransactionId.get(row.id) ?? 0),
      0,
    );
    return cycleSalaryMinor - myCycleSpentMinor;
  }, [cycleSalaryMinor, personalExpenseByTransactionId, selectedCycle, selectedCycleRows]);

  const unbudgetedParentUsage = useMemo(() => {
    if (!selectedCycle) return [] as { id: string; label: string; color: string }[];
    const usedParentIds = new Set<string>();
    for (const row of data.transactions) {
      if (row.kind !== 'expense' || row.is_shared_topup || !row.category_id) continue;
      if (row.occurred_on < selectedCycle.startOn) continue;
      if (selectedCycle.endOnExclusive !== null && row.occurred_on >= selectedCycle.endOnExclusive) continue;
      const parentId = parentByCategoryId.get(row.category_id) ?? row.category_id;
      if (expenseParentIds.has(parentId)) usedParentIds.add(parentId);
    }

    return [...usedParentIds]
      .filter((parentId) => {
        if (isParentRollupCategory(parentId)) {
          const childIds = childIdsByParentId.get(parentId) ?? [];
          return childIds.every((childId) => !budgetByCategoryId.has(childId));
        }
        return !budgetByCategoryId.has(parentId);
      })
      .map((parentId) => {
        const meta = categoryMeta[parentId];
        return {
          id: parentId,
          label: meta?.label ?? 'Category',
          color: meta?.color ?? colors.textMuted,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [budgetByCategoryId, categoryMeta, childIdsByParentId, data.transactions, expenseParentIds, isParentRollupCategory, parentByCategoryId, selectedCycle]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return groupedRows;
    return groupedRows.filter(({ parent, label, children }) => {
      const parentLabel = categoryMeta[parent.id]?.label ?? label;
      const parentText = `${label} ${parent.name} ${parentLabel}`.toLowerCase();
      if (parentText.includes(normalizedQuery)) return true;
      return children.some(({ category, label: childLabel }) => {
        const childParentLabel = categoryMeta[category.parent_id ?? category.id]?.label ?? '';
        const searchText = `${childLabel} ${category.name} ${childParentLabel}`.toLowerCase();
        return searchText.includes(normalizedQuery);
      });
    });
  }, [categoryMeta, groupedRows, query]);

  const visibleParentIds = useMemo(() => filteredRows.map((group) => group.parent.id), [filteredRows]);

  useEffect(() => {
    setExpandedParentIds((current) => current.filter((id) => visibleParentIds.includes(id)));
  }, [visibleParentIds]);

  const toggleParent = (parentId: string): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedParentIds((current) =>
      current.includes(parentId) ? current.filter((id) => id !== parentId) : [...current, parentId],
    );
  };

  const selectCycle = (cycleId: string): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCycleId(cycleId);
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const saveBudget = async (): Promise<void> => {
    if (!draft || !data.userId || !selectedCycle) return;
    if (!isEditableCategory(draft.categoryId)) return;
    const amountMinor = parseMinor(draft.amount);
    if (amountMinor === null) return;

    if (amountMinor === 0) {
      await removeBudget();
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: data.userId,
        category_id: draft.categoryId,
        salary_cycle_id: selectedCycle.id,
        amount_minor: amountMinor,
        notes: draft.notes || null,
      };
      const { error } = await supabase
        .from('budgets')
        .upsert(payload, { onConflict: 'user_id,category_id,salary_cycle_id' });
      if (!error) {
        await data.reload();
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const setNoBudget = async (): Promise<void> => {
    if (!draft) return;
    if (!isEditableCategory(draft.categoryId)) return;
    if (!draft.budgetId && !budgetByCategoryId.get(draft.categoryId)?.id) {
      setDraft(null);
      return;
    }
    await removeBudget();
  };

  const removeBudget = async (): Promise<void> => {
    if (draft && !isEditableCategory(draft.categoryId)) return;
    const budgetId = draft?.budgetId ?? budgetByCategoryId.get(draft?.categoryId ?? '')?.id;
    if (!budgetId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
      if (!error) {
        await data.reload();
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!draftCategoryId) return;
    requestAnimationFrame(() => amountInputRef.current?.focus());
  }, [draftCategoryId]);

  const openBudgetTransactions = (scope: { categoryId?: string; parentLabel?: string; categoryIds?: string[] }): void => {
    if (!selectedCycle) return;
    const params = new URLSearchParams();
    params.set('startOn', selectedCycle.startOn);
    if (selectedCycle.endOnExclusive) params.set('endOnExclusive', selectedCycle.endOnExclusive);
    params.set('kind', 'expense');
    params.set('includeShared', '1');
    if (scope.categoryIds && scope.categoryIds.length > 0) params.set('categoryIds', scope.categoryIds.join(','));
    if (scope.categoryId) params.set('categoryId', scope.categoryId);
    if (scope.parentLabel) params.set('parentLabel', scope.parentLabel);
    router.push((`/personal-history?${params.toString()}`) as never);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
      >
        <ScreenHeader
          back
          title="Budgets"
          subtitle={selectedCycle ? `Selected cycle ${selectedCycle.label}` : 'Add a salary transaction to start budgeting'}
        />

        {selectedCycle && cyclesWithTransactions.length > 0 ? (
          <View style={styles.cycleCard}>
            <Pressable
              style={({ pressed }) => [styles.cycleArrow, pressed && styles.buttonPressed]}
              onPress={() => {
                const index = cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle.id);
                const next = cyclesWithTransactions[index - 1];
                if (!next) return;
                selectCycle(next.id);
              }}
              disabled={cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle.id) <= 0}
            >
              <FontAwesome6 name="chevron-left" size={22} color={colors.text} />
            </Pressable>
            <View style={styles.cycleBody}>
              <Text style={styles.cycleLabel}>Cycle</Text>
              <Text style={styles.cycleValue}>{selectedCycle.label}</Text>
              <Text style={styles.cycleMeta}>Budgets use this salary window, even if it is a past cycle.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.cycleArrow, pressed && styles.buttonPressed]}
              onPress={() => {
                const index = cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle.id);
                const next = cyclesWithTransactions[index + 1];
                if (!next) return;
                selectCycle(next.id);
              }}
              disabled={cyclesWithTransactions.findIndex((cycle) => cycle.id === selectedCycle.id) >= cyclesWithTransactions.length - 1}
            >
              <FontAwesome6 name="chevron-right" size={22} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {data.isInitialLoading ? <BudgetSkeleton /> : null}

        {!data.isInitialLoading ? (
          <>

            <SearchField value={query} onChangeText={setQuery} placeholder="Search categories" />

            {!selectedCycle ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No active salary cycle yet</Text>
                <Text style={styles.emptyBody}>
                  Mark an income transaction as salary first. That opens the current cycle and lets budgets attach to the right period.
                </Text>
              </View>
            ) : (
              <View style={styles.section}>
                {filteredRows.length === 0 ? (
                  <View style={styles.emptySearchCard}>
                    <Text style={styles.emptyTitle}>No categories match</Text>
                    <Text style={styles.emptyBody}>Try a broader search term or clear the filter.</Text>
                  </View>
                ) : null}

                {filteredRows.map(({ parent, label, icon, state, hasChildren, children }) => {
                  const expanded = expandedParentIds.includes(parent.id);
                  const tone =
                    state?.tone === 'critical'
                      ? colors.danger
                      : state?.tone === 'warning'
                        ? '#F5B942'
                        : parent.color;
                  const parentBudget: BudgetRow | null = hasChildren ? null : budgetByCategoryId.get(parent.id) ?? null;
                  return (
                    <View key={parent.id} style={styles.groupCard}>
                      <Pressable
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                        onPress={() => {
                          openBudgetTransactions({ parentLabel: label, categoryIds: children.map((child) => child.category.id) });
                        }}
                        onLongPress={
                          hasChildren
                            ? undefined
                            : () => {
                              Keyboard.dismiss();
                              setDraft({
                                categoryId: parent.id,
                                label,
                                icon,
                                amount: parentBudget ? String((parentBudget.amount_minor / 100).toFixed(2)) : '',
                                notes: String((parentBudget?.notes) || ''),
                                budgetId: parentBudget?.id,
                              });
                            }
                        }
                      >
                        <View style={[styles.iconWrap, { backgroundColor: `${tone}22` }]}>
                          <CategoryIcon name={icon} size={20} color={tone} />
                        </View>
                        <View style={styles.rowBody}>
                          <View style={styles.rowHead}>
                            <View style={styles.rowIdentity}>
                              <Text style={styles.rowLabel}>{label}</Text>
                            </View>
                            <Text style={[styles.rowRatio, state ? { color: tone } : styles.rowRatioMuted]}>
                              {state ? formatPercent(state.ratio) : '--'}
                            </Text>
                          </View>
                          <Text style={styles.rowMeta}>
                            {state
                              ? (() => {
                                const totalSpentMinor = totalSpentByCategoryId.get(parent.id) ?? state.spentMinor;
                                if (totalSpentMinor > state.spentMinor) {
                                  return (
                                    <>
                                      <Text style={styles.rowMetaLabel}>Mine:</Text> {formatMinor(state.spentMinor)} of {formatMinor(state.amountMinor)}
                                      {'\n'}
                                      <Text style={styles.rowMetaLabel}>Total:</Text> {formatMinor(totalSpentMinor)}
                                    </>
                                  );
                                }
                                return `${formatMinor(state.spentMinor)} of ${formatMinor(state.amountMinor)}`;
                              })()
                              : 'Long press to set cycle target'}
                          </Text>
                          <ProgressBar value={state?.ratio ?? 0} color={tone} />
                          {parentBudget && parentBudget.notes ? (
                            <View style={styles.rowNotes}>
                              <RichTextDisplay text={String(parentBudget.notes || '')} />
                            </View>
                          ) : null}
                        </View>
                        {hasChildren ? (
                          <Pressable
                            hitSlop={14}
                            style={({ pressed }) => [styles.chevronHitbox, pressed && styles.buttonPressed]}
                            onPress={() => toggleParent(parent.id)}
                          >
                            <FontAwesome6
                              name={expanded ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color={colors.textMuted}
                            />
                          </Pressable>
                        ) : null}
                      </Pressable>

                      {expanded ? (
                        <View style={styles.childGroup}>
                          {children.length === 0 ? (
                            <Text style={styles.childEmpty}>No subcategories</Text>
                          ) : (
                            children.map(({ category, label: childLabel, icon: childIcon, state: childState }) => {
                              const childTone = `${category.color}CC`;
                              return (
                                <Pressable
                                  key={category.id}
                                  style={({ pressed }) => [styles.childRow, pressed && styles.rowPressed]}
                                  onPress={() => {
                                    openBudgetTransactions({ categoryId: category.id, parentLabel: label, categoryIds: [category.id] });
                                  }}
                                  onLongPress={() => {
                                    Keyboard.dismiss();
                                    setDraft({
                                      categoryId: category.id,
                                      label: childLabel,
                                      icon: childIcon,
                                      amount: childState ? String((childState.amountMinor / 100).toFixed(2)) : '',
                                      notes: String(budgetByCategoryId.get(category.id)?.notes || ''),
                                      budgetId: budgetByCategoryId.get(category.id)?.id,
                                    });
                                  }}
                                >
                                  <View style={[styles.childIconWrap, { backgroundColor: `${childTone}22` }]}>
                                    <CategoryIcon name={childIcon} size={18} color={childTone} />
                                  </View>
                                  <View style={styles.rowBody}>
                                    <View style={styles.rowHead}>
                                      <View style={styles.rowIdentity}>
                                        <Text style={styles.rowLabel}>{childLabel}</Text>
                                      </View>
                                      <Text style={[styles.rowRatio, childState ? { color: childTone } : styles.rowRatioMuted]}>
                                        {childState ? formatPercent(childState.ratio) : '--'}
                                      </Text>
                                    </View>
                                    <Text style={styles.rowMeta}>
                                      {childState
                                        ? (() => {
                                          const totalSpentMinor = totalSpentByCategoryId.get(category.id) ?? childState.spentMinor;
                                          if (totalSpentMinor > childState.spentMinor) {
                                            return (
                                              <>
                                                <Text style={styles.rowMetaLabel}>Mine:</Text> {formatMinor(childState.spentMinor)} of {formatMinor(childState.amountMinor)}
                                                {'\n'}
                                                <Text style={styles.rowMetaLabel}>Total:</Text> {formatMinor(totalSpentMinor)}
                                              </>
                                            );
                                          }
                                          return `${formatMinor(childState.spentMinor)} of ${formatMinor(childState.amountMinor)}`;
                                        })()
                                        : totalSpentByCategoryId.get(category.id)
                                          ? (
                                            <>
                                              <Text style={styles.rowMetaLabel}>Mine:</Text> {formatMinor(mySpentByCategoryId.get(category.id) ?? 0)}
                                              {'\n'}
                                              <Text style={styles.rowMetaLabel}>Total:</Text> {formatMinor(totalSpentByCategoryId.get(category.id) ?? 0)}
                                            </>
                                          )
                                          : 'Long press to set budget'}
                                    </Text>
                                    <ProgressBar value={childState?.ratio ?? 0} color={childTone} />
                                  </View>
                                </Pressable>
                              );
                            })
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Cycle budget check</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Current salary</Text>
                    <Text style={styles.summaryValue}>{formatMinor(cycleSalaryMinor)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>If all budgets are fully spent</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        remainingAfterBudgetsMinor < 0 ? styles.summaryValueNegative : styles.summaryValuePositive,
                      ]}
                    >
                      {formatMinor(remainingAfterBudgetsMinor)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Real available to save</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        realAvailableMoneyMinor < 0 ? styles.summaryValueNegative : styles.summaryValuePositive,
                      ]}
                    >
                      {formatMinor(realAvailableMoneyMinor)}
                    </Text>
                  </View>

                  <Text style={styles.summarySubTitle}>Used categories with no budget</Text>
                  {unbudgetedParentUsage.length === 0 ? (
                    <Text style={styles.summaryMuted}>All used categories have a budget.</Text>
                  ) : (
                    <View style={styles.unbudgetedList}>
                      {unbudgetedParentUsage.map((item) => (
                        <Text key={item.id} style={[styles.unbudgetedItem, { color: item.color }]}>{item.label}</Text>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={draft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setDraft(null);
        }}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => {
              setDraft(null);
            }}
            title="Edit Budget"
            subtitle={draft?.label}
            actions={[
              {
                icon: 'check',
                onPress: () => runDetached(saveBudget(), 'budgets.saveBudget'),
              },
            ]}
          />
          <KeyboardAvoidingView
            style={styles.modalContent}
            behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
            keyboardVerticalOffset={spacing.md}
          >
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Cycle target</Text>
              <View style={styles.amountCard}>
                <TextInput
                  ref={amountInputRef}
                  value={draft?.amount ?? ''}
                  onChangeText={(value) => setDraft((current) => (current ? { ...current, amount: value } : current))}
                  autoFocus
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.text}
                  cursorColor={colors.text}
                  style={styles.amountInput}
                  accessibilityLabel="Budget amount"
                />
                <Text style={styles.amountCurrency}>DKK</Text>
              </View>
              <Text style={styles.helper}>
                Progress updates automatically from transactions in the selected salary cycle.
              </Text>

              <Text style={styles.label}>Notes</Text>
              {draft ? (
                <RichTextEditor
                  value={draft.notes}
                  onChange={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
                  placeholder="Add notes with **bold** formatting..."
                />
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.buttonPressed]}
                onPress={() => runDetached(saveBudget(), 'budgets.saveBudget')}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save budget'}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                onPress={() => runDetached(setNoBudget(), 'budgets.setNoBudget')}
              >
                <Text style={styles.secondaryButtonText}>No budget</Text>
              </Pressable>
            </ScrollView>

          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxl * 3, gap: spacing.lg },
  cycleCard: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cycleBody: { flex: 1, gap: spacing.xs },
  cycleLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cycleValue: { ...typography.h2, color: colors.text },
  cycleMeta: { ...typography.label, color: colors.textMuted },
  cycleArrow: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  skeletonHeroCard: { marginHorizontal: spacing.lg },
  skeletonSearchCard: { marginHorizontal: spacing.lg },
  skeletonSearchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skeletonBudgetRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroTitle: { ...typography.h2, color: colors.text },
  heroBody: { ...typography.body, color: colors.textMuted },
  emptyCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.h2, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textMuted },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptySearchCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  rowPressed: { opacity: 0.86 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: spacing.xs },
  rowHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  rowIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  rowRatio: { ...typography.body, fontWeight: '700' },
  rowRatioMuted: { color: colors.textMuted },
  rowMeta: { ...typography.label, color: colors.textMuted },
  rowMetaLabel: { color: colors.text, fontWeight: '700' },
  rowNotes: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  groupCard: { gap: spacing.sm },
  summaryCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  summaryTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  summarySubTitle: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  summaryLabel: { ...typography.body, color: colors.textMuted, flex: 1 },
  summaryValue: { ...typography.body, color: colors.text, fontWeight: '700' },
  summaryValuePositive: { color: colors.success },
  summaryValueNegative: { color: colors.danger },
  summaryMuted: { ...typography.label, color: colors.textMuted },
  unbudgetedList: { gap: spacing.xs },
  unbudgetedItem: { ...typography.body, fontWeight: '600' },
  chevronHitbox: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginLeft: spacing.xs,
  },
  childGroup: { gap: spacing.sm, paddingLeft: spacing.lg },
  childRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  childEmpty: { ...typography.label, color: colors.textMuted, paddingHorizontal: spacing.sm },
  childIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childSpent: { ...typography.label, color: colors.text, fontWeight: '600' },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalContent: { flex: 1 },
  modalBody: { flex: 1 },
  modalBodyContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  amountInput: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  amountCurrency: { ...typography.label, color: colors.textMuted, letterSpacing: 0.5 },
  helper: { ...typography.label, color: colors.textMuted },
  smallButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  smallButtonMuted: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  smallButtonText: { ...typography.label, color: colors.text, fontWeight: '600' },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: { ...typography.body, color: colors.danger, fontWeight: '600' },
  buttonPressed: { opacity: 0.86 },
});

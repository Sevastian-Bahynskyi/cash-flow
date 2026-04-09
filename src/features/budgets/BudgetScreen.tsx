import { useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverview } from '@/features/overview/useOverview';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { buildBudgetStateByCategory } from '@/features/budgets/helpers';
import { supabase } from '@/lib/supabase';
import { formatMinor, formatPercent } from '@/lib/format';
import { ProgressBar } from '@/ui/ProgressBar';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type BudgetDraft = {
  categoryId: string;
  label: string;
  icon: string;
  amount: string;
  budgetId?: string;
};

const parseMinor = (raw: string): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const formatAmountDisplay = (raw: string): string => {
  if (raw.trim().length === 0) return '0.00';
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value)) return raw;
  return value.toFixed(2);
};

const highlightedAmount = (raw: string): { display: string; activeIndex: number | null } => {
  const display = formatAmountDisplay(raw);
  const normalized = raw.trim().replace(',', '.');
  const displayDotAt = display.indexOf('.');

  if (normalized.endsWith('.')) {
    return { display, activeIndex: displayDotAt >= 0 ? displayDotAt + 1 : null };
  }

  let rawIndex = normalized.length - 1;

  while (rawIndex >= 0 && !/[0-9]/.test(normalized[rawIndex] ?? '')) {
    rawIndex -= 1;
  }

  if (rawIndex < 0) return { display, activeIndex: null };

  return { display, activeIndex: rawIndex };
};

export default function BudgetScreen() {
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(true);

  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);
  const budgetStates = useMemo(
    () => buildBudgetStateByCategory(data.categories, data.budgets, data.transactions, data.activeCycle),
    [data.activeCycle, data.budgets, data.categories, data.transactions],
  );
  const amountDisplayState = useMemo(() => highlightedAmount(draft?.amount ?? ''), [draft?.amount]);

  const rows = useMemo(() => {
    const budgetByCategoryId = new Map(data.budgets.map((budget) => [budget.category_id, budget]));
    return data.categories
      .map((category) => ({
        category,
        label: categoryMeta[category.id]?.label ?? category.name,
        icon: category.icon,
        budget: budgetByCategoryId.get(category.id),
        state: budgetStates[category.id] ?? null,
      }))
      .sort((a, b) => {
        const aHasBudget = a.budget ? 1 : 0;
        const bHasBudget = b.budget ? 1 : 0;
        if (aHasBudget !== bHasBudget) return bHasBudget - aHasBudget;
        if (a.category.level !== b.category.level) return a.category.level - b.category.level;
        return a.label.localeCompare(b.label);
      });
  }, [budgetStates, categoryMeta, data.budgets, data.categories]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return rows;
    return rows.filter(({ label, category }) => {
      const parentLabel = categoryMeta[category.id]?.label ?? label;
      const searchText = `${label} ${category.name} ${parentLabel}`.toLowerCase();
      return searchText.includes(normalizedQuery);
    });
  }, [categoryMeta, query, rows]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const saveBudget = async (): Promise<void> => {
    if (!draft || !data.userId || !data.activeCycle) return;
    const amountMinor = parseMinor(draft.amount);
    if (amountMinor === null) return;

    setSaving(true);
    try {
      const payload = {
        user_id: data.userId,
        category_id: draft.categoryId,
        salary_cycle_id: data.activeCycle.id,
        amount_minor: amountMinor,
      };
      const { error } = await supabase
        .from('budgets')
        .upsert(payload, { onConflict: 'user_id,category_id,salary_cycle_id' });
      if (!error) {
        await data.reload();
        setDraft(null);
        setKeypadOpen(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeBudget = async (): Promise<void> => {
    if (!draft?.budgetId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', draft.budgetId);
      if (!error) {
        await data.reload();
        setDraft(null);
        setKeypadOpen(true);
      }
    } finally {
      setSaving(false);
    }
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
          subtitle={data.activeCycle ? `Current cycle ${data.activeCycle.label}` : 'Add a salary transaction to start budgeting'}
        />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Cycle budget state</Text>
          <Text style={styles.heroBody}>
            Budgets live on salary cycles, not calendar months. Tap any category to set, edit, or remove its target for the active cycle.
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {query.trim().length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {!data.activeCycle ? (
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

            {filteredRows.map(({ category, label, icon, budget, state }) => {
              const tone =
                state?.tone === 'critical'
                  ? colors.danger
                  : state?.tone === 'warning'
                    ? '#F5B942'
                    : category.level === 1
                      ? category.color
                      : `${category.color}CC`;
              return (
                <Pressable
                  key={category.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setKeypadOpen(true);
                    setDraft({
                      categoryId: category.id,
                      label,
                      icon,
                      amount: budget ? String((budget.amount_minor / 100).toFixed(2)) : '',
                      budgetId: budget?.id,
                    });
                  }}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${tone}22` }]}>
                    <MaterialCommunityIcons name={icon as never} size={20} color={tone} />
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowHead}>
                      <Text style={[styles.rowLabel, category.level === 2 && styles.rowLabelChild]}>
                        {label}
                      </Text>
                      <Text style={styles.rowAmount}>
                        {state ? formatMinor(state.amountMinor) : 'No budget'}
                      </Text>
                    </View>
                    <Text style={styles.rowMeta}>
                      {state
                        ? `${formatMinor(state.spentMinor)} spent · ${formatPercent(state.ratio)}`
                        : 'Tap to set a target for this cycle'}
                    </Text>
                    <ProgressBar value={state?.ratio ?? 0} color={tone} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={draft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setDraft(null);
          setKeypadOpen(true);
        }}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => {
              setDraft(null);
              setKeypadOpen(true);
            }}
            title="Edit Budget"
            subtitle={draft?.label}
            actions={[
              {
                icon: 'check',
                onPress: () => {
                  void saveBudget();
                },
              },
            ]}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalBody}>
              <Text style={styles.label}>Cycle target</Text>
              <View style={styles.amountCard}>
                <Text style={styles.amountValue}>
                  {amountDisplayState.display.split('').map((char, index) => (
                    <Text
                      key={`${char}-${index}`}
                      style={index === amountDisplayState.activeIndex ? styles.amountValueActive : undefined}
                    >
                      {char}
                    </Text>
                  ))}
                </Text>
                <Text style={styles.amountCurrency}>DKK</Text>
              </View>
              <Text style={styles.helper}>
                Use the same keypad as transactions. Progress updates automatically from transactions in the active salary cycle.
              </Text>

              <Pressable
                style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.buttonPressed]}
                onPress={() => {
                  void saveBudget();
                }}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save budget'}</Text>
              </Pressable>

              {draft?.budgetId ? (
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  onPress={() => {
                    void removeBudget();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Remove budget</Text>
                </Pressable>
              ) : null}
            </View>

            {keypadOpen ? (
              <NumericKeypad
                value={draft?.amount ?? ''}
                onChange={(value) => setDraft((current) => (current ? { ...current, amount: value } : current))}
                onClose={() => setKeypadOpen(false)}
              />
            ) : (
              <View style={styles.keyboardDock}>
                <Pressable
                  style={({ pressed }) => [styles.keyboardDockButton, pressed && styles.buttonPressed]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setKeypadOpen(true);
                  }}
                >
                  <MaterialCommunityIcons name="keyboard-outline" size={18} color={colors.text} />
                  <Text style={styles.keyboardDockText}>Open keypad</Text>
                  <MaterialCommunityIcons name="chevron-up" size={18} color={colors.text} />
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
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
    gap: spacing.sm,
  },
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
  searchWrap: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: 0,
  },
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
  rowLabel: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  rowLabelChild: { color: colors.textMuted },
  rowAmount: { ...typography.label, color: colors.text },
  rowMeta: { ...typography.label, color: colors.textMuted },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalContent: { flex: 1, justifyContent: 'space-between' },
  modalBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
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
  amountValue: { ...typography.amount, color: colors.text },
  amountValueActive: { color: colors.accentAlt },
  amountCurrency: { ...typography.label, color: colors.textMuted, letterSpacing: 0.5 },
  helper: { ...typography.label, color: colors.textMuted },
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
  keyboardDock: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keyboardDockButton: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,185,66,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.32)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  keyboardDockText: { ...typography.label, color: colors.text, fontWeight: '600' },
});

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { getCategoryDisplayColor } from './helpers';
import { useCategories } from './useCategories';
import type { CategoryOption } from './types';
import type { TransactionKind } from '@/features/transactions/types';
import { isAllowedIncomeCategoryOption, isIncomeCategoryOption } from './rules';

type BudgetIndicator = {
  tone: 'neutral' | 'warning' | 'critical';
  label: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: CategoryOption) => void;
  kind?: TransactionKind;
  frequentIds?: readonly string[];
  recentIds?: readonly string[];
  selectedId?: string | null;
  budgetStateByCategory?: Record<string, BudgetIndicator>;
};

const toneColor = (tone: BudgetIndicator['tone']): string => {
  if (tone === 'critical') return colors.danger;
  if (tone === 'warning') return '#F5B942';
  return colors.textMuted;
};

function CategoryRow({
  item,
  onSelect,
  onClose,
  selectedId,
  budget,
  kind,
}: {
  item: CategoryOption;
  onSelect: (option: CategoryOption) => void;
  onClose: () => void;
  selectedId?: string | null;
  budget?: BudgetIndicator;
  kind: TransactionKind;
}) {
  const selected = selectedId === item.id;
  const iconColor = getCategoryDisplayColor({
    kind,
    parentName: item.parentName,
    name: item.name,
    parentColor: item.parentColor,
    color: item.color,
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
      onPress={() => {
        onSelect(item);
        onClose();
      }}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: `${iconColor}22` }]}>
        <CategoryIcon name={item.icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        {item.parentName !== item.name ? <Text style={styles.rowParent}>{item.parentName}</Text> : null}
        <Text style={styles.rowName}>{item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        {budget ? (
          <Text style={[styles.budgetTag, { color: toneColor(budget.tone) }]}>{budget.label}</Text>
        ) : null}
        {selected ? <FontAwesome6 name="check" size={18} color={colors.accent} /> : null}
      </View>
    </Pressable>
  );
}

export function CategorySheet({
  visible,
  onClose,
  onSelect,
  kind = 'expense',
  frequentIds,
  recentIds,
  selectedId,
  budgetStateByCategory,
}: Props) {
  const state = useCategories();
  const [query, setQuery] = useState('');

  const filtered = useMemo<CategoryOption[]>(() => {
    if (state.status !== 'ready') return [];
    const visibleOptions =
      kind === 'expense'
        ? state.options.filter((option) => !isIncomeCategoryOption(option))
        : state.options.filter((option) => isAllowedIncomeCategoryOption(option));
    const q = query.trim().toLowerCase();
    if (q.length === 0) return visibleOptions;
    return visibleOptions.filter((option) => option.searchKey.includes(q));
  }, [kind, query, state]);

  const featured = useMemo(() => {
    if (state.status !== 'ready') return { frequent: [], recent: [] } as const;
    const visibleOptions =
      kind === 'expense'
        ? state.options.filter((option) => !isIncomeCategoryOption(option))
        : state.options.filter((option) => isAllowedIncomeCategoryOption(option));
    const optionsById = new Map(visibleOptions.map((option) => [option.id, option]));
    const frequent = (frequentIds ?? [])
      .map((id) => optionsById.get(id))
      .filter((value): value is CategoryOption => Boolean(value));
    const recent = (recentIds ?? [])
      .map((id) => optionsById.get(id))
      .filter(
        (value): value is CategoryOption =>
          value !== undefined && !frequent.some((item) => item.id === value.id),
      );
    return { frequent, recent } as const;
  }, [frequentIds, kind, recentIds, state]);

  const grouped = useMemo(() => {
    if (state.status !== 'ready') return [] as { parentId: string; parentName: string; items: CategoryOption[] }[];
    const groups = new Map<string, { parentId: string; parentName: string; items: CategoryOption[] }>();
    const visibleOptions =
      kind === 'expense'
        ? state.options.filter((option) => !isIncomeCategoryOption(option))
        : state.options.filter((option) => isAllowedIncomeCategoryOption(option));
    for (const option of visibleOptions) {
      const existing = groups.get(option.parentId);
      if (existing) existing.items.push(option);
      else groups.set(option.parentId, { parentId: option.parentId, parentName: option.parentName, items: [option] });
    }
    return [...groups.values()]
      .sort((a, b) => a.parentName.localeCompare(b.parentName))
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [kind, state]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView style={styles.sheetWrap} edges={['bottom']}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Pick a category</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.search}
          />
          {state.status === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
          {state.status === 'error' && (
            <View style={styles.center}>
              <Text style={styles.error}>{state.message}</Text>
            </View>
          )}
          {state.status === 'ready' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {query.trim().length > 0 ? (
                filtered.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={styles.muted}>No matches</Text>
                  </View>
                ) : (
                  filtered.map((item) => (
                    <CategoryRow
                      key={item.id}
                      item={item}
                      onSelect={onSelect}
                      onClose={onClose}
                      selectedId={selectedId}
                      budget={budgetStateByCategory?.[item.id]}
                      kind={kind}
                    />
                  ))
                )
              ) : (
                <>
                  {featured.frequent.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Frequent</Text>
                      {featured.frequent.map((item) => (
                        <CategoryRow
                          key={item.id}
                          item={item}
                          onSelect={onSelect}
                          onClose={onClose}
                          selectedId={selectedId}
                          budget={budgetStateByCategory?.[item.id]}
                          kind={kind}
                        />
                      ))}
                    </View>
                  ) : null}

                  {featured.recent.length > 0 ? (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Recent</Text>
                      {featured.recent.map((item) => (
                        <CategoryRow
                          key={item.id}
                          item={item}
                          onSelect={onSelect}
                          onClose={onClose}
                          selectedId={selectedId}
                          budget={budgetStateByCategory?.[item.id]}
                          kind={kind}
                        />
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>All categories</Text>
                    {grouped.map((group) => (
                      <View key={group.parentId} style={styles.group}>
                        <Text style={styles.groupTitle}>{group.parentName}</Text>
                        {group.items.map((item) => (
                          <CategoryRow
                            key={item.id}
                            item={item}
                            onSelect={onSelect}
                            onClose={onClose}
                            selectedId={selectedId}
                            budget={budgetStateByCategory?.[item.id]}
                            kind={kind}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheetWrap: {
    height: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.h2, color: colors.text },
  close: { ...typography.body, color: colors.accent },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    color: colors.text,
    ...typography.body,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  section: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: { gap: spacing.xs },
  groupTitle: { ...typography.label, color: colors.textMuted, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.86 },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1 },
  rowParent: { ...typography.label, color: colors.textMuted },
  rowName: { ...typography.body, color: colors.text, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  budgetTag: { ...typography.label, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});

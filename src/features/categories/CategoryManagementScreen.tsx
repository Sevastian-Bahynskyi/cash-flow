import { useMemo, useState } from 'react';
import {
  Alert,
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
import { clearCategoryCache } from '@/features/categories/useCategories';
import type { CategoryRow } from '@/features/categories/types';
import { categoryColorOptions, categoryIconOptions } from '@/features/categories/presentation';
import { useOverview } from '@/features/overview/useOverview';
import { buildBudgetStateByCategory } from '@/features/budgets/helpers';
import { supabase } from '@/lib/supabase';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type CategoryDraft = {
  mode: 'create-parent' | 'create-child' | 'edit';
  categoryId?: string;
  parentId: string | null;
  name: string;
  icon: string;
  color: string;
  level: 1 | 2;
  readOnly: boolean;
};

const toneForBudget = (tone: 'neutral' | 'warning' | 'critical' | null): string => {
  if (tone === 'critical') return colors.danger;
  if (tone === 'warning') return '#F5B942';
  return colors.textMuted;
};

export default function CategoryManagementScreen() {
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const budgetStates = useMemo(
    () => buildBudgetStateByCategory(data.categories, data.budgets, data.transactions, data.activeCycle),
    [data.activeCycle, data.budgets, data.categories, data.transactions],
  );

  const parents = useMemo(
    () =>
      data.categories
        .filter((category) => category.level === 1)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((parent) => ({
          parent,
          children: data.categories
            .filter((category) => category.parent_id === parent.id)
            .sort((a, b) => a.name.localeCompare(b.name)),
        })),
    [data.categories],
  );

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  const openCreateParent = (): void => {
    setDraft({
      mode: 'create-parent',
      parentId: null,
      name: '',
      icon: 'shape-outline',
      color: '#7C5CFF',
      level: 1,
      readOnly: false,
    });
  };

  const openCreateChild = (parent: CategoryRow): void => {
    setDraft({
      mode: 'create-child',
      parentId: parent.id,
      name: '',
      icon: parent.icon,
      color: parent.color,
      level: 2,
      readOnly: false,
    });
  };

  const openEdit = (category: CategoryRow): void => {
    setDraft({
      mode: 'edit',
      categoryId: category.id,
      parentId: category.parent_id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      level: category.level,
      readOnly: category.is_system,
    });
  };

  const saveCategory = async (): Promise<void> => {
    if (!draft || draft.name.trim().length === 0 || !data.userId || draft.readOnly) return;

    setSaving(true);
    try {
      if (draft.mode === 'edit' && draft.categoryId) {
        const payload =
          draft.level === 1
            ? { name: draft.name.trim(), icon: draft.icon, color: draft.color }
            : { name: draft.name.trim(), icon: draft.icon };
        const { error } = await supabase.from('categories').update(payload).eq('id', draft.categoryId);
        if (!error) {
          clearCategoryCache();
          await data.reload();
          setDraft(null);
        }
        return;
      }

      const payload = {
        user_id: data.userId,
        parent_id: draft.level === 2 ? draft.parentId : null,
        name: draft.name.trim(),
        level: draft.level,
        is_system: false,
        icon: draft.icon,
        color: draft.level === 1 ? draft.color : draft.color,
      };
      const { error } = await supabase.from('categories').insert(payload);
      if (!error) {
        clearCategoryCache();
        await data.reload();
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (): Promise<void> => {
    if (!draft?.categoryId || draft.readOnly) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', draft.categoryId);
      if (!error) {
        clearCategoryCache();
        await data.reload();
        setDraft(null);
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
          title="Categories"
          subtitle="Parents stay bold. Subcategories stay fast."
          actions={[{ icon: 'plus', onPress: openCreateParent }]}
        />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Category system</Text>
          <Text style={styles.heroBody}>
            Default categories stay protected. You can add custom parents and subcategories, edit custom names and icons, and keep the hierarchy obvious.
          </Text>
        </View>

        <View style={styles.section}>
          {parents.map(({ parent, children }) => (
            <View key={parent.id} style={styles.parentCard}>
              <View style={styles.parentHead}>
                <View style={[styles.parentIconWrap, { backgroundColor: `${parent.color}22` }]}>
                  <MaterialCommunityIcons name={parent.icon as never} size={22} color={parent.color} />
                </View>
                <View style={styles.parentCopy}>
                  <Text style={styles.parentName}>{parent.name}</Text>
                  <View style={styles.parentMetaRow}>
                    <Text style={styles.parentMeta}>
                      {parent.is_system ? 'System category' : 'Custom category'}
                    </Text>
                    {budgetStates[parent.id] ? (
                      <Text
                        style={[
                          styles.budgetTag,
                          { color: toneForBudget(budgetStates[parent.id]?.tone ?? null) },
                        ]}
                      >
                        Budget {Math.round((budgetStates[parent.id]?.ratio ?? 0) * 100)}%
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <View style={styles.parentActions}>
                <Pressable
                  style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                  onPress={() => openCreateChild(parent)}
                >
                  <Text style={styles.smallButtonText}>Add subcategory</Text>
                </Pressable>
                {!parent.is_system ? (
                  <Pressable
                    style={({ pressed }) => [styles.smallButtonMuted, pressed && styles.buttonPressed]}
                    onPress={() => openEdit(parent)}
                  >
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.childList}>
                {children.map((child) => (
                  <Pressable
                    key={child.id}
                    style={({ pressed }) => [styles.childRow, pressed && !child.is_system && styles.rowPressed]}
                    onPress={() => {
                      if (!child.is_system) openEdit(child);
                    }}
                    onLongPress={() => {
                      if (child.is_system) return;
                      Alert.alert(child.name, undefined, [
                        { text: 'Edit', onPress: () => openEdit(child) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    }}
                  >
                    <View style={[styles.childIconWrap, { backgroundColor: `${parent.color}22` }]}>
                      <MaterialCommunityIcons name={child.icon as never} size={18} color={parent.color} />
                    </View>
                    <View style={styles.childCopy}>
                      <Text style={styles.childName}>{child.name}</Text>
                      <Text style={styles.childMeta}>
                        {child.is_system ? 'System subcategory' : 'Custom subcategory'}
                      </Text>
                    </View>
                    {budgetStates[child.id] ? (
                      <Text
                        style={[
                          styles.budgetTag,
                          { color: toneForBudget(budgetStates[child.id]?.tone ?? null) },
                        ]}
                      >
                        {Math.round((budgetStates[child.id]?.ratio ?? 0) * 100)}%
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={draft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            title={draft?.mode === 'edit' ? 'Edit Category' : draft?.level === 1 ? 'New Category' : 'New Subcategory'}
            subtitle={draft?.readOnly ? 'System categories are read-only' : undefined}
            actions={
              draft?.readOnly
                ? undefined
                : [
                    {
                      icon: 'check',
                      onPress: () => {
                        void saveCategory();
                      },
                    },
                  ]
            }
          />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={draft?.name ?? ''}
              onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
              editable={!draft?.readOnly}
              placeholder="Category name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Icon</Text>
            <View style={styles.optionGrid}>
              {categoryIconOptions.map((icon) => {
                const active = draft?.icon === icon;
                return (
                  <Pressable
                    key={icon}
                    disabled={draft?.readOnly}
                    style={({ pressed }) => [
                      styles.optionTile,
                      active && styles.optionTileActive,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => setDraft((current) => (current ? { ...current, icon } : current))}
                  >
                    <MaterialCommunityIcons
                      name={icon as never}
                      size={20}
                      color={active ? colors.text : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Color</Text>
            {draft?.level === 2 ? (
              <View style={styles.lockedColor}>
                <View style={[styles.colorDot, { backgroundColor: draft.color }]} />
                <Text style={styles.lockedCopy}>Subcategories inherit the parent color.</Text>
              </View>
            ) : (
              <View style={styles.colorRow}>
                {categoryColorOptions.map((color) => {
                  const active = draft?.color === color;
                  return (
                    <Pressable
                      key={color}
                      disabled={draft?.readOnly}
                      style={({ pressed }) => [
                        styles.colorChip,
                        { backgroundColor: color },
                        active && styles.colorChipActive,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => setDraft((current) => (current ? { ...current, color } : current))}
                    />
                  );
                })}
              </View>
            )}

            {!draft?.readOnly && draft?.mode === 'edit' ? (
              <Pressable
                style={({ pressed }) => [styles.destructiveButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  void deleteCategory();
                }}
              >
                <Text style={styles.destructiveButtonText}>{saving ? 'Working...' : 'Delete category'}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
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
  section: { paddingHorizontal: spacing.lg, gap: spacing.md },
  parentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  parentHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  parentIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentCopy: { flex: 1, gap: 2 },
  parentName: { ...typography.h2, color: colors.text },
  parentMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  parentMeta: { ...typography.label, color: colors.textMuted },
  budgetTag: { ...typography.label, fontWeight: '700' },
  parentActions: { flexDirection: 'row', gap: spacing.sm },
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
  smallButtonText: { ...typography.label, color: colors.text },
  childList: { gap: spacing.sm },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowPressed: { opacity: 0.86 },
  childIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCopy: { flex: 1, gap: 2 },
  childName: { ...typography.body, color: colors.text, fontWeight: '600' },
  childMeta: { ...typography.label, color: colors.textMuted },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(124,92,255,0.18)',
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorChipActive: { borderColor: colors.text },
  lockedColor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  colorDot: { width: 16, height: 16, borderRadius: radius.pill },
  lockedCopy: { ...typography.body, color: colors.textMuted },
  destructiveButton: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  destructiveButtonText: { ...typography.body, color: colors.danger, fontWeight: '600' },
  buttonPressed: { opacity: 0.86 },
});

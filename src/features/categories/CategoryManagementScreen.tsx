import { useEffect, useMemo, useState } from 'react';
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
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { clearCategoryCache } from '@/features/categories/useCategories';
import type { CategoryRow } from '@/features/categories/types';
import { categoryColorOptions, categoryIconOptions } from '@/features/categories/presentation';
import {
  fetchTransferPeople,
  removeTransferPerson,
  saveTransferPerson,
} from '@/features/transfers/people';
import type { TransferPersonRow } from '@/features/transfers/types';
import { useOverview } from '@/features/overview/useOverview';
import { buildBudgetStateByCategory } from '@/features/budgets/helpers';
import { supabase } from '@/lib/supabase';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CategoryIcon } from '@/ui/CategoryIcon';
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
  canDelete: boolean;
  saveMode: 'category' | 'override';
};

type TransferPersonDraft = {
  id?: string;
  name: string;
};

const toneForBudget = (tone: 'neutral' | 'warning' | 'critical' | null): string => {
  if (tone === 'critical') return colors.danger;
  if (tone === 'warning') return '#F5B942';
  return colors.textMuted;
};

function SwipeDeleteAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.swipeDeleteAction, pressed && styles.buttonPressed]} onPress={onPress}>
      <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.text} />
      <Text style={styles.swipeDeleteText}>{label}</Text>
    </Pressable>
  );
}

export default function CategoryManagementScreen() {
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [transferPeople, setTransferPeople] = useState<TransferPersonRow[]>([]);
  const [transferPeopleLoading, setTransferPeopleLoading] = useState(true);
  const [transferPersonDraft, setTransferPersonDraft] = useState<TransferPersonDraft | null>(null);
  const [transferPeopleSaving, setTransferPeopleSaving] = useState(false);
  const [transferPeopleError, setTransferPeopleError] = useState<string | null>(null);

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

  const transfersParentId = useMemo(
    () =>
      data.categories.find(
        (category) => category.level === 1 && category.name.trim().toLowerCase() === 'transfers',
      )?.id ?? null,
    [data.categories],
  );

  const loadTransferPeople = async (force = false): Promise<void> => {
    setTransferPeopleLoading(true);
    try {
      const rows = await fetchTransferPeople({ force });
      setTransferPeople(rows);
    } finally {
      setTransferPeopleLoading(false);
    }
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([data.reload(), loadTransferPeople(true)]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTransferPeople();
  }, []);

  const openCreateParent = (): void => {
    setDraft({
      mode: 'create-parent',
      parentId: null,
      name: '',
      icon: 'shape-outline',
      color: '#7C5CFF',
      level: 1,
      readOnly: false,
      canDelete: false,
      saveMode: 'category',
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
      canDelete: false,
      saveMode: 'category',
    });
  };

  const openEdit = (category: CategoryRow): void => {
    const isSystemSubcategory = category.is_system && category.level === 2;
    setDraft({
      mode: 'edit',
      categoryId: category.id,
      parentId: category.parent_id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      level: category.level,
      readOnly: category.is_system && category.level === 1,
      canDelete: !category.is_system,
      saveMode: isSystemSubcategory ? 'override' : 'category',
    });
  };

  const saveCategory = async (): Promise<void> => {
    if (!draft || draft.name.trim().length === 0 || !data.userId || draft.readOnly) return;

    setSaving(true);
    try {
      if (draft.mode === 'edit' && draft.categoryId) {
        if (draft.saveMode === 'override') {
          const { error } = await supabase.from('category_overrides').upsert(
            {
              user_id: data.userId,
              category_id: draft.categoryId,
              name: draft.name.trim(),
              icon: draft.icon,
            },
            { onConflict: 'user_id,category_id' },
          );
          if (error) {
            Alert.alert('Could not save category', error.message);
            return;
          }

          clearCategoryCache();
          await data.reload();
          setDraft(null);
          return;
        }

        const payload =
          draft.level === 1
            ? { name: draft.name.trim(), icon: draft.icon, color: draft.color }
            : { name: draft.name.trim(), icon: draft.icon };
        const { error } = await supabase.from('categories').update(payload).eq('id', draft.categoryId);
        if (error) {
          Alert.alert('Could not save category', error.message);
          return;
        }

        clearCategoryCache();
        await data.reload();
        setDraft(null);
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
      if (error) {
        Alert.alert('Could not create category', error.message);
        return;
      }

      clearCategoryCache();
      await data.reload();
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (): Promise<void> => {
    if (!draft?.categoryId || draft.readOnly || !draft.canDelete) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', draft.categoryId);
      if (error) {
        Alert.alert('Could not delete category', error.message);
        return;
      }

      clearCategoryCache();
      await data.reload();
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteCategoryById = async (category: CategoryRow): Promise<void> => {
    if (category.is_system) return;

    Alert.alert(`Delete ${category.name}?`, 'This removes the category from your list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              const { error } = await supabase.from('categories').delete().eq('id', category.id);
              if (error) {
                Alert.alert('Could not delete category', error.message);
                return;
              }

              clearCategoryCache();
              await data.reload();
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  };

  const saveTransferPersonDraft = async (): Promise<void> => {
    if (!transferPersonDraft) return;

    setTransferPeopleSaving(true);
    setTransferPeopleError(null);
    try {
      const result = await saveTransferPerson(transferPersonDraft);
      if (!result.ok) {
        setTransferPeopleError(result.error);
        Alert.alert('Could not save person', result.error ?? 'Unknown error');
        return;
      }

      await loadTransferPeople(true);
      setTransferPersonDraft(null);
    } finally {
      setTransferPeopleSaving(false);
    }
  };

  const deleteTransferPerson = async (): Promise<void> => {
    if (!transferPersonDraft?.id) return;

    setTransferPeopleSaving(true);
    setTransferPeopleError(null);
    try {
      const result = await removeTransferPerson(transferPersonDraft.id);
      if (!result.ok) {
        setTransferPeopleError(result.error);
        Alert.alert('Could not delete person', result.error ?? 'Unknown error');
        return;
      }

      await loadTransferPeople(true);
      setTransferPersonDraft(null);
    } finally {
      setTransferPeopleSaving(false);
    }
  };

  const deleteTransferPersonById = (person: TransferPersonRow): void => {
    Alert.alert(`Delete ${person.name}?`, 'This name will stop auto-defaulting to Transfers · MobilePay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setTransferPeopleSaving(true);
            setTransferPeopleError(null);
            try {
              const result = await removeTransferPerson(person.id);
              if (!result.ok) {
                setTransferPeopleError(result.error);
                Alert.alert('Could not delete person', result.error ?? 'Unknown error');
                return;
              }

              await loadTransferPeople(true);
            } finally {
              setTransferPeopleSaving(false);
            }
          })();
        },
      },
    ]);
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
                  <CategoryIcon name={parent.icon} size={22} color={parent.color} />
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
                  <Swipeable
                    key={child.id}
                    enabled={!child.is_system}
                    overshootRight={false}
                    renderRightActions={() =>
                      child.is_system ? null : (
                        <SwipeDeleteAction label="Delete" onPress={() => void deleteCategoryById(child)} />
                      )
                    }
                  >
                    <Pressable
                      style={({ pressed }) => [styles.childRow, pressed && styles.rowPressed]}
                      onPress={() => {
                        openEdit(child);
                      }}
                    >
                    <View style={[styles.childIconWrap, { backgroundColor: `${parent.color}22` }]}>
                      <CategoryIcon name={child.icon} size={18} color={parent.color} />
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
                  </Swipeable>
                ))}
              </View>

              {parent.id === transfersParentId ? (
                <View style={styles.transferPeopleCard}>
                  <View style={styles.transferPeopleHead}>
                    <View style={styles.transferPeopleCopy}>
                      <Text style={styles.transferPeopleTitle}>People</Text>
                      <Text style={styles.transferPeopleMeta}>
                        Auto-categorization defaults to Transfers · MobilePay only when the transaction name itself looks like this person's full name.
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.smallButton, pressed && styles.buttonPressed]}
                      onPress={() => {
                        setTransferPeopleError(null);
                        setTransferPersonDraft({ name: '' });
                      }}
                    >
                      <Text style={styles.smallButtonText}>Add person</Text>
                    </Pressable>
                  </View>

                  {transferPeopleLoading ? (
                    <Text style={styles.transferPeopleEmpty}>Loading...</Text>
                  ) : transferPeople.length === 0 ? (
                    <Text style={styles.transferPeopleEmpty}>No people added yet.</Text>
                  ) : (
                    <View style={styles.transferPeopleList}>
                      {transferPeople.map((person) => (
                        <Swipeable
                          key={person.id}
                          enabled={!transferPeopleSaving}
                          overshootRight={false}
                          renderRightActions={() => (
                            <SwipeDeleteAction label="Delete" onPress={() => deleteTransferPersonById(person)} />
                          )}
                        >
                          <Pressable
                            style={({ pressed }) => [styles.transferPersonRow, pressed && styles.rowPressed]}
                            onPress={() => {
                              setTransferPeopleError(null);
                              setTransferPersonDraft({ id: person.id, name: person.name });
                            }}
                          >
                            <Text style={styles.transferPersonName}>{person.name}</Text>
                            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textMuted} />
                          </Pressable>
                        </Swipeable>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
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
            onBack={() => setDraft(null)}
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
                    <CategoryIcon name={icon} size={20} color={active ? colors.text : colors.textMuted} />
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

            {!draft?.readOnly && draft?.mode === 'edit' && draft.canDelete ? (
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

      <Modal
        visible={transferPersonDraft !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTransferPersonDraft(null)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <ScreenHeader
            back
            onBack={() => setTransferPersonDraft(null)}
            title={transferPersonDraft?.id ? 'Edit Person' : 'Add Person'}
            subtitle="Transfers · MobilePay"
            actions={[
              {
                icon: 'check',
                onPress: () => {
                  void saveTransferPersonDraft();
                },
                disabled: transferPeopleSaving,
              },
            ]}
          />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={transferPersonDraft?.name ?? ''}
              onChangeText={(value) => {
                setTransferPeopleError(null);
                setTransferPersonDraft((current) => (current ? { ...current, name: value } : current));
              }}
              placeholder="Person name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.transferPeopleHint}>
              This only triggers when the transaction name itself looks like this person's full name.
            </Text>

            {transferPeopleError ? <Text style={styles.transferPeopleError}>{transferPeopleError}</Text> : null}

            {transferPersonDraft?.id ? (
              <Pressable
                style={({ pressed }) => [styles.destructiveButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  void deleteTransferPerson();
                }}
              >
                <Text style={styles.destructiveButtonText}>
                  {transferPeopleSaving ? 'Working...' : 'Delete person'}
                </Text>
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
  transferPeopleCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  transferPeopleHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  transferPeopleCopy: { flex: 1, gap: 4 },
  transferPeopleTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  transferPeopleMeta: { ...typography.label, color: colors.textMuted },
  transferPeopleList: { gap: spacing.sm },
  swipeDeleteAction: {
    minWidth: 96,
    height: '100%',
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.danger,
  },
  swipeDeleteText: { ...typography.label, color: colors.text, fontWeight: '700' },
  transferPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  transferPersonName: { ...typography.body, color: colors.text, fontWeight: '600' },
  transferPeopleEmpty: { ...typography.body, color: colors.textMuted },
  transferPeopleHint: { ...typography.body, color: colors.textMuted },
  transferPeopleError: { ...typography.label, color: colors.danger },
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

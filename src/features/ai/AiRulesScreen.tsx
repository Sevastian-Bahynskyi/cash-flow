import { useEffect, useMemo, useState } from 'react';
import {
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
import { FontAwesome6 } from '@expo/vector-icons';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { useOverview } from '@/features/overview/useOverview';
import { runDetached } from '@/lib/async';
import { supabase } from '@/lib/supabase';
import { formatDateLabel } from '@/lib/format';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SkeletonBlock, SkeletonCard } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import {
  deleteMerchantRule,
  fetchMerchantRules,
  upsertMerchantRule,
  type MerchantRuleRow,
} from '@/features/transactions/suggestions';

type RuleDraft = {
  id?: string;
  pattern: string;
  kind: 'expense' | 'income';
  category_id: string | null;
  is_blocked: boolean;
  is_shared_topup: boolean;
  notes: string;
};

function MerchantRulesSkeleton() {
  return (
    <>
      <SkeletonCard style={styles.skeletonHeroCard}>
        <SkeletonBlock width="42%" height={24} radius={radius.md} />
        <SkeletonBlock width="100%" height={14} radius={radius.sm} />
        <SkeletonBlock width="76%" height={14} radius={radius.sm} />
      </SkeletonCard>

      <View style={styles.section}>
        {[0, 1, 2, 3].map((item) => (
          <SkeletonCard key={item} padding={spacing.md}>
            <View style={styles.skeletonRuleHead}>
              <SkeletonBlock width="48%" height={16} />
              <SkeletonBlock width={72} height={12} radius={radius.sm} />
            </View>
            <SkeletonBlock width="58%" height={12} radius={radius.sm} />
          </SkeletonCard>
        ))}
      </View>
    </>
  );
}

export default function AiRulesScreen() {
  const overview = useOverview();
  const [rules, setRules] = useState<MerchantRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedRules, setHasLoadedRules] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  const categoryMeta = useMemo(() => buildCategoryMeta(overview.categories), [overview.categories]);

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rules;

    return rules.filter((rule) => {
      const categoryLabel = rule.category_id ? categoryMeta[rule.category_id]?.label ?? '' : '';
      const statusLabel = rule.is_blocked
        ? 'blocked'
        : rule.category_id
          ? 'mapped'
          : 'unmapped';
      const sharedLabel = rule.is_shared_topup ? 'shared top up' : '';
      return [rule.pattern, rule.kind, categoryLabel, statusLabel, sharedLabel, rule.source]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [categoryMeta, rules, searchQuery]);

  const loadRules = async (): Promise<void> => {
    setLoading(true);
    try {
      setRules(await fetchMerchantRules());
    } finally {
      setLoading(false);
      setHasLoadedRules(true);
    }
  };

  const isInitialLoading = overview.isInitialLoading || (loading && !hasLoadedRules);

  useEffect(() => {
    runDetached(loadRules(), 'merchantRules.load');
  }, []);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([overview.reload(), loadRules()]);
    } finally {
      setRefreshing(false);
    }
  };

  const saveDraft = async (): Promise<void> => {
    if (!draft) return;
    const normalizedPattern = draft.pattern.trim().toLowerCase();
    if (normalizedPattern.length < 2) return;
    if (!draft.is_blocked && !draft.category_id) return;

    setSavingDraft(true);
    try {
      if (draft.id) {
        const { error } = await supabase
          .from('merchant_category_rules')
          .update({
            kind: draft.kind,
            pattern: normalizedPattern,
            canonical_merchant: normalizedPattern,
            category_id: draft.is_blocked ? null : draft.category_id,
            is_blocked: draft.is_blocked,
            is_shared_topup: draft.kind === 'expense' ? draft.is_shared_topup : false,
            notes: draft.notes.trim().length === 0 ? null : draft.notes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', draft.id);
        if (error) return;
      } else {
        const ok = await upsertMerchantRule({
          kind: draft.kind,
          pattern: normalizedPattern,
          categoryId: draft.is_blocked ? null : draft.category_id,
          canonicalMerchant: normalizedPattern,
          isBlocked: draft.is_blocked,
          isSharedTopup: draft.kind === 'expense' ? draft.is_shared_topup : false,
          notes: draft.notes.trim().length === 0 ? null : draft.notes.trim(),
          priority: 300,
        });
        if (!ok) return;
      }

      await loadRules();
      setDraft(null);
    } finally {
      setSavingDraft(false);
    }
  };

  const removeRule = async (ruleId: string): Promise<void> => {
    const ok = await deleteMerchantRule(ruleId);
    if (ok) {
      await loadRules();
      setDraft(null);
    }
  };

  const openCreateRule = (): void => {
    setDraft({
      pattern: '',
      kind: 'expense',
      category_id: null,
      is_blocked: false,
      is_shared_topup: false,
      notes: '',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              runDetached(onRefresh(), 'merchantRules.refresh');
            }}
            tintColor={colors.text}
          />
        }
      >
        <ScreenHeader back title="Merchant Rules" subtitle="Manual overrides, blocks, and shared top-ups" />

        {isInitialLoading ? <MerchantRulesSkeleton /> : null}

        {!isInitialLoading ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Deterministic beats mysterious</Text>
              <Pressable
                style={({ pressed }) => [styles.newRuleButton, pressed && styles.rowPressed]}
                onPress={openCreateRule}
              >
                <FontAwesome6 name="plus" size={18} color={colors.bg} />
                <Text style={styles.newRuleButtonText}>Add rule</Text>
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <FontAwesome6 name="magnifying-glass" size={18} color={colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search merchant rules"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.searchInput}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={12}>
                  <FontAwesome6 name="circle-xmark" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.section}>
              {loading ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Loading...</Text>
                </View>
              ) : rules.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No merchant rules yet. They will appear here as you correct or block suggestions.</Text>
                </View>
              ) : filteredRules.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No merchant rules match this search.</Text>
                </View>
              ) : (
                filteredRules.map((rule) => (
                  <Pressable
                    key={rule.id}
                    style={({ pressed }) => [styles.ruleCard, pressed && styles.rowPressed]}
                    onPress={() =>
                      setDraft({
                        id: rule.id,
                        pattern: rule.pattern,
                        kind: rule.kind,
                        category_id: rule.category_id,
                        is_blocked: rule.is_blocked,
                        is_shared_topup: rule.is_shared_topup,
                        notes: rule.notes ?? '',
                      })
                    }
                  >
                    <View style={styles.ruleHead}>
                      <Text style={styles.rulePattern}>{rule.pattern}</Text>
                      <Text style={styles.ruleDate}>{formatDateLabel(rule.updated_at.slice(0, 10))}</Text>
                    </View>
                    <Text style={styles.ruleMeta}>
                      {rule.kind === 'income' ? 'Income' : 'Expense'}
                      {' · '}
                      {rule.is_blocked
                        ? 'Blocked'
                        : rule.category_id
                          ? categoryMeta[rule.category_id]?.label ?? 'Mapped category'
                          : 'No category'}
                    </Text>
                    {rule.is_shared_topup ? <Text style={styles.ruleHint}>Marks matching expenses as shared top-ups.</Text> : null}
                  </Pressable>
                ))
              )}
            </View>
          </>
        ) : null}
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
            title={draft?.id ? 'Edit Merchant Rule' : 'Create Merchant Rule'}
            subtitle={draft?.pattern || 'Set up deterministic categorization'}
            actions={[{ icon: 'check', onPress: () => runDetached(saveDraft(), 'merchantRules.saveDraft') }]}
          />
          <View style={styles.modalBody}>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Pattern</Text>
              <TextInput
                value={draft?.pattern ?? ''}
                onChangeText={(value) => setDraft((current) => (current ? { ...current, pattern: value } : current))}
                placeholder="merchant name, e.g. spotify"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.fieldInput}
              />
              <Text style={styles.fieldHint}>Exact lowercase match used for deterministic categorization.</Text>
            </View>

            <View style={styles.kindRow}>
              {(['expense', 'income'] as const).map((kind) => (
                <Pressable
                  key={kind}
                  style={({ pressed }) => [
                    styles.kindChip,
                    draft?.kind === kind ? styles.kindChipActive : null,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() =>
                    setDraft((current) =>
                      current
                        ? {
                          ...current,
                          kind,
                          is_shared_topup: kind === 'expense' ? current.is_shared_topup : false,
                        }
                        : current,
                    )
                  }
                >
                  <Text style={draft?.kind === kind ? styles.kindChipTextActive : styles.kindChipText}>
                    {kind === 'expense' ? 'Expense' : 'Income'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              onPress={() => setDraft((current) => (current ? { ...current, is_blocked: !current.is_blocked } : current))}
            >
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>Block suggestions</Text>
                <Text style={styles.actionMeta}>
                  When blocked, the merchant no longer auto-suggests a category.
                </Text>
              </View>
              <FontAwesome6
                name={draft?.is_blocked ? 'circle-check' : 'circle'}
                size={22}
                color={draft?.is_blocked ? colors.danger : colors.textMuted}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              onPress={() => setPickerOpen(true)}
              disabled={draft?.is_blocked}
            >
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>Mapped category</Text>
                <Text style={styles.actionMeta}>
                  {draft?.category_id ? categoryMeta[draft.category_id]?.label ?? 'Unknown category' : 'Choose a category'}
                </Text>
              </View>
              <FontAwesome6 name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>

            {draft?.kind === 'expense' ? (
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
                onPress={() =>
                  setDraft((current) =>
                    current ? { ...current, is_shared_topup: !current.is_shared_topup } : current,
                  )
                }
              >
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>Mark as shared top-up</Text>
                  <Text style={styles.actionMeta}>
                    Matching expenses will default to the shared top-up flow.
                  </Text>
                </View>
                <FontAwesome6
                  name={draft?.is_shared_topup ? 'circle-check' : 'circle'}
                  size={22}
                  color={draft?.is_shared_topup ? colors.accent : colors.textMuted}
                />
              </Pressable>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                value={draft?.notes ?? ''}
                onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
                placeholder="Optional notes"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={styles.fieldInputMultiline}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || savingDraft) && styles.rowPressed,
                (savingDraft || (draft?.pattern.trim().length ?? 0) < 2 || (!draft?.is_blocked && !draft?.category_id))
                  ? styles.primaryButtonDisabled
                  : null,
              ]}
              onPress={() => runDetached(saveDraft(), 'merchantRules.saveButton')}
              disabled={savingDraft || (draft?.pattern.trim().length ?? 0) < 2 || (!draft?.is_blocked && !draft?.category_id)}
            >
              <Text style={styles.primaryButtonText}>{savingDraft ? 'Saving...' : draft?.id ? 'Save Changes' : 'Create Rule'}</Text>
            </Pressable>

            {draft?.id ? (
              <Pressable
                style={({ pressed }) => [styles.destructiveButton, pressed && styles.rowPressed]}
                onPress={() => {
                  if (!draft.id) return;
                  runDetached(removeRule(draft.id), 'merchantRules.deleteRule');
                }}
              >
                <Text style={styles.destructiveButtonText}>Delete rule</Text>
              </Pressable>
            ) : null}
          </View>

          <CategorySheet
            visible={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(option) => {
              setDraft((current) => (current ? { ...current, category_id: option.id, is_blocked: false } : current));
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTitle: { ...typography.h2, color: colors.text },
  newRuleButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newRuleButtonText: { ...typography.label, color: colors.bg, fontWeight: '700' },
  searchWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: 0,
  },
  section: { gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  ruleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rulePattern: { ...typography.body, color: colors.text, fontWeight: '700', flex: 1 },
  ruleDate: { ...typography.label, color: colors.textMuted },
  ruleMeta: { ...typography.label, color: colors.textMuted },
  ruleHint: { ...typography.label, color: colors.accent },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  fieldBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldInputMultiline: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 96,
  },
  fieldHint: { ...typography.label, color: colors.textMuted },
  kindRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kindChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  kindChipText: { ...typography.label, color: colors.text },
  kindChipTextActive: { ...typography.label, color: colors.bg, fontWeight: '700' },
  primaryButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: { ...typography.body, color: colors.bg, fontWeight: '700' },
  actionRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actionCopy: { flex: 1, gap: spacing.xs },
  actionTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  actionMeta: { ...typography.body, color: colors.textMuted },
  destructiveButton: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: `${colors.danger}12`,
  },
  destructiveButtonText: { ...typography.body, color: colors.danger, fontWeight: '700' },
  rowPressed: { opacity: 0.86 },
  skeletonHeroCard: { gap: spacing.sm },
  skeletonRuleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});

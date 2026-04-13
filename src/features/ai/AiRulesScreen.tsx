import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  type MerchantRuleRow,
} from '@/features/transactions/suggestions';

type RuleDraft = {
  id: string;
  pattern: string;
  kind: 'expense' | 'income';
  category_id: string | null;
  is_blocked: boolean;
  is_shared_topup: boolean;
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

  const categoryMeta = useMemo(() => buildCategoryMeta(overview.categories), [overview.categories]);

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
    const { error } = await supabase
      .from('merchant_category_rules')
      .update({
        category_id: draft.is_blocked ? null : draft.category_id,
        is_blocked: draft.is_blocked,
        is_shared_topup: draft.is_shared_topup,
      })
      .eq('id', draft.id);
    if (!error) {
      await loadRules();
      setDraft(null);
    }
  };

  const removeRule = async (ruleId: string): Promise<void> => {
    const ok = await deleteMerchantRule(ruleId);
    if (ok) {
      await loadRules();
      setDraft(null);
    }
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
              <Text style={styles.heroBody}>
                Each rule matches a normalized merchant and decides whether we categorize it, block it, or mark it as a shared top-up. These rules are checked before fuzzy memory and before the fallback AI.
              </Text>
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
              ) : (
                rules.map((rule) => (
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
            title="Edit Merchant Rule"
            subtitle={draft?.pattern}
            actions={[{ icon: 'check', onPress: () => runDetached(saveDraft(), 'merchantRules.saveDraft') }]}
          />
          <View style={styles.modalBody}>
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
              <MaterialCommunityIcons
                name={draft?.is_blocked ? 'check-circle' : 'checkbox-blank-circle-outline'}
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
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
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
                <MaterialCommunityIcons
                  name={draft?.is_shared_topup ? 'check-circle' : 'checkbox-blank-circle-outline'}
                  size={22}
                  color={draft?.is_shared_topup ? colors.accent : colors.textMuted}
                />
              </Pressable>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.destructiveButton, pressed && styles.rowPressed]}
              onPress={() => {
                if (!draft) return;
                runDetached(removeRule(draft.id), 'merchantRules.deleteRule');
              }}
            >
              <Text style={styles.destructiveButtonText}>Delete rule</Text>
            </Pressable>
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
    gap: spacing.sm,
  },
  heroTitle: { ...typography.h2, color: colors.text },
  heroBody: { ...typography.body, color: colors.textMuted },
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

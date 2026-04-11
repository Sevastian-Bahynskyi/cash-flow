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

type AiRuleRow = {
  id: string;
  user_id: string;
  pattern_key: string;
  category_id: string | null;
  is_blocked: boolean;
  updated_at: string;
};

type RuleDraft = {
  id: string;
  pattern_key: string;
  category_id: string | null;
  is_blocked: boolean;
};

function AiRulesSkeleton() {
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
  const [rules, setRules] = useState<AiRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedRules, setHasLoadedRules] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const categoryMeta = useMemo(() => buildCategoryMeta(overview.categories), [overview.categories]);

  const loadRules = async (): Promise<void> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_category_rules')
        .select('id, user_id, pattern_key, category_id, is_blocked, updated_at')
        .order('updated_at', { ascending: false });
      if (!error) {
        setRules((data ?? []) as AiRuleRow[]);
      }
    } finally {
      setLoading(false);
      setHasLoadedRules(true);
    }
  };

  const isInitialLoading = overview.isInitialLoading || (loading && !hasLoadedRules);

  useEffect(() => {
    runDetached(loadRules(), 'aiRules.load');
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
      .from('ai_category_rules')
      .update({
        category_id: draft.is_blocked ? null : draft.category_id,
        is_blocked: draft.is_blocked,
      })
      .eq('id', draft.id);
    if (!error) {
      await loadRules();
      setDraft(null);
    }
  };

  const deleteRule = async (ruleId: string): Promise<void> => {
    const { error } = await supabase.from('ai_category_rules').delete().eq('id', ruleId);
    if (!error) {
      await loadRules();
      setDraft(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
      >
        <ScreenHeader back title="Smart Assist" subtitle="Correction memory and blocked suggestions" />

        {isInitialLoading ? <AiRulesSkeleton /> : null}

        {!isInitialLoading ? (
          <>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Learning stays simple</Text>
          <Text style={styles.heroBody}>
            Every rule is just a normalized merchant pattern. You can map it to a category or block suggestions entirely, and nothing here ever blocks saving a transaction.
          </Text>
        </View>

        <View style={styles.section}>
          {loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : rules.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No saved correction memory yet. It will appear here once you override or block a suggestion.</Text>
            </View>
          ) : (
            rules.map((rule) => (
              <Pressable
                key={rule.id}
                style={({ pressed }) => [styles.ruleCard, pressed && styles.rowPressed]}
                onPress={() =>
                  setDraft({
                    id: rule.id,
                    pattern_key: rule.pattern_key,
                    category_id: rule.category_id,
                    is_blocked: rule.is_blocked,
                  })
                }
              >
                <View style={styles.ruleHead}>
                  <Text style={styles.rulePattern}>{rule.pattern_key}</Text>
                  <Text style={styles.ruleDate}>
                    {formatDateLabel(rule.updated_at.slice(0, 10))}
                  </Text>
                </View>
                <Text style={styles.ruleMeta}>
                  {rule.is_blocked
                    ? 'Suggestions blocked'
                    : rule.category_id
                      ? `Mapped to ${categoryMeta[rule.category_id]?.label ?? 'category'}`
                      : 'No mapped category'}
                </Text>
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
            title="Edit Rule"
            subtitle={draft?.pattern_key}
            actions={[{ icon: 'check', onPress: () => runDetached(saveDraft(), 'aiRules.saveDraft') }]}
          />
          <View style={styles.modalBody}>
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              onPress={() => setDraft((current) => (current ? { ...current, is_blocked: !current.is_blocked } : current))}
            >
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>Block suggestions</Text>
                <Text style={styles.actionMeta}>
                  When blocked, the app stops auto-suggesting for this merchant pattern.
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

            <Pressable
              style={({ pressed }) => [styles.destructiveButton, pressed && styles.rowPressed]}
              onPress={() => {
                if (!draft) return;
                runDetached(deleteRule(draft.id), 'aiRules.deleteRule');
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
  content: { paddingBottom: spacing.xxl * 3, gap: spacing.lg },
  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  skeletonHeroCard: { marginHorizontal: spacing.lg },
  heroTitle: { ...typography.h2, color: colors.text },
  heroBody: { ...typography.body, color: colors.textMuted },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  skeletonRuleHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'space-between' },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  ruleCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  rowPressed: { opacity: 0.86 },
  ruleHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  rulePattern: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  ruleDate: { ...typography.label, color: colors.textMuted },
  ruleMeta: { ...typography.label, color: colors.textMuted },
  modalSafeArea: { flex: 1, backgroundColor: colors.bg },
  modalBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  actionRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionCopy: { flex: 1, gap: spacing.xs },
  actionTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  actionMeta: { ...typography.label, color: colors.textMuted },
  destructiveButton: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  destructiveButtonText: { ...typography.body, color: colors.danger, fontWeight: '600' },
});

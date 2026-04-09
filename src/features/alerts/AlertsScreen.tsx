import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOverview } from '@/features/overview/useOverview';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { formatMinor } from '@/lib/format';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';

export default function AlertsScreen() {
  const data = useOverview();
  const [refreshing, setRefreshing] = useState(false);
  const categoryMeta = useMemo(() => buildCategoryMeta(data.categories), [data.categories]);

  const hints = [
    data.transactions.length === 0 ? 'Log your first transaction so alerts can become behavioral instead of empty.' : null,
    data.shared.userTopupTotal === 0 ? 'Your first shared top-up unlocks the fairness view and ratio explanation.' : null,
    data.budgets.length === 0 ? 'Set one budget to start getting calm warning states before overspending sneaks up.' : null,
  ].filter((value): value is string => value !== null);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await data.reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.text} />}
      >
        <ScreenHeader back title="Alerts" subtitle="Warnings, reminders, and weekly context" />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Heads-up only</Text>
          <Text style={styles.heroBody}>
            This screen stays focused on live budget pressure and useful nudges inside the app.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget alerts</Text>
          {data.budgetAlerts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nothing urgent right now. Budgets stay visible here once a category crosses 80%.</Text>
            </View>
          ) : (
            data.budgetAlerts.map((alert) => {
              const tone = alert.level === 'critical' ? colors.danger : '#F5B942';
              return (
                <View key={alert.categoryId} style={[styles.alertCard, { borderColor: `${tone}66` }]}>
                  <View style={styles.alertHead}>
                    <MaterialCommunityIcons
                      name={alert.level === 'critical' ? 'alert-circle' : 'alert-outline'}
                      size={18}
                      color={tone}
                    />
                    <Text style={styles.alertTitle}>
                      {categoryMeta[alert.categoryId]?.label ?? alert.label}
                    </Text>
                  </View>
                  <Text style={styles.alertMeta}>
                    {formatMinor(alert.spentMinor)} of {formatMinor(alert.amountMinor)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Helpful nudges</Text>
          {hints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Your setup is in a good place. This screen will stay quiet unless it has something useful to say.</Text>
            </View>
          ) : (
            hints.map((hint) => (
              <View key={hint} style={styles.hintCard}>
                <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.accent} />
                <Text style={styles.hintText}>{hint}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    gap: spacing.md,
  },
  heroTitle: { ...typography.h2, color: colors.text },
  heroBody: { ...typography.body, color: colors.textMuted },
  buttonPressed: { opacity: 0.86 },
  section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  alertCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    gap: spacing.xs,
  },
  alertHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  alertTitle: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  alertMeta: { ...typography.label, color: colors.textMuted },
  hintCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  hintText: { ...typography.body, color: colors.text, flex: 1 },
});

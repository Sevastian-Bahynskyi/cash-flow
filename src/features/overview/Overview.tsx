import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useOverview } from './useOverview';

const formatMinor = (minor: number): string => {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
};

type Props = {
  refreshKey: number;
};

export default function Overview({ refreshKey }: Props) {
  const data = useOverview();
  const router = useRouter();

  useEffect(() => {
    if (refreshKey > 0) void data.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Personal balance</Text>
        <Text style={styles.big}>{data.loading ? '—' : formatMinor(data.personalMinor)}</Text>
        <Text style={styles.meta}>
          cycle spend {formatMinor(data.cycleSpendMinor)}
          {data.activeCycle ? ` · ${data.activeCycle.label}` : ''}
        </Text>
      </View>

      {data.budgetAlerts.length > 0 && (
        <View style={styles.alerts}>
          {data.budgetAlerts.map((a) => (
            <View
              key={a.categoryId}
              style={[
                styles.alert,
                a.level === 'critical' ? styles.alertCritical : styles.alertWarning,
              ]}
            >
              <Text style={styles.alertTitle}>
                {a.level === 'critical' ? 'Over budget' : 'Budget warning'} · {a.label}
              </Text>
              <Text style={styles.alertMeta}>
                {formatMinor(a.spentMinor)} / {formatMinor(a.amountMinor)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={() => router.push('/shared')} style={styles.card}>
        <Text style={styles.label}>
          Shared cycle {data.activeCycle ? `· ${data.activeCycle.label}` : '· none'}
        </Text>
        <Text style={styles.big}>{data.loading ? '—' : formatMinor(data.shared.sharedBalance)}</Text>
        <Text style={styles.meta}>
          spend {formatMinor(data.shared.sharedExpenseTotal)} · your share{' '}
          {formatMinor(data.shared.userEffectiveShare)} · ratio{' '}
          {(data.shared.userShareRatio * 100).toFixed(0)}%
        </Text>
      </Pressable>

      {data.topCategories.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>Top categories this cycle</Text>
          <View style={styles.catList}>
            {data.topCategories.map((c) => (
              <View key={c.categoryId} style={styles.catRow}>
                <Text style={styles.catLabel} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text style={styles.catAmount}>{formatMinor(c.spentMinor)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.row}>
        <View style={[styles.card, styles.half]}>
          <Text style={styles.label}>Savings</Text>
          <Text style={styles.med}>{data.loading ? '—' : formatMinor(data.savingsMinor)}</Text>
        </View>
        <View style={[styles.card, styles.half]}>
          <Text style={styles.label}>Open loans</Text>
          <Text style={styles.med}>{data.loading ? '—' : String(data.openLoans.length)}</Text>
        </View>
      </View>

      {data.error && <Text style={styles.error}>{data.error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  big: { ...typography.h1, color: colors.text, marginTop: spacing.xs },
  med: { ...typography.h2, color: colors.text, marginTop: spacing.xs },
  meta: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
  error: { ...typography.label, color: colors.danger },
  alerts: { gap: spacing.sm },
  alert: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  alertWarning: {
    backgroundColor: 'rgba(255,184,0,0.08)',
    borderColor: 'rgba(255,184,0,0.3)',
  },
  alertCritical: {
    backgroundColor: 'rgba(255,92,122,0.1)',
    borderColor: 'rgba(255,92,122,0.4)',
  },
  alertTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  alertMeta: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  catList: { marginTop: spacing.sm, gap: spacing.sm },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catLabel: { ...typography.body, color: colors.text, flex: 1, marginRight: spacing.md },
  catAmount: { ...typography.body, color: colors.text, fontVariant: ['tabular-nums'] },
});

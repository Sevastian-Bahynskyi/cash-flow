import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useOverview } from '@/features/overview/useOverview';

const formatMinor = (minor: number): string => {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
};

export default function SharedScreen() {
  const data = useOverview();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Shared</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.label}>
            Active cycle {data.activeCycle ? `· ${data.activeCycle.label}` : '· none'}
          </Text>
          <Text style={styles.big}>{formatMinor(data.shared.sharedBalance)}</Text>
          <Text style={styles.meta}>shared balance</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Raw shared spend</Text>
          <Text style={styles.big}>{formatMinor(data.shared.sharedExpenseTotal)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Your top-ups</Text>
          <Text style={styles.big}>{formatMinor(data.shared.userTopupTotal)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Partner contribution (inferred)</Text>
          <Text style={styles.big}>{formatMinor(data.shared.partnerInferred)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Your share ratio</Text>
          <Text style={styles.big}>{(data.shared.userShareRatio * 100).toFixed(0)}%</Text>
          <Text style={styles.meta}>
            effective share {formatMinor(data.shared.userEffectiveShare)}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: { ...typography.body, color: colors.accent },
  title: { ...typography.h2, color: colors.text },
  scroll: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  big: { ...typography.h1, color: colors.text, marginTop: spacing.xs },
  meta: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
});

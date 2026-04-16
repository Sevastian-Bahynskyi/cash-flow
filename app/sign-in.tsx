import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;

  const onPress = async (): Promise<void> => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  if (isDesktop) {
    return (
      <SafeAreaView style={styles.desktopContainer} edges={['top', 'bottom']}>
        <View style={styles.desktopShell}>
          <View style={styles.desktopIntro}>
            <Text style={styles.kicker}>Behavioral budgeting</Text>
            <Text style={styles.desktopTitle}>Cash Flow</Text>
            <Text style={styles.desktopSubtitle}>
              A cleaner desktop surface for the same fast transaction flow. Wider charts, calmer spacing, fewer taps.
            </Text>

            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Text style={styles.featureLabel}>Flow first</Text>
                <Text style={styles.featureValue}>Amount, category, name, save.</Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureLabel}>Shared aware</Text>
                <Text style={styles.featureValue}>Top-ups and shared spend stay visible.</Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureLabel}>Desktop ready</Text>
                <Text style={styles.featureValue}>More context, less cramped UI.</Text>
              </View>
            </View>
          </View>

          <View style={styles.desktopCard}>
            <View style={styles.brand}>
              <Text style={styles.title}>Cash Flow</Text>
              <Text style={styles.subtitle}>Fast behavioral budgeting</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={onPress}
                disabled={busy}
                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
              >
                {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>Continue with Google</Text>}
              </Pressable>
              <Text style={styles.hint}>OAuth only · no passwords</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.brand}>
        <Text style={styles.title}>Cash Flow</Text>
        <Text style={styles.subtitle}>Fast behavioral budgeting</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onPress}
          disabled={busy}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.btnText}>Continue with Google</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>OAuth only · no passwords</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between', paddingVertical: spacing.xxl },
  desktopContainer: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl },
  desktopShell: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', gap: spacing.xl, alignItems: 'stretch' },
  desktopIntro: { flex: 1.15, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  desktopCard: {
    flex: 0.85,
    backgroundColor: 'rgba(22,22,29,0.92)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: spacing.xl,
    justifyContent: 'space-between',
    minHeight: 520,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  kicker: { ...typography.label, color: colors.accentAlt, textTransform: 'uppercase', letterSpacing: 2 },
  desktopTitle: { ...typography.h1, color: colors.text, fontSize: 72, lineHeight: 74 },
  desktopSubtitle: { ...typography.body, color: colors.textMuted, maxWidth: 560, fontSize: 18, lineHeight: 26 },
  featureGrid: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', maxWidth: 640 },
  featureCard: { flexGrow: 1, flexBasis: 180, backgroundColor: 'rgba(31,31,41,0.92)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: spacing.lg, gap: spacing.xs },
  featureLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  featureValue: { ...typography.body, color: colors.text, lineHeight: 22 },
  brand: { paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
  title: { ...typography.h1, color: colors.text, fontSize: 44 },
  subtitle: { ...typography.body, color: colors.textMuted },
  actions: { paddingHorizontal: spacing.xl, gap: spacing.md, alignItems: 'center' },
  btn: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.6 },
  btnText: { ...typography.body, color: colors.text, fontWeight: '600' },
  hint: { ...typography.label, color: colors.textMuted },
});

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

export default function SignInScreen() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onPress = async (): Promise<void> => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

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

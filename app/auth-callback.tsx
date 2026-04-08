import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

export default function AuthCallbackScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = typeof params.next === 'string' ? params.next : '/';

  useEffect(() => {
    if (!session) return;
    router.replace(next as '/' | '/sign-in' | '/shared' | `/oauth/consent?authorization_id=${string}`);
  }, [session, router, next]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.text}>Finishing sign in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.textMuted,
  },
});

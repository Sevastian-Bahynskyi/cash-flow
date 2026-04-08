import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

type AuthorizationDetails = {
  authorization_id: string;
  client: {
    name?: string | null;
    client_name?: string | null;
    redirect_uri?: string | null;
  };
  scope?: string | null;
};

type AuthorizationRedirect = {
  redirect_to?: string | null;
  redirect_url?: string | null;
};

const isAuthorizationDetails = (value: unknown): value is AuthorizationDetails => {
  if (typeof value !== 'object' || value === null) return false;
  return 'authorization_id' in value;
};

const getRedirectUrl = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  if ('redirect_to' in value && typeof value.redirect_to === 'string') return value.redirect_to;
  if ('redirect_url' in value && typeof value.redirect_url === 'string') return value.redirect_url;
  return null;
};

export default function OAuthConsentScreen() {
  const { session, loading, signInWithGoogle } = useAuth();
  const params = useLocalSearchParams<{ authorization_id?: string | string[] }>();
  const authorizationId =
    typeof params.authorization_id === 'string' ? params.authorization_id : null;
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    if (!authorizationId) return '/oauth/consent';
    return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  }, [authorizationId]);

  const loadAuthorization = useCallback(async (): Promise<void> => {
    if (!authorizationId || !session) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (isAuthorizationDetails(data)) {
        setDetails(data);
        return;
      }
      const redirectUrl = getRedirectUrl(data);
      if (redirectUrl) {
        await Linking.openURL(redirectUrl);
        return;
      }
      setError('Could not load authorization details.');
    } finally {
      setBusy(false);
    }
  }, [authorizationId, session]);

  useEffect(() => {
    if (!loading && session) {
      void loadAuthorization();
    }
  }, [loading, session, loadAuthorization]);

  const handleDecision = useCallback(
    async (decision: 'approve' | 'deny'): Promise<void> => {
      if (!authorizationId) return;
      setBusy(true);
      setError(null);
      try {
        const result =
          decision === 'approve'
            ? await supabase.auth.oauth.approveAuthorization(authorizationId)
            : await supabase.auth.oauth.denyAuthorization(authorizationId);
        if (result.error) {
          setError(result.error.message);
          return;
        }
        const redirectUrl = getRedirectUrl(result.data as AuthorizationRedirect);
        if (!redirectUrl) {
          setError('Authorization completed but no redirect URL was returned.');
          return;
        }
        await Linking.openURL(redirectUrl);
      } finally {
        setBusy(false);
      }
    },
    [authorizationId],
  );

  if (!authorizationId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>OAuth consent</Text>
        <Text style={styles.muted}>Missing authorization_id.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.muted}>Loading session…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sign in to continue</Text>
        <Text style={styles.muted}>This app needs your permission before continuing the OAuth flow.</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => {
            void signInWithGoogle(nextPath);
          }}
        >
          <Text style={styles.primaryText}>Continue with Google</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>OAuth Consent</Text>
      <Text style={styles.title}>{details?.client.name ?? details?.client.client_name ?? 'Third-party app'}</Text>
      <Text style={styles.muted}>
        Review the requested access and choose whether to continue.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Requested permissions</Text>
        {details?.scope?.trim() ? (
          details.scope.split(' ').map((scopeItem) => (
            <Text key={scopeItem} style={styles.scopeItem}>
              {scopeItem}
            </Text>
          ))
        ) : (
          <Text style={styles.scopeItem}>No scopes requested.</Text>
        )}
      </View>

      {details?.client.redirect_uri ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Redirect URI</Text>
          <Text style={styles.redirectUri}>{details.client.redirect_uri}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!details && busy ? (
        <View style={styles.centerInline}>
          <ActivityIndicator color={colors.text} />
          <Text style={styles.muted}>Loading authorization details…</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, busy && styles.disabled]}
          disabled={busy}
          onPress={() => {
            void handleDecision('deny');
          }}
        >
          <Text style={styles.secondaryText}>Deny</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}
          disabled={busy || !details}
          onPress={() => {
            void handleDecision('approve');
          }}
        >
          <Text style={styles.primaryText}>Approve</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  centerInline: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  eyebrow: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  scopeItem: { ...typography.body, color: colors.text },
  redirectUri: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryText: { ...typography.body, color: colors.text, fontWeight: '600' },
  secondaryText: { ...typography.body, color: colors.textMuted, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});

import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { colors, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { reportDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = typeof params.next === 'string' ? params.next : '/';
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (session) return;
    let active = true;

    const completeCallback = async (): Promise<void> => {
      const callbackUrl =
        typeof window !== 'undefined' ? window.location.href : await Linking.getInitialURL();
      if (!callbackUrl) {
        if (active) setErrorText('Sign-in callback URL is missing. Please try again.');
        return;
      }

      const hasCode = /[?&]code=/.test(callbackUrl);
      const hasTokenFragment = /(access_token|refresh_token)=/.test(callbackUrl);

      if (hasCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(callbackUrl);
        if (error) {
          reportDevError('auth.exchangeCodeForSession', error);
          if (active) setErrorText(error.message);
        }
        return;
      }

      if (!hasTokenFragment) {
        if (active) {
          setErrorText('OAuth callback did not contain an auth code or session tokens.');
        }
        return;
      }

      const url = new URL(callbackUrl);
      const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
      const queryParams = new URLSearchParams(url.search);
      const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');

      if (!accessToken || !refreshToken) {
        if (active) {
          setErrorText('OAuth callback tokens are incomplete. Please try signing in again.');
        }
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        reportDevError('auth.setSession', error);
        if (active) setErrorText(error.message);
      }
    };

    void completeCallback();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    router.replace(next as '/' | '/sign-in' | '/shared' | `/oauth/consent?authorization_id=${string}`);
  }, [session, router, next]);

  return (
    <View style={styles.container}>
      {errorText ? null : <ActivityIndicator color={colors.text} />}
      <Text style={styles.text}>{errorText ?? 'Finishing sign in…'}</Text>
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

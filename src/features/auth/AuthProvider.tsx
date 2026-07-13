import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase, supabaseAuthUrl, supabaseUrl } from '@/lib/supabase';
import { runDetached } from '@/lib/async';
import { reportDevError } from '@/lib/errors';
import type { Session } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: (nextPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const extractTokens = (url: string): { access_token: string; refresh_token: string } | null => {
  // Supabase can return tokens either in the hash fragment or query params.
  const afterHash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const afterQ = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(afterHash || afterQ);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
};

const extractCode = (url: string): string | null => new URL(url).searchParams.get('code');

const buildGoogleOAuthUrl = (redirectTo: string, skipHttpRedirect: boolean): string => {
  const authUrl = new URL('/auth/v1/authorize', `${supabaseAuthUrl}/`);
  authUrl.searchParams.set('provider', 'google');
  authUrl.searchParams.set('redirect_to', redirectTo);
  if (skipHttpRedirect) {
    authUrl.searchParams.set('skip_http_redirect', 'true');
  }
  return authUrl.toString();
};

const buildRedirectTo = (nextPath?: string): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const redirectUrl = new URL('/auth-callback', window.location.origin);
    if (nextPath) {
      redirectUrl.searchParams.set('next', nextPath);
    }
    return redirectUrl.toString();
  }
  return Linking.createURL('auth-callback', {
    queryParams: nextPath ? { next: nextPath } : undefined,
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    runDetached(
      (async () => {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          reportDevError('auth.getSession', error);
        }
        setSession(data.session);
        setLoading(false);
      })(),
      'auth.getSession',
      () => {
        if (mounted) {
          setLoading(false);
        }
      },
    );

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (nextPath?: string): Promise<void> => {
    const redirectTo = buildRedirectTo(nextPath);

    if (Platform.OS === 'web') {
      if (supabaseAuthUrl && supabaseAuthUrl !== supabaseUrl) {
        window.location.assign(buildGoogleOAuthUrl(redirectTo, false));
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        reportDevError('auth.signInWithGoogle', error);
      }
      return;
    }

    let authUrl: string | null = null;

    if (supabaseAuthUrl && supabaseAuthUrl !== supabaseUrl) {
      authUrl = buildGoogleOAuthUrl(redirectTo, true);
    } else {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        reportDevError('auth.signInWithGoogle', error ?? new Error('Supabase did not return an OAuth URL.'));
        return;
      }
      authUrl = data.url;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    if (result.type !== 'success' || !result.url) return;

    const tokens = extractTokens(result.url);
    if (tokens) {
      const { error } = await supabase.auth.setSession(tokens);
      if (error) {
        reportDevError('auth.setSession', error);
      }
      return;
    }

    const code = extractCode(result.url);
    if (!code) {
      reportDevError('auth.signInWithGoogle', new Error('OAuth callback did not include a session.'));
      return;
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      reportDevError('auth.exchangeCodeForSession', error);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      reportDevError('auth.signOut', error);
    }
  }, []);

  return (
    <Ctx.Provider value={{ session, loading, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = (): AuthState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

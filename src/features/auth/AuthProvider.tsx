import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase, supabaseAuthUrl, supabaseUrl } from '@/lib/supabase';
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

const buildGoogleOAuthUrl = (redirectTo: string): string => {
  const authUrl = new URL('/auth/v1/authorize', `${supabaseAuthUrl}/`);
  authUrl.searchParams.set('provider', 'google');
  authUrl.searchParams.set('redirect_to', redirectTo);
  authUrl.searchParams.set('skip_http_redirect', 'true');
  return authUrl.toString();
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (nextPath?: string): Promise<void> => {
    const redirectTo = Linking.createURL('auth-callback', {
      queryParams: nextPath ? { next: nextPath } : undefined,
    });
    let authUrl: string | null = null;

    if (supabaseAuthUrl && supabaseAuthUrl !== supabaseUrl) {
      authUrl = buildGoogleOAuthUrl(redirectTo);
    } else {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) return;
      authUrl = data.url;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
    if (result.type !== 'success' || !result.url) return;

    const tokens = extractTokens(result.url);
    if (!tokens) return;
    await supabase.auth.setSession(tokens);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
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

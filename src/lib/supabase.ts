import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { qaScenario } from '@/dev/scenario';

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const normalizeUrl = (value: unknown): string | undefined => text(value)?.replace(/\/+$/, '');

const fixture = Boolean(qaScenario());
const url = fixture ? 'http://127.0.0.1:1' : normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const publishableKey = fixture ? 'cashflow-read-only-fixture' :
  (text(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY) ?? text(process.env.EXPO_PUBLIC_SUPABASE_KEY));
export const supabaseUrl = url;
export const supabaseAuthUrl = fixture ? url : normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_AUTH_URL) ?? url;

if (!url || !publishableKey) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local, .env.dev, or .env.prod.',
  );
}

export const supabase = createClient(url, publishableKey, {
  global: fixture ? { fetch: () => Promise.reject(new Error('These are offline examples.')) } : undefined,
  auth: {
    storage: AsyncStorage,
    persistSession: !fixture,
    autoRefreshToken: !fixture,
    detectSessionInUrl: false,
  },
});

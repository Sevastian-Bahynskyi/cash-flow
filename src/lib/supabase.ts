import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const normalizeUrl = (value: string | undefined): string | undefined => value?.replace(/\/+$/, '');

const url = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_KEY;
export const supabaseUrl = url;
export const supabaseAuthUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_AUTH_URL) ?? url;

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY in .env.local, .env.dev, or .env.prod.',
  );
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

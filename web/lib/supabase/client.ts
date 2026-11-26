import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from './config'

let client: SupabaseClient | null = null

/** One browser client for the whole app; RLS scopes every query to the signed-in user. */
export function supabase(): SupabaseClient {
  client ??= createBrowserClient(supabaseUrl, supabasePublishableKey)
  return client
}

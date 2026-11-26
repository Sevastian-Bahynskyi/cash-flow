import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Finishes Google sign-in: trades the code for a session cookie, then returns where the person was going. */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const raw = searchParams.get('next') ?? '/'
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  if (!code) return NextResponse.redirect(`${origin}/sign-in?error=missing`)
  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/sign-in?error=exchange`)
  return NextResponse.redirect(`${origin}${next}`)
}

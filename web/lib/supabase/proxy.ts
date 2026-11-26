import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabasePublishableKey, supabaseUrl } from './config'

const PUBLIC = ['/sign-in', '/auth/callback', '/manifest.webmanifest', '/sw.js', '/oauth/consent']

/** Refreshes the session cookie on every navigation and sends signed-out visitors to sign in. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data } = await supabase.auth.getClaims()
  const path = request.nextUrl.pathname
  if (!data?.claims && !PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  return response
}

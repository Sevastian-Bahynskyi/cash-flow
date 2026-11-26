'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { Icon } from '@/components/Icon'
import { supabase } from '@/lib/supabase/client'

// What each OAuth scope lets the other app do, in plain words; unknown scopes show as sent.
const SCOPES: Record<string, [string, string]> = {
  openid: ['profile', 'Know it’s you'],
  email: ['mail', 'See your email address'],
  profile: ['profile', 'See your name and picture'],
}

function Consent(): React.JSX.Element {
  const id = useSearchParams().get('authorization_id')
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null)
  const [error, setError] = useState<string | null>(id ? null : 'This link is missing a part. Go back to the app that sent you and try again.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    void (async () => {
      const { data: s } = await supabase().auth.getSession()
      if (!s.session) { window.location.assign(`/sign-in?next=${encodeURIComponent(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`)}`); return }
      const { data, error: e } = await supabase().auth.oauth.getAuthorizationDetails(id)
      if (!alive) return
      if (e || !data) { setError(navigator.onLine ? 'This request couldn’t be loaded. It may have expired; start again from the other app.' : 'You’re offline. Connect and reload.'); return }
      // Consent given before: Supabase sends us straight back to the app.
      if ('redirect_url' in data) { window.location.assign(data.redirect_url); return }
      setDetails(data)
    })()
    return () => { alive = false }
  }, [id])

  const decide = async (allow: boolean): Promise<void> => {
    if (!id) return
    setBusy(true); setError(null)
    const o = supabase().auth.oauth
    const { data, error: e } = allow ? await o.approveAuthorization(id, { skipBrowserRedirect: true }) : await o.denyAuthorization(id, { skipBrowserRedirect: true })
    if (e || !data?.redirect_url) { setBusy(false); setError(navigator.onLine ? 'That didn’t go through. Try again.' : 'You’re offline. Connect and try again.'); return }
    window.location.assign(data.redirect_url)
  }

  const scopes = details ? details.scope.split(/\s+/).filter(Boolean) : []
  return (
    <main className="auth">
      <div>
        <p className="authbrand">Cashflow</p>
        {details ? <>
          <h1 className="consenth">{details.client.name || 'An app'} wants access to your Cashflow</h1>
          {scopes.length > 0 && <div className="scopes">{scopes.map((s) => <div key={s}><Icon name={SCOPES[s]?.[0] ?? 'lock'} /><span>{SCOPES[s]?.[1] ?? s}</span></div>)}</div>}
          <p className="uri">Returns to {details.redirect_uri}</p>
          {details.user.email && <p className="uri">Signed in as {details.user.email}</p>}
        </> : !error && <>
          <span className="sk" style={{ height: 36, width: '80%', marginBottom: 12 }} />
          <span className="sk" style={{ height: 96, width: '100%', borderRadius: 18 }} />
        </>}
      </div>
      <div>
        {error && <div className="err" role="alert"><span>{error}</span></div>}
        {details && <div className="dates2">
          <button className="btn ghost" disabled={busy} onClick={() => void decide(false)}>Deny</button>
          <button className="btn" disabled={busy} onClick={() => void decide(true)}>{busy ? 'One moment…' : 'Allow'}</button>
        </div>}
      </div>
    </main>
  )
}

export default function Page(): React.JSX.Element {
  return <Suspense><Consent /></Suspense>
}

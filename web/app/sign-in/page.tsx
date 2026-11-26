'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase/client'

function SignIn(): React.JSX.Element {
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(params.get('error') ? 'Sign-in didn’t finish. Try again.' : null)
  const next = params.get('next') ?? '/'
  const go = async (): Promise<void> => {
    setBusy(true); setError(null)
    const { error: e } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
    if (e) { setBusy(false); setError(navigator.onLine ? 'Google sign-in didn’t open. Try again.' : 'You’re offline. Connect and try again.') }
  }
  return (
    <main className="auth">
      <div>
        <p style={{ fontFamily: 'var(--font-newsreader),Georgia,serif', fontSize: 22, color: 'var(--ink)', marginBottom: 40 }}>Cashflow</p>
        <h1>Your money, payday to payday</h1>
        <p>See what is left until payday, keep your budgets, and share a pot with the person you live with.</p>
        <div className="mini" aria-hidden="true">
          <div style={{ fontSize: 13, color: 'var(--on-you-2)' }}>Example</div>
          <div className="big num">827 kr.</div>
          <div className="sub">left to spend, <em>4 days to payday</em></div>
        </div>
      </div>
      <div>
        {error && <div className="err" role="alert"><span>{error}</span></div>}
        <button className="gbtn" onClick={go} disabled={busy}><span className="gmark" aria-hidden="true">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}</button>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>New here? The same button creates your account.</p>
      </div>
    </main>
  )
}

export default function Page(): React.JSX.Element {
  return <Suspense><SignIn /></Suspense>
}

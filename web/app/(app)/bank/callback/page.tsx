'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/Header'
import { useStore } from '@/lib/data/store'
import { supabase } from '@/lib/supabase/client'

/** The bank sends you back here after you renew access; the code is handed to the bank-consent function once. */
export default function Page(): React.JSX.Element {
  const { userId, reload } = useStore()
  const [err, setErr] = useState<string | null>(null)
  const sent = useRef(false)
  useEffect(() => {
    if (!userId || sent.current) return
    sent.current = true
    const q = new URLSearchParams(window.location.search)
    const code = q.get('code'), state = q.get('state')
    if (!code || !state) { setErr(q.get('error_description') ?? q.get('error') ?? 'The bank didn’t send a code back.'); return }
    void supabase().functions.invoke('bank-consent', { method: 'POST', body: { code, state } }).then(async ({ error }) => {
      if (error) { setErr('Couldn’t finish the renewal. Start it again from Accounts & sync.'); return }
      await reload()
      window.location.replace('/bank')
    })
  }, [userId, reload])
  return (
    <>
      <Header title="Renewing access" big="Renewing access" />
      <div className="panel"><div className="empty">{err ? <><b>Not renewed</b>{err}<br /><Link className="btn" href="/bank">Back to Accounts & sync</Link></> : <><b>One moment</b>Saving the bank’s answer…</>}</div></div>
    </>
  )
}

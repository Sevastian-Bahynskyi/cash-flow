'use client'

import { useRouter } from 'next/navigation'
import { Icon } from './Icon'

/** One header per screen: a small centred title with Back on a phone, a serif page title on desktop. */
export function Header({ title, big, aside, right, back }: { title: string; big?: string; aside?: React.ReactNode; right?: React.ReactNode; back?: boolean }): React.JSX.Element {
  const router = useRouter()
  const goBack = (): void => { if (window.history.length > 1) router.back(); else router.push('/') }
  return (
    <>
      <div className="bar">
        {back ? <button className="iconbtn" onClick={goBack} aria-label="Back"><Icon name="back" /></button> : <span />}
        <h1>{title}</h1>
        {right ?? <span />}
      </div>
      <div className="pagehead">
        <div>
          {back && <button className="back" onClick={goBack}><Icon name="back" /> Back</button>}
          <h1>{big ?? title}</h1>
        </div>
        {aside ? <p>{aside}</p> : null}
        {right ? <div className="deskonly">{right}</div> : null}
      </div>
    </>
  )
}

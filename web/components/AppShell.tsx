'use client'

import { useEffect } from 'react'
import { DataProvider } from '@/lib/data/store'
import { DEMO } from '@/lib/data/demo'
import { ToastProvider } from './Toast'
import { AddProvider, useAdd } from './AddSheet'
import { DetailProvider } from './ui'
import { Nav } from './Nav'

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  const add = useAdd()
  // Demo only: ?open=add opens the composer, so headless screenshots can see it.
  useEffect(() => { if (DEMO && new URLSearchParams(window.location.search).get('open') === 'add') add() }, [add])
  return <div className="app"><Nav onAdd={() => add()} /><main id="view" tabIndex={-1}>{children}</main></div>
}

/** Everything a signed-in screen needs: the data, the add sheet, the detail sheet, toasts and the nav. */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <DataProvider><ToastProvider><AddProvider><DetailProvider><Frame>{children}</Frame></DetailProvider></AddProvider></ToastProvider></DataProvider>
}

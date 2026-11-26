'use client'

import { DataProvider } from '@/lib/data/store'
import { ToastProvider } from './Toast'
import { AddProvider, useAdd } from './AddSheet'
import { DetailProvider } from './ui'
import { Nav } from './Nav'

function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  const add = useAdd()
  return <div className="app"><Nav onAdd={() => add()} /><main id="view" tabIndex={-1}>{children}</main></div>
}

/** Everything a signed-in screen needs: the data, the add sheet, the detail sheet, toasts and the nav. */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <DataProvider><ToastProvider><AddProvider><DetailProvider><Frame>{children}</Frame></DetailProvider></AddProvider></ToastProvider></DataProvider>
}

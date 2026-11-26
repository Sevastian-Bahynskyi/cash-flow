'use client'

import { DataProvider } from '@/lib/data/store'
import { ToastProvider } from './Toast'
import { DetailProvider } from './ui'
import { Nav } from './Nav'

/** Everything a signed-in screen needs: the data, the detail sheet, toasts and the nav. Transactions come only from the bank. */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <DataProvider><ToastProvider><DetailProvider><div className="app"><Nav /><main id="view" tabIndex={-1}>{children}</main></div></DetailProvider></ToastProvider></DataProvider>
}

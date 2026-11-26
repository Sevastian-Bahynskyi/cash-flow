import { AppShell } from '@/components/AppShell'

export default function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <AppShell>{children}</AppShell>
}

import { useMemo, type ReactNode } from 'react';
import { FixtureDataProvider } from '@/core/data/store';
import { fixtureTables } from './tables';
import type { QaScenario } from './scenario';

export default function FixtureApp({ scenario, children }: {
  scenario: QaScenario; children: ReactNode;
}): React.JSX.Element {
  const tables = useMemo(() => fixtureTables(scenario), [scenario]);
  return <FixtureDataProvider tables={tables}>{children}</FixtureDataProvider>;
}

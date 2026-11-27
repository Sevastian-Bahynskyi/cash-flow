const SCENARIOS = ['budgets', 'payday', 'nobank', 'empty'] as const;
export type QaScenario = (typeof SCENARIOS)[number];
const isScenario = (value: unknown): value is QaScenario => SCENARIOS.some((scenario) => scenario === value);

export function qaScenario(): QaScenario | null {
  if (!__DEV__) return null;
  const value: unknown = process.env.EXPO_PUBLIC_CASHFLOW_QA;
  return isScenario(value) ? value : null;
}

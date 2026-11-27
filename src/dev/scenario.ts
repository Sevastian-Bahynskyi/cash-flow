export function qaScenario(): 'budgets' | 'empty' | null {
  if (!__DEV__) return null;
  const value: unknown = process.env.EXPO_PUBLIC_CASHFLOW_QA;
  return value === 'budgets' || value === 'empty' ? value : null;
}

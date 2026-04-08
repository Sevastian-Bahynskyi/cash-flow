import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';

const MotionScopeContext = createContext(0);

export function MotionScope({
  value,
  children,
}: PropsWithChildren<{ value: number }>): ReactElement {
  return <MotionScopeContext.Provider value={value}>{children}</MotionScopeContext.Provider>;
}

export const useMotionScope = (): number => useContext(MotionScopeContext);

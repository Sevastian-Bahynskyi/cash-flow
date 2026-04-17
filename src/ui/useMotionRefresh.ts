import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useMotionRefresh(): number {
  const [run, setRun] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRun((current) => current + 1);
    }, []),
  );
  return run;
}

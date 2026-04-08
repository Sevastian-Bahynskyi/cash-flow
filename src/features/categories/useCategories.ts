import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CategoryOption, CategoryRow } from './types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; options: CategoryOption[] };

let cache: CategoryOption[] | null = null;

export function useCategories(): State {
  const [state, setState] = useState<State>(
    cache ? { status: 'ready', options: cache } : { status: 'loading' },
  );

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, user_id, parent_id, name, level, is_system')
        .order('level', { ascending: true })
        .order('name', { ascending: true });

      if (cancelled) return;
      if (error) {
        setState({ status: 'error', message: 'Could not load categories.' });
        return;
      }

      const rows = (data ?? []) as CategoryRow[];
      const parents = new Map<string, string>();
      for (const r of rows) {
        if (r.level === 1) parents.set(r.id, r.name);
      }

      const options: CategoryOption[] = rows
        .filter((r) => r.level === 2 && r.parent_id !== null)
        .map((r) => {
          const parentName = parents.get(r.parent_id ?? '') ?? '';
          return {
            id: r.id,
            name: r.name,
            parentName,
            searchKey: `${parentName} ${r.name}`.toLowerCase(),
          };
        });

      cache = options;
      setState({ status: 'ready', options });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

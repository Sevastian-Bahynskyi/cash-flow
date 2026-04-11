import { useEffect, useState } from 'react';
import { runDetached } from '@/lib/async';
import { supabase } from '@/lib/supabase';
import { applyCategoryOverrides, getDisplayCategoryName } from './helpers';
import type { CategoryOption, CategoryOverrideRow, CategoryRow } from './types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; options: CategoryOption[] };

let cache: CategoryOption[] | null = null;

export const clearCategoryCache = (): void => {
  cache = null;
};

export function useCategories(): State {
  const [state, setState] = useState<State>(
    cache ? { status: 'ready', options: cache } : { status: 'loading' },
  );

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    runDetached((async () => {
      const [categoriesRes, overridesRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, user_id, parent_id, name, level, is_system, icon, color')
          .order('level', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('category_overrides')
          .select('id, user_id, category_id, name, icon, updated_at'),
      ]);

      if (cancelled) return;
      if (categoriesRes.error || overridesRes.error) {
        setState({ status: 'error', message: 'Could not load categories.' });
        return;
      }

      const rows = applyCategoryOverrides(
        (categoriesRes.data ?? []) as CategoryRow[],
        (overridesRes.data ?? []) as CategoryOverrideRow[],
      );
      const parents = new Map<string, CategoryRow>();
      for (const r of rows) {
        if (r.level === 1) parents.set(r.id, r);
      }

      const options: CategoryOption[] = rows
        .filter((r) => r.level === 2 && r.parent_id !== null)
        .map((r) => {
          const parent = parents.get(r.parent_id ?? '');
          const parentName = parent?.name ?? '';
          const displayName = getDisplayCategoryName(parentName, r.name);
          return {
            id: r.id,
            name: displayName,
            parentName,
            searchKey: `${parentName} ${displayName} ${r.name}`.toLowerCase(),
            parentId: r.parent_id ?? '',
            icon: r.icon,
            color: r.color,
            parentColor: parent?.color ?? r.color,
            parentIcon: parent?.icon ?? r.icon,
          };
        });

      cache = options;
      setState({ status: 'ready', options });
    })(), 'categories.useCategories.load');
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

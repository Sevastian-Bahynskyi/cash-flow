import { supabase } from '@/lib/supabase';
import type { TransferPersonRow } from './types';

let cache: TransferPersonRow[] | null = null;

export const clearTransferPeopleCache = (): void => {
  cache = null;
};

export const normalizeTransferPersonName = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z\u00c0-\u024f]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const fetchTransferPeople = async (options?: { force?: boolean }): Promise<TransferPersonRow[]> => {
  if (cache && !options?.force) return cache;

  const { data, error } = await supabase
    .from('transfer_people')
    .select('id, user_id, name, normalized_name, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) {
    if (__DEV__) {
      console.warn('[transfer-people] Failed to load transfer people.', error.message);
    }
    return [];
  }

  cache = (data ?? []) as TransferPersonRow[];
  return cache;
};

export const saveTransferPerson = async ({
  id,
  name,
}: {
  id?: string;
  name: string;
}): Promise<{ ok: boolean; error: string | null }> => {
  const trimmedName = name.trim();
  const normalizedName = normalizeTransferPersonName(trimmedName);
  if (!trimmedName || !normalizedName) {
    return { ok: false, error: 'Enter a name before saving.' };
  }

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: 'You need to be signed in to save people.' };
  }

  if (id) {
    const { error } = await supabase
      .from('transfer_people')
      .update({ name: trimmedName, normalized_name: normalizedName })
      .eq('id', id);

    if (error) {
      if (__DEV__) {
        console.warn('[transfer-people] Failed to update person.', error.message);
      }
      return { ok: false, error: 'Could not save this person right now.' };
    }
  } else {
    const { error } = await supabase.from('transfer_people').insert({
      user_id: userData.user.id,
      name: trimmedName,
      normalized_name: normalizedName,
    });

    if (error) {
      if (__DEV__) {
        console.warn('[transfer-people] Failed to create person.', error.message);
      }
      return {
        ok: false,
        error:
          error.code === '23505'
            ? 'That person is already in the Transfers list.'
            : 'Could not save this person right now.',
      };
    }
  }

  clearTransferPeopleCache();
  return { ok: true, error: null };
};

export const removeTransferPerson = async (id: string): Promise<{ ok: boolean; error: string | null }> => {
  const { error } = await supabase.from('transfer_people').delete().eq('id', id);

  if (error) {
    if (__DEV__) {
      console.warn('[transfer-people] Failed to delete person.', error.message);
    }
    return { ok: false, error: 'Could not delete this person right now.' };
  }

  clearTransferPeopleCache();
  return { ok: true, error: null };
};

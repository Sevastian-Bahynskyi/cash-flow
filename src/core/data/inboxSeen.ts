import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Which Inbox items the owner has already seen on this phone, so the Activity tab can show a count of new ones,
// like a messenger. Ids only; kept small.
const KEY = 'cashflow:inbox-seen';
let seen: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((raw) => { seen = new Set(raw ? (JSON.parse(raw) as string[]) : []); emit(); })
  .catch(() => { seen = new Set(); emit(); });

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => listeners.delete(l); };

/** How many of these Inbox ids are new; 0 until the seen list has loaded, so nothing flashes on launch. */
export function useUnseen(ids: readonly string[]): number {
  const s = useSyncExternalStore(subscribe, () => seen);
  return s ? ids.filter((id) => !s.has(id)).length : 0;
}

/** The owner looked at the Inbox: these ids are no longer new. */
export function markSeen(ids: readonly string[]): void {
  if (!seen || ids.every((id) => seen!.has(id))) return;
  seen = new Set([...seen, ...ids]);
  AsyncStorage.setItem(KEY, JSON.stringify([...seen].slice(-500))).catch(() => undefined);
  emit();
}

import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useStore } from '@/core/data/store';
import type { TableName } from '@/core/data/types';
import { C } from './theme';
import { Btn, Icon, outcome, Press, T, tap, useToast } from './ui';

type Step = [TableName[], () => PromiseLike<{ error: { message: string; code?: string } | null }>];

/** Runs write steps in order, shows a readable error, reloads what they touched, toasts on success. */
export function useSaver(): { busy: boolean; err: string | null; setErr: (e: string | null) => void; save: (msg: string, steps: Step[]) => Promise<boolean> } {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (msg: string, steps: Step[]): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const touched = new Set<TableName>();
      for (const [tables, run] of steps) {
        const { error } = await run();
        if (error) {
          if (error.code === '23503') throw new Error('It’s still in use, so it can’t be deleted.');
          if (error.code === '23505') throw new Error('That already exists.');
          if (error.code === '42501' || /JWT|auth/i.test(error.message)) throw new Error('Your session ended. Sign in again.');
          console.warn('[save]', error);
          throw new Error('Not saved. Try again in a moment.');
        }
        tables.forEach((t) => touched.add(t));
      }
      if (touched.size) await store.reload([...touched]);
      toast(msg);
      return true;
    } catch (e) { outcome(false); setErr(e instanceof Error ? e.message : 'Not saved.'); return false; } finally { setBusy(false); }
  };
  return { busy, err, setErr, save };
}

export const FormErr = ({ err }: { err: string | null }) => (err ? <T k="note" style={{ color: C.over }}>{err}</T> : null);

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}><T k="strong">{label}</T>{sub ? <T k="meta">{sub}</T> : null}</View>
      <Switch value={on} onValueChange={(v) => { tap(); onChange(v); }} trackColor={{ true: C.ink, false: C.surface3 }} thumbColor={on ? C.bg : C.ink2} />
    </View>
  );
}

/** Two-step delete: the button asks, the second tap does it. */
export function DeleteAsk({ what, busy, onYes, onNo }: { what: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <View style={{ gap: 10, backgroundColor: C.surface, borderRadius: 18, padding: 14 }}>
      <T>Delete {what}? This can’t be undone.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Btn kind="ghost" label="Keep" onPress={onNo} /></View>
        <View style={{ flex: 1 }}><Btn kind="danger" label="Delete" busy={busy} onPress={onYes} /></View>
      </View>
    </View>
  );
}

// The icon meanings a category can take (web/lib/icons.ts ICON_GROUPS, categories part).
const PICKABLE = ['basket', 'store', 'utensils', 'cup', 'drinks', 'train', 'bus', 'taxi', 'car', 'fuel', 'house', 'city', 'bolt', 'wifi', 'phone', 'drop', 'shield', 'cross', 'heart', 'pill', 'film', 'bag', 'shirt', 'laptop', 'gift', 'plane', 'book', 'dumbbell', 'paw', 'baby', 'soap', 'receipt', 'wallet', 'gamepad', 'music', 'trend', 'briefcase', 'sack', 'ticket', 'moved', 'savings', 'grid', 'wrench', 'other'];

export function IconPick({ value, onPick, extra = [] }: { value: string; onPick: (name: string) => void; extra?: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      <T k="meta">Icon</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[...extra, ...PICKABLE].map((k) => (
          <Press key={k} scale={0.9} onPress={() => { tap(); onPick(k); }} accessibilityRole="button" accessibilityLabel={k} accessibilityState={{ selected: value === k }}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: value === k ? C.ink : C.surface }}>
            <Icon name={k} color={value === k ? C.bg : C.ink} />
          </Press>
        ))}
      </View>
    </View>
  );
}

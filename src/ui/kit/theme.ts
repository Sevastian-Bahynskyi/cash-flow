import type { CategoryRow } from '@/core/data/types';

// Everything around the aura is quiet black (owner, 27 Nov 2026): neutral greys, white type, one partner colour.
export const C = {
  bg: '#0B0B0D',
  surface: '#16161A',
  surface2: '#212126',
  surface3: '#2C2C32',
  line: 'rgba(255,255,255,0.08)',
  ink: '#F2F2F3',
  ink2: '#BDBEC3',
  ink3: '#8E8F96',
  partner: '#FFC94D',
  onPartner: '#141414',
  in: '#7AD7A4',
  over: '#FF8F7A',
  ahead: '#F7B267',
  bar: '#F2F2F3',
  track: 'rgba(255,255,255,0.12)',
} as const;

export const F = {
  num: 'BarlowCondensed_800ExtraBold_Italic',
  numSoft: 'BarlowCondensed_700Bold_Italic',
  title: 'Barlow_700Bold_Italic',
  label: 'Barlow_600SemiBold_Italic',
  body: 'Barlow_500Medium',
  strong: 'Barlow_600SemiBold',
} as const;

export const R = { panel: 22, card: 28, pill: 999 } as const;

const budgetColors = ['#83B8FF', '#77D4CE', '#C6AAFF', '#EDA9D2', '#BBC3FA', '#83C9E8', '#BED88A', '#D1C2AE', '#A8B9D2', '#D3ABE8'] as const;
const systemBudgetColor: Readonly<Record<string, number>> = {
  home: 0, rent: 0, food: 1, groceries: 1, transport: 2, shopping: 3, entertainment: 4,
  leisure: 3, travel: 5, sport: 6, bills: 7, 'save up': 8, doctor: 9,
};

export function budgetColor(parent: CategoryRow | undefined): string {
  if (!parent) return C.ink3;
  const system = parent.is_system ? systemBudgetColor[parent.name.toLowerCase()] : undefined;
  if (system !== undefined) return budgetColors[system] ?? C.ink3;
  let hash = 2166136261;
  for (const character of parent.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return budgetColors[(hash >>> 0) % budgetColors.length] ?? C.ink3;
}

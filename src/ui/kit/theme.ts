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

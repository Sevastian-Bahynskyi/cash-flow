// The aura's type: a heavy condensed italic for the big number, Barlow italic for the lines.
export const auraFonts = {
  number: 'BarlowCondensed_800ExtraBold_Italic',
  numberUnit: 'BarlowCondensed_700Bold_Italic',
  line: 'Barlow_700Bold_Italic',
  label: 'Barlow_600SemiBold_Italic',
  body: 'Barlow_500Medium',
  bodyStrong: 'Barlow_600SemiBold',
} as const;

/** "6.240", "−180": whole kroner with Danish grouping and a real minus sign. */
export const bigAmount = (minor: number): string => {
  const whole = Math.round(Math.abs(minor) / 100).toLocaleString('da-DK');
  return `${minor < 0 ? '−' : ''}${whole}`;
};

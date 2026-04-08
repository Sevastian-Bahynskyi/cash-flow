export const formatMinor = (minor: number, currencyCode = 'DKK'): string => {
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    return `${sign}${currencyCode} ${abs.toFixed(2)}`;
  }
};

export const formatPercent = (value: number): string =>
  `${Math.round(value * 100)}%`;

export const formatDateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

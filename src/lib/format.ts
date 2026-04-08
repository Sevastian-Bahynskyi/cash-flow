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

const pad2 = (value: number): string => String(value).padStart(2, '0');

const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateLabel = (iso: string): string => {
  const date = parseIsoDate(iso);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
};

export const formatMonthYearLabel = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(iso));

export const normalizeCountryIso = (value: string | null | undefined): string | null => {
  const normalized = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

export const formatCountryFlag = (value: string | null | undefined): string => {
  const normalized = normalizeCountryIso(value);
  if (!normalized) return '🌍';
  const codePoints = [...normalized].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

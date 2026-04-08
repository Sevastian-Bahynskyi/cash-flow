const SUPPORTED_CURRENCIES = [
  'DKK',
  'EUR',
  'USD',
  'GBP',
  'SEK',
  'NOK',
  'PLN',
  'UAH',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'CZK',
  'HUF',
  'RON',
] as const;

export const currencyOptions = SUPPORTED_CURRENCIES.map((code) => ({
  code,
  label: code,
}));

type FxResult = {
  convertedMinor: number;
  rate: number;
};

export const convertToDkk = async (
  originalMinor: number,
  currencyCode: string,
  occurredOn: string,
): Promise<FxResult> => {
  if (currencyCode === 'DKK') {
    return { convertedMinor: originalMinor, rate: 1 };
  }

  const amount = originalMinor / 100;
  const url = `https://api.frankfurter.app/${occurredOn}?from=${encodeURIComponent(currencyCode)}&to=DKK&amount=${amount}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not load exchange rate');
  }
  const json = (await response.json()) as { rates?: Record<string, number> };
  const converted = json.rates?.DKK;
  if (typeof converted !== 'number' || !Number.isFinite(converted)) {
    throw new Error('Could not convert currency');
  }
  const convertedMinor = Math.round(converted * 100);
  return { convertedMinor, rate: converted / amount };
};

export const normalizePattern = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[0-9]+/g, '#');

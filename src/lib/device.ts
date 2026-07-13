import { getLocales } from 'expo-localization';

export const getDeviceCurrencyCode = (): string => {
  const locale = getLocales()[0];
  return locale?.currencyCode ?? 'DKK';
};

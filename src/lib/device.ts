import { getLocales } from 'expo-localization';

export const getDeviceCountryIso = (): string | null => {
  const locale = getLocales()[0];
  return locale?.regionCode ?? null;
};

export const getDeviceCurrencyCode = (): string => {
  const locale = getLocales()[0];
  return locale?.currencyCode ?? 'DKK';
};

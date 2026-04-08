import * as Location from 'expo-location';
import { getLocales } from 'expo-localization';

export const getDeviceCountryIso = (): string | null => {
  const locale = getLocales()[0];
  return locale?.regionCode ?? null;
};

export const getDeviceCurrencyCode = (): string => {
  const locale = getLocales()[0];
  return locale?.currencyCode ?? 'DKK';
};

let cachedLiveCountryIso: string | null | undefined;
let liveCountryRequest: Promise<string | null> | null = null;

export const getLiveCountryIso = async (): Promise<string | null> => {
  if (cachedLiveCountryIso !== undefined) return cachedLiveCountryIso;
  if (liveCountryRequest) return liveCountryRequest;

  liveCountryRequest = (async () => {
    const localeCountry = getDeviceCountryIso();

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        cachedLiveCountryIso = localeCountry;
        return cachedLiveCountryIso;
      }

      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (!permission.granted) {
        cachedLiveCountryIso = localeCountry;
        return cachedLiveCountryIso;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const addresses = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      cachedLiveCountryIso =
        addresses[0]?.isoCountryCode?.toUpperCase() ?? localeCountry;
      return cachedLiveCountryIso;
    } catch {
      cachedLiveCountryIso = localeCountry;
      return cachedLiveCountryIso;
    } finally {
      liveCountryRequest = null;
    }
  })();

  return liveCountryRequest;
};

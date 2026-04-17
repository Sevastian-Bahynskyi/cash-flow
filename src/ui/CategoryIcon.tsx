import { FontAwesome6 } from '@expo/vector-icons';
import { Path, Svg } from 'react-native-svg';
import {
  siAirbnb,
  siApplemusic,
  siApplepay,
  siBookingdotcom,
  siGooglepay,
  siIkea,
  siMastercard,
  siNetflix,
  siPaypal,
  siPlaystation,
  siReddit,
  siSpotify,
  siSteam,
  siTiktok,
  siUber,
  siVisa,
  siYoutube,
  siYoutubemusic,
} from 'simple-icons';

type Props = {
  name: string;
  size: number;
  color: string;
};

const mobilePayPath =
  'M4.5 18V9.7c0-2.32 1.55-3.7 3.55-3.7 1.45 0 2.35.64 3.45 1.9 1.08-1.26 1.98-1.9 3.42-1.9 2.01 0 3.58 1.38 3.58 3.7V18h-2.57V10.17c0-1.12-.56-1.77-1.56-1.77-.97 0-1.73.65-1.73 1.82V18h-2.58v-7.78c0-1.17-.76-1.82-1.74-1.82-.99 0-1.55.65-1.55 1.77V18H4.5z';

const brandPaths: Record<string, string> = {
  'brand:airbnb': siAirbnb.path,
  'brand:apple-music': siApplemusic.path,
  'brand:apple-pay': siApplepay.path,
  'brand:booking': siBookingdotcom.path,
  'brand:google-pay': siGooglepay.path,
  'brand:ikea': siIkea.path,
  'brand:mastercard': siMastercard.path,
  'brand:mobilepay': mobilePayPath,
  'brand:netflix': siNetflix.path,
  'brand:paypal': siPaypal.path,
  'brand:playstation': siPlaystation.path,
  'brand:reddit': siReddit.path,
  'brand:spotify': siSpotify.path,
  'brand:steam': siSteam.path,
  'brand:tiktok': siTiktok.path,
  'brand:uber': siUber.path,
  'brand:visa': siVisa.path,
  'brand:youtube': siYoutube.path,
  'brand:youtube-music': siYoutubemusic.path,
};

const legacyToFontAwesome6: Record<string, string> = {
  'shape-outline': 'shapes',
  'cart-outline': 'cart-shopping',
  'storefront-outline': 'store',
  'silverware-fork-knife': 'utensils',
  'coffee-outline': 'mug-saucer',
  'train-car': 'train',
  bus: 'bus',
  taxi: 'taxi',
  'gas-station-outline': 'gas-pump',
  'home-outline': 'house',
  'home-city-outline': 'city',
  'flash-outline': 'bolt',
  wifi: 'wifi',
  cellphone: 'mobile-screen-button',
  'meter-gas-outline': 'gauge-high',
  'car-outline': 'car',
  'shield-car': 'shield-halved',
  'heart-pulse': 'heart-pulse',
  pill: 'pills',
  stethoscope: 'stethoscope',
  'movie-open-outline': 'film',
  'party-popper': 'champagne-glasses',
  'shopping-outline': 'bag-shopping',
  'tshirt-crew-outline': 'shirt',
  laptop: 'laptop',
  'gift-outline': 'gift',
  airplane: 'plane',
  'book-open-variant': 'book-open',
  dumbbell: 'dumbbell',
  'paw-outline': 'paw',
  paw: 'paw',
  'baby-face-outline': 'baby',
  'lotion-outline': 'pump-soap',
  'receipt-text-outline': 'receipt',
  'wallet-outline': 'wallet',
  'piggy-bank-outline': 'piggy-bank',
  'bank-outline': 'building-columns',
  'gamepad-variant-outline': 'gamepad',
  'dots-grid': 'grip',
  'hammer-wrench': 'screwdriver-wrench',
  'music-note-outline': 'music',
  'cash-plus': 'money-bill-trend-up',
  'cash-refund': 'money-bill-transfer',
  'swap-horizontal': 'right-left',
  'briefcase-outline': 'briefcase',
  'chart-line': 'chart-line',
  'account-cash-outline': 'sack-dollar',
  parking: 'square-parking',
  'bank-transfer': 'money-bill-transfer',
  'palette-outline': 'palette',
  'school-outline': 'graduation-cap',
  'shield-check-outline': 'shield-halved',
  'heart-outline': 'heart',
  'spray-bottle': 'pump-soap',
  'file-document-outline': 'file-lines',
  'dots-horizontal-circle-outline': 'ellipsis',
  beach: 'umbrella-beach',
  'cellphone-marker': 'mobile-screen-button',
};

export function CategoryIcon({ name, size, color }: Props) {
  const path = brandPaths[name];
  if (!path) {
    const resolvedName = legacyToFontAwesome6[name] ?? name;
    return <FontAwesome6 name={resolvedName as never} size={size} color={color} />;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} fill={color} />
    </Svg>
  );
}

import { MaterialCommunityIcons } from '@expo/vector-icons';
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

export function CategoryIcon({ name, size, color }: Props) {
  const path = brandPaths[name];
  if (!path) {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} fill={color} />
    </Svg>
  );
}

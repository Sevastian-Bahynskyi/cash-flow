// Phosphor icons (duotone is the app's style), loaded one file each so the bundle carries only these.
// require() keeps TypeScript off Phosphor's raw sources, which don't type-check under our settings.
import type { Icon } from 'phosphor-react-native';

/* eslint-disable @typescript-eslint/no-require-imports */
export const House = (require('phosphor-react-native/src/icons/House') as { House: Icon }).House;
export const ChartPie = (require('phosphor-react-native/src/icons/ChartPie') as { ChartPie: Icon }).ChartPie;
export const Users = (require('phosphor-react-native/src/icons/Users') as { Users: Icon }).Users;
export const Bank = (require('phosphor-react-native/src/icons/Bank') as { Bank: Icon }).Bank;
/* eslint-enable @typescript-eslint/no-require-imports */

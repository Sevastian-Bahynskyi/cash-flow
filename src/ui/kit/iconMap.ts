import type { LucideIcon } from 'lucide-react-native';
import ArrowDown from 'lucide-react-native/icons/arrow-down';
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Baby from 'lucide-react-native/icons/baby';
import Bell from 'lucide-react-native/icons/bell';
import Bike from 'lucide-react-native/icons/bike';
import BookOpen from 'lucide-react-native/icons/book-open';
import Briefcase from 'lucide-react-native/icons/briefcase';
import BriefcaseMedical from 'lucide-react-native/icons/briefcase-medical';
import Building2 from 'lucide-react-native/icons/building-2';
import Bus from 'lucide-react-native/icons/bus';
import Calendar from 'lucide-react-native/icons/calendar';
import Camera from 'lucide-react-native/icons/camera';
import Car from 'lucide-react-native/icons/car';
import CarTaxiFront from 'lucide-react-native/icons/car-taxi-front';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import ChartPie from 'lucide-react-native/icons/chart-pie';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import Clapperboard from 'lucide-react-native/icons/clapperboard';
import Clock from 'lucide-react-native/icons/clock';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import Coffee from 'lucide-react-native/icons/coffee';
import Coins from 'lucide-react-native/icons/coins';
import Download from 'lucide-react-native/icons/download';
import Droplet from 'lucide-react-native/icons/droplet';
import Dumbbell from 'lucide-react-native/icons/dumbbell';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import Fuel from 'lucide-react-native/icons/fuel';
import Funnel from 'lucide-react-native/icons/funnel';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Gauge from 'lucide-react-native/icons/gauge';
import Gift from 'lucide-react-native/icons/gift';
import Grid3x3 from 'lucide-react-native/icons/grid-3x3';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import Heart from 'lucide-react-native/icons/heart';
import Hourglass from 'lucide-react-native/icons/hourglass';
import House from 'lucide-react-native/icons/house';
import Image from 'lucide-react-native/icons/image';
import Info from 'lucide-react-native/icons/info';
import CircleHelp from 'lucide-react-native/icons/circle-help';
import KeyRound from 'lucide-react-native/icons/key-round';
import Landmark from 'lucide-react-native/icons/landmark';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Laptop from 'lucide-react-native/icons/laptop';
import Lightbulb from 'lucide-react-native/icons/lightbulb';
import Link from 'lucide-react-native/icons/link';
import List from 'lucide-react-native/icons/list';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import Moon from 'lucide-react-native/icons/moon';
import Music from 'lucide-react-native/icons/music';
import PawPrint from 'lucide-react-native/icons/paw-print';
import Pencil from 'lucide-react-native/icons/pencil';
import PiggyBank from 'lucide-react-native/icons/piggy-bank';
import Pill from 'lucide-react-native/icons/pill';
import Plane from 'lucide-react-native/icons/plane';
import Plus from 'lucide-react-native/icons/plus';
import Receipt from 'lucide-react-native/icons/receipt';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import RotateCw from 'lucide-react-native/icons/rotate-cw';
import Search from 'lucide-react-native/icons/search';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Shirt from 'lucide-react-native/icons/shirt';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import ShoppingBasket from 'lucide-react-native/icons/shopping-basket';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Split from 'lucide-react-native/icons/split';
import SprayCan from 'lucide-react-native/icons/spray-can';
import StickyNote from 'lucide-react-native/icons/sticky-note';
import Store from 'lucide-react-native/icons/store';
import Sun from 'lucide-react-native/icons/sun';
import Tag from 'lucide-react-native/icons/tag';
import Ticket from 'lucide-react-native/icons/ticket';
import TrainFront from 'lucide-react-native/icons/train-front';
import Trash2 from 'lucide-react-native/icons/trash-2';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import Undo2 from 'lucide-react-native/icons/undo-2';
import Upload from 'lucide-react-native/icons/upload';
import UserRound from 'lucide-react-native/icons/user-round';
import Users from 'lucide-react-native/icons/users';
import Utensils from 'lucide-react-native/icons/utensils';
import Wallet from 'lucide-react-native/icons/wallet';
import Wifi from 'lucide-react-native/icons/wifi';
import Wine from 'lucide-react-native/icons/wine';
import Wrench from 'lucide-react-native/icons/wrench';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';

// Stored category names predate the icon kit. Keep both legacy alias tables when changing glyphs.
const LEGACY: Record<string, string> = {"shape-outline": "shapes", "cart-outline": "cart-shopping", "storefront-outline": "store", "silverware-fork-knife": "utensils", "coffee-outline": "mug-saucer", "train-car": "train", "bus": "bus", "taxi": "taxi", "gas-station-outline": "gas-pump", "home-outline": "house", "home-city-outline": "city", "flash-outline": "bolt", "wifi": "wifi", "cellphone": "mobile-screen-button", "meter-gas-outline": "gauge-high", "car-outline": "car", "shield-car": "shield-halved", "heart-pulse": "heart-pulse", "pill": "pills", "stethoscope": "stethoscope", "movie-open-outline": "film", "party-popper": "champagne-glasses", "shopping-outline": "bag-shopping", "tshirt-crew-outline": "shirt", "laptop": "laptop", "gift-outline": "gift", "airplane": "plane", "book-open-variant": "book-open", "dumbbell": "dumbbell", "paw-outline": "paw", "paw": "paw", "baby-face-outline": "baby", "lotion-outline": "pump-soap", "receipt-text-outline": "receipt", "wallet-outline": "wallet", "piggy-bank-outline": "piggy-bank", "bank-outline": "building-columns", "gamepad-variant-outline": "gamepad", "dots-grid": "grip", "hammer-wrench": "screwdriver-wrench", "music-note-outline": "music", "cash-plus": "money-bill-trend-up", "cash-refund": "money-bill-transfer", "swap-horizontal": "right-left", "briefcase-outline": "briefcase", "chart-line": "chart-line", "account-cash-outline": "sack-dollar", "parking": "square-parking", "bank-transfer": "money-bill-transfer", "palette-outline": "palette", "school-outline": "graduation-cap", "shield-check-outline": "shield-halved", "heart-outline": "heart", "spray-bottle": "pump-soap", "file-document-outline": "file-lines", "dots-horizontal-circle-outline": "ellipsis", "beach": "umbrella-beach", "cellphone-marker": "mobile-screen-button", "account-heart-outline": "heart"};
const ALIAS: Record<string, string> = {"arrow-in": "in", "cal": "cal", "cart-shopping": "basket", "mug-saucer": "cup", "gas-pump": "fuel", "mobile-screen-button": "phone", "gauge-high": "drop", "shield-halved": "shield", "heart-pulse": "heart", "pills": "pill", "stethoscope": "cross", "champagne-glasses": "drinks", "bag-shopping": "bag", "book-open": "book", "pump-soap": "soap", "piggy-bank": "savings", "building-columns": "bank", "grip": "grid", "shapes": "other", "screwdriver-wrench": "wrench", "money-bill-trend-up": "trend", "chart-line": "trend", "money-bill-transfer": "moved", "right-left": "moved", "sack-dollar": "sack", "brand:mobilepay": "wallet", "brand:spotify": "music", "brand:apple-music": "music", "brand:youtube-music": "music", "brand:youtube": "film", "brand:netflix": "film", "brand:steam": "gamepad", "brand:playstation": "gamepad", "brand:paypal": "wallet", "brand:google-pay": "wallet", "brand:apple-pay": "wallet", "brand:uber": "taxi", "brand:airbnb": "house", "brand:booking": "plane", "brand:ikea": "store", "brand:reddit": "phone", "brand:tiktok": "phone", "brand:visa": "wallet", "brand:mastercard": "wallet", "square-parking": "car", "palette": "other", "graduation-cap": "book", "file-lines": "receipt", "ellipsis": "grid", "umbrella-beach": "plane"};
const ICONS: Readonly<Record<string, LucideIcon>> = {
  cycle: ChartPie,
  list: List,
  budgets: Gauge,
  where: ChartColumn,
  shared: Users,
  bank: Landmark,
  profile: UserRound,
  add: Plus,
  in: ArrowDown,
  out: ArrowUp,
  moved: ArrowLeftRight,
  savings: PiggyBank,
  loan: Hourglass,
  owed: HandCoins,
  other: LayoutGrid,
  basket: ShoppingBasket,
  store: Store,
  utensils: Utensils,
  cup: Coffee,
  train: TrainFront,
  bus: Bus,
  taxi: CarTaxiFront,
  car: Car,
  fuel: Fuel,
  house: House,
  city: Building2,
  bolt: Zap,
  wifi: Wifi,
  phone: Smartphone,
  drop: Droplet,
  shield: ShieldCheck,
  cross: BriefcaseMedical,
  heart: Heart,
  pill: Pill,
  film: Clapperboard,
  drinks: Wine,
  bag: ShoppingBag,
  shirt: Shirt,
  laptop: Laptop,
  gift: Gift,
  plane: Plane,
  book: BookOpen,
  dumbbell: Dumbbell,
  paw: PawPrint,
  baby: Baby,
  soap: SprayCan,
  receipt: Receipt,
  wallet: Wallet,
  gamepad: Gamepad2,
  grid: Grid3x3,
  wrench: Wrench,
  music: Music,
  trend: TrendingUp,
  briefcase: Briefcase,
  sack: Coins,
  ticket: Ticket,
  back: ChevronLeft,
  chev: ChevronRight,
  down: ChevronDown,
  search: Search,
  filter: Funnel,
  edit: Pencil,
  trash: Trash2,
  more: Ellipsis,
  cal: Calendar,
  note: StickyNote,
  swap: ArrowLeftRight,
  split: Split,
  import: Download,
  export: Upload,
  camera: Camera,
  image: Image,
  signout: LogOut,
  undo: Undo2,
  retry: RotateCw,
  hint: Lightbulb,
  rule: ListChecks,
  tag: Tag,
  bell: Bell,
  lock: Lock,
  mail: Mail,
  eye: Eye,
  link: Link,
  moon: Moon,
  sun: Sun,
  offline: CloudOff,
  warn: TriangleAlert,
  error: CircleAlert,
  info: Info,
  help: CircleHelp,
  done: Check,
  check: Check,
  close: X,
  clock: Clock,
  sync: RefreshCw,
  key: KeyRound,
  bike: Bike,
  cart: ShoppingCart,
};

export function iconFor(name: string | null | undefined): LucideIcon {
  const raw = name ?? '';
  const legacy = Object.hasOwn(LEGACY, raw) ? LEGACY[raw] ?? raw : raw;
  const key = Object.hasOwn(ALIAS, legacy) ? ALIAS[legacy] ?? legacy : legacy;
  return (Object.hasOwn(ICONS, key) ? ICONS[key] : undefined) ?? LayoutGrid;
}

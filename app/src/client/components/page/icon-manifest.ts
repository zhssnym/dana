/*
The labelled manifest of 4.3's icon keys, promised at S8 by RFC 0005 change
control item 5: `FOLDER_ICON_KEYS` in `lib/icons.tsx` is the record of the
set, and this file joins each key to the drawn icon the module exports, for
the picker and for every mark that renders a stored key. Adding a key there
without a row here is a type error, which is the point of the satisfies.

The keys are the designer's forty-two; the fallback for a null icon is the
plain folder, which is also what 4.3 means by an unset identity.
*/
import type { LucideIcon } from '../../lib/icons.js'
import {
  Banknote,
  Bike,
  BookOpen,
  Camera,
  Car,
  Cat,
  Cloud,
  Code,
  Coffee,
  Coins,
  Compass,
  Dog,
  Drum,
  Fish,
  Flame,
  Folder,
  Footprints,
  FOLDER_ICON_KEYS,
  Gamepad,
  Gift,
  Globe,
  Guitar,
  Headphones,
  Heart,
  House,
  Key,
  Laptop,
  Lightbulb,
  MapIcon,
  MapPin,
  Moon,
  Mountain,
  Music,
  Piano,
  Rocket,
  ShoppingBag,
  ShoppingCart,
  Swords,
  Tent,
  Umbrella,
  Utensils,
  Wallet,
  Zap,
} from '../../lib/icons.js'

type FolderIconKey = (typeof FOLDER_ICON_KEYS)[number]

export const FOLDER_ICONS = {
  folder: Folder,
  house: House,
  heart: Heart,
  gift: Gift,
  'book-open': BookOpen,
  lightbulb: Lightbulb,
  rocket: Rocket,
  flame: Flame,
  zap: Zap,
  key: Key,
  map: MapIcon,
  'map-pin': MapPin,
  compass: Compass,
  tent: Tent,
  mountain: Mountain,
  globe: Globe,
  cloud: Cloud,
  moon: Moon,
  umbrella: Umbrella,
  footprints: Footprints,
  car: Car,
  bike: Bike,
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  coffee: Coffee,
  coins: Coins,
  wallet: Wallet,
  banknote: Banknote,
  laptop: Laptop,
  code: Code,
  camera: Camera,
  music: Music,
  guitar: Guitar,
  headphones: Headphones,
  piano: Piano,
  drum: Drum,
  gamepad: Gamepad,
  swords: Swords,
  cat: Cat,
  dog: Dog,
  fish: Fish,
} as const satisfies Record<FolderIconKey, LucideIcon>

/** The icon a stored key draws; an unset or unknown key is the folder. */
export function markIcon(key: string | null): LucideIcon {
  if (key === null) return Folder
  return (FOLDER_ICONS as Record<string, LucideIcon>)[key] ?? Folder
}

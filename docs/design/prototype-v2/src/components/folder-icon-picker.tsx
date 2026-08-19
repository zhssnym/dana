/*
The folder identity picker: which mark a folder wears, and in which colour.

DES-130, extending what DES-054 has proposed since v1. Forty-two glyphs — the
plain folder plus forty-one, expanded at Imran's direction — every one from
the animated family DES-125 ruled in, and none of them an icon Dana's own
chrome uses, so a folder's mark can never be mistaken for a control. The
colours are the ten folder swatches the tokens have carried since v1, plus
graphite; no new colour enters the product here.

**Forty-two is the count and not an accident:** the grid is seven columns, so
six full rows leave no orphan cell and no dead gutter at the right — the gap
Imran caught. Adding a glyph means adding seven, or accepting the hole.

Lane 2: the shipping folder has no icon column and no colour column that
follows the folder rather than the viewer's label. Fixtures only.
*/

import { useState } from "react"

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
  Compass,
  Dog,
  Drum,
  Fish,
  Flame,
  Folder,
  Footprints,
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
  Coins,
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
  type LucideIcon,
} from "@/lib/icons"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-offset-1"

export const FOLDER_GLYPHS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "folder", label: "Folder", icon: Folder },
  { key: "house", label: "Home", icon: House },
  { key: "heart", label: "Heart", icon: Heart },
  { key: "gift", label: "Gift", icon: Gift },
  { key: "book-open", label: "Reading", icon: BookOpen },
  { key: "lightbulb", label: "Ideas", icon: Lightbulb },
  { key: "rocket", label: "Launch", icon: Rocket },
  { key: "flame", label: "Goals", icon: Flame },
  { key: "zap", label: "Energy", icon: Zap },
  { key: "key", label: "Keys", icon: Key },
  { key: "map", label: "Travel", icon: MapIcon },
  { key: "map-pin", label: "Places", icon: MapPin },
  { key: "compass", label: "Adventure", icon: Compass },
  { key: "tent", label: "Camping", icon: Tent },
  { key: "mountain", label: "Outdoors", icon: Mountain },
  { key: "globe", label: "World", icon: Globe },
  { key: "cloud", label: "Weather", icon: Cloud },
  { key: "moon", label: "Night", icon: Moon },
  { key: "umbrella", label: "Rainy days", icon: Umbrella },
  { key: "footprints", label: "Walks", icon: Footprints },
  { key: "car", label: "Car", icon: Car },
  { key: "bike", label: "Cycling", icon: Bike },
  { key: "shopping-cart", label: "Groceries", icon: ShoppingCart },
  { key: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { key: "utensils", label: "Cooking", icon: Utensils },
  { key: "coffee", label: "Coffee", icon: Coffee },
  { key: "coins", label: "Savings", icon: Coins },
  { key: "wallet", label: "Money", icon: Wallet },
  { key: "banknote", label: "Finance", icon: Banknote },
  { key: "laptop", label: "Work", icon: Laptop },
  { key: "code", label: "Code", icon: Code },
  { key: "camera", label: "Photos", icon: Camera },
  { key: "music", label: "Music", icon: Music },
  { key: "guitar", label: "Guitar", icon: Guitar },
  { key: "headphones", label: "Listening", icon: Headphones },
  { key: "piano", label: "Piano", icon: Piano },
  { key: "drum", label: "Drums", icon: Drum },
  { key: "gamepad", label: "Games", icon: Gamepad },
  { key: "swords", label: "Duels", icon: Swords },
  { key: "cat", label: "Cat", icon: Cat },
  { key: "dog", label: "Dog", icon: Dog },
  { key: "fish", label: "Fish", icon: Fish },
]

export function folderGlyph(key: string | undefined): LucideIcon {
  return FOLDER_GLYPHS.find((glyph) => glyph.key === key)?.icon ?? Folder
}

/* The ten folder swatches from tokens.css, plus graphite. The v1 dialog
   offered seven of the ten; there was no reason on record for the missing
   three, so the picker offers the palette the tokens actually define. */
export const FOLDER_COLORS: [name: string, value: string][] = [
  ["Graphite", "var(--color-graphite-900)"],
  ["Clay", "var(--color-folder-clay)"],
  ["Ochre", "var(--color-folder-ochre)"],
  ["Olive", "var(--color-folder-olive)"],
  ["Fern", "var(--color-folder-fern)"],
  ["Teal", "var(--color-folder-teal)"],
  ["Sky", "var(--color-folder-sky)"],
  ["Cobalt", "var(--color-folder-cobalt)"],
  ["Violet", "var(--color-folder-violet)"],
  ["Plum", "var(--color-folder-plum)"],
  ["Rose", "var(--color-folder-rose)"],
]

/*
The panel a folder's mark opens. Glyphs first because they are the bigger
choice, the colour row beneath, and every press commits immediately — DES-109's
rule reaches here too: there is nothing a Save could add.
*/
export function FolderIconPicker({
  glyph,
  color,
  onPick,
}: {
  glyph: string | undefined
  color: string
  onPick: (next: { glyph?: string; color?: string }) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const active = FOLDER_GLYPHS.find((g) => g.key === (glyph ?? "folder"))
  const shown = preview
    ? FOLDER_GLYPHS.find((g) => g.key === preview)
    : active

  return (
    /* Width derived from the grid, not guessed: seven 32px cells, six 4px
       gaps, 8px padding each side — 264px exactly, no orphan space at the
       right edge (Imran's catch). Forty-two glyphs fill six full rows. */
    <div className="w-[264px] p-2" onClick={(e) => e.stopPropagation()}>
      {/* The label names what the pointer is over, so choosing is reading one
          word rather than decoding twenty-one small drawings. */}
      <p className="px-1 pb-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
        {shown ? shown.label : "Folder icon"}
      </p>
      <div
        role="listbox"
        aria-label="Folder icon"
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => setPreview(null)}
      >
        {FOLDER_GLYPHS.map(({ key, label, icon: Icon }) => {
          const selected = (glyph ?? "folder") === key
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={label}
              onMouseEnter={() => setPreview(key)}
              onFocus={() => setPreview(key)}
              onClick={() => onPick({ glyph: key })}
              className={cn(
                /* Selection is a ring, here and in the colour row below and
                   in the cover grid — one language per popover (F2a, Y3). */
                "flex size-8 items-center justify-center rounded-md transition-[background-color,box-shadow]",
                T_FAST,
                FOCUS,
                selected
                  ? "bg-card ring-2 ring-[var(--color-graphite-700)]"
                  : "hover:bg-[var(--color-graphite-50)]",
              )}
            >
              <Icon
                className="size-[18px]"
                style={{ color }}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>

      <div className="mx-1 my-2 h-px bg-[var(--color-graphite-100)]" aria-hidden="true" />

      <div role="listbox" aria-label="Folder color" className="flex flex-wrap gap-1 px-1 pb-1">
        {FOLDER_COLORS.map(([name, value]) => {
          const selected = color === value
          return (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`${name} folder color`}
              onClick={() => onPick({ color: value })}
              className={cn(
                "flex size-6 items-center justify-center rounded-full transition-shadow",
                T_FAST,
                FOCUS,
                selected && "ring-2 ring-[var(--color-graphite-700)] ring-offset-1",
              )}
            >
              <span
                className="size-4 rounded-full"
                style={{ backgroundColor: value }}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

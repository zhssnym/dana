/*
The identity picker of 9.6 and 9.10, ported at S12 from the designer's
`folder-icon-picker.tsx` (DES-130): which mark a page wears, in which colour,
opened from the mark itself and committing on every press (DES-109: there is
nothing a Save could add).

His glyph labels and his grid: seven columns, forty-two glyphs, six full rows
with no orphan cell (Imran's catch); the glyph set is `FOLDER_ICON_KEYS`'s
and the manifest beside this file joins the two, so adding a key without an
icon fails the build rather than the render.

**The colours commit as hex, not as CSS variables.** 4.3 stores `#RRGGBB`
and the identity is shared, one value read by every member in every theme,
so what his swatches expressed as theme tokens this file writes as the
literal values those tokens hold, from the palette record in
`parts/identity-colors.ts`, whose header carries the reasoning.
*/
import { useState } from 'react'

import { IDENTITY_COLORS, IDENTITY_COLOR_FALLBACK } from '../../parts/identity-colors.js'
import { cn } from '../ui/utils.js'
import { FOLDER_ICONS } from './icon-manifest.js'
import type { LucideIcon } from '../../lib/icons.js'

const T_FAST = 'duration-[var(--duration-fast)] ease-[var(--ease-standard)]'
const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'

/** His labels, one word the pointer's row reads out. */
const GLYPH_LABELS: Record<keyof typeof FOLDER_ICONS, string> = {
  folder: 'Folder',
  house: 'Home',
  heart: 'Heart',
  gift: 'Gift',
  'book-open': 'Reading',
  lightbulb: 'Ideas',
  rocket: 'Launch',
  flame: 'Goals',
  zap: 'Energy',
  key: 'Keys',
  map: 'Travel',
  'map-pin': 'Places',
  compass: 'Adventure',
  tent: 'Camping',
  mountain: 'Outdoors',
  globe: 'World',
  cloud: 'Weather',
  moon: 'Night',
  umbrella: 'Rainy days',
  footprints: 'Walks',
  car: 'Car',
  bike: 'Cycling',
  'shopping-cart': 'Groceries',
  'shopping-bag': 'Shopping',
  utensils: 'Cooking',
  coffee: 'Coffee',
  coins: 'Savings',
  wallet: 'Money',
  banknote: 'Finance',
  laptop: 'Work',
  code: 'Code',
  camera: 'Photos',
  music: 'Music',
  guitar: 'Guitar',
  headphones: 'Listening',
  piano: 'Piano',
  drum: 'Drums',
  gamepad: 'Games',
  swords: 'Duels',
  cat: 'Cat',
  dog: 'Dog',
  fish: 'Fish',
}

const GLYPHS = Object.entries(FOLDER_ICONS) as [
  keyof typeof FOLDER_ICONS,
  LucideIcon,
][]

export function IconPicker({
  icon,
  color,
  onPick,
  subject = 'Folder',
}: {
  /** The stored 4.3 key, null for unset (the plain folder). */
  readonly icon: string | null
  /** The stored hex, null for unset (graphite). */
  readonly color: string | null
  readonly onPick: (next: { icon?: string; color?: string }) => void
  /** polish: shelves F10. What the picker dresses, "Folder" or "Shelf", so a
      shelf's picker does not head itself "Folder". */
  readonly subject?: 'Folder' | 'Shelf'
}): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)
  const activeKey = icon ?? 'folder'
  const shownKey = preview ?? activeKey
  const shownLabel =
    shownKey === 'folder' && subject === 'Shelf'
      ? 'Shelf'
      : ((GLYPH_LABELS as Record<string, string>)[shownKey] ?? `${subject} icon`)
  const drawn = color ?? IDENTITY_COLOR_FALLBACK

  return (
    <div className="w-[264px] max-w-full p-2">
      <p className="px-1 pb-1.5 text-[12px] leading-4 font-medium text-muted-foreground">
        {shownLabel}
      </p>
      <div
        role="listbox"
        aria-label={`${subject} icon`}
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => {
          setPreview(null)
        }}
      >
        {GLYPHS.map(([key, Icon]) => {
          const selected = activeKey === key
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={GLYPH_LABELS[key]}
              onMouseEnter={() => {
                setPreview(key)
              }}
              onFocus={() => {
                setPreview(key)
              }}
              onClick={() => {
                onPick({ icon: key })
              }}
              className={cn(
                'flex size-8 items-center justify-center rounded-md transition-[background-color,box-shadow]',
                T_FAST,
                FOCUS,
                selected
                  ? 'bg-card ring-2 ring-foreground'
                  : 'hover:bg-muted',
              )}
            >
              <Icon
                className="size-[18px]"
                style={{ color: drawn }}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>

      <div className="mx-1 my-2 h-px bg-border" aria-hidden="true" />

      <div role="listbox" aria-label={`${subject} color`} className="flex flex-wrap gap-1 px-1 pb-1">
        {IDENTITY_COLORS.map(([name, hex]) => {
          const selected = drawn.toLowerCase() === hex
          return (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`${name} folder color`}
              onClick={() => {
                onPick({ color: hex })
              }}
              className={cn(
                'flex size-6 items-center justify-center rounded-full transition-shadow',
                T_FAST,
                FOCUS,
                selected && 'ring-2 ring-foreground ring-offset-1',
              )}
            >
              <span
                className="size-4 rounded-full"
                style={{ backgroundColor: hex }}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

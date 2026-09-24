/*
The identity picker of 9.6 and 9.10, ported at S12 from the designer's
`folder-icon-picker.tsx` (DES-130): which mark a page wears, in which colour,
opened from the mark itself and committing on every press (DES-109: there is
nothing a Save could add).

His grid: seven columns, whole rows with no orphan cell (Imran's catch); the
glyph set is `FOLDER_ICON_KEYS`'s and the manifest beside this file joins the
two, so adding a key without an icon fails the build rather than the render.

**The colours commit as hex, not as CSS variables.** 4.3 stores `#RRGGBB`
and the identity is shared, one value read by every member in every theme,
so what his swatches expressed as theme tokens this file writes as the
literal values those tokens hold, from the palette record in
`parts/identity-colors.ts`, whose header carries the reasoning.

**Rebuilt 2026-08-30 at the owner's word**, who asked for "emoji icons" and
"the larger animated Lucide icon library" and, separately, that Desk's own
lamp be inside the library so a person who changes it can put it back. Three
things follow and each is here rather than in the manifest, because each is
about choosing rather than about the set:

- **Two tabs, Icons and Emoji.** Not one list with emoji at the end: they are
  two vocabularies and a person arrives wanting one of them. Both write 4.3's
  same `icon` column, an emoji as its codepoint key (`emoji-mark.tsx`).
- **A search box, because a hundred and five drawings is past the count you
  can scan.** It matches the manifest's own one-word labels and the section
  names, so "money" answers with the wallet, the banknote and the piggy bank,
  and nothing has to be remembered as a key.
- **The colour row belongs to the icon tab alone.** An emoji is already
  coloured, and offering a colour that changes nothing is the dead control
  DES-144 forbids.
*/
import { useMemo, useState } from 'react'

import { Search } from '../../lib/icons.js'
import { IDENTITY_COLORS, IDENTITY_COLOR_FALLBACK } from '../../parts/identity-colors.js'
import { Input } from '../ui/input.js'
import { cn } from '../ui/utils.js'
import { EMOJI_SECTIONS, emojiKeyOf, emojiOf } from './emoji-mark.js'
import { FOLDER_ICONS, ICON_LABELS, ICON_SECTIONS } from './icon-manifest.js'

const T_FAST = 'duration-[var(--duration-fast)] ease-[var(--ease-standard)]'
const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'

type IconKey = keyof typeof FOLDER_ICONS

/** The heading above a block of choices, in both tabs. */
function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return (
    <p className="px-1 pt-2.5 pb-1.5 text-xs leading-4 font-medium text-muted-foreground first:pt-0">
      {children}
    </p>
  )
}

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
  const activeKey = icon ?? 'folder'
  const wearsEmoji = emojiOf(activeKey) !== null
  /* The tab a person lands on is the one their mark is already in, so opening
     the picker on an emoji folder does not hide the thing it is wearing. */
  const [tab, setTab] = useState<'icons' | 'emoji'>(wearsEmoji ? 'emoji' : 'icons')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const shownKey = preview ?? activeKey
  const shownLabel =
    shownKey === 'folder' && subject === 'Shelf'
      ? 'Shelf'
      : ((ICON_LABELS as Record<string, string>)[shownKey] ??
        emojiOf(shownKey) ??
        `${subject} icon`)
  const drawn = color ?? IDENTITY_COLOR_FALLBACK

  /*
  The search, over the labels rather than the keys. A section whose own name
  matches keeps all of its glyphs, which is what makes "weather" and "money"
  work as searches at all: a person types the shelf they want, not the word
  one drawing happens to be called.
  */
  const needle = query.trim().toLowerCase()
  const sections = useMemo(() => {
    if (!needle) return ICON_SECTIONS
    return ICON_SECTIONS.map((section) => ({
      label: section.label,
      keys: section.label.toLowerCase().includes(needle)
        ? section.keys
        : section.keys.filter(
            (key) =>
              ICON_LABELS[key].toLowerCase().includes(needle) ||
              key.includes(needle),
          ),
    })).filter((section) => section.keys.length > 0)
  }, [needle])

  return (
    /*
    280 rather than the 264 the prototype derived, and the sixteen pixels are
    the scrollbar. His width was "seven 32px cells, six 4px gaps, 8px padding
    each side, 264px exactly, no orphan space at the right edge", and that
    arithmetic assumes the list never scrolls, which was true of forty-two
    glyphs in six rows and is not true of a hundred and five. A thin scrollbar
    (`tokens.css` sets `scrollbar-width: thin` on everything) takes about
    eleven pixels of track on Windows, which is enough to clip the seventh
    cell of every row. Sixteen back leaves the cells at his 32px with under a
    pixel of slack, so the grid reads as his rather than as a looser one, and
    the emoji cells below take their track's width instead of a fixed one so
    that a fatter scrollbar cannot overflow that grid either.
    */
    <div className="w-[280px] max-w-full p-2">
      {/* The tab row, in the arrangement `folder-cover.tsx` already uses for
          the cover's four tiers: a hairline under the row and the active tab
          marked by ink rather than a pill, so the two popovers a page opens
          are the same popover. */}
      <div className="-mx-2 -mt-2 mb-2 flex items-center gap-0.5 border-b border-border px-2 pt-1.5">
        {(
          [
            ['icons', 'Icons'],
            ['emoji', 'Emoji'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key)
              setPreview(null)
            }}
            className={cn(
              '-mb-px h-8 border-b-2 px-2.5 text-xs leading-4 font-medium transition-colors',
              T_FAST,
              FOCUS,
              tab === key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'icons' ? (
        <>
          {/* The label names what the pointer is over, so choosing is reading
              one word rather than decoding a hundred small drawings. */}
          <p className="px-1 pb-1.5 text-xs leading-4 font-medium text-muted-foreground">
            {shownLabel}
          </p>
          <div
            className={cn(
              'mb-1 flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2 transition-colors',
              T_FAST,
              'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
            )}
          >
            <Search
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <Input
              bare
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              placeholder="Search icons"
              aria-label={`Search ${subject.toLowerCase()} icons`}
              className="min-w-0 flex-1 bg-transparent text-sm leading-5 outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* A listbox per section rather than one around them all, which is
              the arrangement `folder-cover.tsx` already uses for the cover's
              two galleries. ARIA lets a listbox own options and groups and
              nothing else, and a single listbox here would own a heading and
              a wrapper for every section. */}
          <div
            className="max-h-[248px] overflow-y-auto"
            onMouseLeave={() => {
              setPreview(null)
            }}
          >
            {sections.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs leading-4 text-muted-foreground">
                No icon matches “{query.trim()}”.
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.label}>
                  <SectionLabel>{section.label}</SectionLabel>
                  <div
                    role="listbox"
                    aria-label={`${section.label} icons`}
                    className="grid grid-cols-7 justify-items-center gap-1"
                  >
                    {section.keys.map((key) => {
                      const Icon = FOLDER_ICONS[key as IconKey]
                      const selected = activeKey === key
                      return (
                        <button
                          key={key}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-label={ICON_LABELS[key as IconKey]}
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
                            selected ? 'bg-card ring-2 ring-foreground' : 'hover:bg-muted',
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
                </div>
              ))
            )}
          </div>

          <div className="mx-1 my-2 h-px bg-border" aria-hidden="true" />

          <div
            role="listbox"
            aria-label={`${subject} color`}
            className="flex flex-wrap gap-1 px-1 pb-1"
          >
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
        </>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          {EMOJI_SECTIONS.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              <div
                role="listbox"
                aria-label={`${section.label} emoji`}
                className="grid grid-cols-8 gap-1"
              >
                {section.emoji.map((character) => {
                  const key = emojiKeyOf(character)
                  if (key === null) return null
                  const selected = activeKey === key
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={character}
                      onClick={() => {
                        onPick({ icon: key })
                      }}
                      className={cn(
                        'flex aspect-square w-full items-center justify-center rounded-md text-[17px] leading-none transition-[background-color,box-shadow]',
                        T_FAST,
                        FOCUS,
                        selected ? 'bg-card ring-2 ring-foreground' : 'hover:bg-muted',
                      )}
                    >
                      <span aria-hidden="true">{character}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

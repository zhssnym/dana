/*
The identity picker of 9.6 and 9.10: which mark a page wears, in which colour,
opened from the mark itself and committing on every press (there is nothing a
Save could add).

**The colours commit as hex, not as CSS variables.** 4.3 stores `#RRGGBB`
and the identity is shared, one value read by every member in every theme,
so the swatches write the literal values from `parts/identity-colors.ts`.

- **Two tabs, Icons and Emoji.** Both write 4.3's same `icon` column, an emoji
  as its codepoint key (`emoji-mark.tsx`).
- **A search box**, matching the manifest's one-word labels and the section
  names, so "money" answers with the wallet, the banknote and the piggy bank.
- **The colour row belongs to the icon tab alone.** An emoji is already
  coloured.
- **Remove** clears the icon back to the plain page glyph, where the caller
  can store that (`onRemove`).

A selected cell wears the selection tint, never a ring.
*/
import { useMemo, useState } from 'react'

import { Search, X } from '../../lib/icons.js'
import {
  IDENTITY_COLORS,
  IDENTITY_COLOR_FALLBACK,
} from '../../parts/identity-colors.js'
import { Button } from '../ui/button.js'
import { Tabs } from '../ui/tabs.js'
import { Input } from '../ui/input.js'
import { cn } from '../ui/utils.js'
import { EMOJI_SECTIONS, emojiKeyOf, emojiOf } from './emoji-mark.js'
import { FOLDER_ICONS, ICON_LABELS, ICON_SECTIONS } from './icon-manifest.js'

const T_FAST = 'duration-[var(--duration-fast)] ease-[var(--ease-standard)]'

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
  onRemove,
  subject = 'Page',
}: {
  /** The stored 4.3 key, null for unset (the plain page glyph). */
  readonly icon: string | null
  /** The stored hex, null for unset (graphite). */
  readonly color: string | null
  readonly onPick: (next: { icon?: string; color?: string }) => void
  /** Clears the icon; offered only where the caller can store that. */
  readonly onRemove?: () => void
  /** What the picker dresses, "Page" or "Collection" (a shelf, on screen). */
  readonly subject?: 'Page' | 'Collection'
}): React.JSX.Element {
  const activeKey = icon ?? 'folder'
  const wearsEmoji = emojiOf(activeKey) !== null
  /* The tab a person lands on is the one their mark is already in. */
  const [tab, setTab] = useState<'icons' | 'emoji'>(wearsEmoji ? 'emoji' : 'icons')
  const [query, setQuery] = useState('')

  const drawn = color ?? IDENTITY_COLOR_FALLBACK

  /* The search, over the labels rather than the keys. A section whose own name
     matches keeps all of its glyphs. */
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
    /* 280: seven 32px cells plus room for a thin scrollbar. */
    <div className="w-[280px] max-w-full p-2">
      <div className="-mx-2 -mt-2 mb-2 flex items-end gap-4 border-b border-border px-2">
        <Tabs
          label="Icon kind"
          className="border-b-0"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'icons', label: 'Icons' },
            { value: 'emoji', label: 'Emoji' },
          ]}
        />
        {onRemove !== undefined && icon !== null ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="mb-0.5 ml-auto text-muted-foreground"
          >
            <X aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      {tab === 'icons' ? (
        <>
          <div className="mb-1 flex h-[var(--control-height)] items-center gap-1.5 rounded-md border border-input bg-card px-2">
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

          {/* A listbox per section: ARIA lets a listbox own options and groups
              and nothing else. Each icon names itself in its tooltip. */}
          <div className="max-h-[248px] overflow-y-auto">
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
                          title={ICON_LABELS[key as IconKey]}
                          onClick={() => {
                            onPick({ icon: key })
                          }}
                          className={cn(
                            'flex size-8 items-center justify-center rounded-md transition-colors',
                            T_FAST,
                            selected ? 'bg-selected' : 'hover:bg-accent',
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
            className="flex items-center justify-between px-1 pb-1"
          >
            {IDENTITY_COLORS.map(([name, hex]) => {
              const selected = drawn.toLowerCase() === hex
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={`${name} page color`}
                  onClick={() => {
                    onPick({ color: hex })
                  }}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md transition-colors',
                    T_FAST,
                    selected ? 'bg-selected' : 'hover:bg-accent',
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
                        'flex aspect-square w-full items-center justify-center rounded-md text-[17px] leading-none transition-colors',
                        T_FAST,
                        selected ? 'bg-selected' : 'hover:bg-accent',
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

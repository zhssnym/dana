// The icon and colour picker for a page; every press commits. Colours store as hex
// because the identity is shared across members and themes.
import { useMemo, useState } from 'react'

import { Search, X } from '../../lib/icons.js'
import {
  IDENTITY_COLORS,
  IDENTITY_COLOR_FALLBACK,
} from '../../parts/identity-colors.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { cn } from '../ui/utils.js'
import { FOLDER_ICONS, ICON_LABELS, ICON_SECTIONS } from './icon-manifest.js'

const T_FAST = 'duration-[var(--duration-fast)] ease-[var(--ease-standard)]'

type IconKey = keyof typeof FOLDER_ICONS

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
  /** The stored key, null for unset (the plain page glyph). */
  readonly icon: string | null
  /** The stored hex, null for unset. */
  readonly color: string | null
  readonly onPick: (next: { icon?: string; color?: string }) => void
  /** Offered only where the caller can store that. */
  readonly onRemove?: () => void
  /** "Collection" is a shelf on screen. */
  readonly subject?: 'Page' | 'Collection'
}): React.JSX.Element {
  const activeKey = icon ?? 'folder'
  const [query, setQuery] = useState('')

  const drawn = color ?? IDENTITY_COLOR_FALLBACK

  // Search the labels; a section whose own name matches keeps all its glyphs.
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
    // Seven 32px cells plus room for a thin scrollbar.
    <div className="w-[280px] max-w-full p-2">
      {onRemove !== undefined && icon !== null ? (
        <div className="mb-1 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-muted-foreground"
          >
            <X aria-hidden="true" />
            Remove
          </Button>
        </div>
      ) : null}

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

      {/* A listbox per section: ARIA lets a listbox own only options and groups. */}
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
    </div>
  )
}

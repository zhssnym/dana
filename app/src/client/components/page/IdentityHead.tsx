/*
The identity head a page wears (9.6, 9.10), ported at S12 from the
designer's `page-head.tsx` and `shelf-page.tsx` composition: the cover band,
the mark opening the icon-and-colour picker, the name, the editable
description.

**The mark writes the shared identity.** On a folder page the picker commits
PATCH /folders/:id {icon, color}, 4.3's shared columns that every member
reads and any member may set (AC-193's arm); on a shelf it commits the
shelf's own row. Which is why this component takes callbacks and holds no
mutation: the page owns its writes, per the client's one-hook-per-surface
rule.

**The name is a heading until it is being renamed**, and that is a
correction rather than a preference: an always-on field has no heading for a
reader to land on, which AC-226 caught when it asked the imported starter's
page for one and found a textbox. So the title renders as `h1` for everyone,
and for whoever may rename it becomes an inline field on a click or on the
menu's Rename and returns to a heading when it commits. 9.6's two halves both
hold: the owner renames in place, a member reads a heading and is offered no
textbox at all (AC-217 asserts exactly that absence, because a surface never
offers what the server would 403).

The rename commits on blur or Enter; empty and Escape both revert, and
`InlineInput` being uncontrolled makes reverting the browser's own.

**The description is any member's** (9.6's table: "the page: blocks, cover,
icon, colour, description — yes for both roles; the event log says who").
Placeholder rather than fixed copy, his words.
*/
import { useRef } from 'react'

import { IDENTITY_COLOR_FALLBACK } from '../../parts/identity-colors.js'
import { InlineInput, InlineTextarea } from '../ui/inline-field.js'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover.js'
import { IconPicker } from './IconPicker.js'
import { markIcon } from './icon-manifest.js'

export interface IdentityValues {
  readonly name: string
  readonly icon: string | null
  readonly color: string | null
  readonly coverFileId: string | null
  readonly description: string | null
}

export function IdentityHead({
  kind,
  identity,
  canRename,
  canCover,
  renaming,
  onStartRename,
  onEndRename,
  onIdentity,
  onRename,
  onDescription,
  onCover,
}: {
  /** "folder" or "shelf": the word the controls' accessible names carry. */
  readonly kind: 'folder' | 'shelf'
  readonly identity: IdentityValues
  readonly canRename: boolean
  /** Whether the name is a field right now. The page owns it, because the
      overflow menu's Rename is one of the two things that starts it. */
  readonly renaming: boolean
  readonly onStartRename: () => void
  readonly onEndRename: () => void
  /** Whether this page can take a cover upload (a shelf page cannot yet:
      7.15 scopes an upload to a folder, and a shelf has none). */
  readonly canCover: boolean
  readonly onIdentity: (next: { icon?: string; color?: string }) => void
  readonly onRename: (next: string) => void
  readonly onDescription: (next: string | null) => void
  readonly onCover: (file: File | null) => void
}): React.JSX.Element {
  const Mark = markIcon(identity.icon)
  const color = identity.color ?? IDENTITY_COLOR_FALLBACK
  const coverInput = useRef<HTMLInputElement>(null)

  return (
    <div>
      {identity.coverFileId === null ? null : (
        <div className="relative -mx-1 mb-4 h-36 overflow-hidden rounded-lg">
          <img
            src={`/api/v1/files/${identity.coverFileId}`}
            alt=""
            className="size-full object-cover"
          />
          {canCover ? (
            <button
              type="button"
              onClick={() => {
                onCover(null)
              }}
              className="absolute right-2 bottom-2 rounded-md bg-card/85 px-2 py-1 text-[12px] leading-4 text-foreground opacity-0 shadow-[var(--elevation-1)] transition-opacity outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [div:hover>&]:opacity-100"
            >
              Remove cover
            </button>
          ) : null}
        </div>
      )}

      {/* The mark: the one control for a glyph and a colour on every page
          that has one (DES-130). */}
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Icon and colour for ${identity.name}`}
              className="flex size-11 items-center justify-center rounded-lg text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <Mark
            className="size-7"
            style={{ color }}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <IconPicker
            icon={identity.icon}
            color={identity.color}
            onPick={onIdentity}
          />
        </PopoverContent>
      </Popover>

      {canCover && identity.coverFileId === null ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="rounded-md px-1.5 py-0.5 text-[12px] leading-4 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add cover
          </button>
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) onCover(file)
              event.target.value = ''
            }}
          />
        </div>
      ) : null}

      {canRename && renaming ? (
        <InlineInput
          key={identity.name}
          defaultValue={identity.name}
          aria-label={`${kind === 'folder' ? 'Folder' : 'Shelf'} name`}
          maxLength={kind === 'folder' ? 100 : 40}
          autoFocus
          onBlur={(event) => {
            const next = event.target.value.trim()
            onEndRename()
            if (next !== '' && next !== identity.name) onRename(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = identity.name
              event.currentTarget.blur()
            }
          }}
          className="mt-1 text-[24px] leading-8 font-semibold text-foreground"
        />
      ) : (
        /* A heading, always: it is what a reader lands on and what AC-226
           asks the imported starter's page for. For whoever may rename, a
           click on it is the inline rename 9.6 specifies; for a member it is
           an ordinary heading and no textbox is reachable at all. */
        <h1
          onClick={canRename ? onStartRename : undefined}
          className={`mt-1 truncate text-[24px] leading-8 font-semibold text-foreground${
            canRename ? ' cursor-text' : ''
          }`}
        >
          {identity.name}
        </h1>
      )}

      <InlineTextarea
        key={identity.description ?? ''}
        defaultValue={identity.description ?? ''}
        placeholder={
          kind === 'folder' ? 'What this folder is for' : 'What this shelf is for'
        }
        aria-label="Description"
        rows={1}
        onBlur={(event) => {
          const next = event.target.value.trim()
          if (next === (identity.description ?? '')) return
          onDescription(next === '' ? null : next)
        }}
        className="mt-1 text-[12px] leading-5 text-muted-foreground"
      />
    </div>
  )
}

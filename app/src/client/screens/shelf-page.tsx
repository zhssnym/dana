/*
The shelf page, bound through the adapter seam. What is worth knowing:

- **A shelf is keyed by id, never by name** (11.15): the screen takes `id`
  beside `name`, and `shelfKey` is `lib/shelf-acts.ts`'s `shelf:<id>`.
- **The body is the composer** (#221): writing and the native Folder rows are
  `components/page/canvas/ShelfCanvas.tsx`, the Folder canvas's BlockNote
  surface over the Shelf's revisioned document, handed in as `children`.
- **The identity is `lib/page-identity.ts`'s shelf half**, and the picker is
  this client's `IconPicker`: 4.3 and 4.18 store a key and `icon-manifest.ts` is
  the one place a key becomes a glyph, so `folderPageMark` is `markIcon` here.
- **The header is two rows**: mark, name and the one "…" menu; then the
  description. No Add cover control and no activity line: a cover already
  chosen still draws, and what happened to the shelf is the menu's History.
- **`InlineInput`'s rename commits on Enter as well as blur**, 9.10's inline
  rename being what AC-203 and the sidebar dialog both expect of a field.
*/

import { useRef, useState } from "react"
import type { ReactNode } from "react"

import { IconPicker as FolderIconPicker } from "../components/page/IconPicker.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { PageCover } from "../components/page-cover.js"
import { ObjectMenu } from "../components/object-menu.js"
import { HistorySheet } from "../components/history-sheet.js"
import { MoreHorizontal } from "../lib/icons.js"
import { Button } from "../components/ui/button.js"
import { InlineInput, InlineTextarea } from "../components/ui/inline-field.js"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.js"
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { shelfKey } from "../lib/shelf-acts.js"
import { MORE_ACTIONS } from "../components/ui/copy.js"
import { cn } from "../components/ui/utils.js"

export function ShelfPage({
  id,
  name,
  children,
  onRename,
  onCopyLink,
  onDuplicate,
  onSaveWorkflow,
  onDelete,
}: {
  /* Seam 2. */
  id: string
  name: string
  /* The composer: writing and the native Folder rows (#221), which
     `components/page/canvas/ShelfCanvas.tsx` owns. */
  children: ReactNode
  onRename?: (next: string) => void
  /* The acts the shell can perform on this shelf. Absent ones simply do not
     draw, which is the contract's own safety property. */
  onCopyLink?: () => void
  onDuplicate?: () => void
  onSaveWorkflow?: () => void
  onDelete?: () => void
}) {
  const key = shelfKey(id)
  const identity = useFolderIdentity(key)
  /* Seam 4. */
  const Mark = markIcon(identity.glyph ?? null)

  const [historyOpen, setHistoryOpen] = useState(false)
  /* Rename is a field on this page, so the menu item puts the cursor in it,
     the same arrangement the folder page uses. */
  const renameRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex min-h-full w-full max-w-[720px] flex-col">
      {/* A cover already chosen still draws; adding one is not offered here,
          the header being two rows and nothing more. */}
      <PageCover storageName={key} />

      <header className="group/head pt-2">
        {/* Row one: the mark (the picker for glyph and colour), the name as
            its own field, and the one "…" for everything else. */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Icon and colour for ${name}`}
                  className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              }
            >
              <Mark
                className="size-6"
                strokeWidth={1.5}
                aria-hidden="true"
                style={identity.color ? { color: identity.color } : undefined}
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              {/* Seam 4. */}
              <FolderIconPicker
                subject="Shelf"
                icon={identity.glyph ?? null}
                color={identity.color ?? null}
                onPick={(next) =>
                  savePrototypeFolderIdentity(key, {
                    ...(next.icon === undefined ? {} : { glyph: next.icon }),
                    ...(next.color === undefined ? {} : { color: next.color }),
                  })
                }
              />
            </PopoverContent>
          </Popover>

          <InlineInput
            ref={renameRef}
            key={name}
            defaultValue={name}
            aria-label="Shelf name"
            onBlur={(event) => {
              const next = event.target.value.trim()
              /* The name is the membership label, so the rename is the
                 shell's act: it rewrites the label on every member. */
              if (next && next !== name) onRename?.(next)
            }}
            /* Enter commits as well as blur; Escape puts the saved name
               back and leaves. */
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                event.currentTarget.value = name
                event.currentTarget.blur()
              }
            }}
            className="min-w-0 flex-1 text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-bold text-foreground"
          />

          <ObjectMenu
            kind="shelf"
            name={name}
            width="w-52"
            handlers={{
              history: () => setHistoryOpen(true),
              rename: () => renameRef.current?.focus(),
              "copy-link": onCopyLink,
              duplicate: onDuplicate,
              workflow: onSaveWorkflow,
              delete: onDelete,
            }}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                /* 9.1 names every overflow menu "More actions". */
                aria-label={MORE_ACTIONS}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </Button>
            }
          />
        </div>

        {/* Row two: the description, in the person's own words. With none
            written, the offer appears on hover only, in a row whose height
            is always held so nothing shifts. */}
        <InlineTextarea
          key={identity.description ?? ""}
          defaultValue={identity.description ?? ""}
          placeholder="What this shelf is for"
          aria-label="Description"
          rows={1}
          onBlur={(event) =>
            savePrototypeFolderIdentity(key, {
              description: event.target.value.trim() || undefined,
            })
          }
          className={cn(
            "mt-0.5 text-sm text-muted-foreground placeholder:text-muted-foreground/70",
            identity.description
              ? ""
              : "opacity-0 transition-opacity group-hover/head:opacity-100 focus:opacity-100",
          )}
        />
      </header>
      <HistorySheet
        kind="shelf"
        subject={id}
        name={name}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />

      {/* The page's writing, folder rows among them (#221). */}
      <section className="pt-4">{children}</section>
    </div>
  )
}

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
- **The Add cover control** offers the folder page's own Gallery, Upload and
  Photos (issue #118); `lib/page-identity.ts` answers the tiers.
- **The activity line reads the shelf's own events** through `lib/history.ts`;
  every member folder's would be a read per folder over 7.12, and is left to the
  History sheet.
- **`InlineInput`'s rename commits on Enter as well as blur**, 9.10's inline
  rename being what AC-203 and the sidebar dialog both expect of a field.
*/

import { useRef, useState } from "react"
import type { ReactNode } from "react"

import { IconPicker as FolderIconPicker } from "../components/page/IconPicker.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { AddCoverAction, PageCover } from "../components/page-cover.js"
import { ObjectMenu } from "../components/object-menu.js"
import { HistorySheet } from "../components/history-sheet.js"
import { MoreHorizontal } from "../lib/icons.js"
import { Button } from "../components/ui/button.js"
import { InlineInput, InlineTextarea } from "../components/ui/inline-field.js"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.js"
import { WindowActivity, WindowBarActions } from "../components/window-bar.js"
import { useHistory } from "../lib/history.js"
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { shelfKey } from "../lib/shelf-acts.js"
import { MORE_ACTIONS } from "../components/ui/copy.js"

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
  /* Seam 7. */
  const activity = useHistory("shelf", id)

  const [historyOpen, setHistoryOpen] = useState(false)
  /* Rename is a field on this page, so the menu item puts the cursor in it,
     the same arrangement the folder page uses. */
  const renameRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex min-h-full flex-col">
      <PageCover storageName={key} />

      {/* The shell already insets the page; a second measure here would indent
          the shelf's title past every other page's. */}
      <div className="w-full pt-2">
        {/*
        The control row lives in the window bar, exactly where the folder page's
        is, so the same controls are not in two places depending on what kind of
        page you are reading.

        It carries what a shelf actually has: what happened to it, and the acts
        the contract declares for its kind. It does **not** carry the folder
        page's view strip or its filters, and that is the page being honest
        rather than incomplete: a view switches how a list of *tasks* is drawn
        and a shelf holds folders; a filter narrows a list somebody built, and a
        shelf's list is its label, so narrowing it would be editing it.
         */}
        <WindowBarActions order={2}>
          <WindowActivity events={activity} />
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
                /* 9.1 names every overflow menu, a shelf's included, "More
                   actions". */
                aria-label={MORE_ACTIONS}
                className="size-7 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)]"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </Button>
            }
          />
        </WindowBarActions>
        <HistorySheet
          kind="shelf"
          subject={id}
          name={name}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />

        {/* The mark opens the picker, which is the one control for a glyph and
            a colour on every page that has one. */}
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`Icon and colour for ${name}`}
                className="flex size-11 items-center justify-center rounded-lg text-[var(--color-graphite-700)] transition-colors hover:bg-[var(--color-graphite-100)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] outline-none"
              />
            }
          >
            <Mark
              className="size-7"
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

        {/* Add cover: a shelf is a place, so it wears a cover, and every tier
            can reach one. The wrapper is the folder page's `mt-1` verbatim so
            the control sits at the same distance under the mark on both pages. */}
        <div className="mt-1">
          <AddCoverAction storageName={key} />
        </div>

        <InlineInput
          ref={renameRef}
          key={name}
          defaultValue={name}
          aria-label="Shelf name"
          onBlur={(event) => {
            const next = event.target.value.trim()
            /* The name is the membership label, so the rename is the shell's
               act: it rewrites the label on every member and moves the page's
               stores. This page only reports it. */
            if (next && next !== name) onRename?.(next)
          }}
          /* Enter commits as well as blur. Escape puts the saved name back and
             leaves, rather than leaving the typing behind for the next blur to
             save. */
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              event.currentTarget.value = name
              event.currentTarget.blur()
            }
          }}
          className="mt-1 text-[24px] leading-8 font-semibold text-[var(--color-graphite-900)]"
        />

        {/*
        The description is where the explanation lives.

        A name that needs a tooltip every time has failed, so there is no
        permanent hover hint and the explaining is here, which is the pattern
        the native pages already use. It is a placeholder rather than fixed
        copy, because on your own shelf you should be able to say what it is for
        in your own words.
         */}
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
          className="mt-1 text-[12px] leading-5 text-[var(--color-graphite-600)]"
        />

        {/* The page's writing, folder rows among them (#221). */}
        <section className="pt-6">{children}</section>
      </div>
    </div>
  )
}

/*
`docs/design/prototype-v2/src/screens/shelf-page.tsx`, lifted whole at RFC
0004's S27 and bound through the adapter seam. That prototype is deleted
(`a7886df`, 2026-09-01); read it in git history before that commit. It diffs
empty against its original except at the seams named here, each marked `Seam`
in the body.

1. **The `@/` specifiers become this client's relative ESM paths** (11.4),
   and the em dashes leave under protocol section 7.
2. **A shelf and its folders are keyed by id, never by name** (11.15's v2
   hazard, and the S12 port's own rule): the screen takes `id` beside
   `name`, `ShelfFolder` carries an id and an icon key, and a folder block
   stores `folder.id`. `shelfKey` is `lib/shelf-acts.ts`'s `shelf:<id>`.
3. **The arrangement is 4.17's rather than the browser's.** `readFolderLayout`
   becomes the `initialItems` prop and the save effect becomes
   `onLayoutChange`, which answers the items rebuilt from the response so the
   state adopts the ids the server chose; `lib/shelf-layout.ts` is the
   translation and says why. The effect skips its mount run, so opening a
   page is not a write.
4. **The identity is `lib/page-identity.ts`'s shelf half**, its two exported
   names aliased back to the prototype's on import, and the picker is this
   client's `IconPicker` for the reason S26 recorded on the folder page: 4.3
   and 4.18 store a key and `icon-manifest.ts` is the one place a key
   becomes a glyph, so `folderPageMark` is `markIcon` here.
5. **The Add cover control is the prototype's, drawn since issue #118.** It
   stood empty until then, with a comment saying `coverTiersFor` answered
   nothing for a shelf because 7.15's upload needed a `folder_id` — true when
   written, false since issues #20 and #100 made that part optional for a
   cover and gave 4.18 the preset and crop columns. A shelf now offers the
   folder page's own Gallery, Upload and Photos, which is Imran's ruling on
   #118, and the seam is unchanged: `lib/page-identity.ts` answers the tiers.
6. **A folder row is a link**, 9.1's roles table naming each folder and shelf
   row one and AC-223 addressing it so, where the prototype draws a button;
   the page hands it an `href` beside `onOpenFolder`.
7. **The activity line reads the shelf's own events** through
   `lib/history.ts`; the prototype also folds in every member folder's,
   which is a read per folder over 7.12 and is left to the History sheet.
8. **The image insert is not offered and an image block takes no folder**,
   `page-image.tsx`'s upload seam needing one (7.15) and a shelf having none;
   a stored image block still draws. `InsertLine` is this client's, which
   has no `dense` strip, the folder page's blocks having none either.
   **This is still true after #118 and the reason is narrower than it was.**
   7.15 made `folder_id` optional for `kind: cover` and for nothing else, so
   a page image — `kind: image` — still needs a folder this page has not got,
   and the empty string passed below is refused 422 rather than stored. The
   one gesture that can reach it is "Replace…" on a block that already holds a
   picture, which fails silently and leaves the old one; a page-image upload
   with no folder is a section 7 question and not this file's to decide.
9. **`InlineInput`'s rename commits on Enter as well as blur**, 9.10's inline
   rename being what AC-203 and the sidebar dialog both expect of a field.

Nothing else moves. The empty state's third clause, "or drag it here in the
sidebar", is the prototype's and stands: DES-171's sidebar drag is S24's.
*/

import { useEffect, useMemo, useRef, useState } from "react"

import { IconPicker as FolderIconPicker } from "../components/page/IconPicker.js"
import { markIcon } from "../components/page/icon-manifest.js"
import { AddCoverAction, PageCover } from "../components/page-cover.js"
import { ObjectMenu } from "../components/object-menu.js"
import { HistorySheet } from "../components/history-sheet.js"
import { FolderPlus, MoreHorizontal, Plus } from "../lib/icons.js"
import { Button } from "../components/ui/button.js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js"
import { InlineInput, InlineTextarea } from "../components/ui/inline-field.js"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.js"
import { PageImage, type PageImageModel } from "../components/page-image.js"
import { FALLBACK_RATIO } from "../lib/page-images.js"
import { WindowActivity, WindowBarActions } from "../components/window-bar.js"
import { useHistory } from "../lib/history.js"
import {
  savePageIdentity as savePrototypeFolderIdentity,
  usePageIdentity as useFolderIdentity,
} from "../lib/page-identity.js"
import { shelfKey } from "../lib/shelf-acts.js"
import { useSortableList } from "../lib/use-sortable-list.js"
import { ChevronDown, GripVertical } from "../lib/icons.js"
import { InsertLine } from "../components/page/BlocksEditor.js"
import { cn } from "../components/ui/utils.js"
import { MORE_ACTIONS } from "../components/ui/copy.js"

/*
The blocks a page holds, on a shelf too (DES-210, DES-219).

Sections, prose and pictures behave exactly as they do on a folder page: a
block under a heading folds with it, position decides belonging. The folder
row is the fourth kind and the one that makes this a *shelf* page: its
presence is the membership's, its position is yours. See the header note.
*/
export type ShelfItem =
  | { kind: "section"; section: { id: string; name: string } }
  | { kind: "paragraph"; paragraph: { id: string; text: string } }
  /* Seam 3: the block's own id beside the picture's file id. */
  | { kind: "image"; blockId?: string; image: PageImageModel }
  | { kind: "folder"; folder: { id: string } }

export interface ShelfFolder {
  id: string
  name: string
  color: string
  icon: string | null
  pending: number
}

/*
Presence from the membership, position from the layout.

Folder blocks whose membership is gone are dropped; members the layout has
never seen join after the last folder row, or lead the page when there are no
folder rows yet, the same place the folder page keeps its loose tasks.
*/
function reconcileItems(stored: ShelfItem[], folders: ShelfFolder[]): ShelfItem[] {
  const onShelf = new Set(folders.map((folder) => folder.id))
  const kept = stored.filter(
    (item) => item.kind !== "folder" || onShelf.has(item.folder.id),
  )
  const placed = new Set(
    kept.flatMap((item) => (item.kind === "folder" ? [item.folder.id] : [])),
  )
  const missing = folders
    .filter((folder) => !placed.has(folder.id))
    .map((folder): ShelfItem => ({ kind: "folder", folder: { id: folder.id } }))
  /* polish: shelves F2. Unchanged is the same array: a fresh copy of the same
     items read as a change, and the save effect wrote it. */
  if (!missing.length) return kept.length === stored.length ? stored : kept
  let lastFolderAt = -1
  kept.forEach((item, index) => {
    if (item.kind === "folder") lastFolderAt = index
  })
  const at = lastFolderAt + 1
  return [...kept.slice(0, at), ...missing, ...kept.slice(at)]
}

export function ShelfPage({
  id,
  name,
  folders,
  addableFolders = [],
  initialItems,
  onLayoutChange,
  folderHref,
  onOpenFolder,
  onAddFolder,
  onCreateFolder,
  onRename,
  onCopyLink,
  onDuplicate,
  onSaveWorkflow,
  onDelete,
}: {
  /* Seam 2. */
  id: string
  name: string
  folders: ShelfFolder[]
  /* Folders not on this shelf, for the add row: choosing one moves it here,
     which is the same act the sidebar's "Move to shelf" performs. */
  addableFolders?: { id: string; name: string; color: string; icon: string | null }[]
  /* Seam 3. */
  initialItems: ShelfItem[]
  onLayoutChange: (items: ShelfItem[]) => Promise<ShelfItem[] | null>
  /* Seam 6. */
  folderHref: (folder: string) => string
  onOpenFolder: (folder: string) => void
  onAddFolder?: (folder: string) => void
  onCreateFolder?: () => void
  onRename?: (next: string) => void
  /* The acts the shell can perform on this shelf. Absent ones simply do not
     draw, which is the contract's own safety property (DES-197). */
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

  const [items, setItems] = useState<ShelfItem[]>(() =>
    reconcileItems(initialItems, folders),
  )
  /* A folder moved on or off the shelf while the page is open, the sidebar
     drag, the add row, an import, reaches the blocks without a reload. */
  const memberNames = folders.map((folder) => folder.id).join(" ")
  useEffect(() => {
    setItems((current) => reconcileItems(current, folders))
  }, [memberNames])
  /* polish: shelves F11. The section just made is the one whose field opens
     empty and focused, with "New section" as its placeholder. */
  const [freshId, setFreshId] = useState<string | null>(null)
  /* Seam 3: the save effect, over 7.16's PUT. The first run is the mount and
     is not a change; a run that adopted the server's ids is not one either. */
  const mounted = useRef(false)
  const adopting = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (adopting.current) {
      adopting.current = false
      return
    }
    void onLayoutChange(items).then((saved) => {
      if (saved === null) return
      adopting.current = true
      /* polish: shelves F11. The write hands back the server's own block ids,
         so the section just made arrives under a new one and the field that
         was to open empty and focused would close on the adoption. It is
         found again as the one section the write names that this page did not
         have a moment ago. */
      if (freshId !== null) {
        const before = new Set(
          items.flatMap((item) => (item.kind === "section" ? [item.section.id] : [])),
        )
        const made = saved.flatMap((item) =>
          item.kind === "section" && !before.has(item.section.id) ? [item.section.id] : [],
        )
        setFreshId(made[0] ?? null)
      }
      setItems(saved)
    })
  }, [items])

  /* The same engine the folder page's blocks use, so a shelf's blocks move
     exactly like a folder's rather than nearly like them. */
  const drag = useSortableList({
    count: items.length,
    onReorder: (from, to) =>
      setItems((current) => {
        const next = [...current]
        const [moved] = next.splice(from, 1)
        if (moved) next.splice(to, 0, moved)
        return next
      }),
    describe: (index) => {
      const item = items[index]
      if (!item) return "Block"
      return item.kind === "section"
        ? item.section.name
        : item.kind === "folder"
          ? (folders.find((folder) => folder.id === item.folder.id)?.name ?? "Folder")
          : item.kind
    },
  })

  const insertAt = (index: number, kind: "section" | "paragraph" | "image") => {
    const id = `${key}-${kind}-${items.length}-${Date.now()}`
    if (kind === "section") setFreshId(id)
    const block: ShelfItem =
      kind === "section"
        ? { kind: "section", section: { id, name: "New section" } }
        : kind === "image"
          ? {
              kind: "image",
              /* A block nobody has filled yet has no file and therefore no
                 measured shape, which is exactly the case `FALLBACK_RATIO`
                 answers (issue #108). Spelled once in `lib/page-images.ts` so
                 that this page and a folder page reserve the same box. */
              image: { id: "", ratio: FALLBACK_RATIO, caption: "" },
            }
          : { kind: "paragraph", paragraph: { id, text: "" } }
    setItems((current) => {
      const next = [...current]
      next.splice(Math.min(index, next.length), 0, block)
      return next
    })
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  /* Rename is a field on this page, so the menu item puts the cursor in it,
     the same arrangement the folder page uses. */
  const renameRef = useRef<HTMLInputElement>(null)

  /*
  The folder page has an add-task row; a shelf has an add-folder row (DES-219).
  Choosing an existing folder moves it onto this shelf; New folder makes one
  that lands here. It sits after the last folder row, wherever the arrangement
  has put that.
  */
  const addFolderRow =
    onAddFolder || onCreateFolder ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex h-[var(--control-height)] w-full items-center gap-3 rounded-md px-2 text-left text-sm text-[var(--color-graphite-500)] transition-colors outline-none",
                "hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-700)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] data-popup-open:bg-[var(--color-graphite-50)]",
              )}
            />
          }
        >
          <Plus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Add folder
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          {addableFolders.map((folder) => {
            const Glyph = markIcon(folder.icon)
            return (
              <DropdownMenuItem
                key={folder.id}
                onClick={() => onAddFolder?.(folder.id)}
              >
                <Glyph className="size-4" style={{ color: folder.color }} />
                <span className="truncate">{folder.name}</span>
              </DropdownMenuItem>
            )
          })}
          {addableFolders.length && onCreateFolder ? <DropdownMenuSeparator /> : null}
          {onCreateFolder ? (
            <DropdownMenuItem onClick={onCreateFolder}>
              <FolderPlus className="size-4" />
              New folder…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  let lastFolderAt = -1
  items.forEach((item, index) => {
    if (item.kind === "folder") lastFolderAt = index
  })

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  )

  return (
    <div className="flex min-h-full flex-col">
      <PageCover storageName={key} />

      {/* polish: pagehead F5. The shell already insets the page; a second
          measure here indented the shelf's title past every other page's. */}
      <div className="w-full pt-2">
        {/*
        The control row lives in the window bar, exactly where the folder
        page's is (DES-219). It sat inside the page body for one revision,
        which put the same two controls in two places depending on what kind
        of page you were reading, the fault DES-139 moved the folder's
        controls up to avoid.

        It carries what a shelf actually has: what happened to it, and the
        acts the contract declares for its kind. It does **not** carry the
        folder page's view strip or its filters, and that is the page being
        honest rather than incomplete: a view switches how a list of *tasks*
        is drawn and a shelf holds folders; a filter narrows a list somebody
        built, and a shelf's list is its label, so narrowing it would be
        editing it.
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
                /* seam: 9.1 names every overflow menu, a shelf's included,
                   "More actions", where the prototype writes "More actions for
                   {name}"; item 44's A2, transcribed at item 57 (A2). */
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
            a colour on every page that has one (DES-130). */}
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

        {/* Seam 5: the prototype's `AddCoverAction`, in the prototype's own
            place — a shelf is a place, so it wears a cover (DES-141,
            DES-219), and since #118 every tier can reach one. The wrapper is
            the folder page's `mt-1` verbatim so the control sits at the same
            distance under the mark on both pages. */}
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
               act: it rewrites the label on every member and moves the
               page's stores (DES-218). This page only reports it. */
            if (next && next !== name) onRename?.(next)
          }}
          /* Seam 9. polish: shelves F9: Escape puts the saved name back and
             leaves, rather than leaving the typing behind for the next blur
             to save. */
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

        DES-195 refused a permanent hover hint, "a name that needs a tooltip
        every time has failed", and put the explaining here, which is the
        pattern the native pages already use. It is a placeholder rather than
        fixed copy, because on your own shelf you should be able to say what it
        is for in your own words.
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

        {/*
        The page's blocks, folder rows among them, on the folder page's own
        grammar (DES-219): the same grip, the same insert line with the same
        distances (DES-193's dense rule included), the same collapse-by-
        position. One page you have to learn, at two levels.
        */}
        <section className="pt-6">
          {folders.length === 0 ? (
            /* Says what a shelf is *for* rather than that it is empty, the
               same judgement the Trash page's empty state makes, and the place
               DES-195 sent the explanation. */
            <p className="mb-1 rounded-lg border border-dashed border-[var(--color-graphite-200)] px-4 py-8 text-center text-[13px] leading-5 text-[var(--color-graphite-500)]">
              Nothing on this shelf yet. Add a folder below, move one here from
              its own menu, or drag it here in the sidebar.
            </p>
          ) : null}
          {lastFolderAt < 0 ? addFolderRow : null}
          <InsertLine
            onSection={() => insertAt(0, "section")}
            onParagraph={() => insertAt(0, "paragraph")}
          />
          {items.map((item, index) => {
            /* A block under a heading folds with it: position decides
               belonging, never a second record (DES-209). */
            const owner = items
              .slice(0, index)
              .reverse()
              .find((earlier) => earlier.kind === "section")
            if (
              owner?.kind === "section" &&
              collapsed.has(owner.section.id) &&
              item.kind !== "section"
            ) {
              return null
            }
            const state = drag.itemState(index)
            const blockKey =
              item.kind === "section"
                ? item.section.id
                : item.kind === "image"
                  ? (item.blockId ?? `image-${index}`)
                  : item.kind === "folder"
                    ? `folder-${item.folder.id}`
                    : item.paragraph.id
            const after = (
              <InsertLine
                onSection={() => insertAt(index + 1, "section")}
                onParagraph={() => insertAt(index + 1, "paragraph")}
              />
            )
            return (
              <div key={blockKey} className="contents">
              <div
                ref={drag.setItemRef(index)}
                style={{
                  transform:
                    state.offset === 0
                      ? undefined
                      : `translate3d(0, ${state.offset}px, 0)`,
                  transition:
                    state.isActive && !state.isSettling
                      ? "box-shadow var(--duration-fast) var(--ease-standard)"
                      : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-fast) var(--ease-standard)",
                  zIndex: state.isActive ? 30 : undefined,
                }}
                className={cn(
                  "group/item relative rounded-md",
                  state.isActive &&
                    "cursor-grabbing bg-card shadow-[var(--elevation-1)] ring-1 ring-[var(--color-graphite-200)]",
                )}
              >
                <button
                  type="button"
                  aria-label={
                    item.kind === "section"
                      ? `Reorder section ${item.section.name}`
                      : item.kind === "folder"
                        ? `Reorder folder ${folderById.get(item.folder.id)?.name ?? ""}`
                        : `Reorder ${item.kind}`
                  }
                  {...drag.handleProps(index)}
                  className="absolute top-1 -left-7 z-10 flex size-6 cursor-grab items-center justify-center rounded-md text-[var(--color-graphite-400)] opacity-0 transition-opacity outline-none group-hover/item:opacity-100 hover:bg-[var(--color-graphite-100)] focus-visible:opacity-100 active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" strokeWidth={2} aria-hidden="true" />
                </button>
                {item.kind === "folder" ? (
                  (() => {
                    const folder = folderById.get(item.folder.id)
                    const Glyph = markIcon(folder?.icon ?? null)
                    return (
                      /* Seam 6: an anchor, 9.1's role for a folder row. */
                      <a
                        href={folderHref(item.folder.id)}
                        /* Opens as its own tab and lands you on it: a shelf
                           is where a workflow is presented, so a folder
                           opened from it stays open beside it (Imran,
                           2026-08-24). */
                        onClick={(event) => {
                          event.preventDefault()
                          onOpenFolder(item.folder.id)
                        }}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left outline-none transition-colors",
                          "hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]",
                        )}
                      >
                        <Glyph
                          className="size-4 shrink-0"
                          style={folder ? { color: folder.color } : undefined}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-[var(--color-graphite-800)]">
                          {folder?.name ?? ""}
                        </span>
                        {folder?.pending ? (
                          <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-500)] tabular-nums">
                            {folder.pending}
                          </span>
                        ) : null}
                      </a>
                    )
                  })()
                ) : item.kind === "section" ? (
                  <div className="flex items-center gap-1.5 pt-3">
                    <button
                      type="button"
                      aria-label={`${collapsed.has(item.section.id) ? "Expand" : "Collapse"} section ${item.section.name}`}
                      onClick={() =>
                        setCollapsed((current) => {
                          const next = new Set(current)
                          if (next.has(item.section.id)) next.delete(item.section.id)
                          else next.add(item.section.id)
                          return next
                        })
                      }
                      className="text-[var(--color-graphite-400)] transition-colors outline-none hover:text-[var(--color-graphite-700)]"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          collapsed.has(item.section.id) && "-rotate-90",
                        )}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                    <InlineInput
                      defaultValue={item.section.id === freshId ? "" : item.section.name}
                      placeholder={item.section.id === freshId ? "New section" : undefined}
                      autoFocus={item.section.id === freshId}
                      aria-label="Section name"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur()
                      }}
                      onBlur={(event) => {
                        if (item.section.id === freshId) setFreshId(null)
                        setItems((current) =>
                          current.map((candidate, i) =>
                            i === index && candidate.kind === "section"
                              ? {
                                  kind: "section" as const,
                                  section: {
                                    ...candidate.section,
                                    name: event.target.value.trim() || candidate.section.name,
                                  },
                                }
                              : candidate,
                          ),
                        )
                      }}
                      className="text-[16px] leading-6 font-semibold text-[var(--color-graphite-900)]"
                    />
                  </div>
                ) : item.kind === "image" ? (
                  /* Seam 8. */
                  <PageImage
                    /* A shelf is not a folder, so its page's picture belongs
                       to the person: no folder_id part at all (7.15, #167). */
                    folderId={null}
                    image={item.image}
                    onChange={(next) =>
                      setItems((current) =>
                        current.map((candidate, i) =>
                          i === index && candidate.kind === "image"
                            ? { ...candidate, image: next }
                            : candidate,
                        ),
                      )
                    }
                    onRemove={() =>
                      setItems((current) => current.filter((_, i) => i !== index))
                    }
                  />
                ) : (
                  <InlineTextarea
                    defaultValue={item.paragraph.text}
                    placeholder="Write something…"
                    aria-label="Paragraph"
                    rows={1}
                    onBlur={(event) => {
                      const text = event.target.value.trim()
                      setItems((current) =>
                        text
                          ? current.map((candidate, i) =>
                              i === index
                                ? {
                                    kind: "paragraph" as const,
                                    paragraph: { ...item.paragraph, text },
                                  }
                                : candidate,
                            )
                          : current.filter((_, i) => i !== index),
                      )
                    }}
                    className="text-[12px] leading-5 text-[var(--color-graphite-600)]"
                  />
                )}
                {after}
              </div>
              {/* Outside the draggable wrapper on purpose: the add row marks
                  the end of the folder run, it is not part of the block being
                  carried. */}
              {index === lastFolderAt ? addFolderRow : null}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

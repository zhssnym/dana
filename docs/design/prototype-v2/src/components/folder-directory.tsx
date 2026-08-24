/*
The sidebar's folders, arranged by the person who owns them.

"Sidebar drag" has been on Imran's list since the first session and nothing
had touched it: `app-sidebar.tsx` carried no drag code at all, and the
alphabet decided where every folder went. Three gestures were missing, and
they are one gesture seen from three angles —

- **reorder**, within the directory or within a group;
- **in and out of a group**, which is one act performed in two directions and
  must therefore be one gesture rather than two (DES-166);
- **two folders becoming a group**, which is the 1.5-second hold that already
  makes a folder out of two tasks (DES-103), one level up.

**Stillness is what separates them, and always was.** Travelling proposes a
slot: the rows make space and the carried row settles into it. Coming to rest
inside a container proposes that container, so the list stops holding a space
open and the container answers instead. Coming to rest on a *folder* proposes
that the two become a group, and that one takes a deliberate hold, because
making a container is a larger act than using one — a group created by every
clumsy pass of the pointer would be worse than no grouping at all.

**Why the directory is one list rather than two.** Groups and loose folders
share a column, so somebody moving things in that column is arranging one
sequence; a model that kept them apart would have to refuse the obvious drag —
a loose folder above a group — for a reason that exists only in the code. A
group is therefore an entry in the directory, and its folders are a list of
their own inside it: the same two-level shape the folder page already has in
its sections and their tasks.

Where the ordering lives, and why the alphabet still seeds it, is
`lib/folder-order.ts`.
*/

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import {
  ChevronDown,
  ChevronRight,
  Folders,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "@/lib/icons"

import { FolderRow } from "@/components/folder-row"
import { ObjectMenu } from "@/components/object-menu"
import { HistorySheet } from "@/components/history-sheet"
import { copyShelfLink, duplicateShelf } from "@/lib/shelf-acts"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import type { ShellFolderFixture } from "@/fixtures"
import {
  arrange,
  entryLabel,
  folderEntry,
  groupEntry,
  moved,
  saveFolderOrder,
  useFolderOrder,
  type FolderOrder,
} from "@/lib/folder-order"
import { pushUndo } from "@/lib/undo"
import { useSortableList, type SortableItemState } from "@/lib/use-sortable-list"
import { cn } from "@/lib/utils"

export type DirectoryFolder = ShellFolderFixture & { folderKey: string }

type FolderAction = "rename" | "appearance" | "delete"

/* The directory itself as a place a release can land. Distinct from any
   group's key and from null, which is an answer rather than a place. */
const DIRECTORY = "directory"

type Point = { x: number; y: number }

/* Where a release would put the thing: which container, which slot in it, and
   how far down that container's own box the line goes. The pixel is carried
   with the answer so nothing has to be measured while React renders. */
type Drop = { key: string; at: number; top: number }

/* ---------------------------------------------------------------- grip -- */

/*
A press on a sidebar row is ambiguous in a way a task row's is not: the row
*is* a button, and `surfaceProps` deliberately refuses to start a drag from
one. So the grip here is the whole row, guarded by hand — anything marked
`data-no-drag` (the hover actions, a group's menu) keeps its press, and
everything else may become a drag.
*/
function grip(base: { onPointerDown: (event: ReactPointerEvent) => void }) {
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.("[data-no-drag]")) return
      base.onPointerDown(event)
    },
  }
}

/*
A drag that ends over a row would otherwise also be a click.

The engine listens on the window rather than capturing the pointer, so the
browser still delivers a click on release — onto whichever row is under the
cursor, which in a sidebar means opening a folder somebody was only moving.
One capture-phase listener, armed at the lift and gone by the next frame, is
the whole fix.
*/
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener("click", swallow, true)
  window.addEventListener(
    "pointerup",
    () =>
      window.setTimeout(
        () => window.removeEventListener("click", swallow, true),
        0,
      ),
    { once: true },
  )
}

/* --------------------------------------------------------------- lines -- */

/* Where a folder arriving from another list would land. Absolutely
   positioned, so nothing moves while it is shown: an indicator that shifted
   the rows would be changing the answer it was describing. */
function InsertLine({ top }: { top: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 left-2 z-20 h-0.5 rounded-full bg-[var(--color-dana-accent-600)]"
      style={{ top }}
    />
  )
}

/* --------------------------------------------------------------- group -- */

function FolderGroupEntry({
  label,
  folders,
  activeFolder,
  isDropTarget,
  dropTop,
  itemRef,
  dragProps,
  dragState,
  registerZone,
  onAddFolder,
  onRenameGroup,
  onOpenGroup,
  onOpenFolderInTab,
  onSaveShelfWorkflow,
  onDeleteGroup,
  children,
}: {
  label: string
  folders: DirectoryFolder[]
  activeFolder?: string
  isDropTarget: boolean
  dropTop: number | null
  itemRef: (element: HTMLElement | null) => void
  /*
  The grip. A group moves like anything else in this column — Imran,
  2026-08-22: "the group of folders are not movable by dragging, it's now only
  sorted by alphabetical order."

  It was half-built and the half showing was the wrong one: a group already
  *participated* in the directory's list, so it made space as folders passed
  it and could be landed beside, and it was the one entry that could not be
  picked up. A row that moves for you but not by you reads as broken rather
  than as restricted.

  What it still cannot do is go *inside* another group — Dana nests one level,
  and the honest answer to that drag is that the group moves past.
  */
  dragProps: Record<string, unknown>
  dragState: SortableItemState
  registerZone: (key: string) => (element: HTMLElement | null) => void
  onAddFolder?: (label: string) => void
  onRenameGroup?: (label: string, folders: ShellFolderFixture[]) => void
  /* A shelf has a page now, so its row can go there (DES-207). */
  onOpenGroup?: (label: string) => void
  onOpenFolderInTab?: (name: string) => void
  onSaveShelfWorkflow?: (label: string) => void
  onDeleteGroup?: (label: string, folders: ShellFolderFixture[]) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const [shelfHistoryOpen, setShelfHistoryOpen] = useState(false)
  const carried = dragState.isActive && !dragState.isSettling
  const childActive = folders.some((folder) => folder.folderKey === activeFolder)
  const groupIconTone = childActive
    ? "text-[var(--color-graphite-900)]"
    : "text-[var(--color-graphite-500)]"
  const asFixtures = folders.map((folder) => ({ ...folder, name: folder.folderKey }))

  return (
    <SidebarMenuItem
      ref={(node: HTMLElement | null) => {
        itemRef(node)
        registerZone(groupEntry(label))(node)
      }}
      {...dragProps}
      data-drop-row
      data-container={DIRECTORY}
      data-entry={groupEntry(label)}
      style={{
        transform:
          dragState.offset === 0
            ? undefined
            : `translate3d(0, ${dragState.offset}px, 0)`,
        transition: carried
          ? "box-shadow var(--duration-fast) var(--ease-standard)"
          : "transform var(--duration-base) var(--ease-enter), box-shadow var(--duration-base) var(--ease-enter)",
        zIndex: carried ? 30 : undefined,
      }}
      className={cn(
        "rounded-md",
        /* Picked up: the whole group travels, folders and all, because that
           is what a person moving one means. */
        carried &&
          "cursor-grabbing bg-card shadow-[var(--elevation-2)] ring-1 ring-[var(--color-graphite-300)]",
        /* A container about to receive something says so as a whole, because
           what is proposed is the group and not a line in it. */
        isDropTarget &&
          "bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-300)]",
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "group/folder-group relative flex h-[var(--shell-sidebar-row-height)] items-center rounded-md bg-transparent text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-600)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] focus-within:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10",
            childActive ? "text-[var(--color-graphite-900)]" : "",
          )}
        >
          {/*
          The glyph is the disclosure; the name is the way in (DES-207).

          The whole row used to toggle, which was right while a shelf was only
          a heading over some folders. It has a page now, so the row has to
          behave like every other row that names something you can open: the
          label goes there, and the disclosure keeps the corner it already
          announced — the Folders glyph has swapped to a chevron on hover since
          the day it was drawn, which was the affordance saying so all along.
          */}
          <CollapsibleTrigger
            data-sidebar-tier="group"
            aria-label={`Show the folders on ${label}`}
            className="flex h-full shrink-0 items-center rounded-md py-0 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="relative size-4 shrink-0" aria-hidden="true">
              <Folders
                className={`absolute inset-0 !size-4 opacity-90 transition-opacity group-hover/folder-group:opacity-0 group-focus-within/folder-group:opacity-0 ${groupIconTone}`}
                strokeWidth={1.75}
              />
              {open ? (
                <ChevronDown
                  className={`absolute inset-0 !size-4 opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${groupIconTone}`}
                  strokeWidth={1.75}
                />
              ) : (
                <ChevronRight
                  className={`absolute inset-0 !size-4 opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${groupIconTone}`}
                  strokeWidth={1.75}
                />
              )}
            </span>
          </CollapsibleTrigger>
          <button
            type="button"
            data-sidebar-tier="group"
            onClick={() => onOpenGroup?.(label)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md py-0 pr-1 pl-2 text-left text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="truncate">{label}</span>
          </button>
          {/* The grip is the whole entry, so the controls on it have to say
              they are not. */}
          <div data-no-drag className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] group-hover/folder-group:opacity-100 focus-visible:opacity-100"
              aria-label={`Add folder to ${label}`}
              onClick={() => onAddFolder?.(label)}
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </Button>
            {/*
            From the contract, like every other object's menu (DES-197). No
            Copy link: a shelf page is private by construction (DES-196), so a
            link to send is a link that does nothing — and an act with no
            handler simply does not draw, which is how that is expressed.
            */}
            <ObjectMenu
              kind="shelf"
              name={label}
              width="w-44"
              handlers={{
                open: onOpenGroup ? () => onOpenGroup(label) : undefined,
                history: () => setShelfHistoryOpen(true),
                rename: onRenameGroup
                  ? () => onRenameGroup(label, asFixtures)
                  : undefined,
                "copy-link": () => copyShelfLink(label),
                duplicate: () => duplicateShelf(label),
                workflow: onSaveShelfWorkflow
                  ? () => onSaveShelfWorkflow(label)
                  : undefined,
                delete: onDeleteGroup
                  ? () => onDeleteGroup(label, asFixtures)
                  : undefined,
              }}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] group-hover/folder-group:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                  aria-label={`Manage ${label} shelf`}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </Button>
              }
            />
            <HistorySheet
              kind="shelf"
              subject={label}
              name={label}
              open={shelfHistoryOpen}
              onOpenChange={setShelfHistoryOpen}
            />
          </div>
        </div>
        <CollapsibleContent>
          <SidebarMenu className="pb-1">{children}</SidebarMenu>
        </CollapsibleContent>
      </Collapsible>

      {/* A closed group takes drops too, and has nowhere inside it to draw a
          line, so it says the words instead. It is deliberately *not* sprung
          open by the drag: opening it would move every row below it after the
          engine had measured where they sit, which is the same fault that
          retired the folder page's dashed strip. */}
      {isDropTarget && dropTop !== null && open && folders.length > 0 ? (
        <InsertLine top={dropTop} />
      ) : null}
      {isDropTarget && (!open || folders.length === 0) ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 z-20 -translate-y-1/2 text-[11px] leading-4 font-medium text-[var(--color-dana-accent-700)]"
        >
          Into {label}
        </span>
      ) : null}
    </SidebarMenuItem>
  )
}

/* ----------------------------------------------------------- directory -- */

export function FolderDirectory({
  groups,
  loose,
  activeFolder,
  onSelectFolder,
  onAddFolder,
  onAddTask,
  onMoveFolderToLabel,
  onOpenFolderAction,
  onRenameGroup,
  onOpenGroup,
  onOpenFolderInTab,
  onSaveShelfWorkflow,
  onDeleteGroup,
  onCopyFolderLink,
  onDuplicateFolder,
  onDeleteFolder,
  onGroupFolders,
}: {
  /* Alphabetical, which is the seed the stored arrangement is laid over. */
  groups: { label: string; folders: DirectoryFolder[] }[]
  loose: DirectoryFolder[]
  activeFolder?: string
  onSelectFolder?: (name: string) => void
  onAddFolder?: (label: string) => void
  onAddTask?: (folderName: string) => void
  onMoveFolderToLabel?: (folderName: string, label: string | null) => void
  onOpenFolderAction?: (folderName: string, action: FolderAction) => void
  onRenameGroup?: (label: string, folders: ShellFolderFixture[]) => void
  /* A shelf has a page now, so its row can go there (DES-207). */
  onOpenGroup?: (label: string) => void
  onOpenFolderInTab?: (name: string) => void
  onSaveShelfWorkflow?: (label: string) => void
  onDeleteGroup?: (label: string, folders: ShellFolderFixture[]) => void
  /* The object contract's acts, threaded down so every folder row in this
     column offers exactly what a folder offers anywhere else. */
  onCopyFolderLink?: (name: string) => void
  onDuplicateFolder?: (name: string) => void
  /* Deleting happens where you are (DES-216) — see the note in app-shell. */
  onDeleteFolder?: (name: string) => void
  /* Two folders that met. The naming panel is the group dialog the shell
     already owns — one mechanism, a second door onto it (DES-154). */
  onGroupFolders?: (folderNames: string[]) => void
}) {
  const order = useFolderOrder()

  type Entry =
    | { kind: "group"; key: string; label: string; folders: DirectoryFolder[] }
    | { kind: "folder"; key: string; folder: DirectoryFolder }

  const entries: Entry[] = arrange(
    [
      ...groups.map(
        (group): Entry => ({
          kind: "group",
          key: groupEntry(group.label),
          label: group.label,
          folders: arrange(
            group.folders,
            (folder) => folder.folderKey,
            order.within[group.label] ?? [],
          ),
        }),
      ),
      ...loose.map(
        (folder): Entry => ({
          kind: "folder",
          key: folderEntry(folder.folderKey),
          folder,
        }),
      ),
    ],
    (entry) => entry.key,
    order.entries,
  )

  const groupLabels = groups.map((group) => group.label)

  /* Every place a release can land, registering itself as it mounts. The
     folder page's sections do exactly this one level down. */
  const zones = useRef(new Map<string, HTMLElement>())
  const registerZone = (key: string) => (node: HTMLElement | null) => {
    if (node) zones.current.set(key, node)
    else zones.current.delete(key)
  }

  /* Only one drag runs at a time, so one answer is enough for both levels of
     list to draw from. */
  const [drop, setDrop] = useState<Drop | null>(null)
  const lastPoint = useRef<Point>({ x: 0, y: 0 })

  function rowsOf(key: string) {
    const node = zones.current.get(key)
    if (!node) return []
    return [...node.querySelectorAll<HTMLElement>("[data-drop-row]")].filter(
      (row) => row.dataset.container === key,
    )
  }

  /* Which slot in that container the pointer is proposing, and where the line
     goes to say so. Measured live, because the rows have been moving. */
  function proposalIn(key: string, y: number, exclude?: string): Drop {
    const node = zones.current.get(key)
    const rows = rowsOf(key).filter((row) => row.dataset.entry !== exclude)
    const origin = node ? node.getBoundingClientRect().top : 0
    for (let index = 0; index < rows.length; index += 1) {
      const box = rows[index]!.getBoundingClientRect()
      if (y < (box.top + box.bottom) / 2) {
        return { key, at: index, top: box.top - origin }
      }
    }
    const last = rows[rows.length - 1]
    return {
      key,
      at: rows.length,
      top: last ? last.getBoundingClientRect().bottom - origin : 0,
    }
  }

  /*
  Which container the point is in, ignoring the one asking.

  Groups are tested before the directory because a group sits inside it, and
  "inside the directory but inside no group" is precisely what taking a folder
  *out* means — so out needs no target of its own. That is DES-166's lesson:
  a target that exists only while you are already dragging is a target nobody
  can discover, and the space around the containers is already there.
  */
  function containerAt(point: Point, asking: string | null): string | null {
    for (const [key, node] of zones.current) {
      if (key === DIRECTORY || key === asking) continue
      const box = node.getBoundingClientRect()
      if (
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top &&
        point.y <= box.bottom
      ) {
        return key
      }
    }
    const directory = zones.current.get(DIRECTORY)
    if (!directory) return null
    const box = directory.getBoundingClientRect()
    return point.x >= box.left &&
      point.x <= box.right &&
      point.y >= box.top &&
      point.y <= box.bottom
      ? DIRECTORY
      : null
  }

  function rearrange(next: FolderOrder, label: string) {
    const before = order
    saveFolderOrder(next)
    pushUndo(label, () => saveFolderOrder(before))
  }

  function currentWithin(groupKey: string) {
    const entry = entries.find((candidate) => candidate.key === groupKey)
    if (!entry || entry.kind !== "group") return []
    return entry.folders.map((folder) => folder.folderKey)
  }

  /*
  A folder changing container: two facts moving together.

  Which group it belongs to already lives in `folder-membership`, so this
  writes the arrangement and hands the label change to the shell rather than
  keeping a second copy of it — two stores for one fact is how the two come to
  disagree. Both halves go back on one undo, because to the person it was one
  act.
  */
  function moveFolder(
    folder: DirectoryFolder,
    from: string,
    to: string,
    at: number,
  ) {
    if (from === to) return
    const before = order
    const previousLabel = from === DIRECTORY ? null : entryLabel(from)
    const nextLabel = to === DIRECTORY ? null : entryLabel(to)
    const key = folderEntry(folder.folderKey)

    const next: FolderOrder = {
      entries: entries.map((entry) => entry.key).filter((entry) => entry !== key),
      within: { ...order.within },
    }
    if (previousLabel !== null) {
      next.within[previousLabel] = currentWithin(from).filter(
        (name) => name !== folder.folderKey,
      )
    }
    if (nextLabel === null) {
      next.entries.splice(at, 0, key)
    } else {
      const sequence = currentWithin(to).filter((name) => name !== folder.folderKey)
      sequence.splice(at, 0, folder.folderKey)
      next.within[nextLabel] = sequence
    }

    saveFolderOrder(next)
    onMoveFolderToLabel?.(folder.folderKey, nextLabel)
    pushUndo(
      nextLabel === null
        ? `${folder.name} moved out of ${previousLabel}`
        : `${folder.name} moved to ${nextLabel}`,
      () => {
        saveFolderOrder(before)
        onMoveFolderToLabel?.(folder.folderKey, previousLabel)
      },
    )
  }

  /* ------------------------------------------------------ the directory -- */

  const directoryDrag = useSortableList({
    count: entries.length,
    onLift: swallowNextClick,
    describe: (index) => {
      const entry = entries[index]
      if (!entry) return "Folder"
      return entry.kind === "group" ? entry.label : entry.folder.name
    },
    onOver: (from, point) => {
      lastPoint.current = point
      const entry = entries[from]
      /* A group cannot be put inside anything — Dana nests one level, and the
         honest answer to dragging a group onto a group is that it moves past
         it. */
      if (!entry || entry.kind === "group") {
        setDrop(null)
        return null
      }
      const container = containerAt(point, null)
      if (!container || container === DIRECTORY) {
        setDrop(null)
        return null
      }
      const next = proposalIn(container, point.y)
      setDrop((current) =>
        current?.key === next.key && current.at === next.at && current.top === next.top
          ? current
          : next,
      )
      return container
    },
    onDropAt: (from, point) => {
      setDrop(null)
      const entry = entries[from]
      if (!entry || entry.kind === "group") return false
      const container = containerAt(point, null)
      if (!container || container === DIRECTORY) return false
      moveFolder(entry.folder, DIRECTORY, container, proposalIn(container, point.y).at)
      return true
    },
    onReorder: (from, to) => {
      rearrange(
        { ...order, entries: moved(entries.map((entry) => entry.key), from, to) },
        "Folders rearranged",
      )
    },
    /*
    Resting on a folder proposes that the two become a group.

    The engine arms on whatever pair it is over, and only folder-on-folder
    means anything here. But a hold that ends in nothing at all is the worst
    available answer, because the person waited for it — so an unusable pair
    falls back to the slot their pointer is over, which is what the drag was
    proposing before they paused.
    */
    onDwell: (from, to) => {
      setDrop(null)
      const carried = entries[from]
      const onto = entries[to]
      if (!carried) return
      if (carried.kind === "folder" && onto?.kind === "folder") {
        onGroupFolders?.([carried.folder.folderKey, onto.folder.folderKey])
        return
      }
      const at = proposalIn(DIRECTORY, lastPoint.current.y, carried.key).at
      rearrange(
        { ...order, entries: moved(entries.map((entry) => entry.key), from, at) },
        "Folders rearranged",
      )
    },
  })

  /* A group being carried must not be drawn as a merge proposal: the engine
     arms on any pair, and only two folders make a group. */
  const carried =
    directoryDrag.activeIndex === null ? null : entries[directoryDrag.activeIndex]
  const canGroup = carried?.kind === "folder"

  return (
    <SidebarMenu ref={registerZone(DIRECTORY)} className="relative">
      {entries.map((entry, index) => {
        const state = directoryDrag.itemState(index)
        const holding = canGroup && state.isDwelling && !state.isArmed
        const armed = canGroup && state.isArmed
        const proposal = !state.isActive
          ? null
          : directoryDrag.overKey
            ? `Into ${entryLabel(directoryDrag.overKey)}`
            : armed
              ? "Release to group"
              : holding
                ? "Hold to group"
                : null

        if (entry.kind === "group") {
          const handle = directoryDrag.handleProps(index)
          return (
            <FolderGroupEntry
              key={entry.key}
              label={entry.label}
              folders={entry.folders}
              activeFolder={activeFolder}
              isDropTarget={drop?.key === entry.key}
              dropTop={drop?.key === entry.key ? drop.top : null}
              itemRef={directoryDrag.setItemRef(index)}
              dragProps={grip(handle)}
              dragState={state}
              registerZone={registerZone}
              onAddFolder={onAddFolder}
              onRenameGroup={onRenameGroup}
              onOpenGroup={onOpenGroup}
              onOpenFolderInTab={onOpenFolderInTab}
              onSaveShelfWorkflow={onSaveShelfWorkflow}
              onDeleteGroup={onDeleteGroup}
            >
              <GroupFolders
                label={entry.label}
                folders={entry.folders}
                activeFolder={activeFolder}
                groupLabels={groupLabels}
                order={order}
                currentWithin={currentWithin}
                containerAt={containerAt}
                proposalIn={proposalIn}
                setDrop={setDrop}
                rearrange={rearrange}
                moveFolder={moveFolder}
                onSelectFolder={onSelectFolder}
                onAddTask={onAddTask}
                onMoveFolderToLabel={onMoveFolderToLabel}
                onOpenFolderAction={onOpenFolderAction}
                onCopyFolderLink={onCopyFolderLink}
                onDuplicateFolder={onDuplicateFolder}
                onDeleteFolder={onDeleteFolder}
                onOpenFolderInTab={onOpenFolderInTab}
              />
            </FolderGroupEntry>
          )
        }

        const folder = entry.folder
        const handle = directoryDrag.handleProps(index)
        return (
          <FolderRow
            key={entry.key}
            {...folder}
            active={activeFolder === folder.folderKey}
            groupLabels={groupLabels}
            currentLabel={null}
            itemRef={directoryDrag.setItemRef(index)}
            rowProps={{
              ...grip(handle),
              "data-drop-row": true,
              "data-container": DIRECTORY,
              "data-entry": entry.key,
            }}
            handleProps={{
              "data-sort-handle": true,
              onKeyDown: handle.onKeyDown,
            }}
            dragState={state}
            proposal={proposal}
            holding={holding}
            armed={armed}
            onSelect={() => onSelectFolder?.(folder.folderKey)}
            onAddTask={() => onAddTask?.(folder.folderKey)}
            onMoveToLabel={(label) => onMoveFolderToLabel?.(folder.folderKey, label)}
            onRename={() => onOpenFolderAction?.(folder.folderKey, "rename")}
            onEditAppearance={() => onOpenFolderAction?.(folder.folderKey, "appearance")}
            onDelete={
              onDeleteFolder ? () => onDeleteFolder(folder.folderKey) : undefined
            }
            onOpenInTab={
              onOpenFolderInTab ? () => onOpenFolderInTab(folder.folderKey) : undefined
            }
            onCopyLink={
              onCopyFolderLink ? () => onCopyFolderLink(folder.folderKey) : undefined
            }
            onDuplicate={
              onDuplicateFolder ? () => onDuplicateFolder(folder.folderKey) : undefined
            }
          />
        )
      })}
      {drop?.key === DIRECTORY ? <InsertLine top={drop.top} /> : null}
      <span aria-live="polite" className="sr-only">
        {directoryDrag.announcement}
      </span>
    </SidebarMenu>
  )
}

/* ---------------------------------------------------- a group's folders -- */

function GroupFolders({
  label,
  folders,
  activeFolder,
  groupLabels,
  order,
  currentWithin,
  containerAt,
  proposalIn,
  setDrop,
  rearrange,
  moveFolder,
  onSelectFolder,
  onAddTask,
  onMoveFolderToLabel,
  onOpenFolderAction,
  onCopyFolderLink,
  onDuplicateFolder,
  onDeleteFolder,
  onOpenFolderInTab,
}: {
  label: string
  folders: DirectoryFolder[]
  activeFolder?: string
  groupLabels: string[]
  order: FolderOrder
  currentWithin: (groupKey: string) => string[]
  containerAt: (point: Point, asking: string | null) => string | null
  proposalIn: (key: string, y: number, exclude?: string) => Drop
  setDrop: (value: Drop | null) => void
  rearrange: (next: FolderOrder, label: string) => void
  moveFolder: (
    folder: DirectoryFolder,
    from: string,
    to: string,
    at: number,
  ) => void
  onSelectFolder?: (name: string) => void
  onAddTask?: (folderName: string) => void
  onMoveFolderToLabel?: (folderName: string, label: string | null) => void
  onOpenFolderAction?: (folderName: string, action: FolderAction) => void
  onCopyFolderLink?: (name: string) => void
  onDuplicateFolder?: (name: string) => void
  /* Deleting happens where you are (DES-216) — see the note in app-shell. */
  onDeleteFolder?: (name: string) => void
  onOpenFolderInTab?: (name: string) => void
}) {
  const self = groupEntry(label)

  /* No hold in here, and no option for one: two folders already in a group
     cannot become a group, and Dana nests one level deep. */
  const drag = useSortableList({
    count: folders.length,
    onLift: swallowNextClick,
    describe: (index) => folders[index]?.name ?? "Folder",
    onOver: (_from, point) => {
      const container = containerAt(point, self)
      if (!container) {
        setDrop(null)
        return null
      }
      setDrop(proposalIn(container, point.y))
      return container
    },
    onDropAt: (from, point) => {
      setDrop(null)
      const folder = folders[from]
      if (!folder) return false
      const container = containerAt(point, self)
      if (!container) return false
      moveFolder(folder, self, container, proposalIn(container, point.y).at)
      return true
    },
    onReorder: (from, to) => {
      rearrange(
        {
          ...order,
          within: { ...order.within, [label]: moved(currentWithin(self), from, to) },
        },
        "Folders rearranged",
      )
    },
  })

  return (
    <>
      {folders.map((folder, index) => {
        const state = drag.itemState(index)
        const handle = drag.handleProps(index)
        return (
          <FolderRow
            key={folder.folderKey}
            {...folder}
            nested
            tree
            treeLast={index === folders.length - 1}
            active={activeFolder === folder.folderKey}
            groupLabels={groupLabels}
            currentLabel={label}
            itemRef={drag.setItemRef(index)}
            rowProps={{
              ...grip(handle),
              "data-drop-row": true,
              "data-container": self,
              "data-entry": folderEntry(folder.folderKey),
            }}
            handleProps={{
              "data-sort-handle": true,
              onKeyDown: handle.onKeyDown,
            }}
            dragState={state}
            proposal={
              state.isActive && drag.overKey
                ? drag.overKey === DIRECTORY
                  ? "Out of group"
                  : `Into ${entryLabel(drag.overKey)}`
                : null
            }
            onSelect={() => onSelectFolder?.(folder.folderKey)}
            onAddTask={() => onAddTask?.(folder.folderKey)}
            onMoveToLabel={(next) => onMoveFolderToLabel?.(folder.folderKey, next)}
            onRename={() => onOpenFolderAction?.(folder.folderKey, "rename")}
            onEditAppearance={() =>
              onOpenFolderAction?.(folder.folderKey, "appearance")
            }
            onDelete={
              onDeleteFolder ? () => onDeleteFolder(folder.folderKey) : undefined
            }
            onOpenInTab={
              onOpenFolderInTab ? () => onOpenFolderInTab(folder.folderKey) : undefined
            }
            onCopyLink={
              onCopyFolderLink ? () => onCopyFolderLink(folder.folderKey) : undefined
            }
            onDuplicate={
              onDuplicateFolder ? () => onDuplicateFolder(folder.folderKey) : undefined
            }
          />
        )
      })}
      <span aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
    </>
  )
}

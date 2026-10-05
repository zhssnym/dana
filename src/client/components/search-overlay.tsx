// The search overlay. Results come from `lib/search-items.ts`; with nothing typed it
// offers the viewer's pages in Library order and the shortcuts sheet.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router"

import { Button } from "./ui/button.js"
import { Input } from "./ui/input.js"
import { pageGlyph } from "../lib/nav-model.js"
import {
  CalendarDays,
  FileText,
  Folders,
  Keyboard,
  Search,
  type LucideIcon,
} from "../lib/icons.js"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js"
import { Skeleton } from "./ui/skeleton.js"
import { cn } from "./ui/utils.js"
import { SHORTCUTS_RESULT, useSearchAnswer } from "../lib/search-items.js"
import { formatDay } from "../lib/dates.js"
import { todayInBrowserZone } from "../api/tz.js"
import { useBundle, useFolders, useShelves } from "../api/queries.js"
import { folderMark } from "../parts/presenters.js"
import { markIcon } from "./page/icon-manifest.js"
import { buildTree } from "../shell/page-tree.js"
import { arrangeColumn } from "../shell/library-order.js"
import { onOpenSearch, openShortcuts } from "../shell/overlays.js"
import { paths } from "../routes.js"
import { openTask } from "./task-open.js"
import { StateMark } from "./thread/timeline/state.js"
import type { TaskState } from "./thread/timeline/state.js"

export type SearchResultStatus = "pending" | "abandoned" | "completed"

export type SearchResultKind = "task" | "folder" | "shelf" | "page"

export type SearchResultItem = {
  kind: SearchResultKind
  id: string
  title: string
  // Everything else this result should match on, joined.
  haystack?: string
  // A task's folder, or a page's place in the page tree.
  hint?: string
  status?: SearchResultStatus
  folder?: { name: string; color: string }
  dueDate?: string
  color?: string
  // Absent means the plain page glyph.
  icon?: LucideIcon
  // Match rank, best first (`nameRank`); absent sorts as a name match.
  rank?: number
  // A page's own prose that matched, not a page called that.
  passage?: boolean
}

const statusOrder: SearchResultStatus[] = ["pending", "abandoned", "completed"]

// Kind decides the headings; status orders Tasks. A folder is a page on screen, so
// both sit under Pages; passages get their own heading.
type SearchGroup = "task" | "page" | "shelf" | "passage" | "help"

const groupOrder: SearchGroup[] = ["task", "page", "shelf", "passage", "help"]

// Tie-break between kinds' best rows: pages, then collections, tasks, passages, Help.
const groupTieOrder: Record<SearchGroup, number> = { page: 0, shelf: 1, task: 2, passage: 3, help: 4 }

const groupLabels: Record<SearchGroup, string> = {
  task: "Tasks",
  page: "Pages",
  shelf: "Collections",
  passage: "In pages",
  help: "Help",
}

function groupOf(item: SearchResultItem): SearchGroup {
  if (item.id === SHORTCUTS_RESULT) return "help"
  if (item.passage === true) return "passage"
  if (item.kind === "task") return "task"
  if (item.kind === "shelf") return "shelf"
  return "page"
}

const SEARCH_DEBOUNCE_MS = 150

// With nothing typed: this many of the viewer's pages, in Library order.
const RECENT_LIMIT = 8

const SHORTCUTS_ITEM: SearchResultItem = {
  kind: "page",
  id: SHORTCUTS_RESULT,
  title: "Keyboard shortcuts",
}

function resultGlyph(item: SearchResultItem): LucideIcon {
  if (item.kind === "shelf") return Folders
  if (item.id === SHORTCUTS_RESULT) return Keyboard
  if (item.kind === "page") return item.icon ?? pageGlyph(item.title) ?? FileText
  return item.icon ?? FileText
}

const STATE_OF: Record<SearchResultStatus, TaskState> = {
  pending: "open",
  abandoned: "dropped",
  completed: "done",
}

const statusLabels: Record<SearchResultStatus, string> = {
  pending: "To do",
  abandoned: "Dropped",
  completed: "Done",
}

function StatusBadge({ status }: { status: SearchResultStatus }) {
  // Announced, not drawn: the StateMark beside the title already shows it.
  return <span className="sr-only">{statusLabels[status]}</span>
}

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--space-row)]" aria-label="Searching">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex h-[var(--row-height)] items-center gap-[var(--space-inline)] px-2"
        >
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3.5 w-[44%]" />
        </div>
      ))}
    </div>
  )
}

function useLibraryPages(open: boolean): SearchResultItem[] {
  const folders = useFolders().data
  const shelves = useShelves(open).data
  const order = useBundle().data?.sidebar_order
  return useMemo(() => {
    if (folders === undefined) return []
    const tree = buildTree(folders)
    // The Desk heads the Library, so it heads this list too.
    const desk = folders.filter((folder) => folder.is_default)
    const roots = tree.roots.filter((folder) => !folder.is_default)
    return [
      ...desk,
      ...arrangeColumn(roots, order ?? [], shelves ?? []).flatMap((entry) =>
        entry.kind === "folder" ? [entry.folder] : entry.folders,
      ),
    ]
      .slice(0, RECENT_LIMIT)
      .map((folder): SearchResultItem => ({
        kind: "folder",
        id: folder.id,
        title: folder.name,
        color: folderMark(folder).color,
        ...(folder.icon == null ? {} : { icon: markIcon(folder.icon) }),
      }))
  }, [folders, shelves, order])
}

function SearchDialog({
  open,
  onOpenChange,
  onOpenResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenResult: (id: string, kind: SearchResultKind) => void
}) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === debouncedQuery) {
      setSearching(false)
      return
    }

    setSearching(trimmed.length > 0)
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(trimmed)
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [query, debouncedQuery])

  // A title match ranks above a body match; `useSearchAnswer` does that.
  const answer = useSearchAnswer(debouncedQuery, open)
  const libraryPages = useLibraryPages(open)
  const fresh =
    debouncedQuery === "" ? [...libraryPages, SHORTCUTS_ITEM] : answer.results
  // Keep the last answer on screen while the next one loads, so typing narrows the
  // list instead of blanking it.
  const waiting = searching || answer.pending
  const shown = useRef<SearchResultItem[]>([])
  if (!waiting) shown.current = fresh
  const results = waiting ? shown.current : fresh

  // Inside a kind the better match leads; tasks of one rank follow status order.
  // The sort is stable.
  const groupedResults = groupOrder.map((group) => ({
    kind: group,
    rows: results
      .filter((result) => groupOf(result) === group)
      .sort(
        (a, b) =>
          (a.rank ?? 0) - (b.rank ?? 0) ||
          (group === "task"
            ? statusOrder.indexOf(a.status ?? "pending") - statusOrder.indexOf(b.status ?? "pending")
            : 0),
      ),
  }))
  // The kind whose first row matches best comes first, so the cursor and Enter land on
  // the thing named what you typed.
  const bestOf = (group: (typeof groupedResults)[number]): number =>
    group.rows[0]?.rank ?? Number.MAX_SAFE_INTEGER
  groupedResults.sort(
    (a, b) => bestOf(a) - bestOf(b) || groupTieOrder[a.kind] - groupTieOrder[b.kind],
  )
  const orderedResults = groupedResults.flatMap((group) => group.rows)

  // Only arrow keys scroll the list; a hover already has its row under the pointer.
  const listRef = useRef<HTMLDivElement>(null)
  function moveTo(index: number) {
    setActiveIndex(index)
    const row = listRef.current?.querySelector<HTMLElement>(`#dana-search-result-${String(index)}`)
    // The first row's heading comes back into sight with it.
    if (index === 0 && listRef.current) listRef.current.scrollTop = 0
    else row?.scrollIntoView({ block: "nearest" })
  }

  // Only a pointer that actually moved takes the cursor: a new answer under a resting
  // pointer can fire mouse events at the same spot.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  function pointerMoved(event: React.MouseEvent, index: number) {
    const last = pointer.current
    if (last !== null && last.x === event.clientX && last.y === event.clientY) return
    pointer.current = { x: event.clientX, y: event.clientY }
    if (index !== activeIndex) setActiveIndex(index)
  }

  // A new answer puts the cursor on its first row and scrolls the list to the top.
  useEffect(() => {
    if (waiting) return
    setActiveIndex(0)
    if (listRef.current) listRef.current.scrollTop = 0
  }, [debouncedQuery, waiting])

  function openResult(item: SearchResultItem) {
    onOpenChange(false)
    onOpenResult(item.id, item.kind)
  }

  // Enter before the answer arrives waits for it, rather than opening a stale row.
  const pendingEnter = useRef(false)
  useEffect(() => {
    if (waiting || !pendingEnter.current) return
    pendingEnter.current = false
    const first = orderedResults[0]
    if (first) openResult(first)
  })

  function arrows(event: KeyboardEvent<HTMLElement>): boolean {
    if (orderedResults.length === 0) return false
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveTo((activeIndex + 1) % orderedResults.length)
      return true
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      moveTo((activeIndex - 1 + orderedResults.length) % orderedResults.length)
      return true
    }
    return false
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (arrows(event)) return
    if (event.key !== "Enter") return
    event.preventDefault()
    if (waiting) {
      pendingEnter.current = true
      // Skip the rest of the debounce: the person has finished typing.
      const trimmed = query.trim()
      if (trimmed !== debouncedQuery) setDebouncedQuery(trimmed)
      return
    }
    const chosen = orderedResults[activeIndex] ?? orderedResults[0]
    if (chosen) openResult(chosen)
  }

  let resultIndex = -1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full screen below md; a floating panel from md up. */}
      <DialogContent className="flex flex-col overflow-hidden p-0 max-md:inset-0 max-md:h-dvh max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:shadow-none md:top-[12vh] md:w-[calc(100vw-2rem)] md:max-w-xl md:translate-y-0 md:rounded-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Dana</DialogTitle>
          <DialogDescription>
            Search the tasks and pages you can access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-[var(--space-inline)] border-b border-border px-4 py-[var(--space-inline)]">
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input bare
            ref={inputRef}
            value={query}
            onChange={(event) => {
              pendingEnter.current = false
              setQuery(event.target.value)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search Dana"
            aria-label="Search Dana"
            aria-controls="dana-search-results"
            aria-activedescendant={
              orderedResults.length > 0
                ? `dana-search-result-${String(activeIndex)}`
                : undefined
            }
            className="h-[var(--row-height)] min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {/* The one way out on a phone, which has no Esc and no outside to tap. */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground md:hidden"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>

        <div
          id="dana-search-results"
          ref={listRef}
          className="overflow-y-auto p-2 max-md:flex-1 md:max-h-[60vh]"
        >
          {waiting && results.length === 0 ? (
            <SearchSkeleton />
          ) : answer.failed ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              Something went wrong. Try searching again.
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">No matches for that search.</p>
          ) : (
            <div className="flex flex-col gap-[var(--space-inline)]">
              {groupedResults.map((group) =>
                group.rows.length > 0 ? (
                  <section key={group.kind} aria-labelledby={`search-${group.kind}`}>
                    <h3
                      id={`search-${group.kind}`}
                      className="flex h-[var(--control-height)] items-center px-2 text-xs font-medium text-muted-foreground"
                    >
                      {groupLabels[group.kind]}
                    </h3>
                    <div className="flex flex-col gap-[var(--space-row)]">
                      {group.rows.map((item) => {
                        resultIndex += 1
                        const itemIndex = resultIndex
                        const active = activeIndex === itemIndex
                        const Glyph = resultGlyph(item)
                        return (
                          <button
                            // Several block hits share their page's path as id, so the position keeps keys unique.
                            key={`${item.kind}:${item.id}:${String(itemIndex)}`}
                            id={`dana-search-result-${String(itemIndex)}`}
                            type="button"
                            data-focus="self"
                            // Focus stays in the field so typing keeps refining: rows are not Tab stops and a
                            // press does not take focus.
                            tabIndex={-1}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseMove={(event) => pointerMoved(event, itemIndex)}
                            onClick={() => openResult(item)}
                            className={cn(
                              "flex h-[var(--row-height)] w-full items-center gap-[var(--space-inline)] rounded-md px-2 text-left text-sm font-normal text-foreground outline-none",
                              active && "bg-selected",
                            )}
                          >
                            {item.kind === "task" ? (
                              // The task's own state mark: a dropped task never shows the done check.
                              <StateMark state={STATE_OF[item.status ?? "pending"]} />
                            ) : (
                              <Glyph
                                className="size-4 shrink-0 text-muted-foreground"
                                style={item.color ? { color: item.color } : undefined}
                                strokeWidth={1.75}
                                aria-hidden="true"
                              />
                            )}
                            <span className="min-w-0 truncate">{item.title}</span>
                            {item.hint ? (
                              // The hint keeps a share of a long row: a block hit is useless without its page.
                              <span
                                className={cn(
                                  "max-w-[40%] shrink-0 truncate text-xs font-normal text-muted-foreground",
                                  // On a phone a passage's own text needs the room.
                                  item.passage && "max-md:max-w-[30%]",
                                )}
                              >
                                {item.hint}
                              </span>
                            ) : null}
                            <span className="flex-1" />
                            {item.dueDate ? (
                              <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                                <CalendarDays className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                                {formatDay(item.dueDate, todayInBrowserZone())}
                              </span>
                            ) : null}
                            {item.status ? <StatusBadge status={item.status} /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ) : null,
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Opened through `shell/overlays.ts`. Blur the input before closing, because that
// seam ignores "/" while an input is focused.
export function SearchOverlay(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const openRef = useRef(open)
  openRef.current = open

  function change(next: boolean) {
    if (!next) {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
    }
    setOpen(next)
  }

  // Ctrl+K a second time closes it.
  useEffect(() => onOpenSearch((toggle) => change(!(toggle && openRef.current))), [])

  return (
    <SearchDialog
      // Remounted per opening, so the query and cursor start empty.
      key={open ? "open" : "closed"}
      open={open}
      onOpenChange={change}
      onOpenResult={(id, kind) => {
        if (id === SHORTCUTS_RESULT) openShortcuts()
        else if (kind === "task") openTask(id)
        else if (kind === "folder") void navigate(paths.folder(id))
        else if (kind === "shelf") void navigate(paths.shelf(id))
        else {
          void navigate(id)
          // A passage on the page already open: a pushed hash fires no hashchange, and
          // `useBlockAnchor` listens for one.
          if (id.includes("#block-")) {
            window.setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 0)
          }
        }
      }}
    />
  )
}

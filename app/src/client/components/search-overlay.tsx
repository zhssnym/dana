/*
9.9's search overlay, in one file: the shell's opener and router wiring
(`SearchOverlay`) over the dialog (`SearchDialog`). Results come from
`lib/search-items.ts`; with nothing typed it offers the viewer's pages in
Library order and the shortcuts sheet under Help.
*/
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useNavigate } from "react-router"

import { Button } from "./ui/button.js"
import { Input } from "./ui/input.js"
import { pageGlyph } from "../lib/nav-model.js"
import {
  CalendarDays,
  CheckCircle2,
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

export type SearchResultStatus = "pending" | "abandoned" | "completed"

/* Four kinds: every kind Dana has that you can go to. */
export type SearchResultKind = "task" | "folder" | "shelf" | "page"

export type SearchResultItem = {
  kind: SearchResultKind
  id: string
  title: string
  /* Everything else this result should match on, joined. */
  haystack?: string
  /* A task's folder, a page's place in the page tree. */
  hint?: string
  status?: SearchResultStatus
  folder?: { name: string; color: string }
  dueDate?: string
  /* A folder's own colour, for its mark. */
  color?: string
  /* The glyph a folder's owner chose; absent means the plain page glyph. */
  icon?: LucideIcon
}

const statusOrder: SearchResultStatus[] = ["pending", "abandoned", "completed"]

/* Kind decides the headings; status decides the order inside Tasks. A folder
   is a page on screen, so both sit under Pages. */
type SearchGroup = "task" | "page" | "shelf" | "help"

const groupOrder: SearchGroup[] = ["task", "page", "shelf", "help"]

const groupLabels: Record<SearchGroup, string> = {
  task: "Tasks",
  page: "Pages",
  shelf: "Collections",
  help: "Help",
}

function groupOf(item: SearchResultItem): SearchGroup {
  if (item.id === SHORTCUTS_RESULT) return "help"
  if (item.kind === "task") return "task"
  if (item.kind === "shelf") return "shelf"
  return "page"
}

/* Short enough to feel immediate, long enough not to ask on every letter. */
const SEARCH_DEBOUNCE_MS = 150

/* With nothing typed: this many of the viewer's pages, in Library order. */
const RECENT_LIMIT = 8

const SHORTCUTS_ITEM: SearchResultItem = {
  kind: "page",
  id: SHORTCUTS_RESULT,
  title: "Keyboard shortcuts",
}

function resultGlyph(item: SearchResultItem): LucideIcon {
  if (item.kind === "task") return CheckCircle2
  if (item.kind === "shelf") return Folders
  if (item.id === SHORTCUTS_RESULT) return Keyboard
  if (item.kind === "page") return pageGlyph(item.title) ?? FileText
  return item.icon ?? FileText
}

const statusLabels: Record<SearchResultStatus, string> = {
  pending: "Pending",
  abandoned: "Abandoned",
  completed: "Completed",
}

function StatusBadge({ status }: { status: SearchResultStatus }) {
  /* Pending is announced, not drawn: a word saying "ordinary" says nothing. */
  if (status === "pending") return <span className="sr-only">{statusLabels[status]}</span>
  return (
    <span className="shrink-0 text-xs font-normal text-muted-foreground">
      {statusLabels[status]}
    </span>
  )
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

/* The viewer's pages as the Library orders them, capped. */
function useLibraryPages(open: boolean): SearchResultItem[] {
  const folders = useFolders().data
  const shelves = useShelves(open).data
  const order = useBundle().data?.sidebar_order
  return useMemo(() => {
    if (folders === undefined) return []
    const tree = buildTree(folders)
    /* The Desk heads the Library, so it heads this list too. */
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
      setActiveIndex(0)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [query, debouncedQuery])

  /* A title match ranks above a body match; `useSearchAnswer` does that. */
  const answer = useSearchAnswer(debouncedQuery, open)
  const libraryPages = useLibraryPages(open)
  const fresh =
    debouncedQuery === "" ? [...libraryPages, SHORTCUTS_ITEM] : answer.results
  /* While the next answer is on its way the last one stays on screen, so
     typing narrows the list rather than blanking it on every letter. */
  const waiting = searching || answer.pending
  const shown = useRef<SearchResultItem[]>([])
  if (!waiting) shown.current = fresh
  const results = waiting ? shown.current : fresh

  const groupedResults = groupOrder.map((group) => ({
    kind: group,
    rows:
      group === "task"
        ? results
            .filter((result) => result.kind === "task")
            .sort(
              (a, b) =>
                statusOrder.indexOf(a.status ?? "pending") -
                statusOrder.indexOf(b.status ?? "pending"),
            )
        : results.filter((result) => groupOf(result) === group),
  }))
  const orderedResults = groupedResults.flatMap((group) => group.rows)

  function openResult(item: SearchResultItem) {
    onOpenChange(false)
    onOpenResult(item.id, item.kind)
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (orderedResults.length === 0) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % orderedResults.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(
        (current) => (current - 1 + orderedResults.length) % orderedResults.length,
      )
    } else if (event.key === "Enter") {
      event.preventDefault()
      const chosen = orderedResults[activeIndex] ?? orderedResults[0]
      if (chosen) openResult(chosen)
    }
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
            onChange={(event) => setQuery(event.target.value)}
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
          {/* Full screen on a phone, where there is no Esc and no outside to
              tap: the one way out. */}
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
                            /* Several block hits share their page's path as
                               an id, so the position is what tells rows apart. */
                            key={`${item.kind}:${item.id}:${String(itemIndex)}`}
                            id={`dana-search-result-${String(itemIndex)}`}
                            type="button"
                            data-focus="self"
                            onMouseEnter={() => setActiveIndex(itemIndex)}
                            onClick={() => openResult(item)}
                            className={cn(
                              "flex h-[var(--row-height)] w-full items-center gap-[var(--space-inline)] rounded-md px-2 text-left text-sm font-normal text-foreground outline-none",
                              active && "bg-selected",
                            )}
                          >
                            <Glyph
                              className="size-4 shrink-0 text-muted-foreground"
                              style={item.kind === "folder" && item.color ? { color: item.color } : undefined}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 truncate">{item.title}</span>
                            {item.hint ? (
                              /* The hint keeps a share of a long row: a block
                                 hit is useless without the page it is on. */
                              <span className="max-w-[40%] shrink-0 truncate text-xs font-normal text-muted-foreground">
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

/* Opened through `shell/overlays.ts`. The input gives up focus before the
   dialog closes, because that seam refuses "/" while an input is focused. */
export function SearchOverlay(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => onOpenSearch(() => setOpen(true)), [])

  return (
    <SearchDialog
      /* Remounted per opening, so the query and the cursor start empty. */
      key={open ? "open" : "closed"}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          const active = document.activeElement
          if (active instanceof HTMLElement) active.blur()
        }
        setOpen(next)
      }}
      onOpenResult={(id, kind) => {
        if (id === SHORTCUTS_RESULT) openShortcuts()
        else if (kind === "task") openTask(id)
        else if (kind === "folder") void navigate(paths.folder(id))
        else if (kind === "shelf") void navigate(paths.shelf(id))
        else void navigate(id)
      }}
    />
  )
}

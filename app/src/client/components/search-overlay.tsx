/*
9.9's search overlay, bound to data through `lib/search-items.ts`. The seams
are marked `Seam` in the body.

1. **Imports are this client's relative ESM paths** (11.4).
2. **The results come from `useSearchAnswer`**, which answers the places
   when nothing is typed and 7.18 otherwise, title matches first, with its
   own `pending` and `failed` states. `items` stays a prop for the places,
   which the shell supplies from 9.1's page block.
3. **`pageGlyph` is this client's**, through `lib/nav-model.ts`. A folder is
   a page on screen, so a folder result is drawn as a page and listed under
   Pages.

What the overlay decides is unchanged and its reasons are in the comments
below: four kinds, grouped by kind with status deciding the order inside
Tasks and a badge on each row rather than a heading over each status; the
places offered before anything is typed; a title match above a body match.
AC-156 and AC-258 read the badge and the order.
*/
import { Input } from "./ui/input.js"
import { pageGlyph } from "../lib/nav-model.js"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Folders,
  Keyboard,
  Search,
  X,
  type LucideIcon,
} from "../lib/icons.js"
import { useIsMobile } from "./ui/use-mobile.js"

import { Button } from "./ui/button.js"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js"
import { Skeleton } from "./ui/skeleton.js"
import { cn } from "./ui/utils.js"
/* Seam 2. */
import { SHORTCUTS_RESULT, useSearchAnswer } from "../lib/search-items.js"
import { formatDay } from "../lib/dates.js"
import { todayInBrowserZone } from "../api/tz.js"

export type SearchResultStatus = "pending" | "abandoned" | "completed"

/*
What search can find: four kinds, which is every kind Dana has that you can
go to. Folders by name, pages by name, and the words written on a folder page
are all findable, not only tasks.
*/
export type SearchResultKind = "task" | "folder" | "shelf" | "page"

export type SearchResultItem = {
  kind: SearchResultKind
  id: string
  title: string
  /* Everything else this result should match on, joined: a task's notes and
     step titles, a folder's prose and description. Searching a title alone is
     what made a paragraph you wrote unfindable. */
  haystack?: string
  /* The second line: a task's folder, a page's place in the page tree, a place's question. */
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

/*
Grouped by **kind**, and the ordering inside Tasks is by status.

Grouping by status at the top level was right while tasks were the only thing
search could return. With three kinds it would have made "Pending", "Abandoned",
"Completed", "Folders" and "Pages" peers: two classification schemes presented
as one list.
So kind decides the headings, and status decides the order within Tasks, where
each row wears its own badge anyway.
*/
/* A folder is a page on screen, so folders and pages share the one Pages
   heading: a folder found by name first, then the places, then a page's
   prose. `kind` still decides what opening a row does. */
type SearchGroup = "task" | "page" | "shelf"

const groupOrder: SearchGroup[] = ["task", "page", "shelf"]

const groupOf: Record<SearchResultKind, SearchGroup> = {
  task: "task",
  folder: "page",
  page: "page",
  shelf: "shelf",
}

const groupLabels: Record<SearchGroup, string> = {
  task: "Tasks",
  page: "Pages",
  shelf: "Collections",
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

/* "Today", "Tomorrow", "Mon", "24 Sep", "24 Sep 2027": the one formatter. */
function formatDueDate(value: string) {
  return formatDay(value, todayInBrowserZone())
}

function StatusBadge({ status }: { status: SearchResultStatus }) {
  /* polish: search F8. Pending is the ordinary state and a chip saying so on
     twelve of fourteen rows says nothing; it is announced, not drawn, so the
     row still reads its status to a screen reader (and to AC-156, AC-258)
     while only Completed and Abandoned wear a visible chip. */
  if (status === "pending") return <span className="sr-only">{statusLabels[status]}</span>
  return (
    <span className="shrink-0 text-xs text-muted-foreground">{statusLabels[status]}</span>
  )
}

function SearchSkeleton() {
  return (
    <div className="space-y-2 px-3 py-4" aria-label="Searching">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex h-12 items-center gap-3 px-2">
          <Skeleton className="size-4 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[44%]" />
            <Skeleton className="h-2.5 w-[24%]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function SearchOverlay({
  open,
  onOpenChange,
  items,
  initialQuery = "",
  previewState,
  onOpenResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: SearchResultItem[]
  initialQuery?: string
  previewState?: string | null
  onOpenResult: (id: string, kind: SearchResultKind) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim())
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
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [query, debouncedQuery])

  /*
  Seam 2. An empty box offers the places rather than nothing.

  `Ctrl/Cmd+K` is a palette, and a palette that shows a blank panel until you
  have typed two characters is one you have to already know the answer to.
  The pages are few and fixed, so they cost one glance and turn the control
  into a way of *getting somewhere* as well as a way of finding something.

  A title match ranks above a body match, because somebody typing *venue*
  means the thing called venue before the thing that mentions it;
  `useSearchAnswer` does the matching over 7.18, and the places come from
  `items` when nothing is typed.
  */
  const answer = useSearchAnswer(debouncedQuery, open)
  const isMobile = useIsMobile()
  /* Any typed character filters; `useSearchAnswer` filters what is in hand
     below Q8's two-character floor. */
  const results =
    debouncedQuery.trim() === "" ? items.filter((item) => item.kind === "page") : answer.results

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
        : results.filter((result) => groupOf[result.kind] === group),
  }))
  const orderedResults = groupedResults.flatMap((group) => group.rows)

  function openResult(item: SearchResultItem) {
    onOpenChange(false)
    /* The surface decides what opening one means: a task into its surface, a
       folder or a page by navigating. Search's job ends at saying which. */
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
      <DialogContent className="top-[12vh] w-[min(680px,calc(100vw-32px))] translate-y-0 overflow-hidden rounded-lg p-0 shadow-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Dana</DialogTitle>
          <DialogDescription>
            Search the tasks, pages and collections you can access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search
            className="size-5 shrink-0 text-muted-foreground"
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
                ? `dana-search-result-${orderedResults[activeIndex]?.id}`
                : undefined
            }
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {/* polish: search F7. The ESC key cap that sat here read as a button
              and was not one; the footer's hints are where the keys live, so
              Esc joins them there and the × is the one close control. */}
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close search"
              >
                <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            }
          />
        </div>

        <div id="dana-search-results" className="max-h-[500px] min-h-40 overflow-y-auto p-2">
          {/* Seam 2: the read's own states beside the lab's preview ones. */}
          {searching || answer.pending || previewState === "loading" ? (
            <SearchSkeleton />
          ) : answer.failed || previewState === "error" ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-medium text-foreground">Something went wrong.</p>
                <p className="mt-1 text-xs text-muted-foreground">Try searching again.</p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <div>
                <Search
                  className="mx-auto size-6 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  No matches for that search.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {groupedResults.map((group) =>
                group.rows.length > 0 ? (
                  <section key={group.kind} aria-labelledby={`search-${group.kind}`}>
                    <h3
                      id={`search-${group.kind}`}
                      className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground"
                    >
                      {groupLabels[group.kind]}
                      <span className="ml-1.5 tabular-nums">{group.rows.length}</span>
                    </h3>
                    <div className="space-y-0.5">
                      {group.rows.map((item) => {
                        resultIndex += 1
                        const itemIndex = resultIndex
                        const active = activeIndex === itemIndex
                        return (
                          <button
                            key={item.id}
                            id={`dana-search-result-${item.id}`}
                            type="button"
                            onMouseEnter={() => setActiveIndex(itemIndex)}
                            onClick={() => openResult(item)}
                            className={cn(
                              "group flex min-h-9 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
                              active
                                ? "bg-accent"
                                : "hover:bg-accent",
                            )}
                          >
                            {/* Each result wears the mark of what it is: a
                                task the task glyph, a page the glyph its
                                owner chose or the plain page, a place the
                                glyph the sidebar gives it. A chosen glyph
                                keeps its colour, as in the sidebar. */}
                            {(() => {
                              const Glyph = resultGlyph(item)
                              return (
                                <Glyph
                                  className="size-4 shrink-0 text-muted-foreground"
                                  style={item.kind === "folder" && item.color ? { color: item.color } : undefined}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              )
                            })()}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {item.title}
                              </span>
                              {item.hint ? (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                  {item.hint}
                                </span>
                              ) : null}
                            </span>
                            {item.dueDate ? (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                                {formatDueDate(item.dueDate)}
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

        {/* Key hints are for a keyboard; a phone has none, so no footer. */}
        {isMobile ? null : (
          <footer className="flex min-h-10 items-center border-t border-border bg-muted px-4 text-xs text-muted-foreground">
            <span className="ml-auto flex items-center gap-2" aria-hidden="true">
              <kbd className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs">↑↓</kbd>
              Navigate
              <kbd className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs">↵</kbd>
              Open
              <kbd className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs">Esc</kbd>
              Close
            </span>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}

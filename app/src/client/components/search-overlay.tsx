/*
`docs/design/prototype-v2/src/components/search-overlay.tsx`, lifted whole at
RFC 0004's S27 and bound through `lib/search-items.ts`. It diffs empty
against its original except at the seams named here, each marked `Seam` in
the body.

1. **The `@/` specifiers become this client's relative ESM paths** (11.4),
   and the em dashes leave under protocol section 7.
2. **The results memo is the adapter's hook.** The prototype filters its
   `items` prop over fixtures; here `useSearchAnswer` answers the places when
   nothing is typed and Q8 plus 7.18 otherwise, with the prototype's own
   title-first rank, and its `pending` and `failed` stand where the lab's
   `previewState` stood. `items` stays a prop for the places, which the
   shell supplies from 9.1's page block, so the signature does not move.
3. **`pageGlyph` and `FolderMark` are this client's**, through
   `lib/nav-model.ts` and `components/folder-mark.tsx`, both already lifted.

What the overlay decides is unchanged and its reasons are in the comments
below: four kinds, grouped by kind with status deciding the order inside
Tasks and a badge on each row rather than a heading over each status; the
places offered before anything is typed; a title match above a body match.
9.9 is amended toward the first and the second at RFC 0005 change control
item 52, and AC-156 and AC-258 read the badge and the order.
*/
import { Input } from "./ui/input.js"
import { FolderMark } from "./folder-mark.js"
import { pageGlyph } from "../lib/nav-model.js"
import { Folders } from "../lib/icons.js"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  ArrowRight,
  CalendarDays,
  Search,
  X,
} from "../lib/icons.js"

import { Badge } from "./ui/badge.js"
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
import { useSearchAnswer } from "../lib/search-items.js"

export type SearchResultStatus = "pending" | "abandoned" | "completed"

/*
What search can find (DES-203).

Imran's brief of 2026-08-23, item 7: expand it. It found tasks, by title and
notes, and nothing else, so a folder you had made was unfindable by name, a
page you wanted was unreachable by typing it, and the words you had written on a
folder page were invisible to the one control whose job is finding words.

Four kinds, which is every kind Dana has that you can go to. Shelves were the
one absent, and only because they had nowhere to land; [[DES-207]] gave them a
page, so the reason expired and they joined.
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
  /* The second line: a task's folder, a folder's shelf, a page's question. */
  hint?: string
  status?: SearchResultStatus
  folder?: { name: string; color: string }
  dueDate?: string
  /* A folder's own colour, for its mark. */
  color?: string
}

const statusOrder: SearchResultStatus[] = ["pending", "abandoned", "completed"]

/*
Grouped by **kind**, and the ordering inside Tasks is by status.

Grouping by status at the top level was right while tasks were the only thing
search could return. With three kinds it would have made "Pending", "Abandoned",
"Completed", "Folders" and "Pages" peers: two classification schemes presented
as one list, which is precisely the fault [[DES-152]] took out of the sidebar.
So kind decides the headings, and status decides the order within Tasks, where
each row wears its own badge anyway.
*/
const kindOrder: SearchResultKind[] = ["task", "folder", "shelf", "page"]

const kindLabels: Record<SearchResultKind, string> = {
  task: "Tasks",
  folder: "Folders",
  shelf: "Shelves",
  page: "Pages",
}

const statusLabels: Record<SearchResultStatus, string> = {
  pending: "Pending",
  abandoned: "Abandoned",
  completed: "Completed",
}

function formatDueDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function StatusBadge({ status }: { status: SearchResultStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-5 rounded-full border px-2 text-[0.625rem] font-medium",
        status === "pending" &&
          "border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] text-[var(--color-graphite-700)]",
        status === "abandoned" &&
          "border-[var(--color-warning-200)] bg-[var(--color-warning-100)] text-[var(--color-warning-700)]",
        status === "completed" &&
          "border-[var(--color-success-200)] bg-[var(--color-success-100)] text-[var(--color-success-700)]",
      )}
    >
      {statusLabels[status]}
    </Badge>
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

    setSearching(trimmed.length >= 2)
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

  The prototype filters `items` here and ranks a title match above a body
  match, "because somebody typing *venue* means the thing called venue before
  the thing that mentions it"; `useSearchAnswer` does both over Q8 and 7.18,
  and the places come from `items` when nothing is typed.
  */
  const answer = useSearchAnswer(debouncedQuery, open)
  const results =
    debouncedQuery.trim().length < 2 ? items.filter((item) => item.kind === "page") : answer.results

  const groupedResults = kindOrder.map((kind) => ({
    kind,
    rows:
      kind === "task"
        ? results
            .filter((result) => result.kind === "task")
            .sort(
              (a, b) =>
                statusOrder.indexOf(a.status ?? "pending") -
                statusOrder.indexOf(b.status ?? "pending"),
            )
        : results.filter((result) => result.kind === kind),
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
      <DialogContent className="top-[12vh] w-[min(680px,calc(100vw-32px))] translate-y-0 overflow-hidden rounded-[var(--radius-xl)] p-0 shadow-[var(--elevation-2)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Search Dana</DialogTitle>
          <DialogDescription>
            Search the tasks, folders and pages you can access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search
            className="size-5 shrink-0 text-[var(--color-graphite-500)]"
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
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-[var(--color-graphite-400)]"
          />
          <kbd className="hidden rounded-md border border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] px-2 py-1 text-[0.625rem] font-medium text-[var(--color-graphite-500)] sm:block">
            ESC
          </kbd>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 text-[var(--color-graphite-500)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-800)]"
                aria-label="Close search"
              >
                <X className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
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
                  className="mx-auto size-6 text-[var(--color-graphite-400)]"
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
                      className="flex h-7 items-center px-2 text-[0.625rem] font-semibold tracking-[0.08em] text-[var(--color-graphite-500)] uppercase"
                    >
                      {kindLabels[group.kind]}
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
                              "group flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
                              active
                                ? "bg-[var(--color-graphite-100)]"
                                : "hover:bg-[var(--color-graphite-50)]",
                            )}
                          >
                            {/* Each result wears the mark of what it is: a
                                task wears its folder's, a folder wears its
                                own, and a page wears the glyph the sidebar
                                gives it, all from the one resolver, so a
                                folder found by searching looks like the same
                                folder in the sidebar (DES-155). */}
                            {item.kind === "page" || item.kind === "shelf" ? (
                              (() => {
                                const Glyph =
                                  item.kind === "shelf" ? Folders : pageGlyph(item.title)
                                return Glyph ? (
                                  <Glyph
                                    className="size-4 shrink-0 text-[var(--color-graphite-500)]"
                                    strokeWidth={1.75}
                                    aria-hidden="true"
                                  />
                                ) : null
                              })()
                            ) : (
                              <FolderMark
                                name={item.folder?.name ?? item.title}
                                color={item.folder?.color ?? item.color ?? "var(--color-graphite-900)"}
                                className="size-4 shrink-0"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-[var(--color-graphite-800)]">
                                {item.title}
                              </span>
                              {item.hint ? (
                                <span className="mt-0.5 block truncate text-xs text-[var(--color-graphite-500)]">
                                  {item.hint}
                                </span>
                              ) : null}
                            </span>
                            {item.dueDate ? (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-graphite-500)]">
                                <CalendarDays className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                                {formatDueDate(item.dueDate)}
                              </span>
                            ) : null}
                            {item.status ? <StatusBadge status={item.status} /> : null}
                            <ArrowRight
                              className={cn(
                                "size-4 shrink-0 text-[var(--color-graphite-500)] transition-opacity",
                                active ? "opacity-100" : "opacity-0",
                              )}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
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

        <footer className="flex min-h-10 items-center border-t border-border bg-[var(--color-graphite-25)] px-4 text-xs text-[var(--color-graphite-500)]">
          <span>Showing matches from every folder you can access.</span>
          <span className="ml-auto hidden items-center gap-2 sm:flex" aria-hidden="true">
            <kbd className="rounded border border-[var(--color-graphite-200)] bg-white px-1.5 py-0.5 text-[0.625rem]">↑↓</kbd>
            Navigate
            <kbd className="rounded border border-[var(--color-graphite-200)] bg-white px-1.5 py-0.5 text-[0.625rem]">↵</kbd>
            Open
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

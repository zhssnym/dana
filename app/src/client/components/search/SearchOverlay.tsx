/*
9.9's search overlay, ported at P8R session R8 from the designer's
`src/components/search-overlay.tsx` onto our query layer.

"Opened by the top-bar control or shortcut; input with 300 ms debounce;
results per Q8 grouped under Pending, Abandoned and Completed headings; enter
opens the first result; row click opens the task; footer 'Showing matches from
every folder you can access.'"

His composition and his class strings; the reads are `api/queries.ts`'s and
every display value comes from `parts/presenters.ts`. What the port changes
about his file is enumerated here rather than left to be found, because RFC
0002 makes an unexplained difference from the prototype a defect in the port.

**The surface is his dialog and no longer a hand-drawn scrim.** The P8 overlay
painted `dialog-scrim` and `dialog-panel`, two names from the class vocabulary
that left with the old token file at R2, so it had been unpositioned since and
was being held up by an interim `z-50` wrapper in the shell. This is a base-ui
portal of its own now, which is the condition that wrapper's own comment names
for its removal; the wrapper is the Frontend Architect's file and is left for
that role.

**Nothing here filters or sorts.** His overlay runs on `fixtures.ts` and
therefore does its own matching; ours asks 6 Q8, which returns rows already
ordered by status_rank and refuses a query under two characters. So his
`useMemo` filter is gone and the debounced term is a query key. Section 6's own
sentence is that clients never re-sort, and 7.11 makes a rule existing only in
the client a specification violation, so the grouping below partitions and
never orders: each group keeps the relative order it arrived in.

**Enter opens the first result, which is the first row of the response** and
not the first row of whichever group is drawn on top. They are the same row
because Q8 ranks pending first, and taking it from the response is what keeps
them the same row when they would otherwise not be. His arrow-key cursor is
kept and indexes the same flattened order.

**The debounce is a rate limit in disguise.** 10.4 allows a user 30 searches a
minute, so a client issuing one request per keystroke spends that budget inside
one word and answers the person a 429 for typing. 300 ms is 9.9's own number.

**The floor of two characters is Q8's, not this file's.** The query is disabled
below it rather than sent and refused, because Q8's pattern is '%' q '%' over a
trigram index and a one-character query is a scan of every accessible task with
a pattern the index cannot help.

**The rows are drawn here rather than through `components/task-row.tsx`**, and
that is his choice as much as ours: Q8's row is "title, folder, status chip,
due date if any", which is a smaller thing than 9.4's enumerated row, and a row
carrying a complete checkbox and a star would offer transitions inside a
search.

**One control on this surface is named and one deliberately is not.** 9.1 names
the global search control "Search" and puts it in the sidebar, which is the
shell's; AC-174 counts exactly one button of that name inside the navigation
landmark, so nothing here may answer to it. His close control is "Close
search", which is his string and collides with nothing.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowRight, CalendarDays, Folder, Search, X } from 'lucide-react'

import { useFolders, useSearch } from '../../api/queries.js'
import { onOpenSearch } from '../../shell/overlays.js'
import {
  dueDisplay,
  folderDisplay,
  presenterToday,
} from '../../parts/presenters.js'
import type { TaskCard } from '../../../shared/tasks.js'
import { Badge } from '../ui/badge.js'
import { Button } from '../ui/button.js'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js'
import { cn } from '../ui/utils.js'
import { openTask } from '../task-form/index.js'
import { SEARCH_EMPTY, SEARCH_FOOTER } from './copy.js'

/** 9.9's own number. */
const DEBOUNCE_MS = 300

/** 6 Q8's floor, which the endpoint refuses below. */
const MIN_QUERY = 2

/**
 * The three groups of 9.9, in the order that section writes them, which is
 * also 6's status_rank order and therefore the order the rows arrive in.
 *
 * Each is a named region of 9.1's sections table for this surface, and each
 * carries a heading of the same name, which is what AC-156 addresses.
 */
const GROUPS = [
  { heading: 'Pending', status: 'pending' },
  { heading: 'Abandoned', status: 'abandoned' },
  { heading: 'Completed', status: 'completed' },
] as const

/**
 * His status pill, tinted per status. The three tints are the ones his file
 * carries; the copy is 9.9's own group name, so the chip and the heading above
 * it agree by construction.
 */
function StatusBadge({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-5 rounded-full border px-2 text-[0.625rem] font-medium',
        children === 'Pending' &&
          'border-[var(--color-graphite-200)] bg-[var(--color-graphite-50)] text-[var(--color-graphite-700)]',
        children === 'Abandoned' &&
          'border-[var(--color-warning-200)] bg-[var(--color-warning-100)] text-[var(--color-warning-700)]',
        children === 'Completed' &&
          'border-[var(--color-success-200)] bg-[var(--color-success-100)] text-[var(--color-success-700)]',
      )}
    >
      {children}
    </Badge>
  )
}

export function SearchOverlay(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [debounced, setDebounced] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => onOpenSearch(() => setOpen(true)), [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(typed)
      setCursor(0)
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [typed])

  // His own opening move, and the reason it is a frame later is that the
  // popup is portalled: the element does not exist on the render that opened
  // it. AC-156 asserts the focus three times, once per way in.
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open])

  const term = debounced.trim()
  const results = useSearch(term, open && term.length >= MIN_QUERY)
  const rows = useMemo(() => results.data?.rows ?? [], [results.data])
  const folders = useFolders()
  const today = presenterToday()

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        rows: rows.filter((row) => row.status === group.status),
      })),
    [rows],
  )
  // The flattened order the cursor indexes and enter opens from. Identical to
  // the response's order while Q8 ranks pending first, and identical to what
  // is drawn whether it does or not.
  const ordered = useMemo(() => grouped.flatMap((group) => group.rows), [grouped])

  function close(): void {
    setOpen(false)
    setTyped('')
    setDebounced('')
    setCursor(0)
  }

  function openRow(task: TaskCard): void {
    close()
    openTask(task.id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (ordered.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (current + 1) % ordered.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (current - 1 + ordered.length) % ordered.length)
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    const chosen = ordered[cursor] ?? ordered[0]
    if (chosen !== undefined) openRow(chosen)
  }

  let index = -1

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="top-[12vh] w-[min(680px,calc(100vw-32px))] translate-y-0 overflow-hidden rounded-[var(--radius-xl)] p-0 shadow-[var(--elevation-2)]">
        {/*
        The dialog's own title and description, his and screen-reader only. A
        dialog is announced by its own title, which is why 9.1's names table
        names the fields inside its three dialogs and never the dialogs; these
        are the designer's words for a surface that section leaves unnamed.
        */}
        <DialogHeader className="sr-only">
          <DialogTitle>Search Dana</DialogTitle>
          <DialogDescription>Search tasks you can access.</DialogDescription>
        </DialogHeader>

        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search
            className="size-5 shrink-0 text-[var(--color-graphite-500)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            ref={input}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tasks"
            aria-label="Search tasks"
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

        <div className="max-h-[500px] min-h-40 overflow-y-auto p-2">
          {term.length < MIN_QUERY ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <div>
                <Search
                  className="mx-auto size-6 text-[var(--color-graphite-400)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-[var(--color-graphite-700)]">
                  Search by task title or notes
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter at least two characters.
                </p>
              </div>
            </div>
          ) : results.data !== undefined && rows.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <div>
                <Search
                  className="mx-auto size-6 text-[var(--color-graphite-400)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-muted-foreground">{SEARCH_EMPTY}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map((group) =>
                group.rows.length === 0 ? null : (
                  <section key={group.status} aria-label={group.heading}>
                    <h3 className="flex h-7 items-center gap-1.5 px-2 text-[0.625rem] font-semibold tracking-[0.08em] text-[var(--color-graphite-500)] uppercase">
                      {group.heading}
                      {/* The prototype's count beside the group name,
                          aria-hidden so AC-156's heading name stays the
                          group's own word. */}
                      <span aria-hidden="true" className="font-medium text-[var(--color-graphite-400)]">
                        {group.rows.length}
                      </span>
                    </h3>
                    <div className="space-y-0.5">
                      {group.rows.map((row) => {
                        index += 1
                        const at = index
                        const active = cursor === at
                        const due = dueDisplay(row, today)
                        const folder = folderDisplay(row.folder, folders.data ?? [])
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onMouseEnter={() => {
                              setCursor(at)
                            }}
                            onClick={() => {
                              openRow(row)
                            }}
                            className={cn(
                              'group flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30',
                              active
                                ? 'bg-[var(--color-graphite-100)]'
                                : 'hover:bg-[var(--color-graphite-50)]',
                            )}
                          >
                            <Folder
                              className="size-4 shrink-0"
                              style={{ color: folder.color }}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-[var(--color-graphite-800)]">
                                {row.title}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-[var(--color-graphite-500)]">
                                {folder.name}
                              </span>
                            </span>
                            {due === undefined ? null : (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-graphite-500)]">
                                <CalendarDays
                                  className="size-3.5"
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                                {due.label}
                              </span>
                            )}
                            <StatusBadge>{group.heading}</StatusBadge>
                            <ArrowRight
                              className={cn(
                                'size-4 shrink-0 text-[var(--color-graphite-500)] transition-opacity',
                                active ? 'opacity-100' : 'opacity-0',
                              )}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ),
              )}
            </div>
          )}
        </div>

        <footer className="flex min-h-10 items-center border-t border-border bg-[var(--color-graphite-25)] px-4 text-xs text-[var(--color-graphite-500)]">
          <span>{SEARCH_FOOTER}</span>
          <span className="ml-auto hidden items-center gap-2 sm:flex" aria-hidden="true">
            <kbd className="rounded border border-[var(--color-graphite-200)] bg-white px-1.5 py-0.5 text-[0.625rem]">
              ↑↓
            </kbd>
            Navigate
            <kbd className="rounded border border-[var(--color-graphite-200)] bg-white px-1.5 py-0.5 text-[0.625rem]">
              ↵
            </kbd>
            Open
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

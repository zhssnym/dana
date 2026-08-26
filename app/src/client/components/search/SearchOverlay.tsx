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

**It answers four kinds since S17b, where it answered one.** 7.18's search
extension has returned folders, shelves and page prose since it landed, and
this file consumed `results.data.rows` alone, which is the parity audit's
fourth headline gap in its own words: "the one control whose job is finding
things cannot find most things." 9.9 is the shape: "results group by kind:
tasks (matching title, notes, and step titles), folders and shelves (name and
description), and pages (matching a page's own prose)", with Q8's three status
groups kept *inside* the tasks kind rather than at the top level.

**One warning the audit wrote down before ratifying its own finding, kept here
because a reader will meet it again.** The `useFolders()` read below is the
sidebar's folder list. It is drawn for a task result's folder chip and for the
places offered before a keystroke, and it is **not** `results.data.folders`,
which is the folders the query matched. Rendering the first under a "Folders"
heading would list every folder the viewer has and look exactly like a fix.

**And it offers the places before anything is typed** (DES-203, 9.9): the page
block, the viewer's folders and their shelves, as rows to go to. What stood
there was a box telling a person to type, on the surface whose shortcut is the
fastest way to anywhere in Dana.

**Enter opens the first result and the arrow keys walk every kind.** The order
is collected while the rows are drawn rather than derived beside them, so what
Enter opens is by construction the row on top; a second list built alongside
the render is a second answer that can drift from it. Within tasks that order
is still the response's, Q8 ranking pending first.

**A row opens its thing in place** (9.9). For a task that is 9.3's surface,
which `openTask` raises; for a folder, a shelf or a page it is a route, so the
overlay closes and the router goes there. A page result goes to the page its
prose is on, a block belonging to a folder's page or to a shelf's and 7.18
answering which.

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
import { useNavigate } from 'react-router'
import { ArrowRight, CalendarDays, FileText, Search, X } from 'lucide-react'

import { useFolders, useSearch, useShelves } from '../../api/queries.js'
import { onOpenSearch } from '../../shell/overlays.js'
import { navPages, paths } from '../../routes.js'
import {
  dueDisplay,
  folderDisplay,
  folderMark,
  presenterToday,
  shelfMark,
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
 * carries a heading of the same name, which is what AC-156 addresses. Since
 * S17b they sit inside the Tasks kind rather than at the top level, which is
 * 9.9's own nesting: "results group by kind", and "task results keep the
 * Pending, Abandoned, Completed subgrouping of Q8".
 */
const GROUPS = [
  { heading: 'Pending', status: 'pending' },
  { heading: 'Abandoned', status: 'abandoned' },
  { heading: 'Completed', status: 'completed' },
] as const

/**
 * One row in the flat order the cursor walks and Enter opens from.
 *
 * Every result of every kind contributes one, in the order it is drawn, so
 * 9.9's "enter opens the first result" and its arrow keys mean the same thing
 * they meant when the overlay held only tasks. Collected while rendering
 * rather than derived beside it, because two lists that must agree about
 * order are two chances for them not to.
 */
interface Destination {
  readonly go: () => void
}

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

/**
 * One result row, whatever kind it is.
 *
 * Four kinds drawn by one component rather than four, which is DES-154's rule
 * applied to a list: the mark, the title, the line under it and the arrow are
 * the same anatomy for a task, a folder, a shelf and a page, and only what
 * fills them differs. A task adds its due chip and its status pill through
 * `trailing`, which is the one place the kinds are not alike.
 */
function ResultRow({
  mark,
  title,
  detail,
  active,
  trailing,
  onHover,
  onOpen,
}: {
  readonly mark: React.JSX.Element
  readonly title: string
  readonly detail: string
  readonly active: boolean
  readonly trailing?: React.ReactNode
  readonly onHover: () => void
  readonly onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onOpen}
      className={cn(
        'group flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30',
        active ? 'bg-[var(--color-graphite-100)]' : 'hover:bg-[var(--color-graphite-50)]',
      )}
    >
      {mark}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--color-graphite-800)]">
          {title}
        </span>
        {detail === '' ? null : (
          <span className="mt-0.5 block truncate text-xs text-[var(--color-graphite-500)]">
            {detail}
          </span>
        )}
      </span>
      {trailing}
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
}

/**
 * A kind's block: 9.1's named region plus the heading that names it.
 *
 * The same shape the status groups already had, lifted out so a kind and a
 * status subgroup are one thing drawn twice rather than two that happen to
 * look alike.
 */
function ResultGroup({
  heading,
  count,
  children,
}: {
  readonly heading: string
  readonly count: number
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={heading}>
      <h3 className="flex h-7 items-center gap-1.5 px-2 text-[0.625rem] font-semibold tracking-[0.08em] text-[var(--color-graphite-500)] uppercase">
        {heading}
        {/* The prototype's count beside the group name, aria-hidden so the
            heading's accessible name stays the group's own word (AC-156). */}
        <span aria-hidden="true" className="font-medium text-[var(--color-graphite-400)]">
          {count}
        </span>
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
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
  /*
  The other three kinds, since S17b. 7.18 has answered them since the search
  extension landed and this overlay consumed `rows` alone, which is the audit's
  fourth headline gap: "the one control whose job is finding things cannot find
  most things." Optional on the wire, so an older server or a response that
  predates the extension degrades to the task-only overlay rather than
  throwing.
  */
  const foundFolders = results.data?.folders ?? []
  const foundShelves = results.data?.shelves ?? []
  const foundPages = results.data?.pages ?? []
  /*
  The viewer's own shelves, for the places offered before anything is typed.
  Read here rather than taken from the response because they are two different
  lists answering two different questions, which is the one thing about this
  surface the parity audit warned a reader would misread: `useFolders()` below
  is the sidebar's folder list, drawn for a task result's folder chip and for
  the pre-typed places, and it is not `results.data.folders`.
  */
  const shelves = useShelves(open)
  const navigate = useNavigate()
  const today = presenterToday()

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        rows: rows.filter((row) => row.status === group.status),
      })),
    [rows],
  )

  /** Whether the query found anything at all, across all four kinds. */
  const found = rows.length + foundFolders.length + foundShelves.length + foundPages.length

  /*
  DES-203's places, offered before a keystroke: 9.1's page block, then the
  viewer's folders, then their shelves.

  **Every one of these lists is already in the chrome's cache**, which is what
  makes offering them free: `navPages` is a table, and the folders and shelves
  are the two reads the sidebar makes on every page. The pin list is
  deliberately not consulted, which is the one judgement here: 9.7's pins
  decide what the *sidebar* lists, and a person who unpinned Done did not ask
  to be unable to reach it, 9.1's own rule for an unpinned page being that it
  "stays reachable by URL". This overlay is how they reach it.
  */
  const places = useMemo(
    () => [
      ...navPages.map((page) => ({
        key: `view:${page.key}`,
        name: page.name,
        detail: page.question,
        path: page.path,
        icon: page.icon,
        color: undefined as string | undefined,
      })),
      ...(folders.data ?? []).map((folder) => {
        const mark = folderMark(folder)
        return {
          key: `folder:${folder.id}`,
          name: folder.name,
          detail: 'Folder',
          path: paths.folder(folder.id),
          icon: mark.icon,
          color: mark.color as string | undefined,
        }
      }),
      ...(shelves.data ?? []).map((shelf) => {
        const mark = shelfMark(shelf)
        return {
          key: `shelf:${shelf.id}`,
          name: shelf.name,
          detail: 'Shelf',
          path: paths.shelf(shelf.id),
          icon: mark.icon,
          color: mark.color as string | undefined,
        }
      }),
    ],
    [folders.data, shelves.data],
  )

  function close(): void {
    /*
    The input gives up focus before the dialog starts closing, and that is a
    correctness fix rather than tidiness.

    `shell/overlays.ts` refuses the "/" shortcut while the event's target is an
    input, which is right: a person typing a path into a field is not asking
    for the search overlay. But the dialog unmounts on a 200 ms exit
    transition, so between `setOpen(false)` and the popup leaving the document
    the input is still there and still focused, and a "/" pressed in that
    window is swallowed by a control that is on its way out. The overlay then
    does not reopen, which is exactly what a person pressing escape and then
    "/" quickly would meet.

    Found by CI rather than locally: run 32952559525's Playwright step failed
    AC-156's second shortcut while the same case passed on this machine, and
    the window widened at S17b because the overlay now renders content in its
    pre-typed state where it used to render an empty box. The race was always
    there; this package made it likely enough for a slower machine to lose.
    */
    input.current?.blur()
    setOpen(false)
    setTyped('')
    setDebounced('')
    setCursor(0)
  }

  function openRow(task: TaskCard): void {
    close()
    openTask(task.id)
  }

  /* 9.9: "a row opens its thing in place". A place is a route, so the overlay
     closes and the router goes there; a task is not, so it opens on whichever
     surface 9.3 gives it, which is what `openTask` raises. */
  function goTo(path: string): void {
    close()
    void navigate(path)
  }

  /*
  The flat order the cursor walks, filled while the rows below are drawn.

  Collected rather than derived, and that is the point: the order Enter opens
  from is by construction the order on the screen, where a second list built
  beside the render is a second answer that can drift from it. `index` counts
  the rows as they are emitted and `destinations` holds what each one does.
  */
  const destinations: Destination[] = []
  let index = -1
  const register = (go: () => void): { at: number; active: boolean } => {
    index += 1
    destinations.push({ go })
    return { at: index, active: cursor === index }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const count = destinations.length
    if (count === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (current + 1) % count)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (current - 1 + count) % count)
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    const chosen = destinations[cursor] ?? destinations[0]
    chosen?.go()
  }

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
            /*
            DES-203 and 9.9: "before anything is typed it offers the places,
            pages, folders and shelves, as rows to go to."

            The empty box this replaces told a person to type and nothing else,
            on the surface whose shortcut is the fastest way to anywhere in
            Dana. What stands here now is the whole of where they can go, which
            is what makes the overlay a launcher as well as a search box, and it
            costs no request: every list is one the chrome already holds.
            */
            <div className="space-y-2">
              <ResultGroup heading="Places" count={places.length}>
                {places.map((place) => {
                  const seat = register(() => {
                    goTo(place.path)
                  })
                  return (
                    <ResultRow
                      key={place.key}
                      mark={
                        <place.icon
                          className="size-4 shrink-0"
                          style={place.color === undefined ? undefined : { color: place.color }}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      }
                      title={place.name}
                      detail={place.detail}
                      active={seat.active}
                      onHover={() => {
                        setCursor(seat.at)
                      }}
                      onOpen={() => {
                        goTo(place.path)
                      }}
                    />
                  )
                })}
              </ResultGroup>
              <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
                Or search tasks, folders, shelves and pages. Enter at least two
                characters.
              </p>
            </div>
          ) : results.data !== undefined && found === 0 ? (
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
            /*
            9.9's four kinds, each its own group: "results group by kind: tasks
            (matching title, notes, and step titles), folders and shelves (name
            and description), and pages (matching a page's own prose)".

            Tasks lead because Q8 is the query a person is most often making and
            because its rows carry the most; the other three follow in the order
            that section writes them. Inside Tasks, Q8's three status subgroups
            are unchanged, which is 9.9's own nesting and what AC-156 reads.
            */
            <div className="space-y-2">
              {rows.length === 0 ? null : (
                <ResultGroup heading="Tasks" count={rows.length}>
                  {grouped.map((group) =>
                    group.rows.length === 0 ? null : (
                      <ResultGroup
                        key={group.status}
                        heading={group.heading}
                        count={group.rows.length}
                      >
                        {group.rows.map((row) => {
                          const due = dueDisplay(row, today)
                          const folder = folderDisplay(row.folder, folders.data ?? [])
                          const mark = folderMark(
                            (folders.data ?? []).find((entry) => entry.id === row.folder.id),
                          )
                          const seat = register(() => {
                            openRow(row)
                          })
                          return (
                            <ResultRow
                              key={row.id}
                              mark={
                                <mark.icon
                                  className="size-4 shrink-0"
                                  style={{ color: mark.color }}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                              }
                              title={row.title}
                              detail={folder.name}
                              active={seat.active}
                              onHover={() => {
                                setCursor(seat.at)
                              }}
                              onOpen={() => {
                                openRow(row)
                              }}
                              trailing={
                                <>
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
                                </>
                              }
                            />
                          )
                        })}
                      </ResultGroup>
                    ),
                  )}
                </ResultGroup>
              )}

              {foundFolders.length === 0 ? null : (
                <ResultGroup heading="Folders" count={foundFolders.length}>
                  {foundFolders.map((hit) => {
                    const mark = folderMark(
                      (folders.data ?? []).find((entry) => entry.id === hit.id),
                    )
                    const seat = register(() => {
                      goTo(paths.folder(hit.id))
                    })
                    return (
                      <ResultRow
                        key={`folder:${hit.id}`}
                        mark={
                          <mark.icon
                            className="size-4 shrink-0"
                            style={{ color: mark.color }}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        }
                        title={hit.name}
                        detail="Folder"
                        active={seat.active}
                        onHover={() => {
                          setCursor(seat.at)
                        }}
                        onOpen={() => {
                          goTo(paths.folder(hit.id))
                        }}
                      />
                    )
                  })}
                </ResultGroup>
              )}

              {foundShelves.length === 0 ? null : (
                <ResultGroup heading="Shelves" count={foundShelves.length}>
                  {foundShelves.map((hit) => {
                    const mark = shelfMark(
                      (shelves.data ?? []).find((entry) => entry.id === hit.id) ?? {
                        icon: null,
                        color: null,
                      },
                    )
                    const seat = register(() => {
                      goTo(paths.shelf(hit.id))
                    })
                    return (
                      <ResultRow
                        key={`shelf:${hit.id}`}
                        mark={
                          <mark.icon
                            className="size-4 shrink-0"
                            style={{ color: mark.color }}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        }
                        title={hit.name}
                        detail="Shelf"
                        active={seat.active}
                        onHover={() => {
                          setCursor(seat.at)
                        }}
                        onOpen={() => {
                          goTo(paths.shelf(hit.id))
                        }}
                      />
                    )
                  })}
                </ResultGroup>
              )}

              {foundPages.length === 0 ? null : (
                <ResultGroup heading="Pages" count={foundPages.length}>
                  {foundPages.map((hit) => {
                    /* A block belongs to a folder's page or to a shelf's, and
                       7.18 answers whichever it is; the row goes to the page
                       the prose is on, which is 9.9's "a row opens its thing in
                       place" for a thing that is part of a page. */
                    const path =
                      hit.folder_id !== null
                        ? paths.folder(hit.folder_id)
                        : hit.shelf_id !== null
                          ? paths.shelf(hit.shelf_id)
                          : null
                    if (path === null) return null
                    const home =
                      hit.folder_id !== null
                        ? ((folders.data ?? []).find((entry) => entry.id === hit.folder_id)?.name ??
                          'A page')
                        : ((shelves.data ?? []).find((entry) => entry.id === hit.shelf_id)?.name ??
                          'A page')
                    const seat = register(() => {
                      goTo(path)
                    })
                    return (
                      <ResultRow
                        key={`page:${hit.block_id}`}
                        mark={
                          <FileText
                            className="size-4 shrink-0 text-[var(--color-graphite-500)]"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        }
                        title={hit.text}
                        detail={home}
                        active={seat.active}
                        onHover={() => {
                          setCursor(seat.at)
                        }}
                        onOpen={() => {
                          goTo(path)
                        }}
                      />
                    )
                  })}
                </ResultGroup>
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

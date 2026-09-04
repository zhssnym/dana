/*
What every place-page of 9.4 and 9.5 shares: its head, its window-bar
controls, its filter, its view, and the capture that its own spine defines.

DES-154 is why this is a hook and a pair of components rather than a shape
each page repeats: "a settled behaviour belongs to the mechanism, not to each
screen". Eight pages each wiring their own filter would be eight chances for
one of them to keep a filter across a navigation, or to hand a board the wrong
axis, or to capture without the page's defaults, which is the fault DES-182
found by building the third copy.

The pages keep exactly what is theirs: which rows they read, and how a list of
them is arranged when nobody has asked for a grouping. Everything else is
here.
*/
import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask, useCreateSavedView, usePullIntoMyDay } from '../api/mutations.js'
import { useMe, useSavedViews } from '../api/queries.js'
import { DELETED_USER } from '../parts/presenters.js'
import { presenterToday } from '../parts/presenters.js'
import { openTaskForm } from '../shell/overlays.js'
import { WindowBarActions, WindowBarLead } from '../components/window-bar.js'
import { FilterChips, FilterControl } from './FilterControl.js'
import type { FilterPerson } from './FilterControl.js'
import {
  applyFilter,
  definitionPage,
  filterFromDefinition,
  viewDefinition,
} from './filter.js'
import type { GroupBy, PageFilter } from './filter.js'
import { usePageFilter } from './filter-store.js'
import { captureDefaults, surfaceDefaults } from './place-pages.js'
import type { ColumnValue, PlaceSpine } from './place-pages.js'
import { PageHead } from '../components/page-head.js'
import { ViewStrip } from '../components/view-strip.js'
import type { ViewStripOption } from '../components/view-strip.js'
import { CalendarDays, LayoutGrid, List } from '../lib/icons.js'
import { modeFromSearch, useViewMode, writeViewMode } from './view-mode.js'
import type { ViewMode } from './view-mode.js'

/*
The place page's own option set, which is the half of a view strip that does
not live in the strip (RFC 0005 change control item 39: "the view types are
`components/view-strip.tsx` plus each surface's option set").

**Icons and no written labels**, DES-137 and Imran's direction of 2026-08-18.
The word is the control's accessible name rather than text beside it, so it is
what a screen reader announces and what a criterion addresses; the tooltip
shows the same word to a pointer. 9.1's roles table names the shape since S24:
"a radio within a radiogroup, checked when current".

Which of the three a page offers is `place-pages.ts`'s table and never this
map's guess, which is why the map is keyed rather than ordered: a page that
cannot honestly draw a calendar has no calendar option, not a disabled one
(DES-144).
*/
const VIEW_FACES: Record<ViewMode, { label: string; icon: typeof List }> = {
  list: { label: 'List', icon: List },
  board: { label: 'Board', icon: LayoutGrid },
  calendar: { label: 'Calendar', icon: CalendarDays },
}

/*
The address bar, read at the moment it is asked for, and why nothing here may
use React Router's copy of it to make a decision (issue #47).

`useSearchParams()` returns the search of the location React last rendered.
`BrowserRouter` commits that location inside `React.startTransition`
(`react-router/dist/development/chunk-62JRHF6Z.mjs`, `BrowserRouter`'s
`setState`), so `history` and the address bar are updated **synchronously** by
the navigation while React's copy arrives at transition priority, whenever the
scheduler gets to it. Measured in CI at over 400 ms behind, 289 specs deep.

That gap is a product defect and not a test artifact: a person opened a saved
view, cleared the filter before React caught up, and watched the clear undo
itself half a second later, because the code that strips `?view=` read a
`search` that did not have it yet and the code that seeds from a saved view
read one that suddenly did.

**The functional form of `setSearchParams` is no escape.** React Router calls
it with `new URLSearchParams(searchParams)`, the same memoised, possibly stale
value (`useSearchParams` in the same file). `window.location` is the only
thing that is current at that instant, so both decisions below read it.
*/
function liveSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

export interface Place {
  readonly spine: PlaceSpine
  readonly today: string
  readonly viewerId: string | null
  readonly filter: PageFilter
  readonly setFilter: (next: PageFilter) => void
  readonly mode: ViewMode
  readonly setMode: (next: ViewMode) => void
  /**
   * The axis a board draws. A page in list view with no grouping asked for is
   * 'none', and its own arrangement stands; a board always has one, because a
   * board with no columns is a control that does nothing (DES-182).
   */
  readonly groupBy: GroupBy
  /** The people this page's rows name, for the assignee axis and the chips. */
  readonly people: readonly FilterPerson[]
  /** 9.1's filter over rows the client already holds. Never re-fetches. */
  readonly narrow: (rows: readonly TaskCard[]) => readonly TaskCard[]
  /** A capture at this page's entry defaults, optionally inside a column. */
  readonly capture: (title: string, column?: ColumnValue) => void
  /** The same entry point, escalated to the task surface (9.3). */
  readonly openFull: (column?: ColumnValue, title?: string) => void
}

function peopleIn(
  rows: readonly TaskCard[],
  viewerId: string | null,
  viewerName: string,
): readonly FilterPerson[] {
  const byId = new Map<string, string>()
  if (viewerId !== null) byId.set(viewerId, viewerName)
  for (const task of rows) {
    if (task.assignee !== null) {
      byId.set(task.assignee.id, task.assignee.display_name ?? DELETED_USER)
    }
    /* The makers as well as the carriers, since S25: the filter's created-by
       axis offers this same list, and a page can hold a task somebody made
       and nobody was given, which would otherwise be a person the axis could
       not name. 4.5 makes `created_by` NOT NULL, so this adds a person per
       row rather than sometimes. */
    if (task.created_by !== null) {
      byId.set(task.created_by.id, task.created_by.display_name ?? DELETED_USER)
    }
  }
  return [...byId].map(([id, name]) => ({ id, name }))
}

/**
 * The shared behaviour of a place-page.
 *
 * `rows` is everything the page holds before narrowing, and it is passed in
 * rather than fetched here because which query a page reads is the one thing
 * a place-page decides for itself: Today is Q1, Scheduled is Q3, Assignments
 * is a composition over Q5 that section 6's preamble says is not a query at
 * all.
 */
/**
 * What a place-page supplies that its spine cannot carry, added at S17b when
 * the folder page became one.
 *
 * Every field exists because it needs the page's own id, which is the whole of
 * what separates a folder page from the eight in `PLACES`. A page that passes
 * none of them behaves exactly as it did.
 */
export interface PlaceOptions {
  /**
   * Where this page's filter is remembered, if not under its spine's key.
   *
   * 9.1: "a filter belongs to the page and to the session: kept on return to
   * that page, never carried to another." Two folders are two pages, so a
   * folder page keys by its own id; keying by the kind would make a narrowing
   * on Work follow a person into Home, which is that sentence read backwards.
   */
  readonly filterKey?: string
  /** A capture writing this page's own folder rather than the table's row. */
  readonly capture?: (title: string, column?: ColumnValue) => void
  /** The same entry point escalated to 9.3's surface, with the same folder. */
  readonly openFull?: (column?: ColumnValue, title?: string) => void
}

export function usePlace(
  spine: PlaceSpine,
  rows: readonly TaskCard[],
  options: PlaceOptions = {},
): Place {
  const [filter, setFilter] = usePageFilter(options.filterKey ?? spine.key)
  const [mode, setMode] = useViewMode(spine.views)
  const [search] = useSearchParams()
  const me = useMe()
  const savedViews = useSavedViews()
  const create = useCreateTask()
  const pull = usePullIntoMyDay()
  const today = presenterToday()
  const viewerId = me.data?.user.id ?? null

  /*
  9.4's `?state=important`: "and any link that means 'Today, important only'
  seeds that filter rather than a page-local switch". A seed and not a second
  record, so it is written into the filter once and the filter answers every
  reader afterwards, which is the same rule `?mode=` follows.
  */
  const seedState = search.get('state')
  const seedMode = modeFromSearch(search.toString())
  const seedView = search.get('view')
  const savedDefinition = savedViews.data?.find((view) => view.id === seedView)?.definition
  useEffect(() => {
    if (seedMode !== null) writeViewMode(seedMode)
  }, [seedMode])
  useEffect(() => {
    if (seedState === 'important' && !filter.important) {
      setFilter({ ...filter, important: true })
    }
    // The filter is deliberately out of the dependency list: this seeds once
    // per arrival, and re-running it when the person turns the switch off
    // would make the link a lock rather than a starting point.
  }, [seedState])
  useEffect(() => {
    if (savedDefinition === undefined) return
    /*
    The seed is only honoured while the address bar still says this view is
    open, and that one line is what stops a hand-cleared filter reverting
    itself (issue #47).

    This effect re-runs whenever `seedView` changes, and `seedView` comes from
    the lagging copy described at `liveSearch`. So it fires not only when a
    person opens a view but also, hundreds of milliseconds late, when a
    location they have already left finally commits. In that second case the
    person has edited the filter by hand, `changeFilter` has already taken the
    id out of the address synchronously, and re-seeding here would overwrite
    the edit they just made.

    Reading the address rather than remembering what has been seeded is what
    keeps the four cases apart, and the fourth is the one a "have I seeded
    this id" flag gets wrong. Arriving cold at `?view=<id>`: the address has
    it, seed. Opening a view from the panel on a page already open: the
    navigation writes the address synchronously, so it has it, seed. Editing
    the filter afterwards: the id is gone from the address, so the late echo
    of the old location seeds nothing. Opening the same view again after
    leaving it: the address has it once more, so it seeds again.
    */
    if (liveSearch().get('view') !== seedView) return
    setFilter(filterFromDefinition(savedDefinition))
    // Adjusting the filter afterwards is the person's business rather than a
    // change the link should undo, which is why `filter` is not a dependency.
  }, [seedView, savedDefinition === undefined])

  const people = useMemo(
    () => peopleIn(rows, viewerId, me.data?.user.display_name ?? 'You'),
    [rows, viewerId, me.data],
  )

  const groupBy: GroupBy =
    filter.groupBy !== 'none' ? filter.groupBy : mode === 'board' ? spine.boardAxis : 'none'

  function capture(title: string, column?: ColumnValue): void {
    const defaults = captureDefaults(spine.key, today, column)
    create.mutate(
      {
        title,
        ...(defaults.folder_id === undefined ? {} : { folder_id: defaults.folder_id }),
        ...(defaults.due_date === undefined ? {} : { due_date: defaults.due_date }),
        ...(defaults.important === undefined ? {} : { important: defaults.important }),
        ...(defaults.assignee_id === undefined ? {} : { assignee_id: defaults.assignee_id }),
      },
      {
        onSuccess: (task) => {
          /* Today's spine is the entry, and 7.6's body has no field for one,
             so the capture makes the task and then pulls it. AC-221 reads the
             row on Today after a reload for exactly this: a client that wrote
             the column's folder and forgot the membership passes the column
             half and fails the page's own. */
          if (defaults.pullIntoToday) pull.mutate(task.id)
        },
      },
    )
  }

  function openFull(column?: ColumnValue, title?: string): void {
    const defaults = captureDefaults(spine.key, today, column)
    const surface = surfaceDefaults(spine.key, today)
    openTaskForm({
      /* polish: taskrow F3. */
      ...(title === undefined || title === '' ? {} : { title }),
      due_date: defaults.due_date ?? surface.due_date,
      important: defaults.important ?? surface.important,
      ...(defaults.folder_id === undefined ? {} : { folder_id: defaults.folder_id }),
    })
  }

  return {
    spine,
    today,
    viewerId,
    filter,
    setFilter,
    mode,
    setMode,
    groupBy,
    people,
    narrow: (input) => applyFilter(input, filter, today),
    /* The page's own where it has one: a folder page's capture writes that
       folder and nothing in `PLACES` knows which. Everything else about a
       capture, the column's value riding over the page's defaults included,
       stays here. */
    capture: options.capture ?? capture,
    openFull: options.openFull ?? openFull,
  }
}

/**
 * A place-page's chrome: the chips at the window bar's left end, the view
 * strip and the filter at its right (9.1, DES-150).
 *
 * Rendered by the page rather than by the shell, and the reason is DES-139's:
 * the controls belong to what the tab is showing, so the screen keeps their
 * state and only the placement is the shell's. `WindowBarActions` is the
 * portal that makes that true, and `WindowBarLead` is the bar's other end:
 * one slot for the breadcrumb Dana does not have yet and the filter's chips,
 * which is the lifted bar's arrangement and DES-153's reason for it, both
 * answering "what am I looking at" and reading left to right in the order a
 * person would say it out loud.
 */
export function PlaceChrome({ place }: { readonly place: Place }): React.JSX.Element {
  const saveView = useCreateSavedView()
  const savedViews = useSavedViews()
  const navigate = useNavigate()
  /* polish: pagehead F3. Editing the filter by hand leaves the saved view
     behind, so its id leaves the address too; otherwise "Clear all" cleared
     the chips while the sidebar went on saying the view was open. */
  const changeFilter = (next: PageFilter): void => {
    place.setFilter(next)
    /*
    Read from the address bar and not from `useSearchParams`, for the reason
    written at `liveSearch`: a view opened a moment ago is in the address at
    once and in React's copy of it whenever the scheduler gets there, and
    deciding from the copy meant that clearing a filter quickly enough left
    the id behind and let the seed put the filter back (issue #47).
    */
    const rest = liveSearch()
    if (!rest.has('view')) return
    rest.delete('view')
    const query = rest.toString()
    /*
    `setSearchParams` is not used here, and neither is a bare `?query`: both
    resolve against the router's pathname, which lags for exactly the same
    reason the search does, so a search written during a page change could
    land on the page being left. The pathname is taken from the address bar
    alongside the search, so the two halves of this navigation are always the
    same instant.
    */
    navigate(
      { pathname: window.location.pathname, search: query === '' ? '' : `?${query}` },
      { replace: true },
    )
  }
  /*
  The views saved on this page, listed at the panel's head, which is the
  prototype's own arrangement and the third seam `FilterControl` records.

  Scoped to this page rather than to the account, on 9.1's sentence that a
  filter belongs to the page: `viewDefinition` writes the spine's key into
  every definition precisely so a view made on Today opens on Today, and
  offering Today's saved views inside Done's filter would be the panel
  proposing a narrowing the page cannot honour.
  */
  const listed = (savedViews.data ?? [])
    .filter((view) => definitionPage(view.definition) === place.spine.key)
    .map((view) => ({ id: view.id, name: view.name }))
  return (
    <>
      <WindowBarLead>
        <FilterChips filter={place.filter} onChange={changeFilter} people={place.people} />
      </WindowBarLead>
      <WindowBarActions>
        {/* DES-150's arrangement, written down: views, then the filter. */}
        {/*
        polish: pagehead F1, folderpage F8, places F5. The strip rested
        collapsed to the current view from S24 and widened on hover, which hid
        the board and the calendar from anyone who did not hover one small
        icon, and from every phone. It rests open now, a segmented control;
        9.1 is amended in the same words.
        */}
        <ViewStrip
          ariaLabel="View"
          value={place.mode}
          options={place.spine.views.map((view) => ({
            key: view,
            label: VIEW_FACES[view].label,
            icon: VIEW_FACES[view].icon,
          })) satisfies ViewStripOption<ViewMode>[]}
          onSelect={place.setMode}
        />
        <FilterControl
          filter={place.filter}
          onChange={changeFilter}
          people={place.people}
          savedViews={listed}
          onSaveView={(name) => {
            /*
            Pinned on arrival, and it is DES-189 rather than a shortcut: "a
            setting with no way in is a setting nobody has". DES-153 makes
            pinning a separate choice from saving, and the surface that choice
            belongs to is 9.7's pin list, which is still the v1 page of three
            booleans; until it is rewritten, a view saved unpinned is a view
            with no address a person can reach. So it lands in the sidebar,
            where the pin list can take it out again the day that page lands.
            */
            /* polish: pagehead F3. Saved unpinned: a view lives in this
               page's filter panel, and 9.7's pin list is where a person
               chooses to put one in the sidebar. Pinned on arrival, it read
               as a page and followed people to other pages. */
            saveView.mutate({
              name,
              definition: viewDefinition(place.filter, place.spine.key),
              pinned: false,
            })
          }}
        />
      </WindowBarActions>
    </>
  )
}

/**
 * A place-page's head: the lifted `PageHead` of `prototype-v2`, given this
 * page's spine (RFC 0005 change control item 44's B1, S25).
 *
 * **It is one call here rather than eight in the pages**, which is
 * `PlaceChrome`'s own reason one function up and DES-154's rule: a settled
 * behaviour belongs to the mechanism, and eight pages spelling out the same
 * four props is eight chances for one of them to key its cover by the page's
 * display name instead of by 4.20's place.
 *
 * The cover band is not here: it is inside `PageHead`, at the seam that file
 * records, because the mark rides up over the band on a negative margin and
 * that only works while the two are adjacent in one flow.
 *
 * The description starts with Dana's friendly sentence. A person's edit is
 * saved by 7.21, and clearing it brings that friendly sentence back.
 */
export function PlaceHead({
  place,
  fact,
}: {
  readonly place: Place
  /** 9.4's "N of M done". Only a page with a completion has one. */
  readonly fact?: string
}): React.JSX.Element {
  return (
      <PageHead
        storageName={place.spine.key}
        icon={place.spine.icon}
        title={place.spine.name}
        description={place.spine.question}
        {...(fact === undefined ? {} : { fact })}
      />
  )
}

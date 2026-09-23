/*
What every place-page of 9.4 and 9.5 shares: its head, its window-bar controls,
its filter, its view, and the capture that its own spine defines.

A hook and a pair of components rather than a shape each page repeats, because a
settled behaviour belongs to the mechanism, not to each screen. Eight pages each
wiring their own filter would be eight chances for one of them to keep a filter
across a navigation, or to hand a board the wrong axis, or to capture without
the page's defaults.

The pages keep exactly what is theirs: which rows they read, and how a list of
them is arranged when nobody has asked for a grouping. Everything else is here.
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
The place page's own option set, which is the half of a view strip that does not
live in the strip: the view types are `components/view-strip.tsx` plus each
surface's option set.

**Icons and no written labels.** The word is the control's accessible name
rather than text beside it, so it is what a screen reader announces and what a
test addresses; the tooltip shows the same word to a pointer. 9.1's roles table
names the shape: "a radio within a radiogroup, checked when current".

Which of the three a page offers is `place-pages.ts`'s table and never this
map's guess, which is why the map is keyed rather than ordered: a page that
cannot honestly draw a calendar has no calendar option, not a disabled one.
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
value (`useSearchParams` in the same file). `window.location` is the only thing
that is current at that instant, so every decision below reads it: the `?view=`
seed and the filter edit that strips it (#47), and the `?state=` and `?mode=`
seeds (#48), which had the same fault latently and now take the same guard.
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
   * board with no columns is a control that does nothing.
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
    /* The makers as well as the carriers: the filter's created-by axis offers
       this same list, and a page can hold a task somebody made and nobody was
       given, which would otherwise be a person the axis could not name. 4.5
       makes `created_by` NOT NULL, so this adds a person per row rather than
       sometimes. */
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
 * What a place-page supplies that its spine cannot carry, which is how the
 * folder page is one.
 *
 * Every field exists because it needs the page's own id, which is the whole of
 * what separates a folder page from the eight in `PLACES`. A page that passes
 * none of them behaves as a plain place page.
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
  /*
  What "the person has left this seed" means for the two one-way seeds (issue
  #48), decided here rather than copied from `?view=` below, because the rule
  that made `?view=` easy does not exist for these.

  **The rule: a seed applies while the address bar carries it, and never while
  it does not.** That is the same guard `?view=` takes and it is all these two
  need against the lag `liveSearch` describes. Each effect keys on a value read
  from React's copy of the location, so it fires when a location the person has
  already left finally commits; without the guard, a `?state=important` they
  navigated away from turns the switch back on somewhere else, hundreds of
  milliseconds late, and the failure looks like the filter switching itself on
  rather than like a routing problem.

  **What is deliberately not copied is the other half of `?view=`.** Editing
  the filter takes `?view=` out of the address (`changeFilter` below), so a
  hand-cleared filter stops claiming to be a saved view. Nothing takes
  `?state=` or `?mode=` out, and nothing should: a view is an object the
  sidebar draws as open, so an address still naming it while the filter says
  otherwise is a contradiction a person can see, and these two name no object
  and nothing on the screen claims them. Two things follow and both are wanted.
  Turning the switch off does not rewrite the address, which would be a
  navigation nobody asked for. And reloading `?state=important` seeds again,
  which is right: 9.4 calls it "any link that means 'Today, important only'",
  and a link that stopped meaning that the second time it was opened would be a
  strange link.

  So the guard bites in exactly one case, the late echo, which is the case #48
  is about. It is latent today because nothing in this client generates either
  link — `lib/nav-links.ts`'s `parameterTarget` maps `?task=` and nothing else
  — and it is written now because the first person to add the link 9.4 invites
  would otherwise turn a latent trap into a live defect.
  */
  useEffect(() => {
    if (seedMode === null) return
    /* Through the same helper the seed above it is read with, so that the
       lagging reading and the live one cannot differ by how they were
       parsed as well as by when. */
    if (modeFromSearch(liveSearch().toString()) !== seedMode) return
    writeViewMode(seedMode)
  }, [seedMode])
  useEffect(() => {
    if (seedState === 'important' && !filter.important && liveSearch().get('state') === seedState) {
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
 * A place-page's chrome: the chips at the window bar's left end, the view strip
 * and the filter at its right (9.1).
 *
 * Rendered by the page rather than by the shell: the controls belong to what
 * the tab is showing, so the screen keeps their state and only the placement is
 * the shell's. `WindowBarActions` is the portal that makes that true, and
 * `WindowBarLead` is the bar's other end: one slot for the breadcrumb Dana does
 * not have yet and the filter's chips, both answering "what am I looking at"
 * and reading left to right in the order a person would say it out loud.
 */
export function PlaceChrome({ place }: { readonly place: Place }): React.JSX.Element {
  return (
    <>
      <PlaceFilterChips place={place} />
      <WindowBarActions>
        <PlaceControls place={place} />
      </WindowBarActions>
    </>
  )
}

/** The filter state summary remains in the window bar even when controls move. */
export function PlaceFilterChips({ place }: { readonly place: Place }): React.JSX.Element {
  const navigate = useNavigate()
  const changeFilter = makeFilterChange(place, navigate)
  return (
    <WindowBarLead>
      <FilterChips filter={place.filter} onChange={changeFilter} people={place.people} />
    </WindowBarLead>
  )
}

/** The actionable view and filter controls, reusable by an in-page surface. */
export function PlaceControls({ place }: { readonly place: Place }): React.JSX.Element {
  const saveView = useCreateSavedView()
  const savedViews = useSavedViews()
  const navigate = useNavigate()
  /* Editing the filter by hand leaves the saved view behind, so its id leaves
     the address too; otherwise "Clear all" would clear the chips while the
     sidebar went on saying the view was open. */
  const changeFilter = makeFilterChange(place, navigate)
  /*
  The views saved on this page, listed at the panel's head.

  Scoped to this page rather than to the account, on 9.1's sentence that a
  filter belongs to the page: `viewDefinition` writes the spine's key into every
  definition precisely so a view made on Today opens on Today, and offering
  Today's saved views inside Done's filter would be the panel proposing a
  narrowing the page cannot honour.
  */
  const listed = (savedViews.data ?? [])
    .filter((view) => definitionPage(view.definition) === place.spine.key)
    .map((view) => ({ id: view.id, name: view.name }))
  return (
    <>
        {/* Views, then the filter. */}
        {/*
        The strip rests open, a segmented control (9.1): a strip collapsed to
        the current view and widened on hover would hide the board and the
        calendar from anyone who did not hover one small icon, and from every
        phone.
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
            /* Saved unpinned: a view lives in this page's filter panel, and
               9.7's pin list is where a person chooses to put one in the
               sidebar. Pinned on arrival, it would read as a page and follow
               people to other pages. */
            saveView.mutate({
              name,
              definition: viewDefinition(place.filter, place.spine.key),
              pinned: false,
            })
          }}
        />
    </>
  )
}

function makeFilterChange(
  place: Place,
  navigate: ReturnType<typeof useNavigate>,
): (next: PageFilter) => void {
  return (next: PageFilter): void => {
    place.setFilter(next)
    const rest = liveSearch()
    if (!rest.has('view')) return
    rest.delete('view')
    const query = rest.toString()
    navigate(
      { pathname: window.location.pathname, search: query === '' ? '' : `?${query}` },
      { replace: true },
    )
  }
}

/**
 * A place-page's head: `PageHead`, given this page's spine.
 *
 * **It is one call here rather than eight in the pages**, for `PlaceChrome`'s
 * reason one function up: a settled behaviour belongs to the mechanism, and
 * eight pages spelling out the same four props is eight chances for one of them
 * to key its cover by the page's display name instead of by 4.20's place.
 *
 * The cover band is not here: it is inside `PageHead`, because the mark rides
 * up over the band on a negative margin and that only works while the two are
 * adjacent in one flow.
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

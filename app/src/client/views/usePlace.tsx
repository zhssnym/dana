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
import { useSearchParams } from 'react-router'

import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask, useCreateSavedView, usePullIntoMyDay } from '../api/mutations.js'
import { useMe, useSavedViews } from '../api/queries.js'
import { DELETED_USER } from '../parts/presenters.js'
import { presenterToday } from '../parts/presenters.js'
import { openTaskForm } from '../shell/overlays.js'
import { WindowBarActions } from '../shell/WindowBar.js'
import { FilterChips, FilterControl } from './FilterControl.js'
import type { FilterPerson } from './FilterControl.js'
import { applyFilter, filterFromDefinition, viewDefinition } from './filter.js'
import type { GroupBy, PageFilter } from './filter.js'
import { usePageFilter } from './filter-store.js'
import { captureDefaults, surfaceDefaults } from './place-pages.js'
import type { ColumnValue, PlaceSpine } from './place-pages.js'
import { ViewStrip } from './ViewStrip.js'
import { modeFromSearch, useViewMode, writeViewMode } from './view-mode.js'
import type { ViewMode } from './view-mode.js'

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
  readonly openFull: (column?: ColumnValue) => void
}

function peopleIn(
  rows: readonly TaskCard[],
  viewerId: string | null,
  viewerName: string,
): readonly FilterPerson[] {
  const byId = new Map<string, string>()
  if (viewerId !== null) byId.set(viewerId, viewerName)
  for (const task of rows) {
    if (task.assignee === null) continue
    byId.set(task.assignee.id, task.assignee.display_name ?? DELETED_USER)
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
export function usePlace(spine: PlaceSpine, rows: readonly TaskCard[]): Place {
  const [filter, setFilter] = usePageFilter(spine.key)
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
    setFilter(filterFromDefinition(savedDefinition))
    // Same reasoning as above: opening a saved view sets the page's filter,
    // and adjusting it afterwards is the person's business rather than a
    // change the link should undo.
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

  function openFull(column?: ColumnValue): void {
    const defaults = captureDefaults(spine.key, today, column)
    const surface = surfaceDefaults(spine.key, today)
    openTaskForm({
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
    capture,
    openFull,
  }
}

/**
 * A place-page's chrome: the chips at the window bar's left end, the view
 * strip and the filter at its right (9.1, DES-150).
 *
 * Rendered by the page rather than by the shell, and the reason is DES-139's:
 * the controls belong to what the tab is showing, so the screen keeps their
 * state and only the placement is the shell's. `WindowBarActions` is the
 * portal that makes that true.
 */
export function PlaceChrome({ place }: { readonly place: Place }): React.JSX.Element {
  const saveView = useCreateSavedView()
  return (
    <>
      <WindowBarActions slot="chips">
        <FilterChips filter={place.filter} onChange={place.setFilter} people={place.people} />
      </WindowBarActions>
      <WindowBarActions>
        {/* DES-150's arrangement, written down: views, then the filter. */}
        <ViewStrip offered={place.spine.views} mode={place.mode} onSelect={place.setMode} />
        <FilterControl
          filter={place.filter}
          onChange={place.setFilter}
          people={place.people}
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
            saveView.mutate({
              name,
              definition: viewDefinition(place.filter, place.spine.key),
              pinned: true,
            })
          }}
        />
      </WindowBarActions>
    </>
  )
}

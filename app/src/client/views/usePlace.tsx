/*
What every place-page shares: its header (title and the View menu), its View
settings, its layout, and the capture its spine defines. A page keeps only
which rows it reads and how it arranges them when nobody asked for a grouping.
*/
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'

import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask, usePullIntoMyDay } from '../api/mutations.js'
import { useMe } from '../api/queries.js'
import { presenterToday } from '../parts/presenters.js'
import { ViewMenu } from './FilterControl.js'
import { sortRows } from './filter.js'
import type { GroupBy, PageFilter } from './filter.js'
import { usePageFilter } from './filter-store.js'
import { captureDefaults } from './place-pages.js'
import type { ColumnValue, PlaceSpine } from './place-pages.js'
import { modeFromSearch, useViewMode, writeViewMode } from './view-mode.js'
import type { ViewMode } from './view-mode.js'

/*
The address bar as it is now. React Router's copy lags a navigation (issue
#47), so a `?mode=` seed only applies while the live address still carries it.
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
   * The grouping in force. 'none' in a list means the page's own arrangement;
   * a board always has an axis.
   */
  readonly groupBy: GroupBy
  /** The page's rows in the order the View menu asked for, abandoned ones only
      while "Show completed" is on. Never re-fetches. */
  readonly narrow: (rows: readonly TaskCard[]) => readonly TaskCard[]
  /** A capture at this page's entry defaults, optionally inside a column. */
  readonly capture: (title: string, column?: ColumnValue) => void
}

/** What a folder page supplies that its spine cannot: its own id's worth. */
export interface PlaceOptions {
  /** Where the View settings are remembered, if not under the spine's key. */
  readonly filterKey?: string
  readonly capture?: (title: string, column?: ColumnValue) => void
  /** The page's own "Show completed" where it keeps one (the folder's). */
  readonly showCompleted?: boolean
}

export function usePlace(
  spine: PlaceSpine,
  _rows: readonly TaskCard[],
  options: PlaceOptions = {},
): Place {
  const [filter, setFilter] = usePageFilter(options.filterKey ?? spine.key)
  const [mode, setMode] = useViewMode(spine.views)
  const [search] = useSearchParams()
  const me = useMe()
  const create = useCreateTask()
  const pull = usePullIntoMyDay()
  const today = presenterToday()
  const viewerId = me.data?.user.id ?? null

  const seedMode = modeFromSearch(search.toString())
  useEffect(() => {
    /* Only a layout this page offers is seeded here; a folder page seeds its
       own view (`useFolderView`). */
    if (seedMode === null || !spine.views.includes(seedMode)) return
    if (modeFromSearch(liveSearch().toString()) !== seedMode) return
    writeViewMode(seedMode)
  }, [seedMode, spine.views])

  /* A grouping this page does not offer (left over from another client) is
     the page's own arrangement, never an invisible one. */
  const offered = spine.groups.some((choice) => choice.value === filter.groupBy)
  const chosen: GroupBy = offered ? filter.groupBy : 'none'
  const groupBy: GroupBy = chosen !== 'none' ? chosen : mode === 'board' ? spine.boardAxis : 'none'

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
          if (defaults.pullIntoToday) pull.mutate(task.id)
        },
      },
    )
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
    /* "Show completed" is the one way back to finished work: completed and
       abandoned alike. An abandoned row stays in place, struck and muted. */
    narrow: (input) =>
      sortRows(
        (options.showCompleted ?? filter.showCompleted)
          ? input
          : input.filter((task) => task.status !== 'abandoned'),
        filter.sort,
      ),
    capture: options.capture ?? capture,
  }
}

/** Filter chips are gone: nothing narrows. Kept for the folder page's import. */
export function PlaceFilterChips(_props: { readonly place: Place }): null {
  return null
}

/** The View menu: layout (where the page has more than one), grouping, sort, Show completed. */
export function PlaceControls({ place }: { readonly place: Place }): React.JSX.Element {
  return (
    <ViewMenu
      layouts={place.spine.views}
      layout={place.mode}
      onLayout={place.setMode}
      groups={place.spine.groups}
      completed={place.spine.completed}
      filter={place.filter}
      onChange={place.setFilter}
    />
  )
}

/** A place-page's header: its title, the View menu, and at most one muted line. */
export function PlaceHead({
  place,
  fact,
  bare = false,
}: {
  readonly place: Place
  /** Today's "N of M done". */
  readonly fact?: string
  /** An empty list has nothing to group or sort: no View menu. */
  readonly bare?: boolean
}): React.JSX.Element {
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-(length:--text-title-size) leading-(--text-title-line) font-title text-foreground">
          {place.spine.name}
        </h1>
        {bare ? null : <PlaceControls place={place} />}
      </div>
      {fact === undefined ? null : <p className="mt-1 text-xs text-muted-foreground">{fact}</p>}
    </header>
  )
}

/**
 * A group in a place-page's list: a plain heading, no count, no collapse. The
 * region is named even when the heading is not drawn.
 */
export function PlaceGroup({
  name,
  heading,
  children,
}: {
  readonly name: string
  readonly heading?: string
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <section aria-label={name}>
      {heading === undefined ? null : (
        <h2 className="mb-1 px-2 text-sm font-section text-foreground">{heading}</h2>
      )}
      {children}
    </section>
  )
}

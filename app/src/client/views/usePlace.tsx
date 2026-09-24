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
import { openTaskForm } from '../shell/overlays.js'
import { ViewMenu } from './FilterControl.js'
import { sortRows } from './filter.js'
import type { GroupBy, PageFilter } from './filter.js'
import { usePageFilter } from './filter-store.js'
import { captureDefaults, surfaceDefaults } from './place-pages.js'
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
  /** The page's rows in the order the View menu asked for. Never re-fetches. */
  readonly narrow: (rows: readonly TaskCard[]) => readonly TaskCard[]
  /** A capture at this page's entry defaults, optionally inside a column. */
  readonly capture: (title: string, column?: ColumnValue) => void
  /** The same entry point, escalated to the task surface. */
  readonly openFull: (column?: ColumnValue, title?: string) => void
}

/** What a folder page supplies that its spine cannot: its own id's worth. */
export interface PlaceOptions {
  /** Where the View settings are remembered, if not under the spine's key. */
  readonly filterKey?: string
  readonly capture?: (title: string, column?: ColumnValue) => void
  readonly openFull?: (column?: ColumnValue, title?: string) => void
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
    if (seedMode === null) return
    if (modeFromSearch(liveSearch().toString()) !== seedMode) return
    writeViewMode(seedMode)
  }, [seedMode])

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
    narrow: (input) => sortRows(input, filter.sort),
    capture: options.capture ?? capture,
    openFull: options.openFull ?? openFull,
  }
}

/** Nothing goes in the window bar any more; the View menu is in the header. */
export function PlaceChrome(_props: { readonly place: Place }): null {
  return null
}

/** Filter chips are gone: nothing narrows. Kept for the folder page's import. */
export function PlaceFilterChips(_props: { readonly place: Place }): null {
  return null
}

/** The View menu, for a page that places it itself. */
export function PlaceControls({ place }: { readonly place: Place }): React.JSX.Element {
  return (
    <ViewMenu
      views={place.spine.views}
      groups={place.spine.groups}
      completed={place.spine.completed}
      filter={place.filter}
      onChange={place.setFilter}
      mode={place.mode}
      onModeChange={place.setMode}
    />
  )
}

/** A place-page's header: its title, the View menu, and at most one muted line. */
export function PlaceHead({
  place,
  fact,
}: {
  readonly place: Place
  /** Today's "N of M done". */
  readonly fact?: string
}): React.JSX.Element {
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-(length:--text-title-size) leading-(--text-title-line) font-bold text-foreground">
          {place.spine.name}
        </h1>
        <PlaceControls place={place} />
      </div>
      {fact === undefined ? null : <p className="mt-1 text-sm text-muted-foreground">{fact}</p>}
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
        <h2 className="mb-1 text-base font-semibold text-foreground">{heading}</h2>
      )}
      {children}
    </section>
  )
}

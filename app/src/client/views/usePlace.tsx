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
import { AddCoverAction, PageCover } from '../components/page-cover.js'
import { PageMark, usePageHasCover } from '../components/page-head.js'
import { Button } from '../components/ui/button.js'
import { Image as ImageIcon } from '../lib/icons.js'
import { useWearFilterLabel } from '../api/labels.js'
import { LabelFilterClear, ViewMenu } from './FilterControl.js'
import { labelsWorn, sortRows, wearsLabel } from './filter.js'
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
  /** The Labels this page's rows wear, which the View menu offers (#208). */
  readonly labels: readonly { readonly id: string; readonly name: string; readonly color: string }[]
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
  rows: readonly TaskCard[],
  options: PlaceOptions = {},
): Place {
  const [filter, setFilter] = usePageFilter(options.filterKey ?? spine.key)
  const [mode, setMode] = useViewMode(spine.views)
  const [search] = useSearchParams()
  const me = useMe()
  const create = useCreateTask()
  const pull = usePullIntoMyDay()
  /* A place page's own capture writes no page, so only the viewer's own
     Labels can be put on what it makes. */
  const wearFilterLabel = useWearFilterLabel(null)
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
          /* Under a Label filter a new task wears that label, or it would
             vanish the moment it was made. */
          wearFilterLabel(task.id, filter.label)
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
        input.filter(
          (task) =>
            ((options.showCompleted ?? filter.showCompleted) || task.status !== 'abandoned') &&
            wearsLabel(task, filter.label),
        ),
        filter.sort,
      ),
    capture: options.capture ?? capture,
    labels: labelsWorn(rows),
  }
}

/** Filter chips are gone; the one narrowing (Label) is said by PlaceControls. Kept for the folder page's import. */
export function PlaceFilterChips(_props: { readonly place: Place }): null {
  return null
}

/** The View menu: layout (where the page has more than one), grouping, sort, Show completed. */
export function PlaceControls({
  place,
  bare = false,
}: {
  readonly place: Place
  /** Nothing to group or sort: the View menu is left out. */
  readonly bare?: boolean
}): React.JSX.Element | null {
  if (bare && place.filter.label === null) return null
  /* The calendar draws its own grid and honours none of grouping, sort, Label
     or Show completed, so there its View menu is Layout alone. */
  const calendar = place.mode === 'calendar'
  return (
    <>
      {calendar ? null : <LabelFilterClear
        filter={place.filter}
        labels={place.labels}
        onChange={place.setFilter}
      />}
      {bare ? null : (
    <ViewMenu
      layouts={place.spine.views}
      layout={place.mode}
      onLayout={place.setMode}
      groups={place.spine.groups}
      completed={place.spine.completed}
      filter={place.filter}
      labels={place.labels}
      onChange={place.setFilter}
      {...(place.spine.ownOrder === undefined ? {} : { ownOrder: place.spine.ownOrder })}
      layoutOnly={calendar}
    />
      )}
    </>
  )
}

/**
 * Every screen's head: the title, at most one row of controls on its line, and
 * at most one muted line under it.
 *
 * **The title stands at one height on every screen.** A page's head
 * (`components/folder-head.tsx`) keeps a line above its title for "Add cover",
 * a 24px control under `pt-2` and `space-y-1`, hidden on a touch screen; this head keeps
 * the same empty line, so moving between Today, Settings and a page moves the
 * content and never the title. Change one, change the other.
 */
export function ScreenHead({
  title,
  controls,
  fact,
}: {
  readonly title: ReactNode
  readonly controls?: ReactNode
  readonly fact?: ReactNode
}): React.JSX.Element {
  return (
    <header className="space-y-1 pt-2">
      {/* Built as that line is (a small button in a block), so its height
          matches to the pixel. */}
      <div aria-hidden="true" className="[@media(hover:none)]:hidden">
        <Button variant="ghost" size="sm" tabIndex={-1} className="invisible">
          <ImageIcon />
          Add cover
        </Button>
      </div>
      <div className="flex min-h-(--text-title-line) items-center justify-between gap-4">
        <h1 data-page-title="" className="min-w-0 truncate text-(length:--text-title-size) leading-(--text-title-line) font-title text-foreground">
          {title}
        </h1>
        {controls === undefined || controls === null ? null : (
          <div className="flex shrink-0 items-center gap-2">{controls}</div>
        )}
      </div>
      {fact === undefined ? null : <p className="text-sm text-muted-foreground">{fact}</p>}
    </header>
  )
}

/**
 * A Focus page's head uses the same mark-and-cover composition as every other
 * first-class Dana page. The three fixed Focus pages already have durable place
 * cover storage. Added Focus lists may name an equivalent legacy place store;
 * a list with no durable store keeps its native icon and plain head rather than
 * pretending a browser-only choice is saved.
 */
export function PlaceHead({
  place,
  fact,
  bare = false,
  identityKey,
  controls,
}: {
  readonly place: Place
  /** Today's "N of M done". */
  readonly fact?: string
  /** An empty list has nothing to group or sort: no View menu. */
  readonly bare?: boolean
  /** Durable place-cover key for an added Focus list, where one exists. */
  readonly identityKey?: string
  /** What stands in for the View menu, where a page draws its own (or null for none). */
  readonly controls?: ReactNode
}): React.JSX.Element {
  const nativeIdentityKey =
    place.spine.key === 'today' ||
    place.spine.key === 'scheduled' ||
    place.spine.key === 'assignments'
      ? place.spine.key
      : undefined
  const storageName = identityKey ?? nativeIdentityKey
  /* Hooks are unconditional. `today` is only a harmless read fallback when a
     Focus list has no durable identity store; `hasCover` keeps it from drawing. */
  const coverStorageName = storageName ?? 'today'
  const storedCover = usePageHasCover(coverStorageName)
  const hasCover = storageName !== undefined && storedCover

  return (
    <header className={hasCover ? 'group/head pt-0' : 'group/head pt-2'}>
      {hasCover ? (
        <div className="-mt-4 md:-mt-6">
          <PageCover storageName={coverStorageName} />
        </div>
      ) : null}
      <PageMark icon={place.spine.icon} hasCover={hasCover} />
      {storageName === undefined ? null : (
        <div className="mt-1">
          <AddCoverAction storageName={storageName} />
        </div>
      )}
      <div className="mt-1.5 flex items-baseline justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-3 max-md:flex-col max-md:items-start max-md:gap-1">
          <h1 data-page-title="" className="min-w-0 max-w-full truncate text-[length:var(--text-title-size)] leading-8 font-title text-foreground max-md:whitespace-normal">
            {place.spine.name}
          </h1>
          {fact === undefined ? null : (
            <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
              {fact}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {controls === undefined ? <PlaceControls place={place} bare={bare} /> : controls}
        </div>
      </div>
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
        <h2 className="mb-1 px-1.5 text-sm font-section text-foreground">{heading}</h2>
      )}
      {children}
    </section>
  )
}

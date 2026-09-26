/*
What every place-page shares: its header (title and the View menu), its View
settings, its layout, and the capture its spine defines. A page keeps only
which rows it reads and how it arranges them when nobody asked for a grouping.
*/
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'

import type { FocusListKey, PatchFocusAppearance } from '../../shared/bundle.js'
import type { TaskCard } from '../../shared/tasks.js'
import { useCreateTask, usePatchBundle, usePullIntoMyDay } from '../api/mutations.js'
import { useBundle, useMe } from '../api/queries.js'
import { presenterToday } from '../parts/presenters.js'
import { AddCoverAction, PageCover } from '../components/page-cover.js'
import { PageMark, usePageHasCover } from '../components/page-head.js'
import { IconPicker } from '../components/page/IconPicker.js'
import { Button } from '../components/ui/button.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import { Image as ImageIcon } from '../lib/icons.js'
import { useWearFilterLabel } from '../api/labels.js'
import { focusMark } from '../shell/focus-lists.js'
import type { FocusMark } from '../shell/focus-lists.js'
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

function focusAppearancePatch(
  key: FocusListKey,
  value: null | { icon?: string | null; color?: string | null },
): PatchFocusAppearance {
  const patch: PatchFocusAppearance = {}
  patch[key] = value
  return patch
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
    /* Only a layout this page offers is seeded here. */
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

/** Filter chips are gone. Kept for the folder page's import. */
export function PlaceFilterChips(_props: { readonly place: Place }): null {
  return null
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
 * first-class Dana page. Its mark reads and writes #353's account-level Focus
 * appearance, while its cover stays on the existing native-place cover path.
 * It keeps no View menu and no count (M4); a page passes its own controls.
 */
export function PlaceHead({
  place,
  controls,
  identityKey,
  focusKey,
}: {
  readonly place: Place
  /** The page's own controls, if any. Focus pages keep no View menu (M4). */
  readonly controls?: ReactNode
  /** Durable place-cover key for an added Focus list. */
  readonly identityKey?: string
  /** Added Focus lists use a generic spine, so their account identity key is explicit. */
  readonly focusKey?: FocusListKey
}): React.JSX.Element {
  const nativeIdentityKey =
    place.spine.key === 'today' ||
    place.spine.key === 'scheduled' ||
    place.spine.key === 'assignments'
      ? place.spine.key
      : undefined
  const storageName = identityKey ?? nativeIdentityKey
  const nativeFocusKey: FocusListKey | undefined =
    place.spine.key === 'today' ||
    place.spine.key === 'scheduled' ||
    place.spine.key === 'assignments'
      ? place.spine.key
      : undefined
  const resolvedFocusKey = focusKey ?? nativeFocusKey
  const bundle = useBundle()
  const patchBundle = usePatchBundle()
  const [markOpen, setMarkOpen] = useState(false)
  const appearance =
    resolvedFocusKey === undefined
      ? undefined
      : bundle.data?.focus_appearance[resolvedFocusKey]
  const mark: FocusMark =
    resolvedFocusKey === undefined
      ? { icon: place.spine.icon }
      : focusMark(resolvedFocusKey, bundle.data?.focus_appearance)

  /* Hooks are unconditional. `today` is only a harmless read fallback when a
     place has no durable cover store; `hasCover` keeps it from drawing. */
  const coverStorageName = storageName ?? 'today'
  const storedCover = usePageHasCover(coverStorageName)
  const hasCover = storageName !== undefined && storedCover

  function saveFocusAppearance(
    value: null | { icon?: string | null; color?: string | null },
  ): void {
    if (resolvedFocusKey === undefined) return
    patchBundle.mutate({
      focus_appearance: focusAppearancePatch(resolvedFocusKey, value),
    })
  }

  return (
    <header className={hasCover ? 'group/head pt-0' : 'group/head pt-2'}>
      {hasCover ? (
        <div className="-mt-4 md:-mt-6">
          <PageCover storageName={coverStorageName} />
        </div>
      ) : null}
      {resolvedFocusKey === undefined ? (
        <PageMark icon={mark.icon} hasCover={hasCover} />
      ) : (
        <Popover open={markOpen} onOpenChange={setMarkOpen}>
          <PopoverTrigger
            render={
              <PageMark
                icon={mark.icon}
                hasCover={hasCover}
                interactive
                aria-label={`Icon and colour for ${place.spine.name}`}
                {...(mark.color === undefined ? {} : { color: mark.color })}
              />
            }
          />
          <PopoverContent align="start" className="w-auto p-0">
            <IconPicker
              icon={appearance?.icon ?? null}
              color={appearance?.color ?? null}
              onPick={(next) => {
                saveFocusAppearance(next)
              }}
              {...(appearance?.icon == null
                ? {}
                : {
                    onRemove: () => {
                      saveFocusAppearance({ icon: null })
                      setMarkOpen(false)
                    },
                  })}
            />
            {appearance === undefined ? null : (
              <div className="border-t border-border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => {
                    saveFocusAppearance(null)
                    setMarkOpen(false)
                  }}
                >
                  Reset to default
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
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
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {controls}
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

/*
Which zoom the calendar opens at belongs to the person, not to one browser.

`user_settings.calendar_zoom` is the record for all three of 9.5's zooms: day,
week and month. localStorage is only its fast mirror, so the first grid draws
at the expected zoom while the settings bundle is still loading. Once that
bundle arrives it wins and refreshes the mirror, exactly like the theme and
exactly like where a task opens.

**This is issue #140, and the thing it closes is a gap between the
specification and the code rather than a defect in either alone.** 9.5 has
always said "mode and zoom persist client-side"; `PlannedCalendar.tsx` held the
zoom in `useState('month')` and persisted nothing, so a person who chose week
got month back on the next visit and on every reload. Imran ruled on that issue
that the preference should follow the account rather than the browser,
"consistent with other durable preferences such as density, clock format, and
task-open surface", and ruled out the browser-only answer by name because it
would create another split record. Hassan settled the contract on #142: the
column, migration 0013's named CHECK, the field on the v2 bundle, and AC-378 to
AC-380 over the wire. This module is the client half, and until it landed the
column was inert in production.

**Three constraints, the same three item 43 gave the theme, and each is a line
below.**

- **The column stays the truth and the mirror is a cache.** `useCalendarZoom`
  answers the bundle when it has landed and the mirror only until then, so a
  stale or absent mirror costs one frame and never a wrong preference.
- **Write-through and single-direction.** The mirror is refreshed wherever the
  bundle's value is read and wherever a person chooses; nothing reads the
  mirror back into the column.
- **It is cleared at sign-out**, beside the theme's and the task surface's, so
  a shared device does not open the next person's calendar on the last
  person's zoom.

**The key is `dana.calendarZoom` and it is new**, which is the only reason it
could be chosen at all: #140 records that renaming a localStorage key is the
one genuinely irreversible thing in this client, because it silently resets the
preference for every existing person and no later deploy can reach the orphaned
value. Nothing has ever been written under this name, so nothing is orphaned by
picking it; it is spelled to match `dana.taskSurface`, which is the module this
one is modelled on, rather than `dana:theme`, which is the outlier.

**The list of zooms is imported and never restated.** `shared/bundle.ts`
exports `CALENDAR_ZOOMS` and `DEFAULT_CALENDAR_ZOOM` precisely so that the
client does not carry a fourth copy of three strings, and its own comment
records that `Zoom` in `components/calendar/grid.ts` is already a second one
with nothing linking them. The assertion below links them: the two unions are
checked equal at compile time, so a fourth zoom added to one and not the other
is a typecheck failure here rather than a value the grid cannot draw.

**A queue rather than a fire-and-forget, for the reason
`task-surface-preference.ts` gives its own.** Two quick presses on the zoom
strip are two writes, and unqueued they can reach the server out of order and
leave the account on the earlier one while the interface shows the later. The
interface still changes on the press: the mirror and the cached bundle are
updated first and rolled back if the write fails.
*/

import { useEffect, useSyncExternalStore } from 'react'

import { mutateApi } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { useBundle } from '../api/queries.js'
import {
  CALENDAR_ZOOMS,
  DEFAULT_CALENDAR_ZOOM,
  getSettingsResponse,
} from '../../shared/bundle.js'
import type { CalendarZoom, GetSettingsResponse } from '../../shared/bundle.js'
import type { Zoom } from '../components/calendar/grid.js'
import { showToast } from '../state/toasts.js'

/* The two unions are one set of strings, asserted rather than assumed. 9.5 is
   what says which zooms exist; this fails the build if the calendar's own type
   and the stored column's ever stop agreeing about them. */
const _zoomsAgree: CalendarZoom extends Zoom
  ? Zoom extends CalendarZoom
    ? true
    : never
  : never = true
void _zoomsAgree

/** The mirror's key. New at #140; see the header before renaming it. */
export const CALENDAR_ZOOM_KEY = 'dana.calendarZoom'

function fromStored(value: string | null): CalendarZoom {
  return CALENDAR_ZOOMS.find((zoom) => zoom === value) ?? DEFAULT_CALENDAR_ZOOM
}

function read(): CalendarZoom {
  try {
    return fromStored(localStorage.getItem(CALENDAR_ZOOM_KEY))
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return DEFAULT_CALENDAR_ZOOM
  }
}

let current: CalendarZoom = read()
const listeners = new Set<() => void>()
/* Serialize writes so two quick choices cannot reach the server out of order
   and leave the account on the older one. The interface still updates at once. */
let writeQueue: Promise<void> = Promise.resolve()

function mirrorCalendarZoom(next: CalendarZoom): void {
  const changed = next !== current
  current = next
  try {
    localStorage.setItem(CALENDAR_ZOOM_KEY, next)
  } catch {
    /* The server remains the record when browser storage is unavailable. */
  }
  if (!changed) return
  listeners.forEach((notify) => {
    notify()
  })
}

/** A shared device must not borrow the previous person's first-paint zoom. */
export function clearCalendarZoomMirror(): void {
  current = DEFAULT_CALENDAR_ZOOM
  try {
    localStorage.removeItem(CALENDAR_ZOOM_KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
  listeners.forEach((notify) => {
    notify()
  })
}

/**
 * The zoom the calendar draws: 4.10's column once the bundle has answered, and
 * the browser's mirror for the frames before that.
 */
export function useCalendarZoom(): CalendarZoom {
  const bundle = useBundle()
  const mirrored = useSyncExternalStore<CalendarZoom>(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => DEFAULT_CALENDAR_ZOOM,
  )
  const recorded = bundle.data?.calendar_zoom

  useEffect(() => {
    if (recorded !== undefined) mirrorCalendarZoom(recorded)
  }, [recorded])

  return recorded ?? mirrored
}

/**
 * 9.5's zoom strip, and the "+N more" reveal that switches to the day zoom.
 *
 * Both are a person choosing a zoom, so both write. The reveal is not an
 * exception hiding inside the mechanism: a calendar left at the day zoom by
 * pressing "+N more" is a calendar at the day zoom, and the next visit opening
 * there is what "the zoom persists" means.
 */
export function setCalendarZoom(zoom: CalendarZoom): void {
  const previous = current
  mirrorCalendarZoom(zoom)
  const client = queryClient()
  const previousBundle = client?.getQueryData<GetSettingsResponse>(queryKeys.bundle())
  client?.setQueryData<GetSettingsResponse>(queryKeys.bundle(), (bundle) =>
    bundle === undefined ? bundle : { ...bundle, calendar_zoom: zoom },
  )
  writeQueue = writeQueue.then(async () => {
    try {
      const bundle = await mutateApi(getSettingsResponse, {
        method: 'PATCH',
        path: '/settings',
        body: { calendar_zoom: zoom },
      })
      /* A newer queued choice already owns the optimistic interface. Its
         request will run next, so an older response must not repaint it. */
      if (current !== zoom) return
      mirrorCalendarZoom(bundle.calendar_zoom)
      client?.setQueryData(queryKeys.bundle(), bundle)
      void client?.invalidateQueries()
    } catch (error: unknown) {
      if (current === zoom) {
        mirrorCalendarZoom(previous)
        client?.setQueryData(queryKeys.bundle(), previousBundle)
        void client?.invalidateQueries()
      }
      showToast(writeFailureMessage(error))
    }
  })
}

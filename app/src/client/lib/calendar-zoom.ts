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

**Peeking is not choosing, and that is Imran's ruling of 2026-09-04 on the
review of #140 rather than an implementation nicety.** 9.5's "+N more" control
switches to the day zoom to show a crowded day whole. The first build of this
module wrote that to the account, on the reasoning that a calendar at the day
zoom is a calendar at the day zoom. The ruling is the other way and it is
right: a person pressing "+N more" is looking at one day, not changing what
their calendar is, and a look that silently rewrites a preference on every
device they own is a control with a side effect nobody asked for. So the reveal
sets a **transient** zoom, local to this visit and to this browser: it is not
written, not mirrored, and it is dropped the moment the person chooses a zoom
from the strip or leaves the page. The next visit, anywhere, opens on what they
last chose. `revealCalendarZoom` is the reveal's and `setCalendarZoom` is the
strip's, and nothing else may call the second.

**Three constraints, the same three item 43 gave the theme, and each is a line
below.**

- **The column stays the truth and the mirror is a cache.** `useCalendarZoom`
  answers a transient reveal first, then the bundle when it has landed, and the
  mirror only until then, so a stale or absent mirror costs one frame and never
  a wrong preference.
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
/*
The reveal's zoom, which is a look rather than a preference (see the header).

Module state and not React state, so that one subscription serves both it and
the mirror, and so that `setCalendarZoom` can drop it from outside the
component. Null means nobody is peeking, which is every visit that has not
pressed "+N more".
*/
let revealed: CalendarZoom | null = null
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
  notifyAll()
}

/* Broken out because `mirrorCalendarZoom` notifies only when the mirror moved,
   and a choice that merely ends a reveal (Month pressed while peeking at a day)
   has to notify on its own account. The alternative is a control that looks
   dead. */
function notifyAll(): void {
  listeners.forEach((notify) => {
    notify()
  })
}

/** A shared device must not borrow the previous person's first-paint zoom. */
export function clearCalendarZoomMirror(): void {
  current = DEFAULT_CALENDAR_ZOOM
  revealed = null
  try {
    localStorage.removeItem(CALENDAR_ZOOM_KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
  notifyAll()
}

/**
 * 9.5's "+N more": show this day whole, for this visit, changing nothing.
 *
 * Nothing is written and nothing is mirrored. `PlannedCalendar` drops it when
 * it unmounts, which is 9.5's "leaves the page", and `setCalendarZoom` drops it
 * because an explicit choice is what a reveal defers to.
 */
export function revealCalendarZoom(zoom: CalendarZoom): void {
  if (revealed === zoom) return
  revealed = zoom
  notifyAll()
}

/** Stop peeking: the calendar goes back to the zoom the person chose. */
export function clearRevealedZoom(): void {
  if (revealed === null) return
  revealed = null
  notifyAll()
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

/**
 * The zoom the calendar draws, in the order the three answers rank: a reveal
 * this visit, then 4.10's column once the bundle has answered, then the
 * browser's mirror for the frames before that.
 *
 * Two subscriptions to one listener set rather than one snapshot returning
 * both, because `useSyncExternalStore` compares snapshots by identity and a
 * fresh object every call is an infinite render. Both snapshots are primitives.
 */
export function useCalendarZoom(): CalendarZoom {
  const bundle = useBundle()
  const mirrored = useSyncExternalStore<CalendarZoom>(
    subscribe,
    () => current,
    () => DEFAULT_CALENDAR_ZOOM,
  )
  const peeked = useSyncExternalStore<CalendarZoom | null>(
    subscribe,
    () => revealed,
    () => null,
  )
  const recorded = bundle.data?.calendar_zoom

  useEffect(() => {
    if (recorded !== undefined) mirrorCalendarZoom(recorded)
  }, [recorded])

  return peeked ?? recorded ?? mirrored
}

/**
 * 9.5's zoom strip, and the only thing in this client that writes the zoom.
 *
 * A choice ends a reveal, which is why the transient value is dropped here and
 * not only on unmount: pressing Month while peeking at a day has to leave the
 * calendar on Month.
 */
export function setCalendarZoom(zoom: CalendarZoom): void {
  const previous = current
  revealed = null
  mirrorCalendarZoom(zoom)
  notifyAll()
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

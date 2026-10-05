// The calendar zoom is an account setting; localStorage mirrors it for the first paint,
// and the bundle wins once loaded. A phone's day tap is a transient reveal that is never
// written. Writes are queued so quick presses cannot land out of order.

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

// Fails the build if the calendar's `Zoom` and the stored column's union disagree.
const _zoomsAgree: CalendarZoom extends Zoom
  ? Zoom extends CalendarZoom
    ? true
    : never
  : never = true
void _zoomsAgree

/** The mirror's key. Never rename it: that resets every user's setting. */
export const CALENDAR_ZOOM_KEY = 'dana.calendarZoom'

function fromStored(value: string | null): CalendarZoom {
  return CALENDAR_ZOOMS.find((zoom) => zoom === value) ?? DEFAULT_CALENDAR_ZOOM
}

function read(): CalendarZoom {
  try {
    return fromStored(localStorage.getItem(CALENDAR_ZOOM_KEY))
  } catch {
    // Private modes and sandboxed frames throw rather than return null.
    return DEFAULT_CALENDAR_ZOOM
  }
}

let current: CalendarZoom = read()
// The reveal's zoom, a look rather than a preference. Module state so `setCalendarZoom`
// can drop it. Null means nobody is peeking.
let revealed: CalendarZoom | null = null
const listeners = new Set<() => void>()
// Serialize writes so two quick choices cannot reach the server out of order.
let writeQueue: Promise<void> = Promise.resolve()

function mirrorCalendarZoom(next: CalendarZoom): void {
  const changed = next !== current
  current = next
  try {
    localStorage.setItem(CALENDAR_ZOOM_KEY, next)
  } catch {
    // The server remains the record when browser storage is unavailable.
  }
  if (!changed) return
  notifyAll()
}

// Separate because `mirrorCalendarZoom` notifies only when the mirror moved, and ending a
// reveal must notify too.
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
    // Nothing stored is nothing to clear.
  }
  notifyAll()
}

/**
 * A phone's day tap: show this day whole for this visit. Nothing is written or mirrored;
 * `PlannedCalendar` drops it on unmount and `setCalendarZoom` drops it on a choice.
 */
export function revealCalendarZoom(zoom: CalendarZoom): void {
  if (revealed === zoom) return
  revealed = zoom
  notifyAll()
}

/** Stop peeking: back to the zoom the person chose. */
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
 * A reveal first, then the account column once the bundle answers, then the mirror.
 * Two subscriptions, because `useSyncExternalStore` compares snapshots by identity.
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

/** The zoom strip; the only writer of the zoom. A choice also ends a reveal. */
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
      // A newer queued choice already owns the interface, so an older response must not repaint it.
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

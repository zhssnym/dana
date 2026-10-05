// Zone-dependent date helpers: today(V), the local date of an instant, and a day's instant window.
// Luxon is asked only instant-to-local, which is total; local-to-instant edges are derived by search (11.15).
import { DateTime } from 'luxon'

import { isIanaTimezone } from '../../shared/timezone.js'

import { civilMillis, DAY_MS } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'

/** A half-open window of instants: startInclusive <= t < endExclusive. Consecutive days tile with no gap. */
export interface LocalDayWindow {
  readonly date: CalendarDate
  readonly startInclusive: Date
  readonly endExclusive: Date
}

/** Wider than any tzdb clock shift, so it brackets both edge searches of a day. */
const SEARCH_SPAN_MS = 36 * 3_600_000

/** Zones that passed the validator. Bounded by the tzdb; refused names are never cached. */
const validatedZones = new Set<string>()

/** The shared IANA zone guard (src/shared/timezone.ts), cached, also used by reminder-time.ts. */
export function assertIanaZone(tz: string): string {
  if (validatedZones.has(tz)) return tz
  if (!isIanaTimezone(tz)) {
    throw new TypeError(
      `tz must be a valid IANA timezone identifier; got ${JSON.stringify(tz)}`,
    )
  }
  validatedZones.add(tz)
  return tz
}

function localDateOfMillis(millis: number, tz: string): CalendarDate {
  const date = DateTime.fromMillis(millis, { zone: tz }).toISODate()
  if (date === null) {
    throw new TypeError(`could not read a local date in ${tz} at ${millis}`)
  }
  return date
}

/** The civil date an instant falls on in tz (Q6's grouping key). */
export function localDateOf(instant: Date, tz: string): CalendarDate {
  assertIanaZone(tz)
  return localDateOfMillis(instant.getTime(), tz)
}

/** today(V), section 8.1. Pass `at` when the caller has its own clock. */
export function today(tz: string, at: Date = new Date()): CalendarDate {
  return localDateOf(at, tz)
}

/**
 * An instant inside the given civil date in tz, or a throw when the date does not exist there.
 * Probing the zone offset a day either side brackets any transition near midnight.
 */
function instantInsideLocalDay(date: CalendarDate, tz: string): number {
  const naive = civilMillis(date)
  const offsets = [
    DateTime.fromMillis(naive - DAY_MS, { zone: tz }).offset,
    DateTime.fromMillis(naive + DAY_MS, { zone: tz }).offset,
  ]
  let inside: number | null = null
  for (const offset of offsets) {
    const candidate = naive - offset * 60_000
    if (localDateOfMillis(candidate, tz) === date) {
      inside = inside === null ? candidate : Math.min(inside, candidate)
    }
  }
  if (inside === null) {
    // The civil day does not exist in this zone (Pacific/Apia skipped 2011-12-30).
    throw new RangeError(`${date} does not exist in ${tz}`)
  }
  return inside
}

/**
 * Both edges of one civil day in tz, by binary search in the instant-to-local direction.
 * A local midnight can be missing or doubled (America/Santiago, America/Havana), so never ask Luxon for one.
 */
function localDayBounds(
  date: CalendarDate,
  tz: string,
): { start: number; end: number } {
  const inside = instantInsideLocalDay(date, tz)

  let before = inside - SEARCH_SPAN_MS
  let start = inside
  while (start - before > 1) {
    const mid = before + Math.floor((start - before) / 2)
    if (localDateOfMillis(mid, tz) === date) start = mid
    else before = mid
  }

  let last = inside
  let end = inside + SEARCH_SPAN_MS
  while (end - last > 1) {
    const mid = last + Math.floor((end - last) / 2)
    if (localDateOfMillis(mid, tz) === date) last = mid
    else end = mid
  }

  return { start, end }
}

/**
 * The instants of one civil day in tz, for indexable completed_at range queries (Q1R, Q6).
 * Not always 24 hours: 23, 25, 23.5 or 24.5 across transitions.
 */
export function localDayWindow(date: CalendarDate, tz: string): LocalDayWindow {
  assertIanaZone(tz)
  const { start, end } = localDayBounds(date, tz)
  return {
    date,
    startInclusive: new Date(start),
    endExclusive: new Date(end),
  }
}

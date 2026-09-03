/*
The zone-dependent half of the date helpers: reading a civil date off an
instant, today(V), and the local-day window that turns "falls on today in V's
timezone" into a comparison a query can index.

Luxon 3 does the IANA math here, per 11.9 ("Luxon 3 performs all IANA
timezone math"). Only one direction of that math is used: instant to local.
That direction is total and single valued at every instant of every zone, so
none of 11.15's Luxon hazard applies to it. The other direction, local to
instant, is where DST gaps and ambiguities live and where 11.15 forbids
Luxon's raw behavior; localDayWindow needs boundaries that live in exactly
that direction and so never asks Luxon for one, deriving them from
instant-to-local reads instead. The reasoning is written out at
localDayBounds.

Every zone entering this module goes through the shared validator of
app/src/shared/timezone.ts, which 11.15 names as the single IANA validation
and whose sign guard refuses the ECMA-402 offset identifiers ("+05:30") that
Intl accepts and Luxon's zone math cannot use.
*/
import { DateTime } from 'luxon'

import { isIanaTimezone } from '../../shared/timezone.js'

import { civilMillis, DAY_MS } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'

/** A window of absolute time, half open: an instant belongs to the day when
 * startInclusive <= t < endExclusive.
 *
 * Half open rather than inclusive on both ends because instants are dense.
 * An inclusive end would have to name the last representable instant of the
 * day, which is a resolution question (Postgres timestamptz stores
 * microseconds, JavaScript Date milliseconds) rather than a calendar one, and
 * the two answers would disagree by under a millisecond exactly once a day.
 * Half open also makes consecutive days tile the timeline with no gap and no
 * overlap, which is the property Q6's day grouping needs. */
export interface LocalDayWindow {
  readonly date: CalendarDate
  readonly startInclusive: Date
  readonly endExclusive: Date
}

/** No transition in the tzdb moves a clock by anything near this, so a day's
 * run of instants is strictly inside a window this wide around any instant
 * within it. Used as the bracket for both edge searches. */
const SEARCH_SPAN_MS = 36 * 3_600_000

/** Zones already put through the shared validator.
 *
 * The validator's oracle is a fresh Intl.DateTimeFormat, which is the
 * expensive part of every call here, and localDateOf runs once per row when
 * Q6 groups a page of completed tasks by day. Only names the validator
 * accepted are ever added, and the tzdb is a fixed finite list, so this set
 * is bounded by the zone database rather than by request volume; anything
 * refused is refused again next time rather than remembered. */
const validatedZones = new Set<string>()

/**
 * The zone guard, shared with reminder-time.ts so one cache serves both and one
 * message describes the failure. 11.15 names app/src/shared/timezone.ts as the
 * single IANA validation and the fire-instant module needs it for the same
 * reason this file does: without it, an identifier Luxon cannot use produces
 * NaN arithmetic and a failure that names something else.
 */
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
    // Unreachable behind assertIanaZone; a throw beats a null propagating into a
    // query as the string "null".
    throw new TypeError(`could not read a local date in ${tz} at ${millis}`)
  }
  return date
}

/**
 * The civil date an instant falls on in tz.
 *
 * This is Q6's grouping key ("grouped for display by the completed_at date in
 * V's timezone") and the read 4.11 describes for completed_at, a UTC instant
 * "grouped into days in the viewer's timezone at render".
 */
export function localDateOf(instant: Date, tz: string): CalendarDate {
  assertIanaZone(tz)
  return localDateOfMillis(instant.getTime(), tz)
}

/**
 * today(V), section 8.1: the current date in tz at the moment of evaluation.
 *
 * The instant is a parameter, defaulted rather than captured, and that is
 * deliberate. 8.1 says only that the server computes today, which admits
 * reading the moment from the process clock or from the database; the P4
 * change control of 2026-08-07 ruled both readings open and declined to
 * settle them on the implementer's behalf. A helper that called new Date()
 * out of sight would settle it by accident, so the caller supplies the
 * instant whenever it has an opinion about where the clock comes from.
 */
export function today(tz: string, at: Date = new Date()): CalendarDate {
  return localDateOf(at, tz)
}

/**
 * An instant known to fall on the given civil date in tz, or a throw when the
 * date does not exist there.
 *
 * Naive midnight offset by the zone's offset is the instant midnight would be
 * if nothing were moving. Probing that offset a full day either side brackets
 * any transition touching this midnight, and at least one of the two
 * resulting instants lands inside the target day in every case a real zone
 * produces.
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
    // No local time on this date is reachable from either offset, which means
    // the civil day does not exist in this zone: Pacific/Apia skipped
    // 2011-12-30 outright when it crossed the date line, a fact measured on
    // the installed tzdb rather than recalled. Every date that reaches this
    // module is read back off an instant, by today() or by localDateOf(), so
    // such a date cannot arrive from a caller that read one rather than
    // invented one, and refusing is louder than handing back a window no row
    // can ever fall in.
    throw new RangeError(`${date} does not exist in ${tz}`)
  }
  return inside
}

/**
 * Both edges of one civil day in tz, as absolute milliseconds.
 *
 * The edges are defined in the instant-to-local direction on purpose, because
 * that direction is total: every instant has exactly one local date, whatever
 * DST is doing. Asking Luxon the other way, for "midnight on this date in
 * this zone", is the question 11.15's Luxon bullet is about, and twice a year
 * it has no answer or two. Measured on the installed tzdb: America/Santiago
 * runs 2026-09-05 23:59 straight to 2026-09-06 01:00, so that date has no
 * midnight at all, and America/Havana runs 2026-11-01 00:59 back to 00:00, so
 * that date has two.
 *
 * From an instant known to be inside the day, each edge is a binary search,
 * exact to the millisecond and monotone because the instants sharing a local
 * date form one contiguous run. What comes out is the earliest and the
 * first-after by construction: across a spring-forward gap the start is the
 * first instant that exists, and across a fall-back overlap it is the earlier
 * of the two readings, which is 8.6's rule arrived at by definition rather
 * than by trusting a library to have chosen it.
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
 * The window of instants belonging to one civil day in tz.
 *
 * This is what turns two spec sentences into comparisons a query can run
 * against an index rather than against a per-row conversion: Q1R's
 * "completed_at falls on today in V's timezone", and Q6's grouping by
 * completion day, which pages on the (completed_at DESC, id DESC) keyset that
 * 4.12 names. Compare completed_at >= startInclusive AND completed_at <
 * endExclusive.
 *
 * The window is 24 hours only in a zone with no transition inside it. It is
 * 23 hours across a spring forward, 25 across a fall back, and 23.5 or 24.5
 * in the zones that shift by half an hour; the tests measure each of those
 * against the installed tzdb. Callers must not assume the length.
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

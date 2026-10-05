// 8.6's fire-instant computation. A time in a spring-forward gap fires at the transition; an ambiguous
// fall-back time fires at the earlier instant. Raw Luxon gets both wrong, and its answer depends on the process clock.
// Pure: no database, no clock.
import { DateTime } from 'luxon'

import { assertCalendarDate, civilMillis, DAY_MS } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { assertIanaZone } from './today.js'

/** Which case a local time fell into, so tests can assert which DST rule fired. */
export type LocalTimeKind =
  | 'exact'
  /** No instant has it: a spring-forward gap. 8.6 resolves forward. */
  | 'gap'
  /** Two instants have it: a fall-back overlap. 8.6 resolves to the earlier. */
  | 'fold'

export interface LocalResolution {
  readonly instant: Date
  readonly kind: LocalTimeKind
}

/** Exactly one of offsetMinutes and timeOfDay is non-null (4.8's CHECK). The offset arm needs dueTime. */
export interface FireAtInput {
  /** The assignee's zone, or the reminder creator's when unassigned. */
  readonly zone: string
  readonly dueDate: CalendarDate
  readonly dueTime: string | null
  readonly offsetMinutes: number | null
  readonly timeOfDay: string | null
}

/** Wider than any zone shift, so probes this far either side bracket every transition. */
const PROBE_SPAN_MS = DAY_MS

const WALL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Minutes the zone is ahead of UTC at an instant. The one Luxon call, in the safe direction. */
function offsetMinutesAt(instant: number, zone: string): number {
  return DateTime.fromMillis(instant, { zone }).offset
}

function wallMillisAt(instant: number, zone: string): number {
  return instant + offsetMinutesAt(instant, zone) * 60_000
}

/** Milliseconds into the day for HH:MM. A seconds field must be zero; dropping one would move a fire instant. */
function millisIntoDay(time: string, label: string): number {
  const match = WALL_TIME_PATTERN.exec(time)
  if (match === null) {
    throw new TypeError(
      `${label} must be an HH:MM wall-clock time; got ${JSON.stringify(time)}`,
    )
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] === undefined ? 0 : Number(match[3])
  if (hours > 23 || minutes > 59 || seconds !== 0) {
    throw new TypeError(
      `${label} must be a real minute-precision time of day (4.11); got ${JSON.stringify(time)}`,
    )
  }
  return (hours * 60 + minutes) * 60_000
}

/**
 * The instant a naive local wall clock names in a zone, with 8.6's rules.
 * Candidates come from the offsets a day either side; a gap bisects to the transition instant.
 */
function resolveWallMillis(wallMillis: number, zone: string): LocalResolution {
  // An invalid zone gives NaN offsets, which would fail later with a misleading error.
  assertIanaZone(zone)
  const early = wallMillis - offsetMinutesAt(wallMillis - PROBE_SPAN_MS, zone) * 60_000
  const late = wallMillis - offsetMinutesAt(wallMillis + PROBE_SPAN_MS, zone) * 60_000

  const candidates = early === late ? [early] : [early, late]
  const valid = candidates.filter(
    (candidate) => wallMillisAt(candidate, zone) === wallMillis,
  )

  const earliest = valid[0]
  if (earliest !== undefined) {
    // Ambiguous: take the earlier instant. One candidate takes the same branch.
    const instant = valid.reduce((lowest, next) => Math.min(lowest, next), earliest)
    return {
      instant: new Date(instant),
      kind: valid.length > 1 ? 'fold' : 'exact',
    }
  }

  const short = candidates.find((c) => wallMillisAt(c, zone) < wallMillis) ?? null
  const over = candidates.find((c) => wallMillisAt(c, zone) > wallMillis) ?? null
  if (short === null || over === null || short >= over) {
    // Unreachable for real zones. fire_at is NOT NULL, so a wrong instant would mean an email at the wrong hour.
    throw new RangeError(
      `could not bracket the transition around ${new Date(wallMillis).toISOString().slice(0, 16)} local in ${zone}`,
    )
  }

  // The first instant past the gap is the transition itself.
  let behind = short
  let ahead = over
  while (ahead - behind > 1) {
    const mid = behind + Math.floor((ahead - behind) / 2)
    if (wallMillisAt(mid, zone) > wallMillis) ahead = mid
    else behind = mid
  }
  return { instant: new Date(ahead), kind: 'gap' }
}

/** A wall-clock time on a date in a zone, under 8.6's DST rules. */
export function resolveLocalTime(
  date: CalendarDate,
  time: string,
  zone: string,
): LocalResolution {
  return resolveWallMillis(civilMillis(date) + millisIntoDay(time, 'time'), zone)
}

/**
 * 8.6's compute_fire_at. The offset arm subtracts in local time, then resolves the zone:
 * subtracting from the instant would step over a gap (AC-144).
 */
export function computeFireAt(input: FireAtInput): Date {
  return resolveFireAt(input).instant
}

/** computeFireAt plus the case it landed in. */
export function resolveFireAt(input: FireAtInput): LocalResolution {
  const { zone, dueDate, dueTime, offsetMinutes, timeOfDay } = input
  const day = civilMillis(assertCalendarDate(dueDate, 'due_date'))

  if (offsetMinutes !== null) {
    // Two modes or none breaks 4.8's CHECK; guessing which was meant would silently switch modes.
    if (timeOfDay !== null) {
      throw new TypeError(
        'a reminder carries exactly one of offset_minutes and time_of_day (4.8); this input carries both',
      )
    }
    if (!Number.isInteger(offsetMinutes)) {
      throw new TypeError(
        `offset_minutes must be whole minutes (4.8); got ${JSON.stringify(offsetMinutes)}`,
      )
    }
    if (dueTime === null) {
      // An offset reminder needs a due_time. Write paths must prevent this; guessing would invent a fire time.
      throw new TypeError(
        "8.6's offset arm requires the task's due_time, and this task has none (4.8, 7.9)",
      )
    }
    const local = day + millisIntoDay(dueTime, 'due_time') - offsetMinutes * 60_000
    return resolveWallMillis(local, zone)
  }

  // The date-only arm does not check for a missing due_time: that guard belongs to the write paths (4.8).
  if (timeOfDay === null) {
    throw new TypeError(
      'a reminder carries exactly one of offset_minutes and time_of_day (4.8); this input carries neither',
    )
  }
  return resolveWallMillis(day + millisIntoDay(timeOfDay, 'time_of_day'), zone)
}

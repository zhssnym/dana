// Floating calendar dates (YYYY-MM-DD) and their arithmetic. Nothing here knows a timezone;
// turning a date into an instant lives in today.ts.

/** A floating calendar date, YYYY-MM-DD. Every function below validates its input. */
export type CalendarDate = string

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const DAY_MS = 86_400_000

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function civilMillisUnchecked(date: string): number {
  const at = new Date(0)
  // setUTCFullYear, not Date.UTC: Date.UTC maps two-digit years into the 1900s.
  at.setUTCFullYear(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
  at.setUTCHours(0, 0, 0, 0)
  return at.getTime()
}

function formatCivil(millis: number): CalendarDate {
  const at = new Date(millis)
  return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1, 2)}-${pad(at.getUTCDate(), 2)}`
}

/** Whether a value is a real calendar date. The round trip rejects 2026-02-30, which the pattern admits. */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) {
    return false
  }
  return formatCivil(civilMillisUnchecked(value)) === value
}

export function assertCalendarDate(value: unknown, label: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new TypeError(
      `${label} must be a YYYY-MM-DD calendar date; got ${JSON.stringify(value)}`,
    )
  }
  return value
}

/**
 * The date's fields read as though they were UTC: a carrier for arithmetic, never a real instant.
 * Do not bind it into a timestamptz comparison.
 */
export function civilMillis(date: CalendarDate): number {
  return civilMillisUnchecked(assertCalendarDate(date, 'date'))
}

export function civilDateOf(millis: number): CalendarDate {
  return formatCivil(millis)
}

/** Exact because both ends are UTC midnights, so no DST shift can round the division. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  if (!Number.isInteger(days)) {
    throw new TypeError(`days must be a whole number; got ${days}`)
  }
  return formatCivil(civilMillis(date) + days * DAY_MS)
}

/** Whole days from `from` to `to`, positive when `to` is later. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return (
    (civilMillis(assertCalendarDate(to, 'to')) -
      civilMillis(assertCalendarDate(from, 'from'))) /
    DAY_MS
  )
}

/** -1, 0 or 1. String order is calendar order for this zero-padded format. */
export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  assertCalendarDate(a, 'a')
  assertCalendarDate(b, 'b')
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function earliestDate(...dates: readonly CalendarDate[]): CalendarDate {
  const [first, ...rest] = dates
  if (first === undefined) {
    throw new TypeError('earliestDate needs at least one date')
  }
  let earliest = assertCalendarDate(first, 'date')
  for (const candidate of rest) {
    if (compareDates(candidate, earliest) < 0) earliest = candidate
  }
  return earliest
}

/** Inclusive on both ends: a 62-day span admits 63 dates (AC-125). */
export function withinInclusive(
  date: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0
}

/*
Floating calendar dates and the arithmetic over them.

Nothing in this file knows about a timezone. These are civil dates, the kind
a human writes on a wall calendar: 4.11 stores due_date as SQL DATE with no
zone, 7.0 puts it on the wire as YYYY-MM-DD, and 8.1's model is "floating
dates and times everywhere a human plans". Turning a civil date into an
instant needs a zone and lives in today.ts; keeping the two apart is the
whole reason 8.1 can say DST "never break[s] date arithmetic, because
comparisons are date against date, never instant against instant".

Why the arithmetic lives here rather than inside the queries that need it:
The read path does not write date arithmetic: the date predicates inside Q1
and Q3C belong to this module. The exported signatures are
therefore a contract with a consumer, and changing one after a query depends
on it is a change to a published contract, not a local edit.
*/

/**
 * A floating calendar date in 4.11's storage and wire format, YYYY-MM-DD.
 *
 * A plain string alias rather than a branded type on purpose: the view
 * queries read due_date and added_on straight off a result row as strings,
 * and a brand would put a cast at every one of those boundaries, which is a
 * ceremony that teaches people to cast rather than to check. Every function
 * below validates what it is given instead, so a malformed date fails loudly
 * at the seam rather than quietly producing a wrong day.
 */
export type CalendarDate = string

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const DAY_MS = 86_400_000

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function civilMillisUnchecked(date: string): number {
  const at = new Date(0)
  // setUTCFullYear rather than Date.UTC: Date.UTC maps two-digit years into
  // the 1900s, and a 4.11 date may legitimately carry year 0026.
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

/** Whether a value is a well-formed calendar date that exists. The round trip
 * is what rejects 2026-02-30 and 2026-13-01, which the pattern alone admits. */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string' || !CALENDAR_DATE_PATTERN.test(value)) {
    return false
  }
  return formatCivil(civilMillisUnchecked(value)) === value
}

/** Refuses anything isCalendarDate refuses, naming the caller's own label so
 * the throw says which of a query's several dates was wrong. */
export function assertCalendarDate(value: unknown, label: string): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new TypeError(
      `${label} must be a YYYY-MM-DD calendar date; got ${JSON.stringify(value)}`,
    )
  }
  return value
}

/**
 * The date's own fields read as though they were UTC.
 *
 * A carrier for calendar arithmetic and for today.ts's zone probes, never an
 * instant with meaning: a floating date has no instant until a zone is
 * supplied, and anything that binds this number into a timestamptz comparison
 * has reintroduced the timezone the floating format exists to remove.
 */
export function civilMillis(date: CalendarDate): number {
  return civilMillisUnchecked(assertCalendarDate(date, 'date'))
}

/** The calendar date the given carrier millis land on. Inverse of civilMillis. */
export function civilDateOf(millis: number): CalendarDate {
  return formatCivil(millis)
}

/** Calendar addition, days signed. Exact because both ends are UTC midnights,
 * so no DST shift can round the division. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  if (!Number.isInteger(days)) {
    throw new TypeError(`days must be a whole number; got ${days}`)
  }
  return formatCivil(civilMillis(date) + days * DAY_MS)
}

/** Whole days from `from` to `to`, positive when `to` is later. This is the
 * subtraction Q3C means by "end minus start", and 10.3 by "up to 62 days". */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return (
    (civilMillis(assertCalendarDate(to, 'to')) -
      civilMillis(assertCalendarDate(from, 'from'))) /
    DAY_MS
  )
}

/**
 * Chronological comparison, -1, 0 or 1.
 *
 * String comparison is chronological comparison for this format and only for
 * this format: the fields run most to least significant and every one is
 * zero-padded to a fixed width, so lexicographic order and calendar order
 * cannot diverge. Stated here because the identity is the reason the queries
 * may compare these values in SQL as dates and here as strings and get the
 * same answer.
 */
export function compareDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  assertCalendarDate(a, 'a')
  assertCalendarDate(b, 'b')
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** The earliest of the given dates. 8.2's qualify_date is a minimum of two,
 * and this is the operation it names. */
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

/**
 * Inclusive on both ends, which is the reading Q3C's "start and end dates,
 * inclusive" fixes and the one the 62-day span is measured against: a span of
 * 62 admits 63 dates, and AC-125 states that boundary from both sides. The
 * boundary is held by `calendar-date.test.ts` beside this file and by nothing
 * at the wire.
 */
export function withinInclusive(
  date: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0
}

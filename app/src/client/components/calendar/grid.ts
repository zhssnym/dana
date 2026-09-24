/*
The grid's own arithmetic: which civil dates a zoom lays out, and what the
period above them is called.

Separated from the component because it is the half of a calendar that can be
tested without a browser, and because it is the half where a defect is silent:
a grid that starts its weeks on the wrong day still renders forty-two cells
and still looks like a calendar. `grid.test.ts` is what checks it.

**Nothing here converts a zone, and that is the whole of the DST story.**
11.15 lists Luxon's DST handling among the hazards, and the reason this module
is immune to it is structural rather than careful: every value in and out is
4.11's YYYY-MM-DD civil date, the arithmetic runs on `Date.UTC` where every
day is exactly 86400 seconds, and no instant, offset or zone is ever
constructed. A civil date has no DST. The one date this client evaluates
against a clock is today, which `api/tz.ts` owns and `presenters.ts` re-exports
as `presenterToday()`; the component reads it from there and hands it in.

**Period titles come from `lib/dates.ts`**, the one date formatter.

**The format is the design's, which 9.1 says outright:** "the format of a date
is the design's and this section has never spelled one". The week title
joins its two dates with "to" rather than an en dash, as every other range in
this client's copy does.
*/

import { formatDate, formatDayHeading, formatMonthHeading } from '../../lib/dates.js'

/** 9.5's three zoom levels. Year zoom is cut for v1 by Q3C. */
export type Zoom = 'day' | 'week' | 'month'

/**
 * The column headers, starting Monday.
 *
 * 9.5: "weeks begin on Monday", the week start being the design's.
 * AC-177 reads the first of these and asserts
 * that it begins with M, which among the seven English day names only Monday
 * does.
 */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Six weeks of days: 9.5's fixed month grid, and 42 is well inside Q3C's 62. */
export const MONTH_GRID_DAYS = 42

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const DAY_MS = 86_400_000

/**
 * A 4.11 date as a UTC timestamp, or NaN when the string is not one.
 *
 * Every caller below guards on the NaN rather than throwing, because the one
 * value that enters this module from outside is `presenterToday()` and a
 * calendar that threw on a malformed date would take the page down over a
 * header string.
 */
function stampOf(date: string): number {
  const match = ISO_DATE.exec(date)
  if (match === null) return Number.NaN
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return Number.NaN
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

/** The inverse, back to 4.11's YYYY-MM-DD. */
function keyOf(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10)
}

/** N days later, or earlier for a negative N. Pure civil arithmetic. */
export function addDays(date: string, amount: number): string {
  const stamp = stampOf(date)
  return Number.isNaN(stamp) ? date : keyOf(stamp + amount * DAY_MS)
}

/** 0 for Monday through 6 for Sunday, which is the order of the labels above. */
export function weekdayIndex(date: string): number {
  const stamp = stampOf(date)
  if (Number.isNaN(stamp)) return 0
  // getUTCDay is 0 for Sunday; 9.5's weeks begin on Monday.
  return (new Date(stamp).getUTCDay() + 6) % 7
}

/** The Monday of this date's week. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

/** The day of the month a cell prints, as a number. */
export function dayOfMonth(date: string): number {
  const stamp = stampOf(date)
  return Number.isNaN(stamp) ? 0 : new Date(stamp).getUTCDate()
}

/** `YYYY-MM`, which is what "the same month" means to a month grid. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** The first of this date's month, which is what a month zoom is anchored on. */
export function firstOfMonth(date: string): string {
  return `${monthOf(date)}-01`
}

/**
 * The six whole weeks overlapping this date's month, beginning Monday.
 *
 * 9.5 fixes the count rather than the four or five a month strictly needs, and
 * gives the reason: AC-082's clause that ghosts appear only after the current
 * occurrence is positively observable only on a grid reaching past the month
 * end, and a constant height is what the layout is asked for. A month view
 * stopping at the month end hides the next occurrence of every series whose
 * successor lands in the first days of the following month, which is the case
 * the ghost exists to show.
 */
export function monthGridDates(date: string): string[] {
  const start = startOfWeek(firstOfMonth(date))
  return Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addDays(start, index))
}

/** The seven days of this date's week, beginning Monday. */
export function weekDates(date: string): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** What a zoom lays out, which is also the inclusive range it asks Q3C for. */
export function datesFor(zoom: Zoom, anchor: string): string[] {
  if (zoom === 'day') return [anchor]
  if (zoom === 'week') return weekDates(anchor)
  return monthGridDates(anchor)
}

/**
 * Where previous and next land.
 *
 * A month step goes to the first of the neighbouring month rather than to the
 * same day of it, because the same day of a neighbouring month does not always
 * exist and the arithmetic that pretends it does turns 31 March into 2 March.
 * The grid is drawn from whichever month the anchor sits in, so the day inside
 * it changes nothing about what is laid out.
 */
export function shiftAnchor(zoom: Zoom, anchor: string, direction: -1 | 1): string {
  if (zoom === 'day') return addDays(anchor, direction)
  if (zoom === 'week') return addDays(anchor, 7 * direction)
  const stamp = stampOf(firstOfMonth(anchor))
  if (Number.isNaN(stamp)) return anchor
  const at = new Date(stamp)
  return keyOf(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + direction, 1))
}

/**
 * The heading above the grid: which period is on screen. Day: "Today",
 * "Saturday", "24 Sep"; month: "September", "October 2027"; week:
 * "21 to 27 Sep", with years only outside today's year.
 */
export function periodTitle(zoom: Zoom, anchor: string, today = ''): string {
  if (zoom === 'day') return formatDayHeading(anchor, today)
  if (zoom === 'month') return formatMonthHeading(anchor, today)
  const start = startOfWeek(anchor)
  const end = addDays(start, 6)
  const endLabel = formatDate(end, today)
  if (monthOf(start) === monthOf(end)) return `${String(dayOfMonth(start))} to ${endLabel}`
  const startLabel = formatDate(start, start.slice(0, 4) === end.slice(0, 4) ? end : today)
  return `${startLabel} to ${endLabel}`
}

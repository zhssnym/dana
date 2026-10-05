// Calendar grid arithmetic. Every value is a YYYY-MM-DD civil date computed on
// `Date.UTC`, so no zone or DST is involved.

import { formatDate, formatMonthHeading } from '../../lib/dates.js'

/** Year zoom is cut for v1. */
export type Zoom = 'day' | 'week' | 'month'

/** Column headers. Weeks begin on Monday (spec 9.5). */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Six weeks of days, well inside the server's 62-day limit. */
export const MONTH_GRID_DAYS = 42

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const DAY_MS = 86_400_000

/**
 * A date as a UTC timestamp, or NaN. Callers guard on NaN so a malformed date
 * cannot take the page down.
 */
function stampOf(date: string): number {
  const match = ISO_DATE.exec(date)
  if (match === null) return Number.NaN
  const [, year, month, day] = match
  if (year === undefined || month === undefined || day === undefined) return Number.NaN
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

function keyOf(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10)
}

export function addDays(date: string, amount: number): string {
  const stamp = stampOf(date)
  return Number.isNaN(stamp) ? date : keyOf(stamp + amount * DAY_MS)
}

export function weekdayIndex(date: string): number {
  const stamp = stampOf(date)
  if (Number.isNaN(stamp)) return 0
  return (new Date(stamp).getUTCDay() + 6) % 7
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

export function dayOfMonth(date: string): number {
  const stamp = stampOf(date)
  return Number.isNaN(stamp) ? 0 : new Date(stamp).getUTCDate()
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function firstOfMonth(date: string): string {
  return `${monthOf(date)}-01`
}

/**
 * Always six weeks, so ghosts in the next month's first days stay visible and the
 * height stays constant.
 */
export function monthGridDates(date: string): string[] {
  const start = startOfWeek(firstOfMonth(date))
  return Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addDays(start, index))
}

export function weekDates(date: string): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Also the inclusive range the view requests. */
export function datesFor(zoom: Zoom, anchor: string): string[] {
  if (zoom === 'day') return [anchor]
  if (zoom === 'week') return weekDates(anchor)
  return monthGridDates(anchor)
}

/**
 * A month step goes to the first of the neighbouring month, because the same day
 * may not exist there (31 March would become 2 March).
 */
export function shiftAnchor(zoom: Zoom, anchor: string, direction: -1 | 1): string {
  if (zoom === 'day') return addDays(anchor, direction)
  if (zoom === 'week') return addDays(anchor, 7 * direction)
  const stamp = stampOf(firstOfMonth(anchor))
  if (Number.isNaN(stamp)) return anchor
  const at = new Date(stamp)
  return keyOf(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + direction, 1))
}

/** The heading above the grid, with years only outside today's year. */
export function periodTitle(zoom: Zoom, anchor: string, today = ''): string {
  // The Today button already says which day is today, so the day zoom names its date.
  if (zoom === 'day') return `${WEEKDAY_LABELS[weekdayIndex(anchor)] ?? ''} ${formatDate(anchor, today)}`
  if (zoom === 'month') return formatMonthHeading(anchor, today)
  const start = startOfWeek(anchor)
  const end = addDays(start, 6)
  const endLabel = formatDate(end, today)
  if (monthOf(start) === monthOf(end)) return `${String(dayOfMonth(start))} to ${endLabel}`
  const startLabel = formatDate(start, start.slice(0, 4) === end.slice(0, 4) ? end : today)
  return `${startLabel} to ${endLabel}`
}

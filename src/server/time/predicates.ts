// The date predicates the queries embed (spec 8.1, 8.2, Q3C), kept in one place so they cannot disagree.
import { compareDates, daysBetween, earliestDate } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'

/** Spec 8.1: due today when D = today(V), overdue when D < today(V), future when D > today(V). */
export type DueRelation = 'overdue' | 'due_today' | 'future'

export function dueRelation(
  dueDate: CalendarDate,
  today: CalendarDate,
): DueRelation {
  const order = compareDates(dueDate, today)
  if (order < 0) return 'overdue'
  if (order > 0) return 'future'
  return 'due_today'
}

/** My Day's automatic clause: activation date (start date, else due date) <= today. SQL runs the same rule. */
export function isActiveByToday(
  activationDate: CalendarDate,
  today: CalendarDate,
): boolean {
  return compareDates(activationDate, today) <= 0
}

/**
 * 8.2's qualify_date: the earlier of the activation date and the My Day added_on date.
 * Throws when both are null: Q1 should never select such a row.
 */
export function qualifyDate(
  automatic: CalendarDate | null,
  pulled: CalendarDate | null,
): CalendarDate {
  if (automatic !== null && pulled !== null) {
    return earliestDate(automatic, pulled)
  }
  const only = automatic ?? pulled
  if (only === null) {
    throw new TypeError(
      'qualifyDate needs an automatic date or a pulled date; Q1 admits no row with neither',
    )
  }
  return earliestDate(only)
}

export type MyDayGroup = 'carried' | 'today'

/**
 * Only two groups exist. A date after today cannot arise, but goes to Today
 * rather than being dropped, so no row is ever lost.
 */
export function myDayGroup(
  qualifyDate: CalendarDate,
  today: CalendarDate,
): MyDayGroup {
  return compareDates(qualifyDate, today) < 0 ? 'carried' : 'today'
}

/** 10.3's calendar range limit: end minus start at most 62 days (AC-125). */
export const CALENDAR_RANGE_MAX_DAYS = 62

/** Which range rule broke, so the route can name it in its 422. */
export type CalendarRangeCheck =
  | { readonly ok: true; readonly days: number }
  | { readonly ok: false; readonly reason: 'inverted'; readonly days: number }
  | { readonly ok: false; readonly reason: 'too_long'; readonly days: number }

/**
 * Q3C's range rules. The inversion check runs first: an inverted range has a
 * negative span, which passes a days <= 62 check.
 */
export function checkCalendarRange(
  start: CalendarDate,
  end: CalendarDate,
): CalendarRangeCheck {
  const days = daysBetween(start, end)
  if (days < 0) return { ok: false, reason: 'inverted', days }
  if (days > CALENDAR_RANGE_MAX_DAYS) {
    return { ok: false, reason: 'too_long', days }
  }
  return { ok: true, days }
}

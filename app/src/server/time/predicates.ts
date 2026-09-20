/*
The date predicates the section 6 queries embed, each one a spec sentence
rather than a convenience: 8.1's boundary statement, 8.2's qualify_date and
its carried-versus-today boundary, and Q3C's range rules.

They are functions here, and not arithmetic inlined into the queries, because
the date predicates inside Q1 and Q3C belong to this module while the queries
around them belong to the read path, and a predicate
restated in two places is a predicate that will one day disagree with itself.
Nothing in this file decides an HTTP status or names a field in an error
body: those belong to the route, and checkCalendarRange hands it which rule
broke so it can say so.
*/
import { compareDates, daysBetween, earliestDate } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'

/** Section 8.1's boundary statement, in its own words: a task with due_date D
 * is due today when D = today(V), overdue when D < today(V), future when
 * D > today(V). */
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

/**
 * My Day's automatic clause, which 8.1 says admits D <= today(V).
 *
 * D is the task's **activation date** since issue #217: the start date where
 * a task has one and the due date otherwise, which 8.2 now spells as
 * `coalesce(start_date, due_date) <= today`. The arithmetic did not move and
 * neither did this function; which date is handed to it did. The clause's
 * other half, that the task is assigned to V, is a scope condition and
 * belongs to the query.
 *
 * The comparison runs in SQL over a list, so the caller in views/my-day.ts is
 * the query rather than this function; this is the same sentence in
 * JavaScript, for the one-row reader and for the test that pins the boundary.
 */
export function isActiveByToday(
  activationDate: CalendarDate,
  today: CalendarDate,
): boolean {
  return compareDates(activationDate, today) <= 0
}

/**
 * 8.2's qualify_date: the least of the automatic date (the activation date,
 * when the automatic clause holds for this row) and the pulled date (the My
 * Day entry's added_on, when an entry exists).
 *
 * The automatic date was the due_date until issue #217. It is the day the
 * automatic clause began to hold, which is what makes the grouping below one
 * rule rather than two: a task that started three days ago and is not yet due
 * has been carrying since it started, and lands in Carried for the same
 * reason an overdue task does.
 *
 * At least one is present for any row Q1's predicate admits, which is why a
 * pair of nulls throws rather than returning one: a row reaching here with
 * neither is a row the query should not have selected, and a silent default
 * would sort it into a group instead of showing the fault.
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

/** Q1's grouping: "Carried group where qualify_date < today; Today group
 * where qualify_date = today." */
export type MyDayGroup = 'carried' | 'today'

/**
 * Q1's grouping boundary.
 *
 * Only two groups exist, and a qualify_date after today cannot arise: the
 * automatic date is admitted only when the activation date is on or before
 * today, and added_on is the
 * adder's local date at pull time, so both candidates are today or earlier and
 * so is their minimum. A date after today is therefore grouped with Today
 * rather than dropped, because a row in neither group is the one outcome Q1
 * must never produce, and My Day is where a lost row is least likely to be
 * noticed.
 */
export function myDayGroup(
  qualifyDate: CalendarDate,
  today: CalendarDate,
): MyDayGroup {
  return compareDates(qualifyDate, today) < 0 ? 'carried' : 'today'
}

/** 10.3's calendar range limit, which Q3C states as "end minus start at most
 * 62 days" and AC-125 pins from both sides. A span of 62 admits 63 inclusive
 * dates; the arithmetic is the subtraction, not the count. */
export const CALENDAR_RANGE_MAX_DAYS = 62

/** Which of Q3C's two range rules broke, so the route can name the right
 * thing in its 422. Both failures are the route's to answer; this decides
 * only the arithmetic. */
export type CalendarRangeCheck =
  | { readonly ok: true; readonly days: number }
  | { readonly ok: false; readonly reason: 'inverted'; readonly days: number }
  | { readonly ok: false; readonly reason: 'too_long'; readonly days: number }

/**
 * Q3C's range rules, both of them, in the order the specification fixes.
 *
 * The inversion check runs first and is not redundant with the span check.
 * The P4 mid-package change control of 2026-08-07 ruled that an inverted
 * range answers 422 naming the pair, on the recorded ground that "the 62-day
 * arithmetic admits an inverted range by accident, a negative difference
 * being at most 62": start 2026-12-31 with end 2026-01-01 is minus 364 days,
 * which passes any test written as days <= 62. Refusing it is what keeps a
 * malformed request distinguishable from a legitimately empty month.
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

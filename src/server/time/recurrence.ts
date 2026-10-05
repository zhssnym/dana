// The 4.11 recurrence iterator over floating dates. Our own code, not rrule.js (11.9); no zones here.
// Short months skip (monthly on the 31st), 29 February recurs only in leap years, and weeks start on Monday.
import { parseRecurrenceRule } from '../../shared/recurrence.js'
import type {
  RecurrenceRule,
  RecurrenceWeekday,
} from '../../shared/recurrence.js'

import {
  addDays,
  assertCalendarDate,
  civilMillis,
  compareDates,
  daysBetween,
} from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'

/** Indexed by JavaScript weekday number: 0 is Sunday. */
const WEEKDAY_TOKENS: readonly RecurrenceWeekday[] = [
  'SU',
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
]

/**
 * Empty periods in a row before the iterator throws. Unreachable for any valid rule, so reaching
 * it means the arithmetic is wrong; returning null instead would silently end a live series.
 */
const MAX_EMPTY_PERIODS = 1_000

interface DateParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

function partsOf(date: CalendarDate): DateParts {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function daysInMonth(year: number, month: number): number {
  const at = new Date(0)
  at.setUTCFullYear(year, month, 0) // day 0 of the next month is this month's last
  at.setUTCHours(0, 0, 0, 0)
  return at.getUTCDate()
}

/** Null when the month is too short for the day: the skip. */
function dateOf(year: number, month: number, day: number): CalendarDate | null {
  if (day > daysInMonth(year, month)) return null
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

function weekdayOf(date: CalendarDate): number {
  return new Date(civilMillis(date)).getUTCDay()
}

/** The Monday on or before a date. WKST is always MO. */
function weekStartOf(date: CalendarDate): CalendarDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

function laterOf(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareDates(a, b) >= 0 ? a : b
}

/** A stored rule, parsed, or a throw: stored rules were validated, so a failure is corruption. */
export function parseStoredRule(value: string): RecurrenceRule {
  const parsed = parseRecurrenceRule(value)
  if (!parsed.ok) {
    throw new TypeError(
      `stored recurrence_rule is outside the 4.11 subset (${parsed.reason}): ${JSON.stringify(value)}`,
    )
  }
  return parsed.rule
}

/**
 * Every instance from `from` onwards, ascending, never before the anchor, up to UNTIL inclusive.
 * The anchor counts only when it matches the rule's own day selection.
 */
function* instancesFrom(
  rule: RecurrenceRule,
  anchor: CalendarDate,
  from: CalendarDate,
): Generator<CalendarDate> {
  const floor = laterOf(anchor, from)
  const bound = rule.until

  // Returning true means the sequence is over, not that this candidate missed.
  const past = (date: CalendarDate): boolean =>
    bound !== null && compareDates(date, bound) > 0

  if (rule.freq === 'DAILY' || (rule.freq === 'WEEKLY' && rule.byDay === null)) {
    const step = rule.interval * (rule.freq === 'WEEKLY' ? 7 : 1)
    const gap = daysBetween(anchor, floor)
    const first = gap <= 0 ? 0 : Math.ceil(gap / step)
    for (let index = first; ; index += 1) {
      const candidate = addDays(anchor, index * step)
      if (past(candidate)) return
      yield candidate
    }
  }

  if (rule.freq === 'WEEKLY') {
    const selected = new Set<RecurrenceWeekday>(rule.byDay ?? [])
    const baseWeek = weekStartOf(anchor)
    const weeksAway = daysBetween(baseWeek, weekStartOf(floor)) / 7
    const first = weeksAway <= 0 ? 0 : Math.floor(weeksAway / rule.interval)
    for (let index = first; ; index += 1) {
      const weekStart = addDays(baseWeek, index * rule.interval * 7)
      for (let offset = 0; offset < 7; offset += 1) {
        const candidate = addDays(weekStart, offset)
        const token = WEEKDAY_TOKENS[weekdayOf(candidate)]
        if (token === undefined || !selected.has(token)) continue
        if (compareDates(candidate, floor) < 0) continue
        if (past(candidate)) return
        yield candidate
      }
    }
  }

  // MONTHLY and YEARLY: a period whose month is too short yields nothing.
  const anchorParts = partsOf(anchor)
  const monthly = rule.freq === 'MONTHLY'
  const day = monthly ? (rule.byMonthDay ?? anchorParts.day) : anchorParts.day
  const step = monthly ? rule.interval : rule.interval * 12
  const base = anchorParts.year * 12 + (anchorParts.month - 1)
  const floorParts = partsOf(floor)
  const floorIndex = floorParts.year * 12 + (floorParts.month - 1)
  const away = floorIndex - base
  const first = away <= 0 ? 0 : Math.floor(away / step)

  let empty = 0
  for (let index = first; ; index += 1) {
    const months = base + index * step
    const year = Math.floor(months / 12)
    const month = (months % 12) + 1
    // Test UNTIL against the period's first day: a period without the day has no candidate,
    // and a yearly 29 February rule would otherwise walk on to the next leap year.
    if (past(`${pad(year, 4)}-${pad(month, 2)}-01`)) return
    const candidate = dateOf(year, month, day)
    if (candidate === null || compareDates(candidate, floor) < 0) {
      // A candidate behind the floor happens at most once and does not count against the bound.
      if (candidate === null) {
        empty += 1
        if (empty > MAX_EMPTY_PERIODS) {
          throw new RangeError(
            `no instance of ${rule.freq} interval ${String(rule.interval)} on day ${String(day)} within ${String(MAX_EMPTY_PERIODS)} periods after ${anchor}`,
          )
        }
      }
      continue
    }
    if (past(candidate)) return
    empty = 0
    yield candidate
  }
}

/** The earliest instance strictly after `after`, or null when UNTIL ends the series. */
export function nextInstance(
  rule: string,
  anchor: CalendarDate,
  after: CalendarDate,
): CalendarDate | null {
  const parsed = parseStoredRule(rule)
  assertCalendarDate(anchor, 'anchor')
  assertCalendarDate(after, 'after')
  for (const candidate of instancesFrom(parsed, anchor, after)) {
    if (compareDates(candidate, after) > 0) return candidate
  }
  return null
}

/** Every instance inside an inclusive date range. An inverted range yields nothing. */
export function instancesInRange(
  rule: string,
  anchor: CalendarDate,
  start: CalendarDate,
  end: CalendarDate,
): CalendarDate[] {
  const parsed = parseStoredRule(rule)
  assertCalendarDate(anchor, 'anchor')
  assertCalendarDate(start, 'start')
  assertCalendarDate(end, 'end')
  const found: CalendarDate[] = []
  if (compareDates(start, end) > 0) return found
  for (const candidate of instancesFrom(parsed, anchor, start)) {
    if (compareDates(candidate, end) > 0) break
    found.push(candidate)
  }
  return found
}

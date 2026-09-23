/*
The 4.11 iterator: what a rule means on a calendar.

11.9 makes this our own code rather than a runtime library, and gives the
reason: rrule.js is unmaintained and models its results as reinterpreted UTC
Dates, which collides with Dana's floating dates. It stays a development
dependency usable as a differential oracle; where the two disagree, RFC 5545
adjudicates, never the oracle.

**Nothing here touches an instant, and nothing here needs a zone.** Every
value below is a floating civil date, the kind calendar-date.ts carries: 8.5
anchors evaluation at DTSTART = the current occurrence's due_date, which 4.11
stores as SQL DATE with no zone, and asks only for dates back. That is why
11.15's Luxon hazard does not reach this file at all. It reaches the
fire-instant module of 8.6 (reminder-time.ts), and the zone that generation needs
enters at the cutoff (generation.ts) rather than here.

**What the subset does and does not have to implement.** The grammar is
app/src/shared/recurrence.ts and this file evaluates what it parses: FREQ
daily, weekly, monthly, yearly; INTERVAL 1 to 99; BYDAY with weekly only;
BYMONTHDAY 1 to 28 with monthly only; UNTIL inclusive. COUNT is unsupported,
so nothing here counts occurrences, which is exactly why 4.11 excluded it:
counting needs a durable ordinal that row deletion would corrupt.

Two RFC 5545 behaviors the subset does not remove, both implemented:

- **Short months skip.** 4.11 excludes BYMONTHDAY 29 to 31 to avoid RFC skip
  semantics, but the anchor is a due_date rather than a rule part, so a bare
  FREQ=MONTHLY on the 31st still means "the 31st of every month that has
  one", and February, April, June, September and November have none. The
  instance is skipped, not moved, which is the RFC's rule and the one the
  spec's exclusion was avoiding having to explain to a user.
- **29 February is a leap-year rule.** 4.11 states it for FREQ=YEARLY
  anchored there: instances occur only in leap years, which is RFC behavior
  and falls out of the same existence check.

**Weeks start on Monday.** RFC 5545's WKST defaults to MO, and WKST is not in
the subset, so it cannot be set. It is visible only through INTERVAL above 1
with BYDAY: which calendar week an instance belongs to decides whether its
week is one the interval selects, and a Sunday belongs to the week that began
on the Monday before it.
*/
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

/** Indexed by the JavaScript weekday number, which is what a UTC midnight
 * reports: 0 is Sunday. The tokens are 4.11's. */
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
 * How many periods in a row may produce no instance before the iterator
 * decides it is not iterating towards one.
 *
 * Every skip in this subset comes from a date that does not exist in a
 * period: at most two months in a row lack a 31st, and the longest run of
 * non-leap years an interval can walk through is bounded by the 400-year
 * Gregorian cycle, which every interval 1 to 99 crosses because none of them
 * shares a factor with 400 that keeps it off every leap year. The bound is
 * therefore unreachable for any rule the grammar admits, and reaching it
 * means the arithmetic below is wrong rather than that the series ended: a
 * null would be indistinguishable from UNTIL exhaustion and would silently
 * end a live series, so this throws instead.
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

/** Whether a month holds the given day, which is the whole of the skip rule
 * and, at 29 February, the whole of 4.11's leap-year rule. */
function daysInMonth(year: number, month: number): number {
  const at = new Date(0)
  at.setUTCFullYear(year, month, 0) // day 0 of the next month is this month's last
  at.setUTCHours(0, 0, 0, 0)
  return at.getUTCDate()
}

/** A calendar date from its parts, or null when the month is too short for
 * the day. The null is the skip. */
function dateOf(year: number, month: number, day: number): CalendarDate | null {
  if (day > daysInMonth(year, month)) return null
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** 0 for Sunday, the JavaScript numbering, read off the UTC midnight
 * calendar-date.ts carries a date as. */
function weekdayOf(date: CalendarDate): number {
  return new Date(civilMillis(date)).getUTCDay()
}

/** The Monday on or before a date. WKST is MO and the subset cannot change
 * it; see the header. */
function weekStartOf(date: CalendarDate): CalendarDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7))
}

function laterOf(a: CalendarDate, b: CalendarDate): CalendarDate {
  return compareDates(a, b) >= 0 ? a : b
}

/**
 * A stored rule string, parsed, or a throw.
 *
 * Every rule in the column went through the 4.11 validator on the way in, so
 * a string that fails here is corruption rather than input: a 500 naming it
 * is the honest answer, and treating it as "no rule" would silently end a
 * user's series and look like the feature working.
 */
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
 * Every instance of the rule from `from` onwards, ascending.
 *
 * Bounded below by the anchor as well as by `from`, because 8.5 anchors
 * evaluation at DTSTART and a recurrence set does not reach behind its own
 * start; bounded above by UNTIL, inclusive per 4.11 and RFC 5545.
 *
 * The anchor is an instance only when it satisfies the rule's own day
 * selection. RFC 5545 leaves a DTSTART unsynchronized with its rule
 * undefined, and neither caller in this codebase can see the answer:
 * generation asks for dates strictly after a cutoff that is at least the
 * anchor, and projection starts strictly after it. The oracle agrees with
 * the choice, which is why it is written down rather than left to fall out.
 */
function* instancesFrom(
  rule: RecurrenceRule,
  anchor: CalendarDate,
  from: CalendarDate,
): Generator<CalendarDate> {
  const floor = laterOf(anchor, from)
  const bound = rule.until

  // One yield gate for all four frequencies: a candidate counts when it is
  // not behind the floor and not past UNTIL. Returning true means the
  // sequence is over rather than that this candidate missed.
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
    // Non-null by the branch above; the grammar also guarantees BYDAY comes
    // only with WEEKLY.
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

  // MONTHLY and YEARLY: the period is a month or a year, the day within it is
  // fixed, and a period whose month is too short yields nothing at all.
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
    // UNTIL is tested against the first of the period rather than against the
    // candidate, because a period the day does not exist in has no candidate
    // to test and the sequence still has to end there: a yearly rule on 29
    // February bounded in a common year would otherwise walk to the next leap
    // year before noticing it was over.
    if (past(`${pad(year, 4)}-${pad(month, 2)}-01`)) return
    const candidate = dateOf(year, month, day)
    if (candidate === null || compareDates(candidate, floor) < 0) {
      // A candidate behind the floor is the seek landing one period early,
      // which happens at most once and must not count against the bound; a
      // null is the short-month skip, which is what the bound is for.
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

/**
 * 8.5's nextInstance: the earliest instance strictly after `after`, or null
 * when UNTIL bounds it out.
 *
 * "Strictly after" is the whole of the no-pile-up rule. Generation passes a
 * cutoff of max(due_date, today in the actor's zone), so a late completion
 * lands on the next slot after today rather than on every slot it missed,
 * and an early one keeps the series aligned to its own dates.
 */
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

/**
 * Every instance falling inside an inclusive date range.
 *
 * The range is the caller's and is not derived from the rule: 8.5's
 * projection intersects the rule's instances with the range a calendar
 * request asked for, and Q3C's range is inclusive at both ends (the reading
 * calendar-date.ts's withinInclusive fixes). An inverted range yields
 * nothing, because no date is both at or after the later end and at or
 * before the earlier one.
 */
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

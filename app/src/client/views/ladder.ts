/*
Scheduled's ladder (9.5), and the date axis every board shares with it.

"The list is Q3's order under a ladder of headings: Today, Tomorrow, the days
of this week, then week and month rungs. Headings being structure, not
controls; a row says 'Due tomorrow' about one task and a heading says
'Tomorrow' about a bucket, one date vocabulary at two altitudes."

Three decisions this file makes, all of them consequences rather than tastes.

**Overdue is a rung and 9.5 does not name it, because Q3 already does.** "Any
overdue pending rows appear first naturally by date": the query hands them
over ahead of everything, so the ladder either heads them or leaves the first
rows on the page under a heading that says "Today" about work that is late.
DES-182 settles what it is when a board draws it: "Overdue is a relation to
today rather than a value, and there is nothing to make", so the rung takes no
capture.

**A rung is a bucket and only some buckets are a day.** Today, Tomorrow and
each remaining weekday of this week name one date, so a board column drawn
from them captures with it. "Next week", a month and "Later" name ranges, and
a range has no day to write, so those columns capture nothing for the same
reason Overdue does not.

**Nothing here re-sorts.** Section 6's preamble forbids it and the ladder does
not need it: Q3 orders by the schedule date ascending, so walking the rows
once and starting a new rung whenever the bucket changes preserves that order
exactly.

**Which date a row is bucketed by is Q3's and not this file's**, and since
issue #216 that is the schedule date: the due date where a task has one, the
start date where it has only that. The rungs have to read the same date the
server sorted by or they stop being buckets over a sorted stream - the walk
would reopen a rung it had already closed, and rows of one day would be drawn
under two headings. `rungFor` takes one date and knows nothing about this;
`rungForTask` below is where the choice is made, and `grouping.ts`'s date
axis calls that same function, so a board column and a list heading can
never say two things about one row.

**Started work that is not late is In progress, the rule Today uses.**
`rungFor` gives the Overdue rung to any date before today, which was right
while the only date a task had was its deadline. Since #216 a Start-only task
can lead this list by date, and 9.5 says in terms that "a Start Date passing
is not overdue and is not styled as one", 8.1 keeping overdue a relation to
the deadline alone. So an open task whose start has arrived and whose
deadline has not passed takes the **In progress** rung - the membership
Today's "In progress" group uses (`stageOf` present and not late), so one
task has one heading on both screens. A range under way sits there rather
than under its due date's rung, and a task that starts today with no deadline
sits there rather than under "Today". It is a relation to today rather than a
day, so like Overdue it carries no date and captures nothing (DES-182).

**Overdue opens the ladder and In progress follows it**, whatever order their
rows arrived in: both are relations to today, not days, and late work above
started work is the order Today reads in. Every other rung keeps first
appearance in Q3's order; rows within a rung are never re-sorted.
*/
import { addDays, formatDayHeading, formatMonthHeading, weekStart } from '../lib/dates.js'
import { scheduleDateOf } from '../parts/schedule.js'
import { stageOf } from './linear/stage.js'
import type { Schedule } from '../parts/schedule.js'
import type { TaskCard } from '../../shared/tasks.js'

export interface LadderRung {
  /** Stable across renders; the date where a rung is one, else its name. */
  readonly key: string
  /** The heading, which is also the region's name (9.1's regions rule). */
  readonly name: string
  /** The day a capture in this rung writes, or null where it names a range. */
  readonly date: string | null
  readonly rows: readonly TaskCard[]
}

interface Bucket {
  readonly key: string
  readonly name: string
  readonly date: string | null
}

/**
 * The rung a Start-only task whose start has passed goes on.
 *
 * Its own constant because two files draw it - this ladder and the board's
 * date columns - and a second spelling of the name is a second heading for
 * one bucket.
 */
const STARTED: Bucket = { key: 'started', name: 'In progress', date: null }

/**
 * Which rung a date belongs on, given today.
 *
 * The week runs Monday to Sunday, which 9.5 fixes for the calendar and which
 * the ladder shares because they are one date vocabulary.
 */
export function rungFor(due: string | null, today: string): Bucket {
  if (due === null) return { key: 'undated', name: 'No date', date: null }
  if (due < today) return { key: 'overdue', name: 'Overdue', date: null }
  if (due === today) return { key: 'today', name: 'Today', date: today }
  const tomorrow = addDays(today, 1)
  if (due === tomorrow) return { key: 'tomorrow', name: 'Tomorrow', date: tomorrow }

  const thisWeekEnd = addDays(weekStart(today), 6)
  if (due <= thisWeekEnd) return { key: due, name: formatDayHeading(due, today), date: due }

  const nextWeekEnd = addDays(thisWeekEnd, 7)
  if (due <= nextWeekEnd) return { key: 'next-week', name: 'Next week', date: null }

  const month = due.slice(0, 7)
  const twelveMonths = addDays(today, 365)
  if (due <= twelveMonths) return { key: month, name: formatMonthHeading(due, today), date: null }
  return { key: 'later', name: 'Later', date: null }
}

/**
 * Which rung one task belongs on: In progress when it has started and is not
 * late (Today's rule), else `rungFor` over the schedule date.
 *
 * The one function both the list ladder and the board's date axis call, so
 * the two cannot disagree about a row. They did until 2026-09-20: this walk
 * read `due_date ?? start_date` and `grouping.ts` read `due_date`, so one
 * page filed a Start-only task under "Thursday" in list mode and under "No
 * date" in board mode - on a page whose whole membership is "carries a date".
 */
export function rungForTask(
  task: Schedule & Pick<TaskCard, 'status'>,
  today: string,
): Bucket {
  const late = task.due_date !== null && task.due_date < today
  if (!late && stageOf(task, today) === 'present') return STARTED
  return rungFor(scheduleDateOf(task), today)
}

/**
 * Q3's rows under 9.5's headings, in the order they arrived.
 *
 * A rung with no rows is absent rather than a heading over nothing, which is
 * the same rule 9.4's two groups follow and the reason a quiet week does not
 * open on seven empty weekdays.
 */
export function ladderRungs(
  rows: readonly TaskCard[],
  today: string,
): readonly LadderRung[] {
  const order: string[] = []
  const buckets = new Map<string, { bucket: Bucket; rows: TaskCard[] }>()
  for (const task of rows) {
    const bucket = rungForTask(task, today)
    const existing = buckets.get(bucket.key)
    if (existing === undefined) {
      order.push(bucket.key)
      buckets.set(bucket.key, { bucket, rows: [task] })
      continue
    }
    existing.rows.push(task)
  }
  /* Overdue first, In progress second; the rest keep first appearance. */
  const pinned = ['overdue', STARTED.key]
  order.sort((a, b) => {
    const rank = (key: string): number => {
      const at = pinned.indexOf(key)
      return at === -1 ? pinned.length : at
    }
    return rank(a) - rank(b)
  })
  return order.map((key) => {
    const held = buckets.get(key)
    return {
      key,
      name: held?.bucket.name ?? key,
      date: held?.bucket.date ?? null,
      rows: held?.rows ?? [],
    }
  })
}

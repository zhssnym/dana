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
not need it: Q3 orders by due date ascending, so walking the rows once and
starting a new rung whenever the bucket changes preserves that order exactly.
*/
import { addDays, monthLabelOf, weekStart, weekdayNameOf } from '../parts/format-dates.js'
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
  if (due <= thisWeekEnd) return { key: due, name: weekdayNameOf(due), date: due }

  const nextWeekEnd = addDays(thisWeekEnd, 7)
  if (due <= nextWeekEnd) return { key: 'next-week', name: 'Next week', date: null }

  const month = due.slice(0, 7)
  const twelveMonths = addDays(today, 365)
  if (due <= twelveMonths) return { key: month, name: monthLabelOf(due), date: null }
  return { key: 'later', name: 'Later', date: null }
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
    const bucket = rungFor(task.due_date, today)
    const existing = buckets.get(bucket.key)
    if (existing === undefined) {
      order.push(bucket.key)
      buckets.set(bucket.key, { bucket, rows: [task] })
      continue
    }
    existing.rows.push(task)
  }
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

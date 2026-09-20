/*
8.5's virtual_instances: the ghosts a calendar draws for a series that has
not happened yet.

Pure, and deliberately so. Q3C scopes the projection by three things,
accessible, pending and rule-carrying, and every one of them is a fact about
rows that the Query engineer's SQL already establishes; what is left is
arithmetic over dates, which is this module's across the seam
names. So this function takes what was fetched and answers where it draws,
and the fetch itself stays with the query.

**The two bounds are the whole of it**, and each closes a different way of
lying to a user. lo = max(range_start, due_date + 1 day) is strictly after
the current occurrence, so the date the real row sits on never also carries a
ghost of the same series and no date can show the series twice; and no date
before the series began ever shows an occurrence that never existed, which is
the sharp case, because a rule matches dates in the past as happily as in the
future. The upper bound is range_end, so a series running for years answers
only the window that was asked for.

**The range is not what scopes the series.** A task whose current occurrence
is due before the requested range still projects into it, which is the
ordinary case of looking a month ahead at a weekly chore, and AC-143 exists
because the natural implementation, projecting from the real rows a calendar
query already fetched, drops exactly those and fails silently by emptying the
view. Nothing in this file can enforce that on its own: it is a fact about
what the caller passes in, and it is written here because this is the module
the caller reaches for.

**No clock, no zone.** The projection reads stored dates against a requested
range and computes no today at all, which is why AC-082 could be written at
literal dates and why two viewers a day apart must see the same ghosts. (That
criterion's test file went in the 2026-09-20 cut; this module's own tests beside it are
what is left.)
*/
import { addDays, compareDates } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { instancesInRange } from './recurrence.js'

/**
 * What the projection needs to know about a task: the three facts 8.5's
 * first line tests and the anchor it evaluates from. A row shape rather than
 * an id, because this function reads no database and the caller has already
 * fetched the row.
 */
export interface ProjectionSource {
  readonly status: string
  readonly dueDate: CalendarDate | null
  readonly recurrenceRule: string | null
}

/**
 * The dates one task's series draws a ghost on inside an inclusive range,
 * ascending.
 *
 * Empty for anything that is not a pending rule-carrying dated task: 8.5
 * returns nothing for a completed or abandoned occurrence, because a series
 * that has stopped must not promise occurrences that will never be
 * generated, and the real row still draws on its own date in any status.
 */
export function virtualInstances(
  task: ProjectionSource,
  rangeStart: CalendarDate,
  rangeEnd: CalendarDate,
): CalendarDate[] {
  if (task.status !== 'pending') return []
  if (task.recurrenceRule === null || task.dueDate === null) return []

  const afterCurrent = addDays(task.dueDate, 1)
  const lo =
    compareDates(rangeStart, afterCurrent) >= 0 ? rangeStart : afterCurrent
  return instancesInRange(task.recurrenceRule, task.dueDate, lo, rangeEnd)
}

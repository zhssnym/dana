/*
Q3C: GET /views/planned/calendar, the real rows of the grid.

Two things separate this from Q3, and an implementation that reuses the
Planned comparator here gets both wrong.

The predicate admits all three statuses, because "the calendar is a record":
pending renders normal, completed faded and checked, abandoned faded and
struck. Every other list view of section 6 drops at least one status, so this
is the one place an over-copied status filter is invisible until a completed
row goes missing from a past date.

And the order is the cell's rather than the list's: "all-day banners first
(status_rank, id), then timed rows (due_time, status_rank, id), then ghosts".
Q3 puts status_rank above the timed flag; Q3C puts the timed flag above
status_rank, and puts due_time above status_rank inside the timed run. The
two orders disagree on any date carrying a mixed cell.

The virtual arm is empty here and will not always be. It is 8.5's projection
over the 4.11 iterator that 11.9 gives to the Scheduling engineer and P6
delivers, and AC-082 pins it in P6's range rather than this one. The key is
answered now because 7.10 enumerates it, the treatment P3 gave 7.0's
recurrence_rule and reminder keys while their computations were deferred.

There is no cap and no truncated flag, which 7.10 shows by giving this body
neither: the response is bounded by its 62 days instead, and the range check
that enforces them is checkCalendarRange in src/server/time, called by the
route because naming the field and choosing the status are the route's.
*/
import { sql } from 'drizzle-orm'

import type { GetPlannedCalendarResponse } from '../../shared/views.js'
import type { Executor } from '../domain/db.js'

import { STATUS_RANK, readCards } from './cards.js'

/**
 * Q3C's cell order, flattened into one sequence across the range.
 *
 * The array is flat and 7.10 gives it no cell structure, so the date leads
 * and the cell order follows within it; a client draws cells by date without
 * sorting anything, which is what section 6 means by every view returning
 * rows already ordered.
 */
const Q3C_ORDER = sql`t.due_date ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       ${STATUS_RANK} ASC, t.id ASC`

/**
 * GET /views/planned/calendar.
 *
 * "Real rows: folder_id IN ACCESSIBLE(V) AND due_date BETWEEN start AND end,
 * all three statuses." BETWEEN is inclusive at both ends, which is the
 * reading AC-126 pins from both sides, and the dates are compared as dates
 * rather than as instants: 4.11 makes due_date floating, so no zone enters
 * this predicate and tz reaches this endpoint only as the parameter 7.0
 * requires of every view.
 */
export async function plannedCalendarView(
  executor: Executor,
  viewerId: string,
  start: string,
  end: string,
): Promise<GetPlannedCalendarResponse> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`t.due_date BETWEEN ${start}::date AND ${end}::date`,
    order: Q3C_ORDER,
  })
  return { real: rows.map((row) => row.card), virtual: [] }
}

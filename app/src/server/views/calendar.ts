/*
Q3C: GET /views/planned/calendar, the real rows of the grid and the ghosts
drawn beside them.

Three things separate this from Q3, and an implementation that reuses the
Planned comparator here gets all of them wrong.

The predicate admits all three statuses, because "the calendar is a record":
pending renders normal, completed faded and checked, abandoned faded and
struck. Every other list view of section 6 drops at least one status, so this
is the one place an over-copied status filter is invisible until a completed
row goes missing from a past date.

The range is an overlap rather than a containment, and the date it leads on
is the Schedule's first day rather than its last. Both are issue #216's and
both are argued where they are written below; the short of it is that a list
places a task under the day it is owed and a grid draws its whole span.

And the order is the cell's rather than the list's: "all-day banners first
(status_rank, id), then timed rows (due_time, status_rank, id), then ghosts".
Q3 puts status_rank above the timed flag; Q3C puts the timed flag above
status_rank, and puts due_time above status_rank inside the timed run. The
two orders disagree on any date carrying a mixed cell.

The virtual arm is 8.5's projection over the 4.11 iterator, which 11.9 gives
to the Scheduling engineer and P6 delivered; this file calls it and fetches
what it projects from, which is the whole of the seam
names. The arithmetic below the call is never restated here.

**The two fetches are two queries on purpose, and this is the one thing about
this file worth arguing with before changing it.** Q3C's virtual sentence
scopes the projection by three things, accessible, pending and rule-carrying,
and by nothing else; in particular not by the task's own due_date lying inside
the requested range, which is the real-row predicate and belongs to the real
rows alone. Projecting off the BETWEEN-bounded result set is one line shorter,
would have satisfied AC-082 outright, whose current occurrence sits inside its own grid, and
silently empties every month-ahead view of a series anchored before the range,
which is the ordinary way a repeating task is looked at. AC-143 exists to fail
against that implementation, and section 12 records the reading beside it.

There is no cap and no truncated flag, which 7.10 shows by giving this body
neither: the response is bounded by its 62 days instead, and the range check
that enforces them is checkCalendarRange in src/server/time, called by the
route because naming the field and choosing the status are the route's.
*/
import { sql } from 'drizzle-orm'

import type {
  GetPlannedCalendarResponse,
  VirtualInstance,
} from '../../shared/views.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { compareDates, virtualInstances } from '../time/index.js'
import type { CalendarDate } from '../time/index.js'

import {
  ACTIVATION_DATE,
  DUE_DATE,
  DUE_TIME,
  SCHEDULE_DATE,
  STATUS_RANK,
  accessibleTasks,
  nullableString,
  readCards,
} from './cards.js'

/**
 * Q3C's cell order, flattened into one sequence across the range.
 *
 * The array is flat and 7.10 gives it no cell structure, so the date leads
 * and the cell order follows within it; a client draws cells by date without
 * sorting anything, which is what section 6 means by every view returning
 * rows already ordered.
 *
 * **The leading date is the first day of the Schedule since issue #216, not
 * the due date, and it is the opposite choice from Q3's.** A list is a ladder
 * of deadlines and places a task under the day it is owed; a grid draws a
 * Start-to-Due pair as one bar, and a bar is anchored where it begins. So the
 * list leads on SCHEDULE_DATE and the grid on ACTIVATION_DATE, and for the
 * two states that carry one date - due-only and start-only - the two
 * expressions are the same date and nothing moved.
 */
const Q3C_ORDER = sql`${ACTIVATION_DATE} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       ${STATUS_RANK} ASC, t.id ASC`

/**
 * Q3C's virtual sentence as a predicate: "for every accessible pending task
 * with a recurrence_rule".
 *
 * Accessible is the membership join of accessibleTasks, so what is left here
 * is the other two, and there is no third. The range is deliberately absent:
 * see the header. 4.11's CHECK makes a rule-carrying row a dated row, so
 * due_date is never null behind this predicate, and the projection re-tests
 * both facts anyway rather than trusting the caller.
 */
const PROJECTED_SERIES = sql`t.status = 'pending'
       AND t.recurrence_rule IS NOT NULL`

/**
 * Every series that could draw a ghost, in id order.
 *
 * Ordered so the ghosts are, and by the same comparison Q3C's real rows are
 * ordered by: "ghosts (date order, task id)" is a date-major sort over this
 * sequence, and a stable sort leaves the database's own uuid order intact
 * inside a date rather than re-deriving it in JavaScript, where the two could
 * disagree.
 */
async function projectionSources(
  executor: Executor,
  viewerId: string,
): Promise<Record<string, unknown>[]> {
  return rowsOf(
    executor,
    sql`SELECT t.id, t.title, t.status, t.folder_id, t.recurrence_rule,
               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time
        ${accessibleTasks(viewerId)}
        WHERE ${PROJECTED_SERIES}
        ORDER BY t.id ASC`,
  )
}

/**
 * 7.10's virtual element, one per projected date.
 *
 * A ghost is not a card: 7.10 gives it five keys, and the three it takes from
 * the row are the current occurrence's own, because "click opens the current
 * occurrence" (Q3C) means the id it carries is that row's rather than a
 * synthesized one.
 */
function ghostsOf(
  rows: readonly Record<string, unknown>[],
  start: CalendarDate,
  end: CalendarDate,
): VirtualInstance[] {
  const ghosts: VirtualInstance[] = []
  for (const row of rows) {
    const dates = virtualInstances(
      {
        status: String(row.status),
        dueDate: nullableString(row.due_date),
        recurrenceRule: nullableString(row.recurrence_rule),
      },
      start,
      end,
    )
    for (const date of dates) {
      ghosts.push({
        task_id: String(row.id),
        title: String(row.title),
        date,
        due_time: nullableString(row.due_time),
        folder_id: String(row.folder_id),
      })
    }
  }
  return ghosts.sort((a, b) => compareDates(a.date, b.date))
}

/**
 * GET /views/planned/calendar, whose real rows are the tasks whose Schedule
 * overlaps the requested range.
 *
 * Q3C said "due_date BETWEEN start AND end" until issue #216 gave a task a
 * span rather than a day.
 *
 * The old reading is still what this does for the two one-date states: a
 * Schedule whose ends are the same day overlaps a range exactly when that
 * day is inside it.
 * What it adds is the state a bar is drawn for. A task starting 28 September
 * and due 3 October has to reach an October grid that holds neither of the
 * days its bar begins on, and it has to reach the September one too, or the
 * same bar disappears from one month and reappears in the next.
 *
 * Inclusive at both ends, which AC-126 pins from both sides and which the
 * comparison keeps: overlap of two inclusive spans is "each begins no later
 * than the other ends". ACTIVATION_DATE and SCHEDULE_DATE are the two ends of
 * the task's own span under `tasks_start_before_due_check`, and neither is
 * null for a row this predicate can admit, since a task with no date has no
 * span to overlap anything.
 *
 * One row per task, whatever its span covers: the row carries both of its
 * dates and the grid draws one bar from them. Q3C's array is not a list of
 * cells and never was - the ghosts already put several entries on one task -
 * but a real row appearing once per day it covers would be the duplication
 * #216 refuses, and it is not what this returns.
 *
 * The dates are compared as dates rather than as instants: 4.11 makes both
 * floating, so no zone enters this predicate and tz reaches this endpoint
 * only as the parameter 7.0 requires of every view.
 */
export async function plannedCalendarView(
  executor: Executor,
  viewerId: string,
  start: string,
  end: string,
): Promise<GetPlannedCalendarResponse> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${ACTIVATION_DATE} <= ${end}::date
               AND ${SCHEDULE_DATE} >= ${start}::date`,
    order: Q3C_ORDER,
  })
  const series = await projectionSources(executor, viewerId)
  return {
    real: rows.map((row) => row.card),
    virtual: ghostsOf(series, start, end),
  }
}

/*
Q3C, GET /views/planned/calendar: real rows plus recurrence ghosts. Unlike Q3:
all three statuses appear, the range is an overlap, and the cell order puts
the timed flag above status_rank. Ghosts are projected from a separate query
that is not limited to the range, or a series anchored before the range would
show no ghosts (AC-143). Bounded by the 62-day range, not a row cap.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

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
 * Flat, date-major cell order. A grid draws a span from where it begins, so it
 * leads on ACTIVATION_DATE where Q3's list leads on SCHEDULE_DATE.
 */
const Q3C_ORDER = sql`${ACTIVATION_DATE} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       ${STATUS_RANK} ASC, t.id ASC`

/**
 * Pending, rule-carrying tasks, deliberately not limited to the range. The
 * projection re-checks both facts.
 */
const PROJECTED_SERIES = sql`t.status = 'pending'
       AND t.recurrence_rule IS NOT NULL`

/** Ordered by id so a stable date sort keeps the database's order within a date. */
async function projectionSources(
  executor: Executor,
  viewerId: string,
  folderScope: SQL,
): Promise<Record<string, unknown>[]> {
  return rowsOf(
    executor,
    sql`SELECT t.id, t.title, t.status, t.folder_id, t.recurrence_rule,
               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time
        ${accessibleTasks(viewerId)}
        WHERE ${PROJECTED_SERIES} ${folderScope}
        ORDER BY t.id ASC`,
  )
}

/** A ghost's id is the current occurrence's row, which opening a ghost opens. */
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
 * Real rows are tasks whose Schedule overlaps the range, inclusive at both ends
 * (AC-126), once per task however many days it spans. Floating dates, so no
 * zone enters the predicate.
 */
export async function plannedCalendarView(
  executor: Executor,
  viewerId: string,
  start: string,
  end: string,
  folderId?: string,
): Promise<GetPlannedCalendarResponse> {
  const folderScope = folderId === undefined
    ? sql``
    : sql`AND t.folder_id = ${folderId}::uuid`
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${ACTIVATION_DATE} <= ${end}::date
               AND ${SCHEDULE_DATE} >= ${start}::date ${folderScope}`,
    order: Q3C_ORDER,
  })
  const series = await projectionSources(executor, viewerId, folderScope)
  return {
    real: rows.map((row) => row.card),
    virtual: ghostsOf(series, start, end),
  }
}

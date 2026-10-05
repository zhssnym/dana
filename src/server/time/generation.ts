// 8.5's generation: creates the next occurrence when the current one is completed or abandoned. Never by time.
// The caller owns the transaction. The zone is the request's, not the user row's (8.5, 8.1).
import { sql } from 'drizzle-orm'

import { assertCalendarDate, compareDates } from './calendar-date.js'
import type { CalendarDate } from './calendar-date.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { nextInstance } from './recurrence.js'
import { copyReminderToSuccessor } from './reminder-recompute.js'
import { today } from './today.js'
import { copyTaskDocument } from '../domain/task-document.js'

export type GenerationOutcome =
  | {
      readonly kind: 'generated'
      readonly successorId: string
      readonly dueDate: CalendarDate
    }
  /** UNTIL ended the series. The rule stays on the row so a restore can resume it. */
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'not_recurring' }

export interface GenerationRequest {
  readonly taskId: string
  /** The IANA zone of the request that made the transition (8.5, 8.1). */
  readonly tz: string
  readonly at?: Date
}

/** Call only in the winning branch of a complete or abandon, after the guarded UPDATE reported one row. */
export async function generateSuccessor(
  tx: Executor,
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  // to_char because the drivers disagree on DATE: PGlite returns a string, node-postgres a JS Date.
  const found = await rowsOf(
    tx,
    sql`SELECT to_char(due_date, 'YYYY-MM-DD') AS due_date, recurrence_rule
          FROM tasks WHERE id = ${request.taskId}::uuid`,
  )
  const row = found[0]
  if (row === undefined) {
    throw new TypeError(
      `generateSuccessor was given a task that does not exist: ${request.taskId}`,
    )
  }
  const rule = row.recurrence_rule === null ? null : String(row.recurrence_rule)
  if (rule === null) return { kind: 'not_recurring' }
  if (row.due_date === null) {
    // A rule requires a due_date (4.5), so this is corruption, not a state to handle.
    throw new TypeError(
      `task ${request.taskId} carries a recurrence_rule with no due_date, which 4.5 forbids`,
    )
  }

  const dueDate = assertCalendarDate(row.due_date, 'due_date')
  const currentDate = today(request.tz, request.at)
  // A late completion cuts off at today and skips missed slots; an early one cuts off at the due date,
  // so finishing early does not pull the next occurrence forward.
  const cutoff = compareDates(dueDate, currentDate) >= 0 ? dueDate : currentDate
  const nextDue = nextInstance(rule, dueDate, cutoff)
  if (nextDue === null) return { kind: 'exhausted' }

  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                           due_time, recurrence_rule, series_id, assignee_id, assignee_ids,
                           created_by, status)
        SELECT folder_id, title, notes, important, ${nextDue}::date,
               due_time, recurrence_rule, series_id, assignee_id, assignee_ids,
               created_by, 'pending'
          FROM tasks WHERE id = ${request.taskId}::uuid
        RETURNING id`,
  )
  const successor = inserted[0]
  if (successor === undefined) {
    throw new TypeError(
      `the successor of ${request.taskId} was not inserted, and 8.5 has no state where that is a normal outcome`,
    )
  }
  const successorId = String(successor.id)

  // The reminder uses the assignee's zone, not the request's (8.6).
  await copyReminderToSuccessor(tx, request.taskId, successorId, request.at)

  // The successor gets a copy of the task document; its checklist comes across unticked (8.5).
  await copyTaskDocument(tx, request.taskId, successorId, undefined, { uncheck: true })


  // Only the current occurrence carries the rule. Last, because the insert above reads it off this row.
  await tx.execute(
    sql`UPDATE tasks SET recurrence_rule = NULL, updated_at = now()
        WHERE id = ${request.taskId}::uuid`,
  )

  return { kind: 'generated', successorId, dueDate: nextDue }
}

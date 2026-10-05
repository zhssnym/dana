// 5.1's G-SERIES guard for un-complete and restore. With S the other pending row of the series:
// S exists: delete S and take its rule. S absent and this row is newest: allowed, no write. Otherwise: 409.
// It never changes a status. Run it before the caller's guarded UPDATE, in the same transaction.
import { sql } from 'drizzle-orm'

import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

export type SeriesGuardOutcome =
  | { readonly kind: 'not_series' }
  /** S was deleted and its rule is now on this row. */
  | {
      readonly kind: 'reclaimed'
      readonly deletedSuccessorId: string
      readonly rule: string | null
    }
  | { readonly kind: 'newest' }
  | { readonly kind: 'refused'; readonly message: string }

export const SERIES_MOVED_ON =
  'This repeating task has already moved on; restore is only possible on its latest occurrence.'

/**
 * Apply G-SERIES to one accessible row, inside the caller's transaction.
 * Call only when the row is in the status the transition expects: a repeat call must write nothing.
 */
export async function applySeriesGuard(
  tx: Executor,
  taskId: string,
): Promise<SeriesGuardOutcome> {
  const found = await rowsOf(
    tx,
    sql`SELECT series_id FROM tasks
         WHERE id = ${taskId}::uuid FOR UPDATE`,
  )
  const row = found[0]
  if (row === undefined) {
    throw new TypeError(
      `applySeriesGuard was given a task that does not exist: ${taskId}`,
    )
  }
  if (row.series_id === null) return { kind: 'not_series' }
  const seriesId = String(row.series_id)

  const siblings = await rowsOf(
    tx,
    sql`SELECT id, recurrence_rule FROM tasks
         WHERE series_id = ${seriesId}::uuid
           AND id <> ${taskId}::uuid
           AND status = 'pending'
         FOR UPDATE`,
  )
  if (siblings.length > 1) {
    // Two pending rows mean INV-7 is already broken. Deleting one quietly would hide the cause.
    throw new TypeError(
      `series ${seriesId} holds ${String(siblings.length)} pending rows, which INV-7 forbids`,
    )
  }
  const successor = siblings[0]
  if (successor !== undefined) {
    const deletedSuccessorId = String(successor.id)
    const rule =
      successor.recurrence_rule === null
        ? null
        : String(successor.recurrence_rule)
    // Cascades take its steps, My Day entries and reminder; invites.task_id is set null.
    await tx.execute(sql`DELETE FROM tasks WHERE id = ${deletedSuccessorId}::uuid`)
    await tx.execute(
      sql`UPDATE tasks SET recurrence_rule = ${rule}, updated_at = now()
           WHERE id = ${taskId}::uuid`,
    )
    return { kind: 'reclaimed', deletedSuccessorId, rule }
  }

  // Ties on created_at break by id so exactly one row is newest. Compared in SQL to avoid driver timestamp conversion.
  const newer = await rowsOf(
    tx,
    sql`SELECT 1 FROM tasks s, tasks t
         WHERE t.id = ${taskId}::uuid
           AND s.series_id = t.series_id
           AND s.id <> t.id
           AND (s.created_at, s.id) > (t.created_at, t.id)
         LIMIT 1`,
  )
  if (newer.length === 0) return { kind: 'newest' }
  return { kind: 'refused', message: SERIES_MOVED_ON }
}

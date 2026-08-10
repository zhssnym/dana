/*
5.1's G-SERIES guard: what un-complete and restore are allowed to do to a
series, and what they have to do to it first.

The guard exists because a recurring occurrence is not alone. Completing one
generates the next, so undoing that completion has to decide what becomes of
the row generation created, and the answer 5.1 gives is that the successor is
destroyed and its rule handed back. The alternative, leaving both pending,
would break INV-7 and leave a user with two live copies of one chore and no
way to tell which one the series will follow.

Three branches, 5.1's own, with S the pending row of this series other than
this one (INV-7 makes it unique or absent):

- **S exists.** Allowed. Delete S, whose steps and reminder cascade with it,
  copy S.recurrence_rule back onto this row, and this row becomes the current
  occurrence. It is S's rule rather than whatever this row used to carry,
  because an edit made mid-series lives on S and is the series as it stands.
- **S is absent and this row is the newest of its series.** Allowed, and
  nothing is written here: the row keeps whatever rule it holds, which is how
  an exhausted series resumes when its last occurrence is reopened.
- **Otherwise.** Refused, 409, and nothing is written.

**This never changes a status.** The caller runs its own guarded UPDATE
after, in the same transaction: 5.1 makes the status machine one mechanism,
8.3 makes every status write a guarded single-row update, and a guard that
also transitioned would be a second door onto the same column. What this does
write, in the first branch, is the deletion and the rule, which have to
commit with that update or not at all.

**Order matters, and so does the lock.** Run this before the update, not
after: the update is what tells the caller it won the race, but the guard
needs to see the series as it is at the moment of the decision, and the
refusal has to happen before anything moves. The read below takes the row
lock so the two are one decision under a concurrent transition; 11.15 records
that PGlite is single-connection, so no run of this suite can show what that
lock prevents, which is the same shape the 10.3 cap guards carry.
*/
import { sql } from 'drizzle-orm'

import { rowsOf } from './executor.js'
import type { Executor } from './executor.js'

/** 5.1's three branches, plus the case that is not a series at all. */
export type SeriesGuardOutcome =
  /** The row carries no series_id, so G-SERIES does not apply and the
   * transition proceeds. Most tasks are this. */
  | { readonly kind: 'not_series' }
  /** 5.1's first branch: the pending successor was deleted and its rule is
   * now on this row. deleted_successor_id in 7.6's envelope is this id. */
  | {
      readonly kind: 'reclaimed'
      readonly deletedSuccessorId: string
      readonly rule: string | null
    }
  /** 5.1's second branch: no pending sibling, and this row is the newest of
   * its series, so it may reopen as the current occurrence untouched. */
  | { readonly kind: 'newest' }
  /** 5.1's third branch: 409, with the copy the specification writes. */
  | { readonly kind: 'refused'; readonly message: string }

/** 5.1's own words for the refusal, so the route does not invent them. */
export const SERIES_MOVED_ON =
  'This repeating task has already moved on; restore is only possible on its latest occurrence.'

/**
 * Apply G-SERIES to one row, inside the caller's transaction.
 *
 * Call it ahead of the uncomplete and restore updates, on a row the caller
 * has already resolved as accessible, and only when that row is in the status
 * the transition expects: a repeat call on a row that is already pending is
 * 5.1's no-op and must write nothing, so it must not reach this function.
 *
 * Nothing here reads a calendar date or a zone. That is why frozen 7.6 gives
 * uncomplete and restore no tz parameter while complete and abandon carry
 * one: this guard reads the shape of a series, and only 8.5's generation
 * computes a current date.
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
    // Section 3 names generation and these guards as what enforces INV-7, so
    // this function is one of the two places the invariant lives rather than
    // a consumer of it. Two pending rows mean it has already been broken
    // somewhere, and quietly deleting one of them would leave the series
    // wrong and the cause invisible.
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
    // The row goes, and the ON DELETE CASCADE of 4.6, 4.7 and 4.8 takes its
    // steps, My Day entries and reminder with it; 4.9 sets invites.task_id
    // null. 5.1 says destroy rather than fold back, and the
    // confirmation dialog it specifies warned that the next occurrence is
    // removed including any edits made to it.
    await tx.execute(sql`DELETE FROM tasks WHERE id = ${deletedSuccessorId}::uuid`)
    await tx.execute(
      sql`UPDATE tasks SET recurrence_rule = ${rule}, updated_at = now()
           WHERE id = ${taskId}::uuid`,
    )
    return { kind: 'reclaimed', deletedSuccessorId, rule }
  }

  // "This row has the greatest created_at among rows sharing series_id."
  // Ties are broken by id so the order is total: two rows of one series can
  // share an instant only if one statement wrote them both, and a tie that
  // admitted both rows would let a series have two current occurrences. The
  // comparison stays in SQL rather than reading a timestamp out and binding
  // it back, which is where a driver's own idea of an instant would get in.
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

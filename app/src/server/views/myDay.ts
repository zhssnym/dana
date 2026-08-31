/*
Q1 and Q1R: GET /views/my-day, the two open groups and the recap.

This is the one page in section 6 whose grouping is not an ORDER BY. Q1 sorts
its rows by due_date, due_time and id inside each group, and then splits them
on qualify_date against today, which is 8.2's minimum of two dates rather
than a column. So the query answers one ordered stream and the split happens
over it, in the order the stream arrived: filtering preserves relative order,
so each group comes out in Q1's sort without either group being sorted twice.

Every date decision here is the Scheduling engineer's, imported rather than
restated, which docs/team/README.md's first seam requires and this role's
hard boundaries repeat: today(tz) for 8.1's today(V), qualifyDate for 8.2's
minimum, myDayGroup for the Carried and Today boundary, and localDayWindow
for Q1R's "completed_at falls on today in V's timezone".

The one date comparison that is not a call is the automatic clause's
due_date <= today, which has to run in SQL to reach an index. It is written
once, in AUTOMATIC below, and read back as a column so the row-level decision
that follows is the helper's rather than a second copy of the comparison.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { TaskCard } from '../../shared/tasks.js'
import type { GetMyDayResponse } from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import type { Executor } from '../domain/db.js'
import { localDayWindow, myDayGroup, qualifyDate, today } from '../time/index.js'

import { CAP_PROBE, readCards } from './cards.js'

/**
 * Q1's automatic clause: "assignee_id = V AND due_date IS NOT NULL AND
 * due_date <= today". The other arm of the OR is the My Day entry, which the
 * card source already joins.
 *
 * One fragment used twice, in the predicate and in the projection, because
 * qualify_date is "the due_date when the automatic clause holds" and a
 * second spelling of the clause could hold in one place and not the other.
 */
function automaticClause(viewerId: string, todayLocal: string): SQL {
  return sql`(t.assignee_id = ${viewerId} AND t.due_date IS NOT NULL
              AND t.due_date <= ${todayLocal}::date)`
}

/**
 * Q1: the open list.
 *
 * Predicate, predicate order and sort are section 6's own. Abandoned rows
 * never match by the status filter, which Q1 states outright, and the
 * important toggle is a client-side filter over what this returns and
 * changes no query.
 */
async function openGroups(
  executor: Executor,
  viewerId: string,
  todayLocal: string,
): Promise<{ carried: TaskCard[]; today: TaskCard[] }> {
  const automatic = automaticClause(viewerId, todayLocal)
  const rows = await readCards(executor, {
    viewerId,
    where: sql`t.status = 'pending' AND (${automatic} OR e.task_id IS NOT NULL)`,
    // "Sort inside each group: due_date ascending nulls last, due_time
    // ascending nulls first, id." One order for both groups, because the
    // groups are a partition of this sequence rather than two queries.
    /* created_at before id since the polish round of 2026-08-30: the final
       key used to be the uuid alone, which is random, so a task captured on
       Today landed anywhere in its group rather than at its foot. Oldest
       first puts every capture last, the same ruling Q2 took that day, and
       id stays behind it as the deterministic tiebreak. */
    order: sql`t.due_date ASC NULLS LAST, t.due_time ASC NULLS FIRST, t.created_at ASC, t.id ASC`,
    limit: CAP_PROBE,
    extra: sql`${automatic} AS automatic,
               to_char(e.added_on, 'YYYY-MM-DD') AS added_on`,
  })

  const carried: TaskCard[] = []
  const todayGroup: TaskCard[] = []
  for (const row of rows) {
    // 8.2: the least of the due_date, when the automatic clause holds for
    // this row, and the entry's added_on, when an entry exists. At least one
    // is present for every row the predicate admits, which is why the helper
    // throws rather than defaulting when neither is.
    const qualify = qualifyDate(
      row.raw.automatic === true ? row.card.due_date : null,
      row.raw.added_on === null || row.raw.added_on === undefined
        ? null
        : String(row.raw.added_on),
    )
    if (myDayGroup(qualify, todayLocal) === 'carried') carried.push(row.card)
    else todayGroup.push(row.card)
  }
  return { carried, today: todayGroup }
}

/**
 * Q1R: the recap.
 *
 * "completed_at falls on today in V's timezone" is a window of absolute time
 * that moves with the zone, which localDayWindow computes without ever
 * asking a library for midnight in a zone (11.15's Luxon bullet). The
 * comparison is then two instants against an indexed column rather than a
 * per-row conversion.
 *
 * The three-way OR is the whole of who a completion belongs to: the
 * assignee, whoever completed it, and anyone holding an entry for it.
 */
async function recap(
  executor: Executor,
  viewerId: string,
  todayLocal: string,
  tz: string,
): Promise<TaskCard[]> {
  const window = localDayWindow(todayLocal, tz)
  const rows = await readCards(executor, {
    viewerId,
    where: sql`t.status = 'completed'
               AND t.completed_at >= ${window.startInclusive.toISOString()}::timestamptz
               AND t.completed_at < ${window.endExclusive.toISOString()}::timestamptz
               AND (t.assignee_id = ${viewerId} OR t.completed_by = ${viewerId}
                    OR e.task_id IS NOT NULL)`,
    order: sql`t.completed_at DESC, t.id DESC`,
    limit: CAP_PROBE,
  })
  return rows.map((row) => row.card)
}

/**
 * GET /views/my-day.
 *
 * The cap is per response across all three sections, ruled at the P4 change
 * control on 2026-08-07, and the rows kept are the first 1000 in the order
 * 7.10 enumerates them: carried, today, recap.
 */
export async function myDayView(
  executor: Executor,
  viewerId: string,
  tz: string,
): Promise<GetMyDayResponse> {
  const todayLocal = today(tz)
  const groups = await openGroups(executor, viewerId, todayLocal)
  const rows = await recap(executor, viewerId, todayLocal, tz)
  const capped = takeCapped([groups.carried, groups.today, rows])
  return {
    carried: capped.sections[0] ?? [],
    today: capped.sections[1] ?? [],
    recap: capped.sections[2] ?? [],
    truncated: capped.truncated,
  }
}

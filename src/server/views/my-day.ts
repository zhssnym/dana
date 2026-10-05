/*
Q1 and Q1R, GET /views/my-day. One ordered query, then split into Carried and
Today by qualify_date (8.2); filtering keeps the order. Date rules come from
src/server/time; the one SQL date comparison is written once in automaticClause.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { TaskCard } from '../../shared/tasks.js'
import type { GetMyDayResponse } from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import type { Executor } from '../database.js'
import { localDayWindow, myDayGroup, qualifyDate, today } from '../time/index.js'

import { ACTIVATION_DATE, CAP_PROBE, readCards } from './cards.js'

/**
 * Q1's automatic clause: assigned to the viewer with an activation date (start,
 * else due) on or before today (#217). Used in both the predicate and the
 * projection so the two cannot disagree about qualify_date.
 */
function automaticClause(viewerId: string, todayLocal: string): SQL {
  return sql`(t.assignee_ids @> ARRAY[${viewerId}::uuid] AND ${ACTIVATION_DATE} IS NOT NULL
              AND ${ACTIVATION_DATE} <= ${todayLocal}::date)`
}

/** Q1: pending tasks matching the automatic clause or a My Day entry. */
export async function openGroups(
  executor: Executor,
  viewerId: string,
  todayLocal: string,
): Promise<{ carried: TaskCard[]; today: TaskCard[] }> {
  const automatic = automaticClause(viewerId, todayLocal)
  const rows = await readCards(executor, {
    viewerId,
    where: sql`t.status = 'pending' AND (${automatic} OR e.task_id IS NOT NULL)`,
    // One order for both groups. created_at before id, so a new capture lands
    // at the foot (the uuid alone is random).
    order: sql`t.due_date ASC NULLS LAST, t.due_time ASC NULLS FIRST, t.created_at ASC, t.id ASC`,
    limit: CAP_PROBE,
    /* Read back from SQL, not rebuilt from the card's dates, so it is the
       same expression the predicate used. */
    extra: sql`${automatic} AS automatic,
               to_char(${ACTIVATION_DATE}, 'YYYY-MM-DD') AS activation_date,
               to_char(e.added_on, 'YYYY-MM-DD') AS added_on`,
  })

  const carried: TaskCard[] = []
  const todayGroup: TaskCard[] = []
  for (const row of rows) {
    // 8.2: the earlier of the activation date (when the clause holds) and
    // added_on. One is always present, so the helper throws otherwise.
    const qualify = qualifyDate(
      row.raw.automatic === true &&
        row.raw.activation_date !== null &&
        row.raw.activation_date !== undefined
        ? String(row.raw.activation_date)
        : null,
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
 * Q1R: tasks completed during the viewer's local today, as an instant window
 * (localDayWindow; no library midnight, 11.15). Belongs to the assignee, the
 * completer, or anyone with an entry.
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
               AND (t.assignee_ids @> ARRAY[${viewerId}::uuid] OR t.completed_by = ${viewerId}
                    OR e.task_id IS NOT NULL)`,
    order: sql`t.completed_at DESC, t.id DESC`,
    limit: CAP_PROBE,
  })
  return rows.map((row) => row.card)
}

/** GET /views/my-day. One cap across carried, today and recap, in that order. */
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

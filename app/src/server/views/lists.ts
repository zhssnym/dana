/*
Q2 to Q5, the capped list pages. Q2, Q3 and Q5 share OPEN_SCOPE (6.1's proof
depends on it; no test checks it). All reuses the Q2 and Q3 functions rather
than a third query. Q4 is one ORDER BY with each block's keys null in the
other, so it stays one list if a key changes.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { TaskCard } from '../../shared/tasks.js'
import type {
  GetAllResponse,
  GetImportantResponse,
  GetPlannedResponse,
  GetTasksViewResponse,
  TaskCardGroup,
} from '../../shared/views.js'
import { takeCapped } from '../../shared/views.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

import {
  ANYTIME,
  CAP_PROBE,
  OPEN_SCOPE,
  SCHEDULED,
  SCHEDULE_DATE,
  STATUS_RANK,
  readCards,
} from './cards.js'

/** Q2's row order. Ascending, so a new task lands at the foot of its list. */
const Q2_ROW_ORDER = sql`${STATUS_RANK} ASC, t.created_at ASC, t.id ASC`

/**
 * Q7's unscheduled order: the hand `position` first, nulls last, then Q2's keys.
 * The only order that reads `position` (AC-269). Ties in `position` are
 * expected, so the keys behind it end in id.
 */
export const FOLDER_UNSCHEDULED_ORDER = sql`t.position ASC NULLS LAST,
       ${Q2_ROW_ORDER}`

/**
 * Q3's order: schedule date, status_rank, all-day rows first, due_time,
 * created_at, id. A start-only row sorts as all-day (due_time needs a due_date).
 */
const Q3_ORDER = sql`${SCHEDULE_DATE} ASC, ${STATUS_RANK} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC`

/**
 * Q2's grouping as one stream order: the viewer's default folder first (defaults
 * are never shared, INV-3), then by lower(name), id. Groups are contiguous.
 */
export const Q2_ORDER = sql`f.is_default DESC, lower(f.name) ASC, f.id ASC,
       ${Q2_ROW_ORDER}`

/**
 * Q4's order: Scheduled block, then Anytime. Keys the blocks disagree on are
 * CASE expressions that are null in the other block.
 */
const Q4_ORDER = sql`(${SCHEDULE_DATE} IS NULL) ASC, ${SCHEDULE_DATE} ASC,
       ${STATUS_RANK} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN NULL ELSE t.created_at END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN NULL ELSE t.id END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN t.created_at END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN t.id END ASC`

export async function plannedRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND ${SCHEDULED}${extraScope}`,
    order: Q3_ORDER,
    limit: CAP_PROBE,
  })
  return rows.map((row) => row.card)
}

export async function tasksRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
  order: SQL = Q2_ORDER,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND ${ANYTIME}${extraScope}`,
    order,
    limit: CAP_PROBE,
  })
  return rows.map((row) => row.card)
}

/** Splits the ordered Q2 stream into the Inbox and one group per folder. */
function groupTasks(rows: readonly TaskCard[]): {
  inbox: TaskCard[]
  groups: TaskCardGroup[]
} {
  const inbox: TaskCard[] = []
  const groups: TaskCardGroup[] = []
  for (const card of rows) {
    if (card.folder.is_default) {
      inbox.push(card)
      continue
    }
    const open = groups[groups.length - 1]
    if (open !== undefined && open.folder.id === card.folder.id) {
      open.rows.push(card)
      continue
    }
    groups.push({ folder: card.folder, rows: [card] })
  }
  return { inbox, groups }
}

export async function tasksView(
  executor: Executor,
  viewerId: string,
): Promise<GetTasksViewResponse> {
  const capped = takeCapped([await tasksRows(executor, viewerId)])
  const { inbox, groups } = groupTasks(capped.sections[0] ?? [])
  return { inbox, groups, truncated: capped.truncated }
}

export async function plannedView(
  executor: Executor,
  viewerId: string,
): Promise<GetPlannedResponse> {
  const capped = takeCapped([await plannedRows(executor, viewerId)])
  return { rows: capped.sections[0] ?? [], truncated: capped.truncated }
}

export async function importantView(
  executor: Executor,
  viewerId: string,
): Promise<GetImportantResponse> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND t.important = true`,
    order: Q4_ORDER,
    limit: CAP_PROBE,
  })
  const capped = takeCapped([rows.map((row) => row.card)])
  return { rows: capped.sections[0] ?? [], truncated: capped.truncated }
}

/**
 * GET /views/all. takeCapped fills planned, then tasks; grouping after the cap
 * keeps the two allocations in step.
 */
export async function allView(
  executor: Executor,
  viewerId: string,
): Promise<GetAllResponse> {
  const planned = await plannedRows(executor, viewerId)
  const tasks = await tasksRows(executor, viewerId)
  const capped = takeCapped([planned, tasks])
  const { inbox, groups } = groupTasks(capped.sections[1] ?? [])
  return {
    planned: capped.sections[0] ?? [],
    tasks_inbox: inbox,
    tasks_groups: groups,
    truncated: capped.truncated,
  }
}

/** Q7's first two sections: the same functions narrowed to one folder. */
export function folderScheduled(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<TaskCard[]> {
  return plannedRows(executor, viewerId, sql` AND t.folder_id = ${folderId}`)
}

export function folderUnscheduled(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<TaskCard[]> {
  return tasksRows(
    executor,
    viewerId,
    sql` AND t.folder_id = ${folderId}`,
    FOLDER_UNSCHEDULED_ORDER,
  )
}

/**
 * The unscheduled list as ids, for the order-writing mutation, so the order
 * lives in one place. The caller must already have gated access (accessibleTask).
 */
export async function folderUnscheduledIds(
  executor: Executor,
  folderId: string,
): Promise<Array<{ id: string; position: string | null }>> {
  const found = await rowsOf(
    executor,
    sql`SELECT t.id, t.position
        FROM tasks t
        WHERE ${OPEN_SCOPE} AND ${ANYTIME}
          AND t.deleted_at IS NULL AND t.folder_id = ${folderId}
        ORDER BY ${FOLDER_UNSCHEDULED_ORDER}
        LIMIT ${CAP_PROBE}`,
  )
  return found.map((row) => ({
    id: String(row.id),
    position: row.position === null ? null : String(row.position),
  }))
}

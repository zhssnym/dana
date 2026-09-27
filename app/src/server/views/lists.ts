/*
Q2, Q3, Q4 and Q5: the four capped list pages, GET /views/tasks,
/views/planned, /views/important and /views/all.

The three that 6.1's proof is about are built from one scope sentence,
OPEN_SCOPE in cards.ts, and add their own conjunct to it: Q2 adds ANYTIME, Q3
adds SCHEDULED, and Q5 adds nothing. That is not a convenience, it is the
proof's stated dependency, and no test checks it: sharing this fragment is
what holds it.

Both conjuncts are in cards.ts rather than here for the reason that file's
header gives: Scheduled is "a Start Date or a Due Date" (issue #216), so
Anytime is written as the negation of it and the partition holds structurally
instead of by two sentences agreeing. A Scheduled row is ordered by
SCHEDULE_DATE, which is the due date where there is one and the start date
otherwise.

Q5 goes further and reuses the two functions rather than the two predicates.
Section 6 says All is "two stacked sections in one scroll: Planned rendered
exactly as Q3 orders it, then Tasks rendered exactly as Q2 groups it. No
third scheme exists." A third scheme is exactly what a third query would be,
so there is not one here.

Q4 is the odd one and section 6 says why: it borrows Q3's keys for its dated
rows and Q2's for its undated ones. The two agree on created_at ascending;
the CASE split below is kept because the boundary is real even while the
directions coincide. It is still one list, so it is one
ORDER BY, with the keys of each block written as expressions that are null in
the other. The alternative, two queries concatenated, would answer the same
sequence today and would stop being one list the moment a key changed.
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

/* ------------------------------------------------------------------ *
 * The orders of section 6, one fragment each
 * ------------------------------------------------------------------ */

/**
 * Q2's row order: "status_rank, created_at ascending, id ascending".
 *
 * Ascending: a newly added task lands at the foot of the list it was typed
 * into, everywhere, and a list whose newest row leads puts every capture at
 * the top instead. Q2 feeds Anytime, the folder groups and Q4's undated
 * block, so this one fragment is that rule for all three.
 */
const Q2_ROW_ORDER = sql`${STATUS_RANK} ASC, t.created_at ASC, t.id ASC`

/**
 * Q7's second section: the hand order of 4.5 first, nulls trailing, then
 * Q2's own row keys.
 *
 * **This is the only order in section 6 that reads `position`**; nothing
 * else in this file does (AC-269).
 *
 * Nulls trail: a task with no position yet is a task nobody has placed, and
 * what nobody has placed sits at the foot, newest last, exactly where
 * the capture that made it put it. Q2's keys stay behind the new one rather
 * than being replaced: two people may place into one gap at once, so ties
 * in `position` are expected by design, and the keys behind it end in id,
 * which is what the preamble's byte-identical guarantee is made of.
 */
export const FOLDER_UNSCHEDULED_ORDER = sql`t.position ASC NULLS LAST,
       ${Q2_ROW_ORDER}`

/**
 * Q3's order: "schedule date ascending, status_rank, timed flag (all-day rows
 * first: due_time IS NOT NULL sorts after IS NULL), due_time ascending,
 * created_at ascending, id".
 *
 * The leading key was `t.due_date` until issue #216 gave a task two dates.
 * It is SCHEDULE_DATE now, which is the due date where the task has one, so
 * the list stays deadline-oriented and a due-only task sorts exactly where it
 * always did; a start-only task takes its place by the one date it has rather
 * than trailing every dated row as a null would. No row is emitted twice: one
 * task is one row and the expression picks one of its dates.
 *
 * The keys behind it are the due date's own and stay that way. due_time is a
 * time of day on the deadline (4.5 makes it require a due_date), so a
 * start-only row sorts as an all-day row, which is what it is.
 *
 * The timed flag is spelled as the comparison section 6 spells it rather
 * than as a NULLS FIRST modifier on due_time, because it is a key of its own
 * and sits above due_time: false sorts before true in Postgres, so an
 * all-day row leads.
 */
const Q3_ORDER = sql`${SCHEDULE_DATE} ASC, ${STATUS_RANK} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC`

/**
 * Q2's grouping, as an order over one stream: "rows from V's default folder
 * first, ungrouped, no heading; then one group per remaining folder having
 * at least one row, ordered by lower(folder name) ascending, folder id".
 *
 * The default folder sorts first by is_default DESC, and the only accessible
 * default folder is V's own because defaults are never shared (INV-3), so
 * that clause names exactly the Inbox. Grouping the stream afterwards needs
 * no second sort: rows of one folder are already contiguous.
 */
export const Q2_ORDER = sql`f.is_default DESC, lower(f.name) ASC, f.id ASC,
       ${Q2_ROW_ORDER}`

/**
 * Q4's order, one list across the boundary: "schedule date ascending nulls
 * last, then within scheduled rows the Q3 keys (status_rank, timed flag,
 * due_time, created_at, id), within Anytime rows the Q2 keys (status_rank,
 * created_at ascending, id ascending)".
 *
 * The boundary this list crosses is Q3's against Q2's, and since issue #216
 * that is the Scheduled boundary rather than the due date's: Q4's own
 * sentence says a row of the first block "shows due date and time like a
 * Scheduled row" and a row of the second "shows their folder like an Anytime
 * row", so the two blocks are those two pages' membership and move with it.
 * `SCHEDULE_DATE IS NULL` is ANYTIME exactly, which is why the split is one
 * expression here and not a second copy of the membership sentence.
 *
 * Nulls last is spelled as its own leading key so the block boundary is
 * visible, and the keys the two blocks disagree on are written as CASE
 * expressions that are null for every row of the other block, where they
 * discriminate nothing. Everything the two blocks agree on, status_rank
 * first among them, is written once.
 */
const Q4_ORDER = sql`(${SCHEDULE_DATE} IS NULL) ASC, ${SCHEDULE_DATE} ASC,
       ${STATUS_RANK} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN NULL ELSE t.created_at END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN NULL ELSE t.id END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN t.created_at END ASC,
       CASE WHEN ${SCHEDULE_DATE} IS NULL THEN t.id END ASC`

/* ------------------------------------------------------------------ *
 * The two open halves, which All stacks
 * ------------------------------------------------------------------ */

/** Q3's rows: the scope, plus a Schedule. `rungOn` is focus.ts's: the
 * viewer's today, so each card carries its rung. */
export async function plannedRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
  rungOn?: string,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND ${SCHEDULED}${extraScope}`,
    order: Q3_ORDER,
    limit: CAP_PROBE,
    ...(rungOn === undefined ? {} : { rungOn }),
  })
  return rows.map((row) => row.card)
}

/** Q2's rows: the scope, minus a Schedule, in the grouped order. */
export async function tasksRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
  order: SQL = Q2_ORDER,
  rungOn?: string,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND ${ANYTIME}${extraScope}`,
    order,
    limit: CAP_PROBE,
    ...(rungOn === undefined ? {} : { rungOn }),
  })
  return rows.map((row) => row.card)
}

/**
 * The Q2 stream split into the sections 7.10 names, the Inbox ungrouped and
 * one group per remaining folder.
 *
 * The stream is already in the enumerated order, so the split is a walk: a
 * heading opens where the folder id changes, and a folder with no rows never
 * reaches here to open an empty one.
 */
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

/* ------------------------------------------------------------------ *
 * The four endpoints
 * ------------------------------------------------------------------ */

/** GET /views/tasks. 7.10 enumerates it as inbox then groups, which is the
 * order the cap fills in. */
export async function tasksView(
  executor: Executor,
  viewerId: string,
): Promise<GetTasksViewResponse> {
  const capped = takeCapped([await tasksRows(executor, viewerId)])
  const { inbox, groups } = groupTasks(capped.sections[0] ?? [])
  return { inbox, groups, truncated: capped.truncated }
}

/** GET /views/planned, list mode. Calendar mode is calendar.ts. */
export async function plannedView(
  executor: Executor,
  viewerId: string,
): Promise<GetPlannedResponse> {
  const capped = takeCapped([await plannedRows(executor, viewerId)])
  return { rows: capped.sections[0] ?? [], truncated: capped.truncated }
}

/** GET /views/important. Q4's predicate is the open scope plus the star. */
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
 * GET /views/all: Q3's rows, then Q2's grouping, one page and one cap.
 *
 * 7.10 enumerates the sections as planned, tasks_inbox, tasks_groups, so
 * that is the order takeCapped fills: the dated rows keep their place and
 * the Tasks half takes what is left. Splitting the Tasks half after the cap
 * rather than before is what keeps the two allocations from disagreeing,
 * since the stream is already in the enumerated order within itself.
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

/* ------------------------------------------------------------------ *
 * What Q7 borrows
 * ------------------------------------------------------------------ */

/**
 * Q7's first two sections: "Scheduled: Q3 predicate and order, folder_id =
 * F" and "Unscheduled: Q2 row order, folder_id = F (no folder grouping)".
 *
 * By reference in section 6 and by reference here: the folder page narrows
 * the same two functions rather than restating their predicates, which is
 * what stops the folder-scoped copy of an order from drifting from the
 * page-scoped one. The second takes Q2's row order alone, the folder
 * clauses of the grouped order having nothing left to order, and it takes
 * the hand order of 4.5 in front of those keys; the constant below is where that sits.
 */
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
 * The same list as ids alone, for the mutation that writes the order.
 *
 * It is here so that the order lives in one place. The endpoint that places
 * a task has to know the sequence the page is showing, because a drop names
 * its neighbours and because the seeding pass has to preserve what the
 * reader already saw; deriving that from a second ORDER BY written in the
 * domain would be one of section 6's orders stated twice, which is the drift
 * this file refuses everywhere else.
 *
 * The scope is `folderScheduled`'s mirror image, OPEN_SCOPE plus ANYTIME
 * plus the folder. It is the mirror image because ANYTIME is written as the
 * negation of SCHEDULED, which is what keeps this list and that one from
 * both holding a task or neither holding it (issue #216). Folder membership is the caller's to have
 * resolved: this is not a view endpoint, and the 10.2 chokepoint for it is
 * `accessibleTask` in the domain module that calls this.
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

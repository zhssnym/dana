/*
Q2, Q3, Q4 and Q5: the four capped list pages, GET /views/tasks,
/views/planned, /views/important and /views/all.

The three that 6.1's proof is about are built from one scope sentence,
OPEN_SCOPE in cards.ts, and add their own conjunct to it: Q2 adds due_date IS
NULL, Q3 adds due_date IS NOT NULL, and Q5 adds nothing. That is not a
convenience, it is the proof's stated dependency, and AC-070 is the property
test that pins it.

Q5 goes further and reuses the two functions rather than the two predicates.
Section 6 says All is "two stacked sections in one scroll: Planned rendered
exactly as Q3 orders it, then Tasks rendered exactly as Q2 groups it. No
third scheme exists." A third scheme is exactly what a third query would be,
so there is not one here.

Q4 is the odd one and section 6 says why: it borrows Q3's keys for its dated
rows and Q2's for its undated ones, and the two disagree on created_at, which
is ascending in Q3 and descending in Q2. It is still one list, so it is one
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
import { rowsOf } from '../domain/db.js'
import type { Executor } from '../domain/db.js'

import { CAP_PROBE, OPEN_SCOPE, STATUS_RANK, readCards } from './cards.js'

/* ------------------------------------------------------------------ *
 * The orders of section 6, one fragment each
 * ------------------------------------------------------------------ */

/** Q2's row order: "status_rank, created_at descending, id descending". */
const Q2_ROW_ORDER = sql`${STATUS_RANK} ASC, t.created_at DESC, t.id DESC`

/**
 * Q7's second section as RFC 0005 change control item 44 B4 amended it: the
 * hand order of 4.5 first, nulls leading, then Q2's own row keys.
 *
 * **This is the only order in section 6 that B4 moved**, and the ruling says
 * so in terms: it "keeps every one of section 6's eleven queries and their
 * byte-identical ordering guarantee untouched except the one that reads a
 * folder's unscheduled list". Nothing else in this file reads `position`,
 * and AC-269 is the criterion that holds the rest of them still.
 *
 * Nulls lead because Q2 already lists a folder's undated rows newest first,
 * so a task created since the last arrangement lands where it has always
 * landed. Q2's keys stay behind the new one rather than being replaced: two
 * people may place into one gap at once, so ties in `position` are expected
 * by design, and the keys behind it end in id, which is what the preamble's
 * byte-identical guarantee is made of.
 */
export const FOLDER_UNSCHEDULED_ORDER = sql`t.position ASC NULLS FIRST,
       ${Q2_ROW_ORDER}`

/**
 * Q3's order: "due_date ascending, status_rank, timed flag (all-day rows
 * first: due_time IS NOT NULL sorts after IS NULL), due_time ascending,
 * created_at ascending, id".
 *
 * The timed flag is spelled as the comparison section 6 spells it rather
 * than as a NULLS FIRST modifier on due_time, because it is a key of its own
 * and sits above due_time: false sorts before true in Postgres, so an
 * all-day row leads.
 */
const Q3_ORDER = sql`t.due_date ASC, ${STATUS_RANK} ASC,
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
const Q2_ORDER = sql`f.is_default DESC, lower(f.name) ASC, f.id ASC,
       ${Q2_ROW_ORDER}`

/**
 * Q4's order, one list across the boundary: "due_date ascending nulls last,
 * then within dated rows the Q3 keys (status_rank, timed flag, due_time,
 * created_at, id), within undated rows the Q2 keys (status_rank, created_at
 * descending, id descending)".
 *
 * Nulls last is spelled as its own leading key so the block boundary is
 * visible, and the keys the two blocks disagree on are written as CASE
 * expressions that are null for every row of the other block, where they
 * discriminate nothing. Everything the two blocks agree on, status_rank
 * first among them, is written once.
 */
const Q4_ORDER = sql`(t.due_date IS NULL) ASC, t.due_date ASC,
       ${STATUS_RANK} ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE WHEN t.due_date IS NULL THEN NULL ELSE t.created_at END ASC,
       CASE WHEN t.due_date IS NULL THEN NULL ELSE t.id END ASC,
       CASE WHEN t.due_date IS NULL THEN t.created_at END DESC,
       CASE WHEN t.due_date IS NULL THEN t.id END DESC`

/* ------------------------------------------------------------------ *
 * The two open halves, which All stacks
 * ------------------------------------------------------------------ */

/** Q3's rows: the scope, plus a due_date. */
async function plannedRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND t.due_date IS NOT NULL${extraScope}`,
    order: Q3_ORDER,
    limit: CAP_PROBE,
  })
  return rows.map((row) => row.card)
}

/** Q2's rows: the scope, minus a due_date, in the grouped order. */
async function tasksRows(
  executor: Executor,
  viewerId: string,
  extraScope: SQL = sql``,
  order: SQL = Q2_ORDER,
): Promise<TaskCard[]> {
  const rows = await readCards(executor, {
    viewerId,
    where: sql`${OPEN_SCOPE} AND t.due_date IS NULL${extraScope}`,
    order,
    limit: CAP_PROBE,
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
 * clauses of the grouped order having nothing left to order, and since
 * RFC 0005 change control item 44 it takes the hand order of 4.5 in front of
 * those keys; the constant below is where that sits.
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
 * The scope is `folderScheduled`'s mirror image, OPEN_SCOPE plus an absent
 * due_date plus the folder. Folder membership is the caller's to have
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
        WHERE ${OPEN_SCOPE} AND t.due_date IS NULL
          AND t.deleted_at IS NULL AND t.folder_id = ${folderId}
        ORDER BY ${FOLDER_UNSCHEDULED_ORDER}
        LIMIT ${CAP_PROBE}`,
  )
  return found.map((row) => ({
    id: String(row.id),
    position: row.position === null ? null : String(row.position),
  }))
}

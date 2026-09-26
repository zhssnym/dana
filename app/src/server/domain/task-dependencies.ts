/*
The M1-C2 dependency relation (issue #224): one directed row per relation,
read from either end, with its lifecycle state derived rather than stored.

## What is stored and what is not

`task_dependencies` (migration 0019) holds the edge and nothing about its
progress. Four things follow, and all four are the same decision:

- **No `blocked` task status.** 4.5's three statuses are untouched and nothing
  here writes to `tasks`. A dependency write changes no status, no date, no
  assignment and no membership; it inserts or deletes one row in one table.
- **Completing, reopening or abandoning a blocker needs no write here.** The
  state is read off the blocker's own `status` column, so it cannot drift from
  the column that already is the truth.
- **Abandoned is not done.** A dependency on an abandoned blocker is
  `unresolved`: the blocker is not coming back and it did not finish, and
  calling that satisfied would report work as unblocked that nobody did.
- **A soft-deleted task keeps its edges** and restores whole. Both endpoint
  foreign keys cascade, so it is the *permanent* delete (7.13) and the 11.7
  purge — both of which `DELETE FROM tasks` — that take the rows away.

## Access, and what a read is allowed to say

10.2 is the whole of the authorization rule and there is no chokepoint to lean
on, so every entry point here resolves access itself through
`accessibleTask`, which is the same predicate `GET /tasks/:id` gates on.

A write needs **both** ends: the dependent (the task in the path) and the
blocker (the task in the body). An inaccessible end is 404 and never 403, so a
caller cannot learn from the status code whether the id they guessed names a
real task. That is the whole of the protection on the write side, and it is
deliberate that the refusal for a task in somebody else's folder is
indistinguishable from the refusal for a uuid nobody has ever used.

A read is the harder half, because an edge can outlive access to one of its
ends: a cross-folder dependency is made by somebody who could read both, and a
later unshare takes one end away without touching the row. Such an edge is
returned with `task` null and `state` `unknown`. It is not hidden, because the
near end has something real attached to it and a list that silently omitted it
would be lying to the person who can see the near task; and it carries nothing
of the far task, not its title, not its folder, not its status and not its id.
`state` is the one that is easy to leak by accident: it is a function of the
blocker's status, so reporting it for a blocker the viewer cannot read would
be reporting that task's status. `unknown` is what stands in its place.

## Cycles

A self-edge is refused here and also by
`task_dependencies_no_self_edge_check`, in that order: the constraint is the
floor and the domain refusal is what makes it a 422 rather than a 500.

Everything longer is this module's, because no constraint can see it. The walk
is a recursive CTE asking one question — is the proposed dependent already
reachable from the proposed blocker, following `depends_on` edges — and the
answer is yes exactly when the new edge would close a cycle, of length two or
of length twenty. `UNION` rather than `UNION ALL` so the walk terminates even
if a cycle somehow already existed.

**The check and the insert are serialized by a transaction-scoped advisory
lock**, and that is not belt and braces. Two concurrent requests, A→B and
B→A, each read a graph with no cycle in it and each then writes; the cycle
exists afterwards and neither request ever saw it. Row locks on the two tasks
do not close that, because the cycle a write completes can run through tasks
neither request names. One lock over the whole relation is the cheap correct
answer: dependency writes are rare, and the alternative is a graph invariant
that holds only when nobody is in a hurry.

The walk reads edges the viewer may not be able to see, and must: a graph that
skipped the invisible edges would cheerfully admit a cycle through a folder
somebody else owns. The refusal therefore tells a caller that *some* path
exists between two tasks they can both already read, which is the narrowest
thing it can say while remaining correct.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  DependencyState,
  DependencyTaskSummary,
  FolderDependencyEdge,
  TaskDependencies,
  TaskDependencyEdge,
} from '../../shared/task-dependencies.js'
import type { TaskStatus } from '../../shared/tasks.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { accessibleTask, mayActOnTask } from './tasks.js'

/**
 * The one key every dependency write takes, for the whole of its transaction.
 *
 * Arbitrary, like the migration lock in the test harness; what matters is only
 * that every writer agrees on it. It is taken before the cycle walk reads
 * anything, so the walk and the insert that trusts it are one decision.
 */
const DEPENDENCY_GRAPH_LOCK = 727224

/** 4.5's three statuses read as the relation's three lifecycle states.
 * Pending means the work is still ahead, completed means it is done, and
 * abandoned means it stopped without being done — which leaves the dependency
 * unresolved rather than satisfied. */
export function stateOfBlocker(status: TaskStatus): DependencyState {
  switch (status) {
    case 'completed':
      return 'satisfied'
    case 'abandoned':
      return 'unresolved'
    default:
      return 'active'
  }
}

function instantOf(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

/**
 * The far end of an edge, or null where the viewer cannot read it.
 *
 * The lateral join below leaves every `far_*` column null in that case, so one
 * test on the id settles the whole object: there is no arrangement of this
 * function in which a title or a folder name survives a missing membership.
 */
function summaryOf(row: Record<string, unknown>): DependencyTaskSummary | null {
  if (row.far_id === null || row.far_id === undefined) return null
  return {
    id: String(row.far_id),
    title: String(row.far_title),
    status: String(row.far_status) as TaskStatus,
    folder: {
      id: String(row.far_folder_id),
      name: String(row.far_folder_name),
      is_default: row.far_folder_is_default === true,
    },
  }
}

/**
 * The far task of each edge, resolved with exactly the predicate
 * `accessibleTask` uses: a live task, in a live folder, that the viewer is a
 * member of. `near` names which column of the edge is the task being read, and
 * `far` the other one, so one statement serves both projections.
 *
 * The lateral is what keeps the redaction honest. A left join on `tasks` with
 * the membership test bolted on afterwards would hand this function a row it
 * then had to remember to blank; here the far task simply is not there.
 */
async function edgesOf(
  executor: Executor,
  viewerId: string,
  taskId: string,
  near: 'dependent_task_id' | 'blocking_task_id',
  far: 'dependent_task_id' | 'blocking_task_id',
): Promise<Record<string, unknown>[]> {
  const nearColumn = sql.raw(near)
  const farColumn = sql.raw(far)
  return rowsOf(
    executor,
    sql`SELECT d.id, d.created_at, d.created_by,
               far.id AS far_id, far.title AS far_title,
               far.status AS far_status,
               far.folder_id AS far_folder_id,
               far.folder_name AS far_folder_name,
               far.folder_is_default AS far_folder_is_default
        FROM task_dependencies d
        LEFT JOIN LATERAL (
          SELECT t.id, t.title, t.status, f.id AS folder_id,
                 f.name AS folder_name, f.is_default AS folder_is_default
          FROM tasks t
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
          WHERE t.id = d.${farColumn} AND t.deleted_at IS NULL
        ) far ON true
        WHERE d.${nearColumn} = ${taskId}
        ORDER BY d.created_at ASC, d.id ASC`,
  )
}

/**
 * `GET /tasks/:id/dependencies`. Null means the task does not exist or the
 * viewer is not a member of its folder, which 10.2 makes one answer: 404.
 *
 * The two projections differ in where the state comes from, and that is the
 * only asymmetry in this module. A `depends_on` entry's state is the far
 * task's, because the far task is the blocker, so an unreadable far task
 * leaves it `unknown`. A `blocks` entry's state is the *near* task's, the
 * task being read being the blocker there, so it is always knowable and an
 * unreadable dependent redacts the summary and nothing else.
 */
export async function readTaskDependencies(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDependencies | null> {
  const task = await accessibleTask(executor, viewerId, taskId)
  if (task === null) return null

  const dependsOn = await edgesOf(
    executor,
    viewerId,
    taskId,
    'dependent_task_id',
    'blocking_task_id',
  )
  const blocks = await edgesOf(
    executor,
    viewerId,
    taskId,
    'blocking_task_id',
    'dependent_task_id',
  )

  const edge = (
    row: Record<string, unknown>,
    state: DependencyState,
  ): TaskDependencyEdge => ({
    id: String(row.id),
    task: summaryOf(row),
    state,
    created_at: instantOf(row.created_at),
    created_by: row.created_by == null ? null : String(row.created_by),
  })

  return {
    depends_on: dependsOn.map((row) => {
      const blocker = summaryOf(row)
      return edge(row, blocker === null ? 'unknown' : stateOfBlocker(blocker.status))
    }),
    blocks: blocks.map((row) => edge(row, stateOfBlocker(task.status))),
  }
}

export type CreateDependencyResult =
  /** Either end is nonexistent, trashed, or in a folder the viewer is not a
   * member of. One answer for all three (10.2): 404. */
  | { kind: 'not_found' }
  /** A task cannot wait on itself. The CHECK refuses it too; this is what
   * makes the refusal a 422 naming the field rather than a 500. */
  | { kind: 'self_dependency' }
  /** The edge would close a cycle of some length. */
  | { kind: 'cycle' }
  /** Created, 201. */
  | { kind: 'created'; edge: TaskDependencyEdge }
  /** The pair was already related, so the request asked for a state that
   * already holds. 200 with the edge that was already there. */
  | { kind: 'exists'; edge: TaskDependencyEdge }
  /** Visible, and not this member's to relate (issue #228). */
  | { kind: 'forbidden'; reason: string }

/**
 * `POST /tasks/:id/dependencies`, where `:id` is the dependent.
 *
 * The order of the refusals is the order of what they cost: the self-edge is
 * arithmetic, access is two indexed reads, and the cycle walk is the only one
 * that touches the graph. Access comes before the walk so that a caller who
 * can read neither end learns nothing about the shape of somebody else's
 * dependencies.
 */
export async function createTaskDependency(
  db: Db,
  viewerId: string,
  dependentTaskId: string,
  blockingTaskId: string,
): Promise<CreateDependencyResult> {
  if (dependentTaskId === blockingTaskId) {
    return { kind: 'self_dependency' }
  }
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${DEPENDENCY_GRAPH_LOCK})`)

    const dependent = await accessibleTask(tx, viewerId, dependentTaskId)
    if (dependent === null) return { kind: 'not_found' } as const
    const blocker = await accessibleTask(tx, viewerId, blockingTaskId)
    if (blocker === null) return { kind: 'not_found' } as const

    /*
    `task.dependency.manage` on **both** ends (issue #228).

    R8 puts this beyond Can contribute for a reason worth restating here: a
    dependency is not a private annotation, it imposes a planning consequence
    on whoever holds the other task. Checking only the dependent end would let
    a member with Can edit in one Folder hang somebody else's work in a Folder
    where they merely comment. The two ends can be in different Folders --
    `createTaskDependency` resolves each separately and the contract admits a
    cross-Folder edge -- so both are asked, and neither is asked with an
    assignee escape, because this action names none.
    */
    for (const end of [dependent, blocker]) {
      const decision = mayActOnTask(end, 'task.dependency.manage')
      if (!decision.allowed) {
        return { kind: 'forbidden', reason: decision.reason } as const
      }
    }

    /* The new edge says the dependent waits on the blocker, so it closes a
       cycle exactly when the blocker already waits — through any number of
       hops — on the dependent. The walk runs over every edge in the table,
       visible to this viewer or not, because a graph invariant that held only
       over the rows one person can see would not be one. */
    const closes = await rowsOf(
      tx,
      sql`WITH RECURSIVE reachable(task_id) AS (
            SELECT ${blockingTaskId}::uuid
            UNION
            SELECT d.blocking_task_id
            FROM task_dependencies d
            JOIN reachable r ON d.dependent_task_id = r.task_id
          )
          SELECT EXISTS (
            SELECT 1 FROM reachable WHERE task_id = ${dependentTaskId}::uuid
          ) AS closes`,
    )
    if (closes[0]?.closes === true) return { kind: 'cycle' } as const

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO task_dependencies
            (dependent_task_id, blocking_task_id, created_by)
          VALUES (${dependentTaskId}::uuid, ${blockingTaskId}::uuid,
                  ${viewerId}::uuid)
          ON CONFLICT ON CONSTRAINT task_dependencies_pair_key DO NOTHING
          RETURNING id, created_at, created_by`,
    )

    const summary: DependencyTaskSummary = {
      id: blocker.id,
      title: blocker.title,
      status: blocker.status,
      folder: await folderChip(tx, blocker.folderId),
    }
    const row = inserted[0]
    if (row !== undefined) {
      return {
        kind: 'created',
        edge: {
          id: String(row.id),
          task: summary,
          state: stateOfBlocker(blocker.status),
          created_at: instantOf(row.created_at),
          created_by: row.created_by == null ? null : String(row.created_by),
        },
      } as const
    }

    /* Already related. The request asked for a state the table is already in,
       so it is answered with the row that is there rather than refused: a
       client that lost a response and retried gets the same edge back, and
       two people adding the same blocker do not race each other into a 409.
       The status the route gives it says which of the two happened. */
    const existing = await rowsOf(
      tx,
      sql`SELECT id, created_at, created_by FROM task_dependencies
          WHERE dependent_task_id = ${dependentTaskId}::uuid
            AND blocking_task_id = ${blockingTaskId}::uuid`,
    )
    const found = existing[0]
    if (found === undefined) return { kind: 'not_found' } as const
    return {
      kind: 'exists',
      edge: {
        id: String(found.id),
        task: summary,
        state: stateOfBlocker(blocker.status),
        created_at: instantOf(found.created_at),
        created_by: found.created_by == null ? null : String(found.created_by),
      },
    } as const
  })
}

/** The folder chip 7.0 gives a task, for the one task a create already knows
 * the viewer can read. A second read rather than a column on `TaskAccess`,
 * because widening that shape for one caller would put a name on every
 * access resolution in the server. */
async function folderChip(
  executor: Executor,
  folderId: string,
): Promise<{ id: string; name: string; is_default: boolean }> {
  const found = await rowsOf(
    executor,
    sql`SELECT id, name, is_default FROM folders WHERE id = ${folderId}::uuid`,
  )
  const row = found[0]
  return {
    id: folderId,
    name: String(row?.name ?? ''),
    is_default: row?.is_default === true,
  }
}

/**
 * `DELETE /tasks/:id/dependencies/:dependencyId`.
 *
 * The edge is named by its own id and must touch the task in the path, so a
 * member of one folder cannot remove an edge between two tasks in another by
 * guessing its id: the statement's own predicate is the authorization, on top
 * of the access resolution above it.
 *
 * Either end may remove the relation. It is one row and both tasks are party
 * to it, and there is no reading of 5.4 under which a member may add a blocker
 * to a task and not take one off.
 */
export async function deleteTaskDependency(
  db: Db,
  viewerId: string,
  taskId: string,
  dependencyId: string,
): Promise<'not_found' | 'deleted' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const task = await accessibleTask(tx, viewerId, taskId)
    if (task === null) return 'not_found'
    /* The same authority that creates a relation removes one, on this
       function's own stated reasoning: there is no reading under which a
       member may add a blocker to a task and not take one off. Only the end
       named in the path is checked, because that is the only end this caller
       has demonstrably resolved; the far end may be a task they cannot read
       at all, which is what the edge's surrogate id exists for. */
    const decision = mayActOnTask(task, 'task.dependency.manage')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM task_dependencies
          WHERE id = ${dependencyId}::uuid
            AND (dependent_task_id = ${taskId}::uuid
                 OR blocking_task_id = ${taskId}::uuid)
          RETURNING id`,
    )
    return removed.length > 0 ? 'deleted' : 'not_found'
  })
}

/**
 * The duplication rule, which is one sentence: **relationships travel only
 * when both ends travel together.**
 *
 * `identity` maps every source task id that was copied to the id of its copy.
 * An edge is carried across when *both* of its endpoints are keys of that map,
 * and it is then written between the two copies. An edge with one end outside
 * the copied set is dropped rather than retained, because retaining it would
 * bind the new folder's work to the old folder's, which is the one outcome the
 * rule exists to prevent.
 *
 * **No copied task can end up pointing at an original**, and that is
 * structural rather than checked: the only identifiers this function writes
 * are values of `identity`, and every value of `identity` is a task this
 * duplication just created. The `IN` pair in the read is the same rule said a
 * second time, one layer earlier, so a mapping bug cannot even fetch an edge
 * it would have to drop.
 *
 * It runs inside the caller's transaction, so the copied folder and its
 * relations commit together or not at all.
 */
export async function copyDependenciesWithin(
  tx: Executor,
  identity: ReadonlyMap<string, string>,
  createdBy: string,
): Promise<number> {
  const sources = [...identity.keys()]
  if (sources.length < 2) return 0
  const ids = sql.join(
    sources.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const edges = await rowsOf(
    tx,
    sql`SELECT dependent_task_id, blocking_task_id
        FROM task_dependencies
        WHERE dependent_task_id IN (${ids})
          AND blocking_task_id IN (${ids})`,
  )
  let copied = 0
  for (const edge of edges) {
    const dependent = identity.get(String(edge.dependent_task_id))
    const blocker = identity.get(String(edge.blocking_task_id))
    if (dependent === undefined || blocker === undefined) continue
    await tx.execute(
      sql`INSERT INTO task_dependencies
            (dependent_task_id, blocking_task_id, created_by)
          VALUES (${dependent}::uuid, ${blocker}::uuid, ${createdBy}::uuid)
          ON CONFLICT ON CONSTRAINT task_dependencies_pair_key DO NOTHING`,
    )
    copied += 1
  }
  return copied
}

/**
 * `GET /folders/:id/dependencies`: the Folder's internal edges, in one
 * statement. The caller has already resolved the Folder through `accessOf`,
 * which is membership of a live Folder, and that is all `accessibleTask`
 * asks of a live Task inside it — so both ends of every row returned are
 * Tasks the viewer can read, and no redaction is owed.
 *
 * **Both ends are joined to this Folder**, and that is the whole security
 * content of the query: an edge with one end elsewhere names a Task the
 * viewer may not be able to read, which `readTaskDependencies` redacts and
 * this read therefore simply never returns. A trashed Task at either end is
 * left out for the same reason `GET /tasks/:id` answers 404 for it.
 */
export async function readFolderDependencies(
  executor: Executor,
  folderId: string,
): Promise<FolderDependencyEdge[]> {
  const rows = await rowsOf(
    executor,
    sql`SELECT d.id, d.dependent_task_id, d.blocking_task_id
        FROM task_dependencies d
        JOIN tasks dependent
          ON dependent.id = d.dependent_task_id
         AND dependent.folder_id = ${folderId}
         AND dependent.deleted_at IS NULL
        JOIN tasks blocker
          ON blocker.id = d.blocking_task_id
         AND blocker.folder_id = ${folderId}
         AND blocker.deleted_at IS NULL
        ORDER BY d.created_at ASC, d.id ASC`,
  )
  return rows.map((row) => ({
    id: String(row.id),
    dependent_task_id: String(row.dependent_task_id),
    blocking_task_id: String(row.blocking_task_id),
  }))
}

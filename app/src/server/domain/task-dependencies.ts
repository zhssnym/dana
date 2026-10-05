// Task dependencies: one directed row per relation; state is derived from the blocker's status, never stored.
// Abandoned is not done: it leaves the dependency unresolved. Inaccessible ends answer 404, and read results
// redact the far task to `task: null, state: 'unknown'`. Writes take one advisory lock so concurrent edges
// cannot close a cycle together; the cycle walk reads every edge, visible or not.
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
import { joinVisibleFolder } from './folder-access.js'
import { accessibleTask, mayActOnTask } from './tasks.js'

/** The advisory lock every dependency write takes before the cycle walk. The value only has to be agreed. */
const DEPENDENCY_GRAPH_LOCK = 727224

/** Pending is active, completed is satisfied, abandoned is unresolved. */
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

/** The far end of an edge, or null where the viewer cannot read it (every `far_*` column is then null). */
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
 * Each edge's far task, through a lateral join with `accessibleTask`'s predicate, so an unreadable far task
 * is simply absent rather than blanked afterwards. `near` names the column of the task being read.
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
          ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
          WHERE t.id = d.${farColumn} AND t.deleted_at IS NULL
        ) far ON true
        WHERE d.${nearColumn} = ${taskId}
        ORDER BY d.created_at ASC, d.id ASC`,
  )
}

/**
 * `GET /tasks/:id/dependencies`; null is 404 (10.2). A `depends_on` state is the far task's, so it can be
 * `unknown`; a `blocks` state is the near task's, so it is always known.
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
  /** Either end is missing, trashed or not readable: one 404 (10.2). */
  | { kind: 'not_found' }
  /** The CHECK refuses it too; this makes it a 422 instead of a 500. */
  | { kind: 'self_dependency' }
  | { kind: 'cycle' }
  | { kind: 'created'; edge: TaskDependencyEdge }
  /** The pair was already related: 200 with the existing edge. */
  | { kind: 'exists'; edge: TaskDependencyEdge }
  | { kind: 'forbidden'; reason: string }

/** `POST /tasks/:id/dependencies`, `:id` being the dependent. Access is checked before the cycle walk. */
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

    /* `task.dependency.manage` on both ends, which may be in different Folders: a dependency
    imposes on whoever holds the other task. */
    for (const end of [dependent, blocker]) {
      const decision = mayActOnTask(end, 'task.dependency.manage')
      if (!decision.allowed) {
        return { kind: 'forbidden', reason: decision.reason } as const
      }
    }

    /* The edge closes a cycle exactly when the blocker already waits, through any hops, on the dependent. */
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

    /* Already related: answer with the existing row, so a retry or a concurrent duplicate gets the same edge. */
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

/** The folder chip for the created edge's task, read separately to keep `TaskAccess` small. */
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
 * `DELETE /tasks/:id/dependencies/:dependencyId`. The edge must touch the task in the path, so its id alone
 * cannot remove an edge elsewhere. Either end may remove it.
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
    /* Only the path's end is checked: the far end may be a task the caller cannot read. */
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
 * Copies edges only when both ends were copied (`identity` maps source id to copy id).
 * Every id written is a value of `identity`, so no copy can point at an original. Runs in the caller's transaction.
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
 * `GET /folders/:id/dependencies`: edges with both ends in this Folder, so every end is readable.
 * The caller has resolved the Folder through `accessOf`.
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

// blocked_by_count and blocks_count for task rows. Only a completed blocker stops blocking; abandoned still blocks.
// Only edges whose far end the viewer can read are counted, so a count never reveals another task's status.
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { idSet, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { visibleFolder } from './folder-access.js'

export interface TaskDependencyCounts {
  blocked_by_count: number
  blocks_count: number
}

function readable(alias: string, viewerId: string): SQL {
  const t = sql.raw(alias)
  return sql`${t}.deleted_at IS NULL
    AND ${visibleFolder(sql`${t}.folder_id`, viewerId)}`
}

/** Counts for every id at once; ids with no edges come back as zero. */
export async function taskDependencyCountsFor(
  executor: Executor,
  viewerId: string,
  taskIds: readonly string[],
): Promise<Map<string, TaskDependencyCounts>> {
  const byTask = new Map<string, TaskDependencyCounts>()
  for (const id of taskIds) byTask.set(id, { blocked_by_count: 0, blocks_count: 0 })
  if (taskIds.length === 0) return byTask

  const ids = idSet(taskIds)
  const found = await rowsOf(
    executor,
    sql`SELECT d.dependent_task_id AS task_id, 'blocked_by' AS side,
               count(*)::int AS n
          FROM task_dependencies d
          JOIN tasks near ON near.id = d.dependent_task_id
          JOIN tasks far ON far.id = d.blocking_task_id
         WHERE d.dependent_task_id IN ${ids}
           AND far.status <> 'completed'
           AND ${readable('near', viewerId)}
           AND ${readable('far', viewerId)}
         GROUP BY d.dependent_task_id
        UNION ALL
        SELECT d.blocking_task_id AS task_id, 'blocks' AS side,
               count(*)::int AS n
          FROM task_dependencies d
          JOIN tasks near ON near.id = d.blocking_task_id
          JOIN tasks far ON far.id = d.dependent_task_id
         WHERE d.blocking_task_id IN ${ids}
           AND near.status <> 'completed'
           AND ${readable('near', viewerId)}
           AND ${readable('far', viewerId)}
         GROUP BY d.blocking_task_id`,
  )
  for (const row of found) {
    const entry = byTask.get(String(row.task_id))
    if (entry === undefined) continue
    if (String(row.side) === 'blocked_by') entry.blocked_by_count = Number(row.n)
    else entry.blocks_count = Number(row.n)
  }
  return byTask
}

/** The single-row path uses the same statement, so detail and list cannot count differently. */
export async function taskDependencyCountsOf(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDependencyCounts> {
  const found = await taskDependencyCountsFor(executor, viewerId, [taskId])
  return found.get(taskId) ?? { blocked_by_count: 0, blocks_count: 0 }
}

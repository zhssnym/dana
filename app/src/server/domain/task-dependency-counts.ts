/*
The row-level dependency counts a Task row carries (issue #225's prerequisite):
`blocked_by_count` and `blocks_count`, for a compact "Blocked · N" indicator
that needs no second request per row.

## What is counted

An edge counts while it is **unresolved from the blocker's side**, which is
`stateOfBlocker` in task-dependencies.ts read as a predicate: a blocker that is
pending (`active`) or abandoned (`unresolved`) still blocks, and only a
completed blocker (`satisfied`) stops blocking. Abandoned is not done, and the
module that owns the relation already says so; a row count that disagreed with
the detail read's state would be a second definition of "blocked".

- `blocked_by_count`: edges where this task is the dependent and the blocker
  is not completed.
- `blocks_count`: edges where this task is the blocker, counted only while
  this task is not completed. A completed task blocks nobody, whatever its
  dependents' own statuses.

## Access

Only edges whose **far end the viewer can read** are counted, by the same
predicate `accessibleTask` and the detail read's lateral use: a live task in a
live folder the viewer is a member of. This is narrower than the detail read,
which lists an edge to an unreadable task with `state: 'unknown'`, and it has
to be: `blocked_by_count` is a function of the blocker's status, so counting an
unreadable blocker would report whether somebody else's task is done. An edge
the viewer cannot see the far end of is therefore absent from both counts, and
the detail read remains the one place that acknowledges it, neutrally.

The near end carries its own scope too, although every caller hands over ids
from a scoped read: that is 10.2 applied to a statement whose caller happens to
be trustworthy, as `taskLabelsFor` does.

## Cost

One statement for a list of any length, keyed by the ids the card query
produced, so a list read stays a bounded number of statements. Both halves read
`task_dependencies` by an indexed column: the pair key leads with
`dependent_task_id`, and `task_dependencies_blocking_task_id_idx` covers the
other.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { idSet, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { visibleFolder } from './folder-access.js'

export interface TaskDependencyCounts {
  blocked_by_count: number
  blocks_count: number
}

/** The tasks alias `alias` names, as the viewer may read it. */
function readable(alias: string, viewerId: string): SQL {
  const t = sql.raw(alias)
  return sql`${t}.deleted_at IS NULL
    AND ${visibleFolder(sql`${t}.folder_id`, viewerId)}`
}

/**
 * The counts for every id at once. Every id handed over comes back with an
 * entry, zero where it has no edges.
 */
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

/** One task's counts, for the single-row read path: the same statement with a
 * list of one, so the detail and the list cannot count differently. */
export async function taskDependencyCountsOf(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDependencyCounts> {
  const found = await taskDependencyCountsFor(executor, viewerId, [taskId])
  return found.get(taskId) ?? { blocked_by_count: 0, blocks_count: 0 }
}

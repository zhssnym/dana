// POST /tasks/:id/order: hand order of a folder's unscheduled list. The client names neighbours; the server picks the key.
// Unplaced rows sort last, so the first placement seeds keys for every row first. updated_at is deliberately not
// touched, so rearranging does not reorder search results. The folder row lock serialises placements.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { TaskDetail } from '../../shared/tasks.js'
import { folderUnscheduledIds } from '../views/lists.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { initialKeys, keyBetween } from './fractional-index.js'
import { accessibleTask, mayActOnTask, taskView } from './tasks.js'

export type PlaceTaskResult =
  | { kind: 'placed'; task: TaskDetail }
  /** The task is gone or the caller is not a member: 10.2's one answer. */
  | { kind: 'not_found' }
  /** A Scheduled or completed task, which the unscheduled list does not hold. */
  | { kind: 'not_arrangeable' }
  | { kind: 'bad_neighbour'; field: 'after_id' | 'before_id' }
  | { kind: 'forbidden'; reason: string }

export interface Neighbours {
  afterId: string | null
  beforeId: string | null
}

/** Gives every keyless row a key, in the order the list already reads. */
async function seedMissingKeys(
  tx: Executor,
  list: readonly { id: string; position: string | null }[],
): Promise<Map<string, string>> {
  const keys = new Map(
    list.flatMap((row) =>
      row.position === null ? [] : [[row.id, row.position] as const],
    ),
  )
  if (keys.size === list.length) return keys
  const fresh = initialKeys(list.length)
  for (const [index, row] of list.entries()) {
    const key = fresh[index] as string
    keys.set(row.id, key)
    await tx.execute(
      sql`UPDATE tasks SET position = ${key} WHERE id = ${row.id}::uuid`,
    )
  }
  return keys
}

export async function placeTaskInOrder(
  db: Db,
  viewerId: string,
  taskId: string,
  neighbours: Neighbours,
): Promise<PlaceTaskResult> {
  return inTransaction(db, async (tx) => {
    const task = await accessibleTask(tx, viewerId, taskId)
    if (task === null) return { kind: 'not_found' } as const
    /* Scheduled means a start or a due date: such a task is not in the unscheduled list. */
    const scheduled = task.startDate !== null || task.dueDate !== null
    if (scheduled || task.status === 'completed') {
      return { kind: 'not_arrangeable' } as const
    }
    if (neighbours.afterId === taskId) {
      return { kind: 'bad_neighbour', field: 'after_id' } as const
    }
    if (neighbours.beforeId === taskId) {
      return { kind: 'bad_neighbour', field: 'before_id' } as const
    }

    // Lock the folder, not the task: a first placement writes every row in the list.
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${task.folderId}::uuid FOR UPDATE`,
    )
    /* `task.move`, re-read under the folder lock so the gate sees the assignee this transaction writes against.
    Seeding touches others' rows but moves nothing visible, so the ordinary gate applies. */
    const held = await accessibleTask(tx, viewerId, taskId)
    if (held === null) return { kind: 'not_found' } as const
    const decision = mayActOnTask(held, 'task.move')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    const list = await folderUnscheduledIds(tx, task.folderId)
    const places = new Map(list.map((row, index) => [row.id, index] as const))
    for (const [field, id] of [
      ['after_id', neighbours.afterId],
      ['before_id', neighbours.beforeId],
    ] as const) {
      if (id !== null && !places.has(id)) {
        // A neighbour in another folder and a missing one answer alike (10.2).
        return { kind: 'bad_neighbour', field } as const
      }
    }
    if (
      neighbours.afterId !== null &&
      neighbours.beforeId !== null &&
      (places.get(neighbours.afterId) as number) >
        (places.get(neighbours.beforeId) as number)
    ) {
      return { kind: 'bad_neighbour', field: 'after_id' } as const
    }

    const keys = await seedMissingKeys(tx, list)
    const lower =
      neighbours.afterId === null ? null : (keys.get(neighbours.afterId) ?? null)
    const upper =
      neighbours.beforeId === null
        ? null
        : (keys.get(neighbours.beforeId) ?? null)
    const placed = keys.get(taskId)
    // Dropped where it already is: a no-op, not a drifting key.
    const settled =
      placed !== undefined &&
      (lower === null || lower < placed) &&
      (upper === null || placed < upper)
    if (!settled) {
      await tx.execute(
        sql`UPDATE tasks SET position = ${keyBetween(lower, upper)}
            WHERE id = ${taskId}::uuid`,
      )
    }

    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${task.folderId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: task.folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId: task.folderId,
      detail: 'rearranged the list',
    })

    const view = await taskView(tx, viewerId, taskId)
    if (view === null) {
      throw new Error(`task ${taskId} vanished between write and read`)
    }
    return { kind: 'placed', task: view } as const
  })
}

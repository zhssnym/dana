/*
POST /tasks/:id/order: the hand order of a folder's unscheduled list
(RFC 0005 change control item 44, B4).

**What the endpoint is given and what it works out.** The client names the
two rows the task was dropped between, and this module works out the key.
A client that sent an index would be sending a claim about a list it may have
read a minute ago, and a client that sent a key would be an implementation of
the contract living on the wrong side of it.

**Why the first placement writes more than one row.** Until a folder is
arranged, every row's `position` is null, and section 6's amended Q7 order
puts nulls first so that a new task still appears where Q2 has always put it.
That means a task dropped at the top of an unarranged list has nothing to be
above, so the call gives every row in the list a key first, in the order the
list already reads, and then places the moved one. The seeding pass moves
nothing a reader can see, which is what makes it safe to run inside a
placement rather than as a migration.

**Why nothing's `updated_at` moves, the moved task's included.** 4.5 says
that column is touched on every mutation, and this is a recorded deviation
from it (change control item 46(d)): the column's two consumers are the
field-level last-write-wins tiebreak and Q8's search recency key, and a row's
place in one list is evidence for neither. Touching it would mean that
rearranging a folder pushed every task in it to the top of that person's
search results.

**The event is the folder's.** What changed is the folder's arrangement, so a
task history line saying the task was edited would be false in the one place
a person looks to find out what happened. No recipients: 4.14's notifications
are for acts that concern a person.

**Concurrency.** The folder row is locked for the placement, so two first
drags cannot both seed the list. Two later drags into one gap compute the
same key, which is a tie, and section 6's preamble ends every order with id,
so both readers still see one sequence. That is the answer to the question
item 44 recorded as agreed: "two people dragging one shared list must not
corrupt each other's order".
*/
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
  /** A Scheduled or completed task, which the unscheduled list does not
   * hold. */
  | { kind: 'not_arrangeable' }
  | { kind: 'bad_neighbour'; field: 'after_id' | 'before_id' }
  /** Visible, and not this member's to rearrange (issue #228). */
  | { kind: 'forbidden'; reason: string }

export interface Neighbours {
  afterId: string | null
  beforeId: string | null
}

/** Every row in the list carries a key afterwards; the ones that had none
 * take theirs in the order the list already read. */
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
    /* Arrangeable means "in the list this endpoint orders", so the test is
       Q2's membership and not a column. It read `task.dueDate !== null` until
       issue #216 made Scheduled mean either date: a start-only task leaves
       the unscheduled list exactly as a due-only one does, and accepting a
       placement for a row `folderUnscheduledIds` no longer returns would
       write a position nothing ever reads. */
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

    // The lock is the folder's rather than the task's, because a first
    // placement writes every row of the list and two of them must not
    // interleave.
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${task.folderId}::uuid FOR UPDATE`,
    )
    /* `task.move` (issue #228). Re-read under the folder lock rather than
       reusing the resolution above, because the first placement rewrites the
       whole list and the assignee that decides a Can-contribute member's
       standing must be the one this transaction will write against.

       **A first placement is a special case and is deliberately not treated
       as one.** Seeding keys touches every row in the list, including other
       members' work, which is exactly the coordination effect R8 keeps away
       from Can contribute; but the seeding moves nothing a reader can see, so
       refusing the whole drag over it would cost a contributor the
       rearrangement of their own Task for a write nobody observes. The gate
       is the ordinary one and the note is here so the next reader knows the
       question was asked. */
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
        // A neighbour in another folder and one that does not exist answer
        // the same way, which is what 10.2 requires of a refusal that would
        // otherwise say whether a row is out there.
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
    // The drop that lands where the task already is: a person's accidental
    // nudge, and a no-op rather than a key that drifts a little every time.
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

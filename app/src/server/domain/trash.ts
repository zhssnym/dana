/*
The 7.13 surface: what waits in Trash and how it comes back (RFC 0005).

Access is by folder membership at read time, never by who deleted (7.13),
so the membership join is the scope here exactly as it is everywhere else.
Two asymmetries this module is careful about:

- A task in a trashed folder is unreachable while its folder is (4.5): the
  folder waits in Trash as one entry and its tasks ride its fate, so the
  task listing and the task restore both join folders alive.
- Restore carries no 30 day guard of its own. The window is the purge's
  (11.7); a row the pass has not yet swept is a row a person may still
  save, and racing the broom to refuse them would help nobody.

The permanent delete (RFC 0005 change control items 36 and 38, enacted by
RFC 0004's S28a) lives at the bottom of this file, and so does the object
collection the 11.7 purge has always done. Item 36's one requirement on the
endpoint is that it call the collection the purge already does rather than
write a delete beside it, so the collection moved here from the pass and
both callers hand it a selection: the pass its age predicate, the endpoint
one id the owner named. A row's files are the only index to the bytes in
the store, and whichever caller drops the row removes the objects after
the commit, 7.15's order, so a refused delete can never have destroyed
bytes whose rows survived.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
import { recordEvent } from './events.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

export interface TrashedTask {
  id: string
  title: string
  folder_id: string
  folder_name: string
  deleted_at: string
}

export interface TrashedFolder {
  id: string
  name: string
  task_count: number
  deleted_at: string
}

export interface TrashView {
  tasks: TrashedTask[]
  folders: TrashedFolder[]
}

export async function trashView(db: Db, viewerId: string): Promise<TrashView> {
  const tasks = await rowsOf(
    db,
    sql`SELECT t.id, t.title, t.folder_id, f.name AS folder_name, t.deleted_at
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC, t.id DESC`,
  )
  const folders = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.deleted_at,
               (SELECT count(*)::int FROM tasks t
                 WHERE t.folder_id = f.id) AS task_count
        FROM folders f
        JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = ${viewerId}
        WHERE f.deleted_at IS NOT NULL
        ORDER BY f.deleted_at DESC, f.id DESC`,
  )
  return {
    tasks: tasks.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      folder_id: String(row.folder_id),
      folder_name: String(row.folder_name),
      deleted_at: toIso(row.deleted_at),
    })),
    folders: folders.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      task_count: Number(row.task_count),
      deleted_at: toIso(row.deleted_at),
    })),
  }
}

/** Clears the mark and records the return; 'not_found' covers the row that
 * does not exist, is not trashed, is out of the viewer's membership, or
 * rides a trashed folder, which 10.2 makes one answer. */
export async function restoreTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'restored' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT t.id, t.title, t.folder_id
          FROM tasks t
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
          WHERE t.id = ${taskId} AND t.deleted_at IS NOT NULL
          FOR UPDATE OF t`,
    )
    const row = found[0]
    if (row === undefined) return 'not_found'
    await tx.execute(
      sql`UPDATE tasks SET deleted_at = NULL, updated_at = now()
          WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'restored from Trash',
    })
    return 'restored'
  })
}

export async function restoreFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<'restored' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT f.id, f.name
          FROM folders f
          JOIN folder_members m
            ON m.folder_id = f.id AND m.user_id = ${viewerId}
          WHERE f.id = ${folderId} AND f.deleted_at IS NOT NULL
          FOR UPDATE OF f`,
    )
    const row = found[0]
    if (row === undefined) return 'not_found'
    await tx.execute(
      sql`UPDATE folders SET deleted_at = NULL WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(row.name),
      folderId,
      detail: 'restored from Trash',
    })
    return 'restored'
  })
}

/* ------------------------------------------------------------------ *
 * The object collection and the permanent delete (items 36 and 38)
 * ------------------------------------------------------------------ */

export interface DestroyedFolders {
  folderIds: string[]
  /** The files rows the folder deletes cascaded away, whoever uploaded
   * them: the caller removes each from the store after its commit. */
  fileIds: string[]
}

export interface DestroyedTasks {
  taskIds: string[]
  /** The files rows that hung on the tasks' conversations alone and were
   * deleted with them; the caller removes each from the store after its
   * commit. */
  fileIds: string[]
}

/**
 * Deletes the folders `doomed` selects and collects the files rows the
 * cascade drops, in one statement over one snapshot (11.7, RFC 0005 change
 * control item 18). `doomed` is a query answering folder ids and carries
 * its own lock clause, so the purge's SKIP LOCKED claim and the endpoint's
 * FOR UPDATE both read as the same act: the claim, the collection and the
 * delete are three CTEs of one statement, which is what keeps the purge the
 * single wrapperless statement the scheduler's own test pins.
 */
export async function destroyFolders(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedFolders> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed}),
        victims AS (
          SELECT f.id AS file_id, f.folder_id
            FROM files f JOIN doomed d ON d.id = f.folder_id),
        removed AS (
          DELETE FROM folders WHERE id IN (SELECT id FROM doomed)
          RETURNING id)
        SELECT r.id AS folder_id, v.file_id
          FROM removed r LEFT JOIN victims v ON v.folder_id = r.id`,
  )
  const folderIds = new Set<string>()
  const fileIds: string[] = []
  for (const row of rows) {
    folderIds.add(String(row.folder_id))
    if (row.file_id !== null && row.file_id !== undefined) {
      fileIds.push(String(row.file_id))
    }
  }
  return { folderIds: [...folderIds], fileIds }
}

/**
 * Deletes the tasks `doomed` selects. A task carries no files row of its
 * own (4.16 scopes files to folders), but its conversation may: 4.15's
 * comment_files hang uploads on comments, and the task's cascade takes the
 * comments and with them the only reference anyone had to those rows. So
 * the statement collects the files that hung on the doomed tasks'
 * conversations and on nothing else, and a second statement deletes those
 * rows; a file also placed on a page, a cover, or another task's
 * conversation stays, its other reference being a live one. The second
 * statement runs only when the first collected something, so a purge with
 * nothing to collect is still the single statement it has always been.
 */
export async function destroyTasks(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedTasks> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed}),
        victims AS (
          SELECT DISTINCT cf.file_id
            FROM comment_files cf
            JOIN comments c ON c.id = cf.comment_id
            JOIN doomed d ON d.id = c.task_id
           WHERE NOT EXISTS (
                   SELECT 1 FROM comment_files o
                   JOIN comments oc ON oc.id = o.comment_id
                   WHERE o.file_id = cf.file_id
                     AND (oc.task_id IS NULL
                          OR oc.task_id NOT IN (SELECT id FROM doomed)))
             AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = cf.file_id)),
        removed AS (
          DELETE FROM tasks WHERE id IN (SELECT id FROM doomed)
          RETURNING id)
        SELECT r.id AS task_id, NULL::uuid AS file_id FROM removed r
        UNION ALL
        SELECT NULL::uuid AS task_id, v.file_id FROM victims v`,
  )
  const taskIds: string[] = []
  const fileIds: string[] = []
  for (const row of rows) {
    if (row.task_id !== null && row.task_id !== undefined) {
      taskIds.push(String(row.task_id))
    }
    if (row.file_id !== null && row.file_id !== undefined) {
      fileIds.push(String(row.file_id))
    }
  }
  if (fileIds.length > 0) {
    await executor.execute(
      sql`DELETE FROM files WHERE id IN (${sql.join(
        fileIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
  }
  return { taskIds, fileIds }
}

/** The after-commit half, shared by the purge and the endpoint: every row
 * that named these objects is gone, so a refused rm is unreachable bytes
 * rather than a failure anyone can act on, and it must fail neither the
 * pass nor the response. */
export async function removeObjects(
  store: ObjectStore | undefined,
  fileIds: readonly string[],
): Promise<void> {
  if (store === undefined) return
  for (const id of fileIds) {
    try {
      await store.remove(id)
    } catch {
      // Unreachable bytes: see above.
    }
  }
}

export type DestroyOutcome =
  | { kind: 'destroyed'; fileIds: string[] }
  /** A member who is not the folder's owner: the act is the owner's alone
   * (item 38), and the row is visible to them, so this is 403 and not
   * 10.2's 404. */
  | { kind: 'forbidden' }
  /** Does not exist, is not in Trash, rides a trashed folder, or is out of
   * the viewer's membership: one answer (10.2). */
  | { kind: 'not_found' }

/**
 * DELETE /trash/tasks/:id. The folder owner destroys a trashed task and
 * everything that hung on it, the way the purge would have at thirty days.
 * Only a trashed row qualifies: the live delete is 7.6's soft one, and a
 * permanent delete that skipped Trash would be a second, shorter road to the
 * same end. The event is recorded against the folder, which survives, so
 * the members' log says the row is gone and who took it.
 */
export async function destroyTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT t.title, t.folder_id, (f.owner_id = ${viewerId}) AS is_owner
          FROM tasks t
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
          WHERE t.id = ${taskId} AND t.deleted_at IS NOT NULL
          FOR UPDATE OF t`,
    )
    const row = found[0]
    if (row === undefined) return { kind: 'not_found' } as const
    if (row.is_owner !== true) return { kind: 'forbidden' } as const
    const destroyed = await destroyTasks(
      tx,
      sql`SELECT id FROM tasks WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'deleted permanently',
    })
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}

/**
 * DELETE /trash/folders/:id. The owner destroys a trashed folder: its
 * tasks and their conversations, its page, its files rows and (after the
 * commit, by the caller) their bytes, its memberships and its events all go
 * by the named cascades, exactly as the purge takes them. No event records
 * it, because the folder's events cascade with the folder and an event
 * with nowhere to be read is not a record.
 */
export async function destroyFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT (f.owner_id = ${viewerId}) AS is_owner
          FROM folders f
          JOIN folder_members m
            ON m.folder_id = f.id AND m.user_id = ${viewerId}
          WHERE f.id = ${folderId} AND f.deleted_at IS NOT NULL
          FOR UPDATE OF f`,
    )
    const row = found[0]
    if (row === undefined) return { kind: 'not_found' } as const
    if (row.is_owner !== true) return { kind: 'forbidden' } as const
    const destroyed = await destroyFolders(
      tx,
      sql`SELECT id FROM folders WHERE id = ${folderId}`,
    )
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}

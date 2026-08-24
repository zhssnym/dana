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
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { inTransaction, rowsOf } from './db.js'
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

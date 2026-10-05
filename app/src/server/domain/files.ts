import { sql } from 'drizzle-orm'

import type { ObjectStore } from '../files/store.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { copyPageFile } from './files-core.js'

export * from './files-core.js'

/** A Task move carries only the Task document's files; Discussion attachments stay with their Discussion. */
export async function carryTaskFilesOnMove(
  tx: Executor,
  store: ObjectStore | undefined,
  viewerId: string,
  taskId: string,
  fromFolderId: string,
  toFolderId: string,
  copied: string[],
): Promise<'carried' | 'quota_exceeded'> {
  const named = await rowsOf(
    tx,
    sql`SELECT f.id FROM files f
         WHERE f.folder_id = ${fromFolderId}::uuid
           AND f.id IN (SELECT file_id FROM page_blocks WHERE task_id = ${taskId}::uuid)
         ORDER BY f.id
         FOR UPDATE`,
  )
  for (const row of named) {
    const fileId = String(row.id)
    const elsewhere = await rowsOf(
      tx,
      sql`SELECT (
            EXISTS (SELECT 1 FROM page_blocks b
                     WHERE b.file_id = ${fileId}::uuid
                       AND b.task_id IS DISTINCT FROM ${taskId}::uuid)
            OR EXISTS (SELECT 1 FROM comment_files cf
                        WHERE cf.file_id = ${fileId}::uuid)
            OR EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = ${fileId}::uuid)
            OR EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = ${fileId}::uuid)
            OR EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = ${fileId}::uuid)
          ) AS shared`,
    )
    if (elsewhere[0]?.shared !== true) {
      await tx.execute(
        sql`UPDATE files SET folder_id = ${toFolderId}::uuid WHERE id = ${fileId}::uuid`,
      )
      continue
    }
    if (store === undefined) {
      throw new Error('The application was constructed without an object store.')
    }
    const held = await copyPageFile(tx, store, viewerId, fileId, toFolderId)
    if (held.kind === 'quota_exceeded') return 'quota_exceeded'
    if (held.kind !== 'copied') continue
    copied.push(held.id)
    await tx.execute(
      sql`UPDATE page_blocks SET file_id = ${held.id}::uuid
           WHERE task_id = ${taskId}::uuid AND file_id = ${fileId}::uuid`,
    )
  }
  return 'carried'
}

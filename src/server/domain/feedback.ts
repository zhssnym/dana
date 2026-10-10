// Feedback from any signed-in person; only operators (DANA_OPERATORS) read it.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { postFileIds } from '../../shared/comments.js'
import type { FeedbackItem, PostFeedbackBody } from '../../shared/feedback.js'
import { inTransaction, rowsOf } from '../database.js'

/** Null when a named file is not the sender's own folder-less upload. */
export async function createFeedback(db: Db, userId: string, body: PostFeedbackBody): Promise<string | null> {
  const fileIds = [...new Set(postFileIds(body.content))]
  return inTransaction(db, async (tx) => {
    if (fileIds.length > 0) {
      const owned = await rowsOf(tx, sql`
        SELECT count(*)::int AS n FROM files
         WHERE id IN (${sql.join(fileIds.map((id) => sql`${id}::uuid`), sql`, `)})
           AND owner_id = ${userId} AND folder_id IS NULL
           AND kind IN ('image', 'file', 'audio', 'video')`)
      if (Number(owned[0]?.n) !== fileIds.length) return null
    }
    const [row] = await rowsOf(tx, sql`
      INSERT INTO feedback (user_id, kind, content, context)
      VALUES (${userId}, ${body.kind}, ${JSON.stringify(body.content)}::jsonb, ${JSON.stringify(body.context)}::jsonb)
      RETURNING id`)
    const id = String(row?.id)
    for (const fileId of fileIds) {
      await tx.execute(sql`INSERT INTO feedback_files (feedback_id, file_id) VALUES (${id}, ${fileId})`)
    }
    return id
  })
}

export async function listFeedback(db: Db): Promise<FeedbackItem[]> {
  const rows = await rowsOf(db, sql`
    SELECT fb.id, fb.kind, fb.content, fb.context, fb.done_at IS NOT NULL AS done,
      to_char(fb.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      u.email, u.display_name,
      COALESCE((SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'mime', f.mime,
                  'bytes', f.bytes, 'width', f.width, 'height', f.height))
                  FROM feedback_files ff JOIN files f ON f.id = ff.file_id
                 WHERE ff.feedback_id = fb.id), '[]'::json) AS files
      FROM feedback fb JOIN users u ON u.id = fb.user_id
     ORDER BY fb.done_at IS NOT NULL, fb.created_at DESC
     LIMIT 500`)
  const json = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value)
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as FeedbackItem['kind'],
    email: typeof row.email === 'string' ? row.email : null,
    display_name: typeof row.display_name === 'string' ? row.display_name : null,
    created_at: String(row.created_at),
    done: row.done === true,
    content: json(row.content) as FeedbackItem['content'],
    context: json(row.context) as FeedbackItem['context'],
    files: json(row.files) as FeedbackItem['files'],
  }))
}

export async function setFeedbackDone(db: Db, id: string, done: boolean): Promise<boolean> {
  const rows = await rowsOf(db, sql`
    UPDATE feedback SET done_at = ${done ? sql`now()` : sql`NULL`} WHERE id = ${id} RETURNING id`)
  return rows.length > 0
}

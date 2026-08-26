/*
The S6 domain module: comments, replies, and likes per 4.15 and 7.14
(RFC 0005), member-only throughout.

Three rules this module is the whole enforcement of:

- **One reply level.** A parent must itself be parentless; a reply to a
  reply is refused before anything writes. The database cannot state
  "parent's parent is null" as a CHECK, so 4.15 makes it the API's and this
  is the API.
- **The thread is the audience (4.14).** A comment's fan-out reaches the
  people who have spoken in that thread, never the whole roster: a member
  who never joined the conversation is not pinged by it, and the actor is
  dropped by recordEvent as everywhere.
- **Author or owner deletes.** A mere member sees the thread and may not
  clean it (403, visible but forbidden, DES-225); a non-member never learns
  it exists (404).

A comment's event carries the words as its subject_name, clipped: the act a
history line reads back is what was said, not that saying occurred.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  CommentLine,
  PostCommentBody,
  ThreadView,
} from '../../shared/comments.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
import { recordEvent } from './events.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** What an event line says for a comment: the words, clipped to fit the
 * 4.13 detail budget with room to read. */
function snippetOf(body: string | null, fileName: string | null): string {
  if (body !== null && body.length > 0) {
    return body.length > 120 ? `${body.slice(0, 119)}…` : body
  }
  return fileName ?? 'an attachment'
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/comments (access resolved by the route)
 * ------------------------------------------------------------------ */

export type CreateCommentResult =
  | { kind: 'created'; comment: CommentLine }
  | { kind: 'task_not_here' }
  | { kind: 'parent_not_here' }
  | { kind: 'too_deep' }
  | { kind: 'file_not_here' }

export async function createComment(
  db: Db,
  viewerId: string,
  folderId: string,
  taskId: string | null,
  body: PostCommentBody,
): Promise<CreateCommentResult> {
  return inTransaction(db, async (tx) => {
    if (taskId !== null) {
      const task = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM tasks
            WHERE id = ${taskId} AND folder_id = ${folderId}
              AND deleted_at IS NULL`,
      )
      if (task.length === 0) return { kind: 'task_not_here' } as const
    }

    if (body.parent_id !== undefined) {
      const parent = await rowsOf(
        tx,
        sql`SELECT parent_id,
                   (task_id IS NOT DISTINCT FROM ${taskId}) AS same_thread
            FROM comments
            WHERE id = ${body.parent_id} AND folder_id = ${folderId}`,
      )
      const row = parent[0]
      if (row === undefined || row.same_thread !== true) {
        return { kind: 'parent_not_here' } as const
      }
      // 4.15's one level: a legal parent is itself parentless.
      if (row.parent_id !== null) return { kind: 'too_deep' } as const
    }

    let fileName: string | null = null
    if (body.file_id !== undefined) {
      const file = await rowsOf(
        tx,
        sql`SELECT name FROM files
            WHERE id = ${body.file_id} AND folder_id = ${folderId}`,
      )
      if (file[0] === undefined) return { kind: 'file_not_here' } as const
      fileName = String(file[0].name)
    }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO comments (folder_id, task_id, parent_id, author_id, body)
          VALUES (${folderId}::uuid, ${taskId}, ${body.parent_id ?? null},
                  ${viewerId}::uuid, ${body.body ?? null})
          RETURNING id, created_at`,
    )
    const commentId = String(inserted[0]?.id)
    if (body.file_id !== undefined) {
      await tx.execute(
        sql`INSERT INTO comment_files (comment_id, file_id)
            VALUES (${commentId}::uuid, ${body.file_id}::uuid)`,
      )
    }

    // The thread's participants (4.14): everyone who has spoken in this
    // thread before this comment; recordEvent drops the actor.
    const participants = await rowsOf(
      tx,
      sql`SELECT DISTINCT author_id FROM comments
          WHERE folder_id = ${folderId}
            AND task_id IS NOT DISTINCT FROM ${taskId}
            AND id <> ${commentId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'comment',
      subjectId: commentId,
      subjectName: snippetOf(body.body ?? null, fileName),
      folderId,
      detail: 'commented',
      recipients: participants.map((row) => String(row.author_id)),
    })

    return {
      kind: 'created',
      comment: {
        id: commentId,
        folder_id: folderId,
        task_id: taskId,
        parent_id: body.parent_id ?? null,
        author_id: viewerId,
        body: body.body ?? null,
        likes: 0,
        liked: false,
        file_ids: body.file_id === undefined ? [] : [body.file_id],
        created_at: toIso(inserted[0]?.created_at),
        edited_at: null,
      },
    } as const
  })
}

/* ------------------------------------------------------------------ *
 * GET /folders/:id/comments (access resolved by the route)
 * ------------------------------------------------------------------ */

export async function threadView(
  db: Db,
  viewerId: string,
  folderId: string,
  taskId: string | null,
): Promise<ThreadView> {
  const rows = await rowsOf(
    db,
    sql`SELECT c.id, c.folder_id, c.task_id, c.parent_id, c.author_id,
               c.body, c.created_at, c.edited_at,
               (SELECT count(*)::int FROM comment_likes l
                 WHERE l.comment_id = c.id) AS likes,
               EXISTS (SELECT 1 FROM comment_likes l
                        WHERE l.comment_id = c.id
                          AND l.user_id = ${viewerId}) AS liked,
               (SELECT coalesce(json_agg(cf.file_id ORDER BY cf.created_at), '[]'::json)
                  FROM comment_files cf WHERE cf.comment_id = c.id) AS file_ids
        FROM comments c
        WHERE c.folder_id = ${folderId}
          AND c.task_id IS NOT DISTINCT FROM ${taskId}
        ORDER BY c.created_at ASC, c.id ASC`,
  )
  return {
    comments: rows.map((row) => ({
      id: String(row.id),
      folder_id: String(row.folder_id),
      task_id: nullableString(row.task_id),
      parent_id: nullableString(row.parent_id),
      author_id: String(row.author_id),
      body: nullableString(row.body),
      likes: Number(row.likes),
      liked: row.liked === true,
      file_ids: fileIdsFrom(row.file_ids),
      created_at: toIso(row.created_at),
      edited_at: row.edited_at === null ? null : toIso(row.edited_at),
    })),
  }
}

function fileIdsFrom(value: unknown): string[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  return Array.isArray(parsed) ? parsed.map((id) => String(id)) : []
}

/* ------------------------------------------------------------------ *
 * The comment's own resolution: 404 outside the membership, and the
 * caller learns the roles it needs for 403 against 204
 * ------------------------------------------------------------------ */

export interface CommentAccess {
  id: string
  folderId: string
  authorId: string
  isAuthor: boolean
  isFolderOwner: boolean
  body: string | null
}

export async function accessibleComment(
  executor: Executor,
  viewerId: string,
  commentId: string,
): Promise<CommentAccess | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT c.id, c.folder_id, c.author_id, c.body,
               (c.author_id = ${viewerId}) AS is_author,
               (f.owner_id = ${viewerId}) AS is_folder_owner
        FROM comments c
        JOIN folders f ON f.id = c.folder_id AND f.deleted_at IS NULL
        JOIN folder_members m
          ON m.folder_id = c.folder_id AND m.user_id = ${viewerId}
        WHERE c.id = ${commentId}`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    authorId: String(row.author_id),
    isAuthor: row.is_author === true,
    isFolderOwner: row.is_folder_owner === true,
    body: nullableString(row.body),
  }
}

/** The author's own edit (4.15); the caller has resolved authorship. */
export async function editComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
  body: string,
): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.execute(
      sql`UPDATE comments SET body = ${body}, edited_at = now()
          WHERE id = ${access.id}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'comment',
      subjectId: access.id,
      subjectName: snippetOf(body, null),
      folderId: access.folderId,
      detail: 'edited a comment',
    })
  })
}

/** Author or folder owner (4.15); the caller has resolved the role. The
 * replies cascade with the row (4.15's FK), their words going with the
 * thread they answered. */
export async function deleteComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
): Promise<void> {
  await inTransaction(db, async (tx) => {
    await tx.execute(
      sql`DELETE FROM comments WHERE id = ${access.id}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'comment',
      subjectId: access.id,
      subjectName: snippetOf(access.body, null),
      folderId: access.folderId,
      detail: 'removed a comment',
    })
  })
}

/** One bit per person (4.15, DES-146): the repeat lands on the primary key
 * and does nothing, which is the idempotency 7.0 asks of PUT. No event and
 * no fan-out: a like is a glance, not an act the history reads back. */
export async function likeComment(
  db: Db,
  viewerId: string,
  commentId: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO comment_likes (comment_id, user_id)
        VALUES (${commentId}::uuid, ${viewerId}::uuid)
        ON CONFLICT (comment_id, user_id) DO NOTHING`,
  )
}

export async function unlikeComment(
  db: Db,
  viewerId: string,
  commentId: string,
): Promise<void> {
  await db.execute(
    sql`DELETE FROM comment_likes
        WHERE comment_id = ${commentId} AND user_id = ${viewerId}`,
  )
}

/*
The S6 domain module: comments, replies, and likes per 4.15 and 7.14
(RFC 0005), member-only throughout.

Three rules this module is the whole enforcement of:

- **One reply level.** A parent must itself be parentless; a reply to a
  reply is refused before anything writes. The database cannot state
  "parent's parent is null" as a CHECK, so 4.15 makes it the API's and this
  is the API.
- **Ten files, all or nothing (issue #22).** 10.3 caps a comment at ten
  files and this module is what counts them, the schema having already
  refused eleven. Every id must name a file of this folder or the whole
  comment is refused, and the order the caller sent is the order the thread
  reads back.
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
import { attachedFileIds } from '../../shared/comments.js'
import type {
  CommentFile,
  CommentLine,
  PostCommentBody,
  ThreadView,
} from '../../shared/comments.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
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
 * 4.13 detail budget with room to read. A wordless comment carrying several
 * files is named by the first of them, which is a summary rather than a
 * count: the history line says what was posted, and the thread is where the
 * rest of it is. */
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
    /* polish: search F1. The task's own people, read here so the fan-out
       below can reach them: a comment on a task concerns its assignee and
       its creator whether or not either has spoken yet (4.14, "the people
       it concerns"), which is what 9.12's empty state promises. The title is
       read too, so the sentence the bell draws can say which task. */
    let taskPeople: string[] = []
    let taskTitle: string | null = null
    if (taskId !== null) {
      const task = await rowsOf(
        tx,
        sql`SELECT title, assignee_id, created_by FROM tasks
            WHERE id = ${taskId} AND folder_id = ${folderId}
              AND deleted_at IS NULL`,
      )
      const row = task[0]
      if (row === undefined) return { kind: 'task_not_here' } as const
      taskTitle = String(row.title)
      taskPeople = [row.assignee_id, row.created_by].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
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

    /*
    The attachments (issue #22): up to 10.3's ten, resolved in one read and
    kept in the order the caller wrote them, which is what 7.14's "ordered as
    attached" means once there is more than one.

    All or nothing. One id naming a file outside this folder refuses the whole
    comment, exactly as the single-file version refused, rather than posting
    the words with the good files and dropping the rest: a comment that
    silently carries fewer files than the person attached is the failure this
    endpoint has to be careful about, and the words are still in the composer
    for them to send again. The uploads themselves are separate 7.15 requests
    that already succeeded or failed one at a time, so a failed third upload
    of five is a file the client never got an id for and never names here.
    */
    const fileIds = attachedFileIds(body)
    let fileName: string | null = null
    let attached: CommentFile[] = []
    if (fileIds.length > 0) {
      const found = await rowsOf(
        tx,
        sql`SELECT id, name, mime, bytes, width, height FROM files
            WHERE folder_id = ${folderId}
              AND id IN (${sql.join(
                fileIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`,
      )
      const byId = new Map(found.map((row) => [String(row.id), row]))
      if (byId.size !== fileIds.length) return { kind: 'file_not_here' } as const
      attached = fileIds.map((id) => {
        const row = byId.get(id)
        return {
          id,
          name: String(row?.name),
          mime: String(row?.mime),
          bytes: Number(row?.bytes),
          width: dimensionOf(row?.width),
          height: dimensionOf(row?.height),
        }
      })
      fileName = attached[0]?.name ?? null
    }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO comments (folder_id, task_id, parent_id, author_id, body)
          VALUES (${folderId}::uuid, ${taskId}, ${body.parent_id ?? null},
                  ${viewerId}::uuid, ${body.body ?? null})
          RETURNING id, created_at`,
    )
    const commentId = String(inserted[0]?.id)
    /*
    One row per attachment, stamped in order.

    `created_at` is what the thread read orders by, and inside one transaction
    `now()` is the transaction's instant, identical for every row: ten rows
    written with it would come back in whatever order the table felt like,
    which is not an order at all. Each row is therefore stamped one microsecond
    after the one before it, so the sequence the caller sent is the sequence
    the column records and the read reproduces. The column means "when this
    attachment was made", and making ten of them differ by a microsecond in
    the order they were made is truer to that than making them identical.
    Ordering by anything else available here (the file's own upload instant,
    its id) would be deterministic and would not be the caller's order, which
    is the one 7.14 names.
    */
    for (const [index, fileId] of fileIds.entries()) {
      await tx.execute(
        sql`INSERT INTO comment_files (comment_id, file_id, created_at)
            VALUES (${commentId}::uuid, ${fileId}::uuid,
                    now() + (${index}::int * interval '1 microsecond'))`,
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
    const folderRow = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    const placeName = taskTitle ?? String(folderRow[0]?.name ?? 'a folder')
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'comment',
      subjectId: commentId,
      subjectName: snippetOf(body.body ?? null, fileName),
      folderId,
      /* polish: search F4. The detail names where the comment landed, so the
         bell reads "commented on 'Book the van'" rather than "created
         <snippet>, commented". 4.13 caps detail at 200. */
      detail: `commented on "${placeName}"`.slice(0, 200),
      recipients: [...participants.map((row) => String(row.author_id)), ...taskPeople],
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
        files: attached,
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
               (SELECT coalesce(json_agg(json_build_object(
                          'id', f.id, 'name', f.name, 'mime', f.mime,
                          'bytes', f.bytes,
                          'width', f.width, 'height', f.height)
                        ORDER BY cf.created_at, cf.file_id), '[]'::json)
                  FROM comment_files cf JOIN files f ON f.id = cf.file_id
                  WHERE cf.comment_id = c.id) AS files
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
      files: filesFrom(row.files),
      created_at: toIso(row.created_at),
      edited_at: row.edited_at === null ? null : toIso(row.edited_at),
    })),
  }
}

/* 7.14's read shape (item 57 B5): the aggregate is 4.16's columns as JSON,
   which PGlite hands back parsed and node-postgres as text. "Ordered as
   attached" is cf.created_at, which createComment stamps a microsecond apart
   per attachment for exactly this ORDER BY to read; file_id follows it as a
   total tiebreak, so the aggregate has one answer even for rows this module
   did not write. */
function filesFrom(value: unknown): CommentFile[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) return []
  return parsed.map((entry: Record<string, unknown>) => ({
    id: String(entry.id),
    name: String(entry.name),
    mime: String(entry.mime),
    bytes: Number(entry.bytes),
    // Not Number(): a JSON null is 0 through that, and a zero width would
    // be a shape rather than the absence of one (issue #27).
    width: dimensionOf(entry.width),
    height: dimensionOf(entry.height),
  }))
}

function dimensionOf(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
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

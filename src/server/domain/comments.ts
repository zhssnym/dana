import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  attachedFileIds,
  postContent,
  postFileIds,
  postPlainText,
} from '../../shared/comments.js'
import type { ReactionKey } from '../../shared/comments.js'
import { GENERAL_DISCUSSION_TITLE } from '../../shared/consultation.js'
import type {
  CommentFile,
  CommentLine,
  CommentReaction,
  PatchCommentBody,
  PostCommentBody,
  PostContent,
  ThreadView,
} from '../../shared/comments.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { MentionRefusal, syncMentions } from './mentions.js'
import { resolveScoped } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function snippetOf(body: string | null, fileName: string | null): string {
  if (body !== null && body.length > 0) {
    return body.length > 120 ? `${body.slice(0, 119)}…` : body
  }
  return fileName ?? 'an attachment'
}

function derivedBody(content: PostContent): string | null {
  const text = postPlainText(content)
  return text.length > 0 ? text : null
}

function mediaIsAttached(content: PostContent, attached: readonly string[]): boolean {
  const own = new Set(attached)
  return postFileIds(content).every((id) => own.has(id))
}

export function postContentOrNull(value: unknown): PostContent | null {
  if (value === null || value === undefined) return null
  const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value
  const parsed = postContent.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export type CommentThread =
  | { kind: 'discussion'; discussionId: string }
  | { kind: 'folder' }

function isFrozen(row: Record<string, unknown>): boolean {
  return row.state !== 'open' || row.trashed_at !== null
}

async function openGeneralDiscussion(
  tx: Executor,
  folderId: string,
): Promise<string> {
  await tx.execute(
    sql`SELECT id FROM folders WHERE id = ${folderId}::uuid FOR NO KEY UPDATE`,
  )
  const found = await rowsOf(
    tx,
    sql`SELECT id FROM discussions
        WHERE folder_id = ${folderId}::uuid
          AND is_general AND state = 'open' AND trashed_at IS NULL`,
  )
  let discussionId = found[0]?.id
  if (discussionId === undefined) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO discussions (folder_id, title, created_by, is_general)
          SELECT f.id, ${GENERAL_DISCUSSION_TITLE}, f.owner_id, true
            FROM folders f WHERE f.id = ${folderId}::uuid
          RETURNING id`,
    )
    discussionId = made[0]?.id
  }
  if (discussionId === undefined) {
    throw new Error(`folder ${folderId} vanished under its own row lock`)
  }
  const strays = await rowsOf(
    tx,
    sql`SELECT EXISTS (
          SELECT 1 FROM comments
           WHERE folder_id = ${folderId}::uuid
             AND task_id IS NULL AND discussion_id IS NULL) AS found`,
  )
  if (strays[0]?.found === true) {
    await tx.execute(
      sql`UPDATE comments SET discussion_id = ${String(discussionId)}::uuid
          WHERE folder_id = ${folderId}::uuid
            AND task_id IS NULL AND discussion_id IS NULL`,
    )
  }
  return String(discussionId)
}

function inLegacyThread(folderId: string): ReturnType<typeof sql> {
  return sql`c.task_id IS NULL AND (
      c.discussion_id IS NULL
      OR c.discussion_id IN (
        SELECT d.id FROM discussions d
        WHERE d.folder_id = ${folderId}::uuid
          AND d.is_general
          AND d.trashed_at IS NULL))`
}

export type CreateCommentResult =
  | { kind: 'created'; comment: CommentLine }
  | { kind: 'discussion_not_here' }
  | { kind: 'frozen' }
  | { kind: 'parent_not_here' }
  | { kind: 'file_not_here' }
  | { kind: 'content_file_not_attached' }
  | { kind: 'empty' }
  | { kind: 'mention_unknown' }

export async function createComment(
  db: Db,
  viewerId: string,
  folderId: string,
  thread: CommentThread,
  body: PostCommentBody,
): Promise<CreateCommentResult> {
  const words = body.content === undefined ? (body.body ?? null) : derivedBody(body.content)
  if (body.content !== undefined) {
    if (!mediaIsAttached(body.content, attachedFileIds(body))) {
      return { kind: 'content_file_not_attached' } as const
    }
    if (words === null && attachedFileIds(body).length === 0) {
      return { kind: 'empty' } as const
    }
  }

  return inTransaction(db, async (tx) => {
    let discussionId: string
    if (thread.kind === 'discussion') {
      discussionId = thread.discussionId
    } else if (body.parent_id !== undefined) {
      const parent = await rowsOf(
        tx,
        sql`SELECT c.discussion_id FROM comments c
            WHERE c.id = ${body.parent_id} AND c.folder_id = ${folderId}
              AND ${inLegacyThread(folderId)}`,
      )
      const row = parent[0]
      if (row === undefined) return { kind: 'parent_not_here' } as const
      discussionId =
        row.discussion_id === null
          ? await openGeneralDiscussion(tx, folderId)
          : String(row.discussion_id)
    } else {
      discussionId = await openGeneralDiscussion(tx, folderId)
    }

    /* Notify the people of every live linked Task still in this Discussion's Folder.
    Moved Tasks are skipped, so the audience never crosses Folders. */
    const found = await rowsOf(
      tx,
      sql`SELECT d.title, d.state, d.trashed_at,
                 COALESCE((
                   SELECT json_agg(p.person_id ORDER BY p.person_id)
                     FROM (
                       SELECT DISTINCT people.person_id
                         FROM discussion_tasks dt
                         JOIN tasks t ON t.id = dt.task_id
                         CROSS JOIN LATERAL unnest(
                           coalesce(t.assignee_ids, '{}'::uuid[]) || ARRAY[t.created_by]
                         ) AS people(person_id)
                        WHERE dt.discussion_id = d.id
                          AND t.folder_id = d.folder_id
                          AND t.deleted_at IS NULL
                     ) p
                 ), '[]'::json) AS task_people
            FROM discussions d
           WHERE d.id = ${discussionId}::uuid AND d.folder_id = ${folderId}::uuid
           FOR NO KEY UPDATE OF d`,
    )
    const discussionRow = found[0]
    if (discussionRow === undefined) return { kind: 'discussion_not_here' } as const
    if (isFrozen(discussionRow)) return { kind: 'frozen' } as const
    const discussionTitle = String(discussionRow.title)
    const taskPeople = jsonArray(discussionRow.task_people).map(String)

    if (body.parent_id !== undefined) {
      const parent = await rowsOf(
        tx,
        sql`SELECT (discussion_id IS NOT DISTINCT FROM ${discussionId}::uuid)
                     AS same_thread
            FROM comments
            WHERE id = ${body.parent_id} AND folder_id = ${folderId}`,
      )
      const row = parent[0]
      if (row === undefined || row.same_thread !== true) {
        return { kind: 'parent_not_here' } as const
      }
    }

    const fileIds = attachedFileIds(body)
    let fileName: string | null = null
    let attached: CommentFile[] = []
    if (fileIds.length > 0) {
      const files = await rowsOf(
        tx,
        sql`SELECT id, name, mime, bytes, width, height FROM files
            WHERE folder_id = ${folderId}
              AND id IN (${sql.join(fileIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
      )
      const byId = new Map(files.map((row) => [String(row.id), row]))
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
      sql`INSERT INTO comments
            (folder_id, discussion_id, parent_id, author_id, body, content)
          VALUES (${folderId}::uuid, ${discussionId}::uuid,
                  ${body.parent_id ?? null}, ${viewerId}::uuid, ${words},
                  ${body.content === undefined ? null : JSON.stringify(body.content)}::jsonb)
          RETURNING id, created_at`,
    )
    const commentId = String(inserted[0]?.id)
    await tx.execute(
      sql`UPDATE discussions SET last_activity_at = now()
          WHERE id = ${discussionId}::uuid`,
    )
    for (const [index, fileId] of fileIds.entries()) {
      await tx.execute(
        sql`INSERT INTO comment_files (comment_id, file_id, created_at)
            VALUES (${commentId}::uuid, ${fileId}::uuid,
                    now() + (${index}::int * interval '1 microsecond'))`,
      )
    }

    const mentioned = new Set(
      await syncMentions(tx, { pageFolderId: folderId, actorId: viewerId, commentId }),
    )
    const participants = await rowsOf(
      tx,
      sql`SELECT DISTINCT author_id FROM comments
          WHERE folder_id = ${folderId}
            AND discussion_id = ${discussionId}::uuid
            AND id <> ${commentId}::uuid`,
    )
    const folderRow = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    const placeName =
      thread.kind === 'discussion'
        ? discussionTitle
        : String(folderRow[0]?.name ?? 'a folder')
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'comment',
      subjectId: commentId,
      subjectName: snippetOf(words, fileName),
      folderId,
      detail: `posted in "${placeName}"`.slice(0, 200),
      recipients: [
        ...participants.map((row) => String(row.author_id)),
        ...taskPeople,
      ].filter((id) => !mentioned.has(id)),
    })

    return {
      kind: 'created',
      comment: {
        id: commentId,
        folder_id: folderId,
        task_id: null,
        discussion_id: discussionId,
        parent_id: body.parent_id ?? null,
        author_id: viewerId,
        body: words,
        content: body.content ?? null,
        reactions: [] as CommentReaction[],
        files: attached,
        created_at: toIso(inserted[0]?.created_at),
        edited_at: null,
      },
    } as const
  }).catch((error: unknown) => {
    if (error instanceof MentionRefusal) return { kind: 'mention_unknown' } as const
    throw error
  })
}

/* One comment_likes row per person per reaction, grouped by reaction in order first left. */
function commentSelect(): ReturnType<typeof sql> {
  return sql`SELECT c.id, c.folder_id, c.task_id, c.discussion_id,
               c.parent_id, c.author_id,
               c.body, c.content, c.created_at, c.edited_at,
               (SELECT coalesce(json_agg(json_build_object('reaction', r.reaction, 'by', r.by)
                          ORDER BY r.first_at, r.reaction), '[]'::json)
                  FROM (SELECT l.reaction, min(l.created_at) AS first_at,
                               json_agg(l.user_id ORDER BY l.created_at, l.user_id) AS by
                          FROM comment_likes l
                         WHERE l.comment_id = c.id
                         GROUP BY l.reaction) r) AS reactions,
               (SELECT coalesce(json_agg(json_build_object(
                          'id', f.id, 'name', f.name, 'mime', f.mime,
                          'bytes', f.bytes, 'width', f.width, 'height', f.height)
                        ORDER BY cf.created_at, cf.file_id), '[]'::json)
                  FROM comment_files cf JOIN files f ON f.id = cf.file_id
                  WHERE cf.comment_id = c.id) AS files
        FROM comments c`
}

function lineFrom(row: Record<string, unknown>): CommentLine {
  return {
    id: String(row.id),
    folder_id: String(row.folder_id),
    task_id: nullableString(row.task_id),
    discussion_id: nullableString(row.discussion_id),
    parent_id: nullableString(row.parent_id),
    author_id: String(row.author_id),
    body: nullableString(row.body),
    content: postContentOrNull(row.content),
    reactions: reactionsFrom(row.reactions),
    files: filesFrom(row.files),
    created_at: toIso(row.created_at),
    edited_at: row.edited_at === null ? null : toIso(row.edited_at),
  }
}

export async function threadView(
  db: Db,
  folderId: string,
  thread: CommentThread,
): Promise<ThreadView> {
  const scope =
    thread.kind === 'discussion'
      ? sql`c.discussion_id = ${thread.discussionId}::uuid`
      : inLegacyThread(folderId)
  const rows = await rowsOf(
    db,
    sql`${commentSelect()}
        WHERE c.folder_id = ${folderId} AND ${scope}
        ORDER BY c.created_at ASC, c.id ASC`,
  )
  return { comments: rows.map(lineFrom) }
}

async function commentLineById(
  executor: Executor,
  commentId: string,
): Promise<CommentLine | null> {
  const found = await rowsOf(
    executor,
    sql`${commentSelect()} WHERE c.id = ${commentId}`,
  )
  const row = found[0]
  return row === undefined ? null : lineFrom(row)
}

function reactionsFrom(value: unknown): CommentReaction[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) return []
  return parsed.map((entry: Record<string, unknown>) => ({
    reaction: String(entry.reaction) as ReactionKey,
    by: Array.isArray(entry.by) ? entry.by.map(String) : [],
  }))
}

function filesFrom(value: unknown): CommentFile[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) return []
  return parsed.map((entry: Record<string, unknown>) => ({
    id: String(entry.id),
    name: String(entry.name),
    mime: String(entry.mime),
    bytes: Number(entry.bytes),
    width: dimensionOf(entry.width),
    height: dimensionOf(entry.height),
  }))
}

function dimensionOf(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

export interface CommentAccess {
  id: string
  folderId: string
  authorId: string
  isAuthor: boolean
  body: string | null
  facts: FolderActorFacts
}

export async function accessibleComment(
  executor: Executor,
  viewerId: string,
  commentId: string,
): Promise<CommentAccess | null> {
  const scoped = await resolveScoped(executor, 'comment', commentId, viewerId, {
    columns: sql`c.id, c.folder_id, c.author_id, c.body,
                 (c.author_id = ${viewerId}) AS is_author`,
  })
  if (scoped === null) return null
  const { row, facts } = scoped
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    authorId: String(row.author_id),
    isAuthor: row.is_author === true,
    body: nullableString(row.body),
    facts,
  }
}

async function discussionFrozen(
  tx: Executor,
  commentId: string,
): Promise<boolean> {
  const found = await rowsOf(
    tx,
    sql`SELECT d.state, d.trashed_at
        FROM comments c JOIN discussions d ON d.id = c.discussion_id
        WHERE c.id = ${commentId}::uuid
        FOR SHARE OF d`,
  )
  const row = found[0]
  return row !== undefined && isFrozen(row)
}

export type EditCommentResult =
  | { kind: 'edited'; comment: CommentLine }
  | { kind: 'file_not_here' }
  | { kind: 'nothing_left' }
  | { kind: 'content_file_not_attached' }
  | { kind: 'empty' }
  | { kind: 'frozen' }
  | { kind: 'gone' }
  | { kind: 'mention_unknown' }

export async function editComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
  patch: PatchCommentBody,
): Promise<EditCommentResult> {
  return inTransaction(db, async (tx) => {
    if (await discussionFrozen(tx, access.id)) return { kind: 'frozen' } as const
    const present = await rowsOf(
      tx,
      sql`SELECT id, body, content FROM comments
          WHERE id = ${access.id}::uuid FOR UPDATE`,
    )
    const current = present[0]
    if (current === undefined) return { kind: 'gone' } as const

    const currentContent = postContentOrNull(current.content)
    const nextContent: PostContent | null =
      patch.content !== undefined
        ? patch.content
        : patch.body !== undefined
          ? null
          : currentContent
    const nextBody =
      patch.content !== undefined
        ? derivedBody(patch.content)
        : (patch.body ?? nullableString(current.body))
    const finalFileIds =
      patch.file_ids ??
      (
        await rowsOf(
          tx,
          sql`SELECT file_id FROM comment_files WHERE comment_id = ${access.id}::uuid`,
        )
      ).map((row) => String(row.file_id))
    if (nextContent !== null && !mediaIsAttached(nextContent, finalFileIds)) {
      return { kind: 'content_file_not_attached' } as const
    }
    if (patch.content !== undefined && nextBody === null && finalFileIds.length === 0) {
      return { kind: 'empty' } as const
    }
    let firstFileName: string | null = null

    if (patch.file_ids !== undefined) {
      if (patch.file_ids.length > 0) {
        const found = await rowsOf(
          tx,
          sql`SELECT id, name FROM files
              WHERE folder_id = ${access.folderId}
                AND id IN (${sql.join(patch.file_ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
        )
        const byId = new Map(found.map((row) => [String(row.id), row]))
        if (byId.size !== patch.file_ids.length) return { kind: 'file_not_here' } as const
        firstFileName = String(byId.get(patch.file_ids[0] ?? '')?.name ?? '')
      } else if (nextBody === null || nextBody.length === 0) {
        return { kind: 'nothing_left' } as const
      }

      await tx.execute(
        sql`DELETE FROM comment_files WHERE comment_id = ${access.id}::uuid`,
      )
      for (const [index, fileId] of patch.file_ids.entries()) {
        await tx.execute(
          sql`INSERT INTO comment_files (comment_id, file_id, created_at)
              VALUES (${access.id}::uuid, ${fileId}::uuid,
                      now() + (${index}::int * interval '1 microsecond'))`,
        )
      }
    }

    const updated = await rowsOf(
      tx,
      sql`UPDATE comments
          SET body = ${nextBody},
              content = ${nextContent === null ? null : JSON.stringify(nextContent)}::jsonb,
              edited_at = now()
          WHERE id = ${access.id}::uuid
          RETURNING id`,
    )
    if (updated[0] === undefined) return { kind: 'gone' } as const
    await syncMentions(tx, {
      pageFolderId: access.folderId,
      actorId: viewerId,
      commentId: access.id,
    })
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'comment',
      subjectId: access.id,
      subjectName: snippetOf(nextBody, firstFileName),
      folderId: access.folderId,
      detail: 'edited a comment',
    })
    const comment = await commentLineById(tx, access.id)
    return comment === null
      ? ({ kind: 'gone' } as const)
      : ({ kind: 'edited', comment } as const)
  }).catch((error: unknown) => {
    if (error instanceof MentionRefusal) return { kind: 'mention_unknown' } as const
    throw error
  })
}

export async function deleteComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
): Promise<'deleted' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    if (await discussionFrozen(tx, access.id)) return 'frozen' as const
    await tx.execute(sql`DELETE FROM comments WHERE id = ${access.id}::uuid`)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'comment',
      subjectId: access.id,
      subjectName: snippetOf(access.body, null),
      folderId: access.folderId,
      detail: 'removed a comment',
    })
    return 'deleted' as const
  })
}

/** Idempotent: leaving it twice keeps one row. */
export async function addReaction(
  db: Db,
  viewerId: string,
  commentId: string,
  reaction: ReactionKey,
): Promise<'done' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    if (await discussionFrozen(tx, commentId)) return 'frozen' as const
    await tx.execute(
      sql`INSERT INTO comment_likes (comment_id, user_id, reaction)
          VALUES (${commentId}::uuid, ${viewerId}::uuid, ${reaction})
          ON CONFLICT (comment_id, user_id, reaction) DO NOTHING`,
    )
    return 'done' as const
  })
}

export async function removeReaction(
  db: Db,
  viewerId: string,
  commentId: string,
  reaction: ReactionKey,
): Promise<'done' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    if (await discussionFrozen(tx, commentId)) return 'frozen' as const
    await tx.execute(
      sql`DELETE FROM comment_likes
          WHERE comment_id = ${commentId} AND user_id = ${viewerId}
            AND reaction = ${reaction}`,
    )
    return 'done' as const
  })
}

export interface DiscussionScope {
  id: string
  folderId: string
}

export async function discussionScope(
  executor: Executor,
  discussionId: string,
): Promise<DiscussionScope | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT id, folder_id FROM discussions WHERE id = ${discussionId}::uuid`,
  )
  const row = found[0]
  return row === undefined
    ? null
    : { id: String(row.id), folderId: String(row.folder_id) }
}

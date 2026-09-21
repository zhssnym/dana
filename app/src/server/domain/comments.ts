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
  PatchCommentBody,
  PostCommentBody,
  ThreadView,
} from '../../shared/comments.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { presetOf } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'

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

/* The thread's read shape, in one place because two readers want it: the
   thread itself, and the single line `editComment` answers with (issue #94).
   A second copy of this projection is how the two would one day disagree
   about what a comment is. */
function commentSelect(viewerId: string): ReturnType<typeof sql> {
  return sql`SELECT c.id, c.folder_id, c.task_id, c.parent_id, c.author_id,
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
        FROM comments c`
}

function lineFrom(row: Record<string, unknown>): CommentLine {
  return {
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
  }
}

export async function threadView(
  db: Db,
  viewerId: string,
  folderId: string,
  taskId: string | null,
): Promise<ThreadView> {
  const rows = await rowsOf(
    db,
    sql`${commentSelect(viewerId)}
        WHERE c.folder_id = ${folderId}
          AND c.task_id IS NOT DISTINCT FROM ${taskId}
        ORDER BY c.created_at ASC, c.id ASC`,
  )
  return { comments: rows.map(lineFrom) }
}

/* One comment as the thread would read it. The caller has already resolved
   the viewer's access to it, so there is no membership clause here and this
   function must never be reached with an id `accessibleComment` did not
   return. */
async function commentLineById(
  executor: Executor,
  viewerId: string,
  commentId: string,
): Promise<CommentLine | null> {
  const found = await rowsOf(
    executor,
    sql`${commentSelect(viewerId)} WHERE c.id = ${commentId}`,
  )
  const row = found[0]
  return row === undefined ? null : lineFrom(row)
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
  body: string | null
  /** The actor's durable Folder facts, from the same membership join that
   * scoped this read (issue #228). Carried here so the two comment gates ask
   * the resolver rather than re-deriving a rule, and so `isAuthor` stops
   * being an authority of its own.
   *
   * `isFolderOwner` sat beside it until 2026-09-20 (issue #268) and had had
   * no reader since #228 moved both gates onto `mayPerform`; custody reaches
   * them as `facts.isOwner` now, where the table decides what it is worth.
   * Removed rather than kept as documentation, a standing field being an
   * invitation to gate on it again. */
  facts: FolderActorFacts
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
               (f.owner_id = ${viewerId}) AS is_folder_owner,
               f.name AS folder_name, f.is_default, m.access
        FROM comments c
        JOIN folders f ON f.id = c.folder_id AND f.deleted_at IS NULL
        JOIN folder_members m
          ON m.folder_id = c.folder_id AND m.user_id = ${viewerId}
        WHERE c.id = ${commentId}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${viewerId} in ${String(row.folder_id)}`,
    )
  }
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    authorId: String(row.author_id),
    isAuthor: row.is_author === true,
    body: nullableString(row.body),
    facts: {
      folderId: String(row.folder_id),
      actorId: viewerId,
      access,
      isOwner: row.is_folder_owner === true,
      isDefault: row.is_default === true,
      name: String(row.folder_name),
    },
  }
}

export type EditCommentResult =
  | { kind: 'edited'; comment: CommentLine }
  | { kind: 'file_not_here' }
  | { kind: 'nothing_left' }
  | { kind: 'gone' }

/*
The author's own edit (7.14); the caller has resolved it.

**Checked against the delete half on 2026-09-20 (issue #268) and found not to
have the same defect.** The two gates were asked whether either still resolved
on `folders.owner_id`: the delete half did, in the client, and does not here;
this half never did. `PATCH /comments/:id` resolves `comment.mutate.own`,
which is authorship **and** currently holding Can comment or better, and no
preset and no custody has ever let one member edit another's words. So there
is nothing to widen here and nothing to narrow — moderation removes a comment
and does not rewrite it, which is #228's Full-control list read exactly as it
is written.

**The attachments moved here on 2026-09-04 (issue #94), on Imran's ruling that
a person may add or remove them without deleting the comment and posting it
again.** Three rules, and each is the create half's own rule read backwards.

`patch.file_ids` is the whole new set. Omitted, nothing about the attachments
is touched; `[]` removes them all; anything else makes the set exactly those
ids, in that order, which is the order 7.14's "ordered as attached" names and
which the microsecond stamping below is what preserves — inside one
transaction `now()` is the transaction's instant and ten identical stamps are
not an order at all.

Every id is scoped to *this comment's* folder, exactly as `createComment`
scopes the create half's, and one id outside it refuses the whole edit rather
than applying the good half. The comment's folder comes from `access`, which
the route resolved through the viewer's membership, so a file this viewer
cannot reach is indistinguishable here from one that does not exist: the
refusal says which field is wrong and nothing about what is on the other side
of it (10.2, DES-225).

And the comment must still be a comment afterwards. 4.15 admits a wordless one
carrying files and the create half refuses one carrying neither, so an edit
that would leave neither words nor attachments is refused here rather than
being allowed to produce a row the create path could never have written.

**Only whoever could already edit the words may do this**, which is the route's
`comment.mutate.own` gate unchanged: attachment editing is a second thing the
same person may do to their own comment, not a reason to widen who may touch
it. (This named `access.isAuthor` until 2026-09-20; #228 replaced that gate
with the resolver's and the sentence was left behind.)
*/
export async function editComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
  patch: PatchCommentBody,
): Promise<EditCommentResult> {
  return inTransaction(db, async (tx) => {
    /*
    Is the comment still there, decided before anything is written and under a
    row lock (review of #94).

    The route resolves `access` before this transaction opens, and a member
    who moderates may delete another author's comment, so the row can go in
    between. (It read "4.15 lets a folder owner" until 2026-09-20, issue #268:
    the race is the same, the actor is not. Moderation is `comment.moderate`,
    which is Full control's.)
    That used to be caught only by the UPDATE below returning nothing — after
    the attachment rewrite had already run, which meant a non-empty `file_ids`
    hit `comment_files_comment_id_fkey` first and the caller was answered 500
    where the `gone` branch means 404.

    **Reordering the UPDATE would not have fixed it and would have cost more.**
    `inTransaction` is drizzle's `transaction()`, so a plain `return` commits:
    an UPDATE run before the two refusal paths would leave a `file_not_here`
    or a `nothing_left` having changed the words, which is exactly the
    all-or-nothing this endpoint promises. A lock-and-check writes nothing, and
    it does better than reordering as well — the lock is held for the rest of
    the transaction, so a delete racing us blocks rather than being merely
    noticed earlier.
    */
    const present = await rowsOf(
      tx,
      sql`SELECT id FROM comments WHERE id = ${access.id}::uuid FOR UPDATE`,
    )
    if (present[0] === undefined) return { kind: 'gone' } as const

    const nextBody = patch.body ?? access.body
    let firstFileName: string | null = null

    if (patch.file_ids !== undefined) {
      if (patch.file_ids.length > 0) {
        const found = await rowsOf(
          tx,
          sql`SELECT id, name FROM files
              WHERE folder_id = ${access.folderId}
                AND id IN (${sql.join(
                  patch.file_ids.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})`,
        )
        const byId = new Map(found.map((row) => [String(row.id), row]))
        if (byId.size !== patch.file_ids.length) {
          return { kind: 'file_not_here' } as const
        }
        firstFileName = String(byId.get(patch.file_ids[0] ?? '')?.name ?? '')
      } else if (nextBody === null || nextBody.length === 0) {
        // Removing the last attachment from a wordless comment would leave a
        // row carrying nothing, which the create half refuses outright.
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
      sql`UPDATE comments SET body = ${nextBody}, edited_at = now()
          WHERE id = ${access.id}::uuid
          RETURNING id`,
    )
    // Unreachable behind the lock above and kept as its backstop: if the row
    // ever stops being held, this answers 404 rather than "edited".
    if (updated[0] === undefined) return { kind: 'gone' } as const

    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'comment',
      subjectId: access.id,
      subjectName: snippetOf(nextBody, firstFileName),
      folderId: access.folderId,
      detail: 'edited a comment',
    })

    const comment = await commentLineById(tx, viewerId, access.id)
    return comment === null
      ? ({ kind: 'gone' } as const)
      : ({ kind: 'edited', comment } as const)
  })
}

/**
 * The author, or a member who moderates; the caller has resolved which.
 *
 * **This said "Author or folder owner (4.15)" until 2026-09-20 (issue #268),
 * and had been false since #228's R8A landed.** `routes/conversation.ts`
 * resolves `comment.mutate.own` or `comment.moderate`, and moderation is Full
 * control's: an owner whose Access was lowered does not moderate, and a
 * Full-control member who owns nothing does. 4.15 is the table and says
 * nothing about who may delete; 7.14 is where the rule lives, and its dated
 * amendment of 2026-09-20 carries the correction (AC-790).
 *
 * The replies cascade with the row (4.15's FK), their words going with the
 * thread they answered.
 */
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

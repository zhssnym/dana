/*
The domain module for comments, replies, and likes per 4.15 and 7.14,
member-only throughout.

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
import {
  attachedFileIds,
  postContent,
  postFileIds,
  postPlainText,
} from '../../shared/comments.js'
import { GENERAL_DISCUSSION_TITLE } from '../../shared/consultation.js'
import type {
  CommentFile,
  CommentLine,
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

/*
A post's words (W-C): with `content`, the plain `body` every older reader
uses is derived from it, never sent beside it, and an empty derivation is a
NULL body (a pictures-only post), which is what a wordless comment has always
stored. Without `content` the body is what was sent.
*/
function derivedBody(content: PostContent): string | null {
  const text = postPlainText(content)
  return text.length > 0 ? text : null
}

/** Whether every file a post's media blocks name is one of `attached`, the
 * same comment's own attachments. A block naming anything else would let a
 * post display a file that is not its own (W-C). */
function mediaIsAttached(content: PostContent, attached: readonly string[]): boolean {
  const own = new Set(attached)
  return postFileIds(content).every((id) => own.has(id))
}

/* The stored jsonb, as either driver hands it back (parsed, or text if it
   ever arrives cast). Parsed through the contract so a row that somehow
   fails it reads as a plain-text comment rather than breaking the thread. */
export function postContentOrNull(value: unknown): PostContent | null {
  if (value === null || value === undefined) return null
  const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value
  const parsed = postContent.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/* ------------------------------------------------------------------ *
 * Which thread (issue #320)
 * ------------------------------------------------------------------ */

/**
 * The two threads a comment can be written to. A task has no thread of its
 * own since M5 (migration 0059): its conversation is the Discussion linked to
 * it (`discussions.task_id`), and `comments_no_task_scope_check` refuses a
 * task-scoped row.
 *
 * - `discussion`: one Discussion's conversation, `POST /discussions/:id/comments`.
 * - `folder`: the legacy Folder thread the deployed client still posts to
 *   and reads (`/folders/:id/comments`). It is the Folder's
 *   "General discussion" -- migration 0029's backfill target -- and a write
 *   there lands in the open one, created if missing.
 */
export type CommentThread =
  | { kind: 'discussion'; discussionId: string }
  | { kind: 'folder' }

/** A Discussion's conversation takes no writes while it is resolved or in
 * Trash (issue #320). One predicate, so the create, edit, delete and like
 * halves cannot disagree about what frozen means. */
function isFrozen(row: Record<string, unknown>): boolean {
  return row.state !== 'open' || row.trashed_at !== null
}

/**
 * The Folder's open, untrashed General discussion (`is_general`), created if
 * there is none, with every stray Folder-level comment (`task_id` and
 * `discussion_id` both null) filed under it. Legacy writes only.
 *
 * It is found by the `is_general` flag and never by its title: a rename
 * through PATCH /discussions/:id moves nothing, and another Discussion
 * titled "General discussion" is an ordinary Discussion.
 *
 * The Folder row is locked first (`FOR NO KEY UPDATE`, which the comment
 * and discussion inserts' own key checks do not conflict with) so two
 * concurrent legacy posts cannot each create one; the partial unique index
 * `discussions_one_open_general_key` is the backstop. The row created has
 * 0029's backfill shape: that title, `created_by` the Folder owner as
 * provenance, state open, `is_general` true.
 *
 * A resolved or trashed General discussion is left exactly as it is and a
 * fresh open one is made beside it: the deployed client has no way to
 * reopen, and refusing its every post would silence the Folder thread for
 * everyone still on it. The legacy read keeps showing the resolved one's
 * comments, so the old client still reads one continuous thread.
 */
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
  /* Strays exist only from before 0029's route change or a write that raced
     it, so almost always there are none: ask first, from
     `comments_unfiled_folder_idx`, rather than run an UPDATE on every post. */
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

/** The legacy Folder thread's membership test, for the read and for a
 * legacy reply's parent: a Folder-level comment in any untrashed General
 * discussion (`is_general`) of the Folder, or a stray one no Discussion
 * holds yet. */
function inLegacyThread(folderId: string): ReturnType<typeof sql> {
  return sql`c.task_id IS NULL AND (
      c.discussion_id IS NULL
      OR c.discussion_id IN (
        SELECT d.id FROM discussions d
        WHERE d.folder_id = ${folderId}::uuid
          AND d.is_general
          AND d.trashed_at IS NULL))`
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/comments and /discussions/:id/comments (access
 * resolved by the route)
 * ------------------------------------------------------------------ */

export type CreateCommentResult =
  | { kind: 'created'; comment: CommentLine }
  | { kind: 'discussion_not_here' }
  | { kind: 'frozen' }
  | { kind: 'parent_not_here' }
  | { kind: 'too_deep' }
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
  /* W-C, decided before the transaction opens and so before any write (the
     legacy Folder thread may create a General discussion below): the words
     are derived from `content`, every media block must name one of this
     comment's own `file_ids`, and the comment must still carry words or a
     file. */
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
    /*
    The Discussion this comment lands in (issue #320).

    A legacy reply goes where its parent is, because a reply and its parent
    are one conversation: if the parent sits in a General discussion that has
    since been resolved, the reply is refused as frozen rather than filed
    somewhere else. A legacy top-level post goes to the open General
    discussion, made if missing.
    */
    let discussionId: string
    if (thread.kind === 'discussion') {
      discussionId = thread.discussionId
    } else {
      if (body.parent_id !== undefined) {
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
    }

    /* The Discussion's row, locked for the rest of the transaction so a
       resolve or a trash racing this post waits for it or is waited on,
       and never lets a comment land after the Outcome was recorded.

       A Discussion about a live task (M5) also reaches the task's own
       people: a post about a task concerns its assignee and its creator
       whether or not either has spoken yet (4.14, "the people it
       concerns"), as the task's own thread did before 0059. */
    const found = await rowsOf(
      tx,
      sql`SELECT d.title, d.state, d.trashed_at,
                 t.assignee_id AS task_assignee, t.created_by AS task_creator
            FROM discussions d
            LEFT JOIN tasks t
              ON t.id = d.task_id AND t.folder_id = d.folder_id
             AND t.deleted_at IS NULL
           WHERE d.id = ${discussionId}::uuid AND d.folder_id = ${folderId}::uuid
           FOR NO KEY UPDATE OF d`,
    )
    const discussionRow = found[0]
    if (discussionRow === undefined) return { kind: 'discussion_not_here' } as const
    if (isFrozen(discussionRow)) return { kind: 'frozen' } as const
    const discussionTitle = String(discussionRow.title)
    const taskPeople = [discussionRow.task_assignee, discussionRow.task_creator].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )

    if (body.parent_id !== undefined) {
      const parent = await rowsOf(
        tx,
        sql`SELECT parent_id,
                   (discussion_id IS NOT DISTINCT FROM ${discussionId}::uuid)
                     AS same_thread
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
      sql`INSERT INTO comments
            (folder_id, discussion_id, parent_id, author_id, body,
             content)
          VALUES (${folderId}::uuid, ${discussionId}::uuid,
                  ${body.parent_id ?? null}, ${viewerId}::uuid,
                  ${words},
                  ${body.content === undefined ? null : JSON.stringify(body.content)}::jsonb)
          RETURNING id, created_at`,
    )
    const commentId = String(inserted[0]?.id)
    /* The Consultation list orders by this (issue #320), and it moves with
       the comment, in the comment's transaction. */
    await tx.execute(
      sql`UPDATE discussions SET last_activity_at = now()
          WHERE id = ${discussionId}::uuid`,
    )
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

    // Wave 2 (W-D): the people this post newly mentions are told by their
    // own `mentioned` event and left out of `commented` below.
    const mentioned = new Set(await syncMentions(tx, { pageFolderId: folderId, actorId: viewerId, commentId }))
    // The thread's participants (4.14): everyone who has spoken in this
    // thread before this comment; recordEvent drops the actor.
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
    /* A Discussion's own route names the Discussion; the legacy Folder
       thread keeps naming the Folder, as it always has. */
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
      /* The detail names where the post landed, so the bell reads
         "posted in 'Book the van'" rather than "created <snippet>".
         Rows stored before round 5 say "commented on"; the bell reads
         both. 4.13 caps detail at 200. */
      detail: `posted in "${placeName}"`.slice(0, 200),
      recipients: [...participants.map((row) => String(row.author_id)), ...taskPeople].filter((id) => !mentioned.has(id)),
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
        likes: 0,
        liked: false,
        liked_by: [] as string[],
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

/* ------------------------------------------------------------------ *
 * GET /folders/:id/comments (access resolved by the route)
 * ------------------------------------------------------------------ */

/* The thread's read shape, in one place because two readers want it: the
   thread itself, and the single line `editComment` answers with (issue #94).
   A second copy of this projection is how the two would one day disagree
   about what a comment is. */
function commentSelect(viewerId: string): ReturnType<typeof sql> {
  return sql`SELECT c.id, c.folder_id, c.task_id, c.discussion_id,
               c.parent_id, c.author_id,
               c.body, c.content, c.created_at, c.edited_at,
               (SELECT count(*)::int FROM comment_likes l
                 WHERE l.comment_id = c.id) AS likes,
               EXISTS (SELECT 1 FROM comment_likes l
                        WHERE l.comment_id = c.id
                          AND l.user_id = ${viewerId}) AS liked,
               (SELECT coalesce(json_agg(l.user_id ORDER BY l.created_at, l.user_id), '[]'::json)
                  FROM comment_likes l
                  WHERE l.comment_id = c.id) AS liked_by,
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
    discussion_id: nullableString(row.discussion_id),
    parent_id: nullableString(row.parent_id),
    author_id: String(row.author_id),
    body: nullableString(row.body),
    content: postContentOrNull(row.content),
    likes: Number(row.likes),
    liked: row.liked === true,
    liked_by: likersFrom(row.liked_by),
    files: filesFrom(row.files),
    created_at: toIso(row.created_at),
    edited_at: row.edited_at === null ? null : toIso(row.edited_at),
  }
}

/**
 * One thread, whole and in order. A Discussion's is its `discussion_id`; the legacy Folder thread is every
 * General discussion of the Folder that is not in Trash (a resolved one
 * included, so the deployed client keeps reading one continuous history)
 * plus any stray Folder-level comment no Discussion holds yet. Comments of
 * any other Discussion never appear on the Folder thread (issue #320).
 */
export async function threadView(
  db: Db,
  viewerId: string,
  folderId: string,
  thread: CommentThread,
): Promise<ThreadView> {
  const scope =
    thread.kind === 'discussion'
      ? sql`c.discussion_id = ${thread.discussionId}::uuid`
      : inLegacyThread(folderId)
  const rows = await rowsOf(
    db,
    sql`${commentSelect(viewerId)}
        WHERE c.folder_id = ${folderId} AND ${scope}
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

/* 7.14's read shape: the aggregate is 4.16's columns as JSON,
   which PGlite hands back parsed and node-postgres as text. "Ordered as
   attached" is cf.created_at, which createComment stamps a microsecond apart
   per attachment for exactly this ORDER BY to read; file_id follows it as a
   total tiebreak, so the aggregate has one answer even for rows this module
   did not write. */
/** Who liked a post, earliest first (user ids). */
function likersFrom(value: unknown): string[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  return Array.isArray(parsed) ? parsed.map(String) : []
}

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

/**
 * Whether the comment's Discussion is frozen (resolved or in Trash, issue
 * #320), read with that Discussion's row share-locked for the rest of the
 * transaction, so a resolve or a trash cannot slip in between this answer and
 * the write it guards. A Task comment, and a comment no Discussion holds, is
 * never frozen.
 */
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

**A person may add or remove attachments without deleting the comment and
posting it again (issue #94).** Three rules, and each is the create half's own rule read backwards.

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

    Issue #320 first, though: a resolved or trashed Discussion's words stay
    as recorded. The Discussion is locked before the comment, the order
    `createComment` takes them in (Discussion row, then the parent comment's
    key share), so a reply and an edit racing on one thread cannot deadlock.
    */
    if (await discussionFrozen(tx, access.id)) {
      return { kind: 'frozen' } as const
    }
    const present = await rowsOf(
      tx,
      sql`SELECT id, body, content FROM comments
          WHERE id = ${access.id}::uuid FOR UPDATE`,
    )
    const current = present[0]
    if (current === undefined) return { kind: 'gone' } as const

    /*
    W-C: the words and the post content move together.

    - `content` sent: it is stored and `body` is derived from it.
    - `body` sent: a plain-text edit, which replaces the post, so `content`
      is cleared to NULL and the comment reads as the text it now is. (The
      alternative, refusing, would strand a post edited by a client that only
      knows `body`; clearing loses the layout and never the words or files.)
    - neither: both stay as they are, and a stored post's media blocks must
      still name files the comment keeps.

    Either way the final media blocks must name only the final attachments
    (the new `file_ids` if sent, else the current ones), and the comment must
    still carry words or a file. All of it is decided before the first write.
    Only the author reaches this function (`comment.mutate.own`), so only the
    author changes a post's content.
    */
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
      sql`UPDATE comments
          SET body = ${nextBody},
              content = ${nextContent === null ? null : JSON.stringify(nextContent)}::jsonb,
              edited_at = now()
          WHERE id = ${access.id}::uuid
          RETURNING id`,
    )
    // Unreachable behind the lock above and kept as its backstop: if the row
    // ever stops being held, this answers 404 rather than "edited".
    if (updated[0] === undefined) return { kind: 'gone' } as const
    await syncMentions(tx, { pageFolderId: access.folderId, actorId: viewerId, commentId: access.id })

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
  }).catch((error: unknown) => {
    if (error instanceof MentionRefusal) return { kind: 'mention_unknown' } as const
    throw error
  })
}

/**
 * The author, or a member who moderates; the caller has resolved which.
 *
 * `routes/conversation.ts` resolves `comment.mutate.own` or `comment.moderate`, and moderation is Full
 * control's: an owner whose Access was lowered does not moderate, and a
 * Full-control member who owns nothing does. 4.15 is the table and says
 * nothing about who may delete; 7.14 is where the rule lives.
 *
 * Replies survive: migration 0047 made 4.15's parent key ON DELETE SET NULL,
 * so each reply stays in the thread as an ordinary post (parent_id NULL),
 * its author's words intact. Only this row goes.
 */
export async function deleteComment(
  db: Db,
  viewerId: string,
  access: CommentAccess,
): Promise<'deleted' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    /* Issue #320: moderation included. A resolved Discussion's record --
       its Outcome may name this comment as its source -- is changed by
       reopening it first, not by removing what was said underneath it. */
    if (await discussionFrozen(tx, access.id)) return 'frozen' as const
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
    return 'deleted' as const
  })
}

/** One bit per person (4.15, DES-146): the repeat lands on the primary key
 * and does nothing, which is the idempotency 7.0 asks of PUT. No event and
 * no fan-out: a like is a glance, not an act the history reads back. */
export async function likeComment(
  db: Db,
  viewerId: string,
  commentId: string,
): Promise<'done' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    /* Issue #320: likes freeze with the rest of the conversation. A
       resolved Discussion is a record, and its like counts are part of
       what it reads as. */
    if (await discussionFrozen(tx, commentId)) return 'frozen' as const
    await tx.execute(
      sql`INSERT INTO comment_likes (comment_id, user_id)
          VALUES (${commentId}::uuid, ${viewerId}::uuid)
          ON CONFLICT (comment_id, user_id) DO NOTHING`,
    )
    return 'done' as const
  })
}

export async function unlikeComment(
  db: Db,
  viewerId: string,
  commentId: string,
): Promise<'done' | 'frozen'> {
  return inTransaction(db, async (tx) => {
    if (await discussionFrozen(tx, commentId)) return 'frozen' as const
    await tx.execute(
      sql`DELETE FROM comment_likes
          WHERE comment_id = ${commentId} AND user_id = ${viewerId}`,
    )
    return 'done' as const
  })
}

/* ------------------------------------------------------------------ *
 * A Discussion, resolved for its comment routes (issue #320)
 * ------------------------------------------------------------------ */

export interface DiscussionScope {
  id: string
  folderId: string
}

/**
 * The Discussion's Folder, for `/discussions/:id/comments`. No access is
 * decided here: the route asks `accessOf` on the returned Folder, and an id
 * naming no Discussion and a Discussion in a Folder the viewer is not in
 * both answer 404 there. Owned by the comment routes rather than the
 * Discussion domain so the two can land independently.
 */
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

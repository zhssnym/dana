/*
The Consultation domain (issue #320, spec 7.28): a Folder's Discussions, their
append-only Outcomes, and the Discussion's place in Trash.

Storage is migration 0029 and the contract is `shared/consultation.ts`; the
action rules are `shared/folder-actions.ts`'s `discussion.*` rows. This file
decides everything that touches rows, and `routes/consultation.ts` only maps
outcomes to statuses.

## Every writing act has the same shape

1. Lock the Discussion row `FOR UPDATE` in the transaction that writes.
2. Resolve the actor's Folder facts **in that same transaction**, after the
   lock, so a membership removed or lowered a moment earlier is the one the
   decision sees. A creator lowered below Can comment is refused here at once:
   `creatorId` authorizes only through `whenCreatorAtLeast` (#228: authorship
   is provenance, never standing authority).
3. `mayPerform` with `creatorId` read from the locked row.
4. The state rule ("only while open", "only while resolved"), 409.
5. Write, bump `last_activity_at`, record the event.

The route has already answered 404 for a Discussion the caller cannot see and
422 for a malformed body before any of this runs, which is the facet surface's
refusal order: 404, 422, 403, 409.

## Events

Recorded against the Folder (`subject_kind = 'folder'`), as facet acts are:
the deployed client parses `subject_kind` through a closed enum, so a new
subject kind would break its history screens.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  DISCUSSION_TITLE_MAX,
  decodeDiscussionCursor,
  encodeDiscussionCursor,
} from '../../shared/consultation.js'
import type {
  CreateDiscussionBody,
  Discussion,
  DiscussionListQuery,
  DiscussionListResponse,
  Outcome,
  ResolveDiscussionBody,
  UpdateDiscussionBody,
} from '../../shared/consultation.js'
import type { TrashedDiscussion } from '../../shared/trash.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import {
  discussionHasOtherInput,
  onDiscussionResolved,
} from './consultation-hooks.js'
import { recordEvent } from './events.js'
import {
  folderActorFacts,
  joinVisibleFolder,
  mayPerform,
  presetFromRow,
} from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { UNSTARTED_TASK_THREAD } from './tasks.js'

export type ConsultationOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid'; field: string; message: string }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; message: string }

const notFound = { kind: 'not_found' } as const
const ok = <T>(value: T): ConsultationOutcome<T> => ({ kind: 'ok', value })
const forbidden = (reason: string) => ({ kind: 'forbidden', reason }) as const
const conflict = (message: string) => ({ kind: 'conflict', message }) as const
const invalid = (field: string, message: string) =>
  ({ kind: 'invalid', field, message }) as const

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/* ------------------------------------------------------------------ *
 * Reading rows
 * ------------------------------------------------------------------ */

/**
 * The columns every Discussion read selects: the row, its current Outcome
 * inline, and `activity_key`, the database's own microsecond rendering of
 * `last_activity_at` that the list cursor is built from (never a JS Date,
 * which holds milliseconds -- `shared/consultation.ts` says why).
 */
const DISCUSSION_COLUMNS = sql`
  d.id, d.folder_id, d.title, d.context, d.created_by, d.state,
  d.resolved_at, d.resolved_by, d.current_outcome_id, d.last_activity_at,
  d.created_at, d.updated_at, d.trashed_at, d.is_general,
  to_char(d.last_activity_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS activity_key,
  o.id AS o_id, o.statement AS o_statement, o.actor_id AS o_actor_id,
  o.source_comment_id AS o_source_comment_id, o.created_at AS o_created_at,
  d.task_id, lt.id AS lt_id, lt.title AS lt_title, lt.status AS lt_status`

/* The linked task (M5) is shown only while it is live and in the
   Discussion's own Folder, so the link never names a task its readers
   cannot open. */
const DISCUSSION_FROM = sql`
  discussions d
  LEFT JOIN discussion_outcomes o ON o.id = d.current_outcome_id
  LEFT JOIN tasks lt
    ON lt.id = d.task_id AND lt.folder_id = d.folder_id AND lt.deleted_at IS NULL`

function discussionFromRow(row: Record<string, unknown>): Discussion {
  const currentOutcome: Outcome | null =
    row.o_id === null || row.o_id === undefined
      ? null
      : {
          id: String(row.o_id),
          discussion_id: String(row.id),
          statement: String(row.o_statement),
          actor_id: String(row.o_actor_id),
          source_comment_id: stringOrNull(row.o_source_comment_id),
          created_at: toIso(row.o_created_at),
          current: true,
        }
  return {
    id: String(row.id),
    folder_id: String(row.folder_id),
    title: String(row.title),
    context: stringOrNull(row.context),
    created_by: String(row.created_by),
    state: row.state === 'resolved' ? 'resolved' : 'open',
    resolved_at: isoOrNull(row.resolved_at),
    resolved_by: stringOrNull(row.resolved_by),
    current_outcome_id: stringOrNull(row.current_outcome_id),
    current_outcome: currentOutcome,
    last_activity_at: toIso(row.last_activity_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    trashed_at: isoOrNull(row.trashed_at),
    is_general: row.is_general === true,
    task_id: stringOrNull(row.task_id),
    task:
      row.lt_id === null || row.lt_id === undefined
        ? null
        : {
            id: String(row.lt_id),
            title: String(row.lt_title),
            status:
              row.lt_status === 'completed' || row.lt_status === 'abandoned'
                ? row.lt_status
                : 'pending',
          },
  }
}

/** The list row's thread summary (W-C): how many posts, the newest one, and
 * its distinct authors, most recent first, at most five. */
function threadSummaryFromRow(
  row: Record<string, unknown>,
): Pick<Discussion, 'post_count' | 'last_post' | 'participant_ids'> {
  const ids: unknown =
    typeof row.participant_ids === 'string'
      ? JSON.parse(row.participant_ids)
      : row.participant_ids
  return {
    post_count: Number(row.post_count ?? 0),
    last_post:
      row.lp_author_id === null || row.lp_author_id === undefined
        ? null
        : {
            author_id: String(row.lp_author_id),
            preview: String(row.lp_preview ?? ''),
            created_at: toIso(row.lp_created_at),
          },
    participant_ids: Array.isArray(ids) ? ids.map(String) : [],
  }
}

function outcomeFromRow(
  row: Record<string, unknown>,
  currentOutcomeId: string | null,
): Outcome {
  const id = String(row.id)
  return {
    id,
    discussion_id: String(row.discussion_id),
    statement: String(row.statement),
    actor_id: String(row.actor_id),
    source_comment_id: stringOrNull(row.source_comment_id),
    created_at: toIso(row.created_at),
    current: currentOutcomeId === id,
  }
}

async function discussionById(
  executor: Executor,
  discussionId: string,
): Promise<Discussion | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT ${DISCUSSION_COLUMNS} FROM ${DISCUSSION_FROM}
         WHERE d.id = ${discussionId}::uuid`,
  )
  const row = rows[0]
  return row === undefined ? null : discussionFromRow(row)
}

interface LockedDiscussion {
  id: string
  folderId: string
  title: string
  createdBy: string
  state: 'open' | 'resolved'
  trashed: boolean
  /** The Folder's General discussion: the deployed client's Folder thread. */
  isGeneral: boolean
  /** The task it is about (M5), live or not; null when none. */
  taskId: string | null
}

/**
 * The Discussion row under `FOR UPDATE`, in the transaction that writes. The
 * `created_by` it answers is the `creatorId` every creator-stewardship
 * decision reads, so the decision and the write see one row.
 */
async function lockedDiscussion(
  tx: Executor,
  discussionId: string,
): Promise<LockedDiscussion | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, folder_id, title, created_by, state, trashed_at, is_general,
               task_id
          FROM discussions WHERE id = ${discussionId}::uuid
         FOR UPDATE`,
  )
  const row = rows[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    title: String(row.title),
    createdBy: String(row.created_by),
    state: row.state === 'resolved' ? 'resolved' : 'open',
    trashed: row.trashed_at !== null && row.trashed_at !== undefined,
    isGeneral: row.is_general === true,
    taskId: stringOrNull(row.task_id),
  }
}

/**
 * The General discussion is the currently deployed client's whole Folder
 * thread (4.31): resolving it freezes that thread's replies and trashing it
 * hides the thread (and the scheduler purges it after 30 days). Until the
 * Consultation UI ships, both are Full control's, the bar of
 * `discussion.purge` and every other act that can take a shared history
 * away from people who cannot see why. Ordinary Discussions are unaffected.
 */
function generalDecision(
  facts: FolderActorFacts,
  discussion: LockedDiscussion,
): { allowed: true } | { allowed: false; reason: string } {
  if (!discussion.isGeneral) return { allowed: true }
  const decision = mayPerform(facts, 'discussion.purge')
  if (decision.allowed) return decision
  return {
    allowed: false,
    reason:
      "Only people with Full control can resolve or remove the Folder's General discussion.",
  }
}

/**
 * Reopening or restoring a General discussion would make it open beside the
 * one a legacy post has since opened, which `discussions_one_open_general_key`
 * forbids. Checked under the Folder row's lock, the lock the legacy post takes
 * before it creates one, so the check and the write see one answer.
 */
async function anotherOpenGeneral(
  tx: Executor,
  discussion: LockedDiscussion,
): Promise<boolean> {
  if (!discussion.isGeneral) return false
  await tx.execute(
    sql`SELECT id FROM folders WHERE id = ${discussion.folderId}::uuid
        FOR NO KEY UPDATE`,
  )
  const rows = await rowsOf(
    tx,
    sql`SELECT 1 FROM discussions
         WHERE folder_id = ${discussion.folderId}::uuid
           AND id <> ${discussion.id}::uuid
           AND is_general AND state = 'open' AND trashed_at IS NULL`,
  )
  return rows.length > 0
}

const ANOTHER_GENERAL =
  'This Folder already has an open General discussion. Resolve it first.'

/**
 * The Folder a Discussion belongs to, for the route's 404 before it reads a
 * body. Null when the id names nothing. It says nothing about access: the
 * caller asks `accessOf` next, and both nulls are one 404.
 */
export async function folderOfDiscussion(
  executor: Executor,
  discussionId: string,
): Promise<string | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT folder_id FROM discussions WHERE id = ${discussionId}::uuid`,
  )
  const row = rows[0]
  return row === undefined ? null : String(row.folder_id)
}

/**
 * The Folder a live task belongs to, for `POST /tasks/:id/discussion`'s 404
 * before anything else. Null when the id names no task, or a deleted one.
 * Like `folderOfDiscussion` it says nothing about access.
 */
export async function folderOfTask(
  executor: Executor,
  taskId: string,
): Promise<string | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT folder_id FROM tasks
         WHERE id = ${taskId}::uuid AND deleted_at IS NULL`,
  )
  const row = rows[0]
  return row === undefined ? null : String(row.folder_id)
}

/**
 * The locked Discussion and the actor's facts over its live Folder, both read
 * in `tx`. Null is 404: no such row, a trashed Folder, or no membership.
 */
async function lockedWithFacts(
  tx: Executor,
  viewerId: string,
  discussionId: string,
): Promise<{ discussion: LockedDiscussion; facts: FolderActorFacts } | null> {
  const discussion = await lockedDiscussion(tx, discussionId)
  if (discussion === null) return null
  const facts = await folderActorFacts(tx, viewerId, discussion.folderId)
  if (facts === null) return null
  return { discussion, facts }
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/** `YYYY-MM-DDTHH:MI:SS[.ffffff]Z`, the only rendering this file mints, and a
 * real instant: a cursor naming 30 February is refused here rather than
 * reaching a `::timestamptz` cast as a 500. */
function cursorInstantIsReal(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,6})?Z$/.exec(value)
  if (match === null) return false
  const parsed = new Date(`${match[1] ?? ''}Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === match[1]
  )
}

function likePattern(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/**
 * `GET /folders/:id/discussions`. The caller has already been resolved to
 * `facts`; `discussion.read` is Can view, so every member passes it.
 *
 * Keyset order `last_activity_at DESC, id DESC`, which is
 * `discussions_folder_activity_idx` exactly, bounded by `limit`, with one row
 * over-read to know whether a next page exists. Trashed Discussions are
 * never listed here; they are in `GET /trash`.
 */
export async function listDiscussions(
  db: Db,
  facts: FolderActorFacts,
  query: DiscussionListQuery,
): Promise<ConsultationOutcome<DiscussionListResponse>> {
  let after: SQL = sql``
  if (query.cursor !== undefined && query.cursor !== '') {
    const cursor = decodeDiscussionCursor(query.cursor)
    if (cursor === null || !cursorInstantIsReal(cursor.lastActivityAt)) {
      return invalid('cursor', 'is not a cursor this list issued')
    }
    after = sql` AND (d.last_activity_at, d.id)
                   < (${cursor.lastActivityAt}::timestamptz, ${cursor.id}::uuid)`
  }
  const decision = mayPerform(facts, 'discussion.read')
  if (!decision.allowed) return forbidden(decision.reason)

  const state: SQL =
    query.state === 'all' ? sql`` : sql` AND d.state = ${query.state}`
  const search: SQL =
    query.q === undefined || query.q === ''
      ? sql``
      : sql` AND (d.title ILIKE ${likePattern(query.q)}
                  OR d.context ILIKE ${likePattern(query.q)})`
  /* The page is cut first, then each of its rows gains the thread summary
     (W-C) through three LATERAL reads over `comments_discussion_thread_idx`,
     so the summary costs one query for the page and nothing per Discussion
     outside it. Comments are hard-deleted, so every row counted is live. */
  const rows = await rowsOf(
    db,
    sql`WITH page AS (
          SELECT ${DISCUSSION_COLUMNS}, r.read_at AS viewer_read_at
            FROM ${DISCUSSION_FROM}
            LEFT JOIN discussion_reads r
              ON r.discussion_id = d.id AND r.user_id = ${facts.actorId}::uuid
           WHERE d.folder_id = ${facts.folderId}::uuid
             AND d.trashed_at IS NULL
             AND NOT ${UNSTARTED_TASK_THREAD}${state}${search}${after}
           ORDER BY d.last_activity_at DESC, d.id DESC
           LIMIT ${query.limit + 1})
        SELECT page.*, pc.post_count,
               lp.author_id AS lp_author_id, lp.preview AS lp_preview,
               lp.created_at AS lp_created_at, pp.ids AS participant_ids
          FROM page
          LEFT JOIN LATERAL (
            SELECT count(*)::int AS post_count FROM comments c
             WHERE c.discussion_id = page.id) pc ON true
          LEFT JOIN LATERAL (
            SELECT c.author_id, left(coalesce(c.body, ''), 140) AS preview,
                   c.created_at
              FROM comments c
             WHERE c.discussion_id = page.id
             ORDER BY c.created_at DESC, c.id DESC
             LIMIT 1) lp ON true
          LEFT JOIN LATERAL (
            SELECT coalesce(json_agg(a.author_id ORDER BY a.last_at DESC, a.author_id),
                            '[]'::json) AS ids
              FROM (SELECT c.author_id, max(c.created_at) AS last_at
                      FROM comments c
                     WHERE c.discussion_id = page.id
                     GROUP BY c.author_id
                     ORDER BY last_at DESC, c.author_id
                     LIMIT 5) a) pp ON true
         ORDER BY page.last_activity_at DESC, page.id DESC`,
  )
  const page = rows.slice(0, query.limit)
  const last = page[page.length - 1]
  const nextCursor =
    rows.length > query.limit && last !== undefined
      ? encodeDiscussionCursor({
          lastActivityAt: String(last.activity_key),
          id: String(last.id),
        })
      : null
  return ok({
    discussions: page.map((row) => ({
      ...discussionFromRow(row),
      ...threadSummaryFromRow(row),
      read_at: isoOrNull(row.viewer_read_at),
    })),
    next_cursor: nextCursor,
  })
}

/* ------------------------------------------------------------------ *
 * Create and read
 * ------------------------------------------------------------------ */

function contextValue(context: string | null | undefined): string | null {
  return context === undefined || context === null || context.trim() === ''
    ? null
    : context
}

export async function createDiscussion(
  db: Db,
  viewerId: string,
  folderId: string,
  body: CreateDiscussionBody,
): Promise<ConsultationOutcome<Discussion>> {
  return inTransaction(db, async (tx) => {
    const facts = await folderActorFacts(tx, viewerId, folderId)
    if (facts === null) return notFound
    const decision = mayPerform(facts, 'discussion.create')
    if (!decision.allowed) return forbidden(decision.reason)
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO discussions (folder_id, title, context, created_by)
          VALUES (${folderId}::uuid, ${body.title},
                  ${contextValue(body.context)}, ${viewerId}::uuid)
          RETURNING id`,
    )
    const id = String(inserted[0]?.id)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: facts.name,
      folderId,
      detail: 'started a discussion',
    })
    const made = await discussionById(tx, id)
    return made === null ? notFound : ok(made)
  })
}

/**
 * `GET /discussions/:id`. A trashed Discussion is 404 on this surface, as a
 * trashed facet is; it is read from `GET /trash`.
 */
export async function readDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<Discussion>> {
  const discussion = await discussionById(db, discussionId)
  if (discussion === null || discussion.trashed_at !== null) return notFound
  const facts = await folderActorFacts(db, viewerId, discussion.folder_id)
  if (facts === null) return notFound
  const decision = mayPerform(facts, 'discussion.read')
  if (!decision.allowed) return forbidden(decision.reason)
  const read = await rowsOf(
    db,
    sql`SELECT read_at FROM discussion_reads
         WHERE discussion_id = ${discussionId}::uuid
           AND user_id = ${viewerId}::uuid`,
  )
  return ok({ ...discussion, read_at: isoOrNull(read[0]?.read_at) })
}

/**
 * `PUT /discussions/:id/read`: the viewer has opened the thread now. Upserts
 * their `discussion_reads` row and, in the same transaction, marks read their
 * unread notifications about posts in this Discussion, so opening the thread
 * clears the bell for it. No event: reading is not an act the history keeps.
 * The route has already resolved existence and membership; a trashed
 * Discussion, or one gone since, is `not_found`.
 */
export async function markDiscussionRead(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<null>> {
  return inTransaction(db, async (tx) => {
    const found = await rowsOf(
      tx,
      sql`SELECT folder_id FROM discussions
           WHERE id = ${discussionId}::uuid AND trashed_at IS NULL`,
    )
    const folderId = found[0]?.folder_id
    if (folderId === undefined) return notFound
    const facts = await folderActorFacts(tx, viewerId, String(folderId))
    if (facts === null) return notFound
    const decision = mayPerform(facts, 'discussion.read')
    if (!decision.allowed) return forbidden(decision.reason)
    await tx.execute(
      sql`INSERT INTO discussion_reads (discussion_id, user_id, read_at)
          VALUES (${discussionId}::uuid, ${viewerId}::uuid, now())
          ON CONFLICT (discussion_id, user_id)
          DO UPDATE SET read_at = excluded.read_at`,
    )
    await tx.execute(
      sql`UPDATE notifications n SET read_at = now()
            FROM events e, comments c
           WHERE n.user_id = ${viewerId}::uuid
             AND n.read_at IS NULL
             AND e.id = n.event_id
             AND e.subject_kind = 'comment'
             AND c.id = e.subject_id
             AND c.discussion_id = ${discussionId}::uuid`,
    )
    return ok(null)
  })
}

/** `GET /discussions/:id/outcomes`: every Outcome, newest first, current or
 * not. Nothing here is ever edited, so each id reads what it always said. */
export async function listOutcomes(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<{ outcomes: Outcome[] }>> {
  const read = await readDiscussion(db, viewerId, discussionId)
  if (read.kind !== 'ok') return read
  const rows = await rowsOf(
    db,
    sql`SELECT id, discussion_id, statement, actor_id, source_comment_id,
               created_at
          FROM discussion_outcomes
         WHERE discussion_id = ${discussionId}::uuid
         ORDER BY created_at DESC, id DESC`,
  )
  return ok({
    outcomes: rows.map((row) =>
      outcomeFromRow(row, read.value.current_outcome_id),
    ),
  })
}

/**
 * `GET /outcomes/:id`, the Outcome's stable direct route (#320): the Outcome
 * and its parent Discussion, so a client opens the Discussion focused on it.
 * Readable exactly when the Discussion is, and 404 otherwise, whether or not
 * it exists.
 */
export async function readOutcome(
  db: Db,
  viewerId: string,
  outcomeId: string,
): Promise<ConsultationOutcome<{ outcome: Outcome; discussion: Discussion }>> {
  const rows = await rowsOf(
    db,
    sql`SELECT id, discussion_id, statement, actor_id, source_comment_id,
               created_at
          FROM discussion_outcomes WHERE id = ${outcomeId}::uuid`,
  )
  const row = rows[0]
  if (row === undefined) return notFound
  const read = await readDiscussion(db, viewerId, String(row.discussion_id))
  if (read.kind !== 'ok') return read
  return ok({
    outcome: outcomeFromRow(row, read.value.current_outcome_id),
    discussion: read.value,
  })
}

/* ------------------------------------------------------------------ *
 * Edit, resolve, reopen
 * ------------------------------------------------------------------ */

export async function updateDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
  body: UpdateDiscussionBody,
): Promise<ConsultationOutcome<Discussion>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedWithFacts(tx, viewerId, discussionId)
    if (found === null || found.discussion.trashed) return notFound
    const { discussion, facts } = found
    const decision = mayPerform(facts, 'discussion.edit', {
      creatorId: discussion.createdBy,
    })
    if (!decision.allowed) return forbidden(decision.reason)
    if (discussion.state !== 'open') {
      return conflict('A resolved Discussion is reopened before it is edited.')
    }
    let taskId = discussion.taskId
    if (body.task_id !== undefined && body.task_id !== discussion.taskId) {
      const link = await linkableTask(tx, discussion, body.task_id)
      if (link.kind !== 'ok') return link
      taskId = body.task_id
    }
    const title = body.title === undefined ? sql`title` : sql`${body.title}`
    const context =
      body.context === undefined
        ? sql`context`
        : sql`${contextValue(body.context)}`
    await tx.execute(
      sql`UPDATE discussions
             SET title = ${title}, context = ${context},
                 task_id = ${taskId}::uuid,
                 updated_at = now(), last_activity_at = now()
           WHERE id = ${discussionId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'edited a discussion',
    })
    const updated = await discussionById(tx, discussionId)
    return updated === null ? notFound : ok(updated)
  })
}

/**
 * Whether `discussion` may be linked to `taskId` (PATCH `task_id`, M5): the
 * link is set once, never on the General discussion, only to a live task of
 * the Discussion's own Folder (the id arrives in the body, so this check is
 * its authorization gate: a task elsewhere is one 422 whether or not it
 * exists), and only when that task has no other live Discussion. The task
 * row is locked as `discussTask` locks it, so the two cannot both link.
 */
async function linkableTask(
  tx: Executor,
  discussion: LockedDiscussion,
  taskId: string,
): Promise<ConsultationOutcome<null>> {
  if (discussion.taskId !== null) {
    return conflict('This discussion is already about a task.')
  }
  if (discussion.isGeneral) {
    return invalid('task_id', 'the General discussion is about the whole page')
  }
  const task = await rowsOf(
    tx,
    sql`SELECT 1 FROM tasks
         WHERE id = ${taskId}::uuid AND folder_id = ${discussion.folderId}::uuid
           AND deleted_at IS NULL
         FOR NO KEY UPDATE`,
  )
  if (task.length === 0) {
    return invalid('task_id', 'must name a task of this folder')
  }
  if ((await liveDiscussionOfTask(tx, taskId)) !== null) {
    return conflict(TASK_HAS_DISCUSSION)
  }
  return ok(null)
}

const TASK_HAS_DISCUSSION = 'This task already has a discussion.'

async function liveDiscussionOfTask(
  tx: Executor,
  taskId: string,
  except: string | null = null,
): Promise<string | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM discussions
         WHERE task_id = ${taskId}::uuid AND trashed_at IS NULL
           AND id IS DISTINCT FROM ${except}::uuid`,
  )
  return rows[0] === undefined ? null : String(rows[0].id)
}

/**
 * `POST /tasks/:id/discussion` (M5): the task's one live Discussion, made on
 * first use. The route has answered 404 for a task the caller cannot see;
 * this re-resolves both under the task row's lock, which every link writer
 * takes, so two calls at once make one Discussion and the second answers it.
 *
 * An existing live Discussion (open or resolved) is answered to any member,
 * `created: false`. Otherwise `discussion.create` decides, and the new one is
 * titled with the task as it reads now (cut to 4.31's 200); a later rename
 * of the task does not follow, because the link shows the live title.
 */
export async function discussTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<ConsultationOutcome<{ created: boolean; discussion: Discussion }>> {
  return inTransaction(db, async (tx) => {
    const task = await rowsOf(
      tx,
      sql`SELECT folder_id, title FROM tasks
           WHERE id = ${taskId}::uuid AND deleted_at IS NULL
           FOR NO KEY UPDATE`,
    )
    const row = task[0]
    if (row === undefined) return notFound
    const folderId = String(row.folder_id)
    const facts = await folderActorFacts(tx, viewerId, folderId)
    if (facts === null) return notFound
    const readable = mayPerform(facts, 'discussion.read')
    if (!readable.allowed) return forbidden(readable.reason)
    const existing = await liveDiscussionOfTask(tx, taskId)
    if (existing !== null) {
      const found = await discussionById(tx, existing)
      return found === null ? notFound : ok({ created: false, discussion: found })
    }
    const decision = mayPerform(facts, 'discussion.create')
    if (!decision.allowed) return forbidden(decision.reason)
    const title =
      Array.from(String(row.title).trim()).slice(0, DISCUSSION_TITLE_MAX).join('').trim() ||
      'Untitled task'
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO discussions (folder_id, task_id, title, created_by)
          VALUES (${folderId}::uuid, ${taskId}::uuid, ${title}, ${viewerId}::uuid)
          RETURNING id`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: facts.name,
      folderId,
      detail: 'started a discussion',
    })
    const made = await discussionById(tx, String(inserted[0]?.id))
    return made === null ? notFound : ok({ created: true, discussion: made })
  })
}

/**
 * `POST /discussions/:id/resolve`: a new Outcome, made current, and the
 * Discussion resolved, in one transaction (#320 "resolve + Outcome creation is
 * atomic"). Since Wave 2 (decision 3) `{}` resolves with no Outcome: the
 * thread is closed without a decision, `current_outcome_id` stays NULL.
 *
 * `source_comment_id` must be a comment **of this Discussion**; anything else
 * -- another Discussion's comment, a Task's, another Folder's, or no comment
 * -- is one 422, so the field cannot probe for comments elsewhere. Without a
 * `statement` the comment's body at this moment is the snapshot; with one,
 * the statement is, and the comment is provenance only.
 */
export async function resolveDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
  body: ResolveDiscussionBody,
): Promise<ConsultationOutcome<Discussion>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedWithFacts(tx, viewerId, discussionId)
    if (found === null || found.discussion.trashed) return notFound
    const { discussion, facts } = found
    const decision = mayPerform(facts, 'discussion.resolve', {
      creatorId: discussion.createdBy,
    })
    if (!decision.allowed) return forbidden(decision.reason)
    const general = generalDecision(facts, discussion)
    if (!general.allowed) return forbidden(general.reason)
    if (discussion.state !== 'open') {
      return conflict(
        'This Discussion is already resolved. Reopen it to record a new Outcome.',
      )
    }

    let statement = body.statement
    const sourceCommentId = body.source_comment_id ?? null
    if (sourceCommentId !== null) {
      const source = await rowsOf(
        tx,
        sql`SELECT body FROM comments
             WHERE id = ${sourceCommentId}::uuid
               AND discussion_id = ${discussionId}::uuid`,
      )
      const sourceRow = source[0]
      if (sourceRow === undefined) {
        return invalid('source_comment_id', 'is not a comment in this Discussion')
      }
      if (statement === undefined) {
        const snapshot = stringOrNull(sourceRow.body)?.trim() ?? ''
        if (snapshot === '') {
          return invalid(
            'statement',
            'is required when the source comment has no text',
          )
        }
        statement = snapshot
      }
    }

    /* Wave 2 decision 3 ("Close thread"): neither a statement nor a source
       comment closes the Discussion with no Outcome at all -- no row, and
       `current_outcome_id` NULL, which 0040's widened
       `discussions_resolution_check` admits for a resolved row. */
    let outcomeId: string | null = null
    if (statement !== undefined) {
      const inserted = await rowsOf(
        tx,
        sql`INSERT INTO discussion_outcomes
              (discussion_id, statement, actor_id, source_comment_id)
            VALUES (${discussionId}::uuid, ${statement}, ${viewerId}::uuid,
                    ${sourceCommentId})
            RETURNING id`,
      )
      outcomeId = String(inserted[0]?.id)
    }
    await tx.execute(
      sql`UPDATE discussions
             SET state = 'resolved', resolved_at = now(),
                 resolved_by = ${viewerId}::uuid,
                 current_outcome_id = ${outcomeId}::uuid,
                 updated_at = now(), last_activity_at = now()
           WHERE id = ${discussionId}::uuid`,
    )
    // #321: any open input round closes in this same transaction.
    await onDiscussionResolved(tx, discussionId)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'completed',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'resolved a discussion',
    })
    const resolved = await discussionById(tx, discussionId)
    return resolved === null ? notFound : ok(resolved)
  })
}

/**
 * `POST /discussions/:id/reopen`: back to open, the current pointer cleared,
 * and nothing deleted -- every Outcome stays addressable as a previous one.
 */
export async function reopenDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<Discussion>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedWithFacts(tx, viewerId, discussionId)
    if (found === null || found.discussion.trashed) return notFound
    const { discussion, facts } = found
    const decision = mayPerform(facts, 'discussion.reopen', {
      creatorId: discussion.createdBy,
    })
    if (!decision.allowed) return forbidden(decision.reason)
    if (discussion.state !== 'resolved') {
      return conflict('This Discussion is already open.')
    }
    if (await anotherOpenGeneral(tx, discussion)) return conflict(ANOTHER_GENERAL)
    await tx.execute(
      sql`UPDATE discussions
             SET state = 'open', resolved_at = NULL, resolved_by = NULL,
                 current_outcome_id = NULL,
                 updated_at = now(), last_activity_at = now()
           WHERE id = ${discussionId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'reopened',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'reopened a discussion',
    })
    const reopened = await discussionById(tx, discussionId)
    return reopened === null ? notFound : ok(reopened)
  })
}

/* ------------------------------------------------------------------ *
 * Trash: remove, restore, purge (7.13's lifecycle, the fourth kind)
 * ------------------------------------------------------------------ */

/**
 * #320's accidental-Discussion boundary: nobody but its creator has commented
 * on it, it has never had an Outcome (reopen keeps them, so "never" is any
 * row), and nobody else has given structured input (#321's hook).
 */
async function isUnshared(
  tx: Executor,
  discussion: LockedDiscussion,
): Promise<boolean> {
  const rows = await rowsOf(
    tx,
    sql`SELECT
          EXISTS (SELECT 1 FROM comments c
                   WHERE c.discussion_id = ${discussion.id}::uuid
                     AND c.author_id <> ${discussion.createdBy}::uuid)
            AS others_commented,
          EXISTS (SELECT 1 FROM discussion_outcomes o
                   WHERE o.discussion_id = ${discussion.id}::uuid)
            AS has_outcome`,
  )
  const row = rows[0]
  if (row?.others_commented === true || row?.has_outcome === true) return false
  return !(await discussionHasOtherInput(tx, discussion.id, discussion.createdBy))
}

/**
 * The governed rule first (`discussion.trash` / `discussion.restore`, Can
 * edit), then the creator's own-unshared path. The refusal carries the
 * governed rule's sentence, because that is what the caller lacks.
 */
async function lifecycleDecision(
  tx: Executor,
  facts: FolderActorFacts,
  discussion: LockedDiscussion,
  action: 'discussion.trash' | 'discussion.restore',
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const governed = mayPerform(facts, action)
  if (governed.allowed) return governed
  const own = mayPerform(facts, 'discussion.trash.own_unshared', {
    creatorId: discussion.createdBy,
  })
  if (own.allowed && (await isUnshared(tx, discussion))) return own
  return governed
}

/** `DELETE /discussions/:id`: to Trash, non-destructively. */
export async function trashDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<null>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedWithFacts(tx, viewerId, discussionId)
    if (found === null || found.discussion.trashed) return notFound
    const { discussion, facts } = found
    const decision = await lifecycleDecision(tx, facts, discussion, 'discussion.trash')
    if (!decision.allowed) return forbidden(decision.reason)
    const general = generalDecision(facts, discussion)
    if (!general.allowed) return forbidden(general.reason)
    await tx.execute(
      sql`UPDATE discussions SET trashed_at = now(), updated_at = now()
           WHERE id = ${discussionId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'moved a discussion to Trash',
    })
    return ok(null)
  })
}

/**
 * The actor's facts over a Discussion's Folder, which may be trashed: the
 * Trash acts need the facts `folderActorFacts` hides by default, exactly as
 * `trashedFacetFacts` does. Membership is still required.
 */
async function lockedTrashedWithFacts(
  tx: Executor,
  viewerId: string,
  discussionId: string,
): Promise<{
  discussion: LockedDiscussion
  facts: FolderActorFacts
  folderTrashed: boolean
} | null> {
  const discussion = await lockedDiscussion(tx, discussionId)
  if (discussion === null || !discussion.trashed) return null
  const facts = await folderActorFacts(tx, viewerId, discussion.folderId, {
    includeTrashed: true,
  })
  if (facts === null) return null
  const folder = await rowsOf(
    tx,
    sql`SELECT (deleted_at IS NOT NULL) AS trashed FROM folders
         WHERE id = ${discussion.folderId}::uuid`,
  )
  return { discussion, facts, folderTrashed: folder[0]?.trashed === true }
}

/**
 * `POST /discussions/:id/restore`. 409 while its Folder is itself in Trash:
 * the Folder comes back as one entry and its Discussions ride its fate.
 */
export async function restoreDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<Discussion>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedTrashedWithFacts(tx, viewerId, discussionId)
    if (found === null) return notFound
    const { discussion, facts } = found
    const decision = await lifecycleDecision(
      tx,
      facts,
      discussion,
      'discussion.restore',
    )
    if (!decision.allowed) return forbidden(decision.reason)
    if (found.folderTrashed) {
      return conflict('Restore the Folder first; its Discussions come back with it.')
    }
    if (discussion.state === 'open' && (await anotherOpenGeneral(tx, discussion))) {
      return conflict(ANOTHER_GENERAL)
    }
    // M5: a task has one live Discussion; this one waits while another is.
    // The task row's lock is the one `discussTask` takes before it creates.
    if (discussion.taskId !== null) {
      await tx.execute(
        sql`SELECT 1 FROM tasks WHERE id = ${discussion.taskId}::uuid
            FOR NO KEY UPDATE`,
      )
      if ((await liveDiscussionOfTask(tx, discussion.taskId, discussion.id)) !== null) {
        return conflict(TASK_HAS_DISCUSSION)
      }
    }
    await tx.execute(
      sql`UPDATE discussions SET trashed_at = NULL, updated_at = now()
           WHERE id = ${discussionId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'restored a discussion from Trash',
    })
    const restored = await discussionById(tx, discussionId)
    return restored === null ? notFound : ok(restored)
  })
}

/**
 * The 11.7 collection for Discussions, in `destroyTasks`'s shape: `doomed` is
 * a query answering discussion ids with its own lock clause.
 *
 * Deleting a Discussion cascades its Outcomes and its comments
 * (`comments_discussion_scope_fkey`), and with the comments their
 * `comment_files` rows -- the only reference anyone had to those uploads. So
 * the statement collects the files that hung on the doomed Discussions'
 * comments and on nothing else, and deletes those `files` rows; the caller
 * removes the bytes after the commit (7.15's order). A file also referenced
 * from a comment elsewhere, a page, or a cover stays.
 */
export async function destroyDiscussions(
  executor: Executor,
  doomed: SQL,
): Promise<{ discussionIds: string[]; fileIds: string[] }> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed}),
        victims AS (
          SELECT DISTINCT cf.file_id
            FROM comment_files cf
            JOIN comments c ON c.id = cf.comment_id
            JOIN doomed d ON d.id = c.discussion_id
           WHERE NOT EXISTS (
                   SELECT 1 FROM comment_files o
                   JOIN comments oc ON oc.id = o.comment_id
                   WHERE o.file_id = cf.file_id
                     AND (oc.discussion_id IS NULL
                          OR oc.discussion_id NOT IN (SELECT id FROM doomed)))
             AND NOT EXISTS (SELECT 1 FROM page_blocks b WHERE b.file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM folders fo WHERE fo.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM shelves s WHERE s.cover_file_id = cf.file_id)
             AND NOT EXISTS (SELECT 1 FROM user_page_covers u WHERE u.file_id = cf.file_id)),
        removed AS (
          DELETE FROM discussions WHERE id IN (SELECT id FROM doomed)
          RETURNING id)
        SELECT r.id AS discussion_id, NULL::uuid AS file_id FROM removed r
        UNION ALL
        SELECT NULL::uuid AS discussion_id, v.file_id FROM victims v`,
  )
  const discussionIds: string[] = []
  const fileIds: string[] = []
  for (const row of rows) {
    if (row.discussion_id !== null && row.discussion_id !== undefined) {
      discussionIds.push(String(row.discussion_id))
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
  return { discussionIds, fileIds }
}

/**
 * `DELETE /trash/discussions/:id`: `discussion.purge`, Full control with
 * ownership ignored. Only a trashed Discussion qualifies, so a permanent
 * delete is never a shorter road around Trash.
 */
export async function purgeDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<{ fileIds: string[] }>> {
  return inTransaction(db, async (tx) => {
    const found = await lockedTrashedWithFacts(tx, viewerId, discussionId)
    if (found === null) return notFound
    const { facts } = found
    const decision = mayPerform(facts, 'discussion.purge')
    if (!decision.allowed) return forbidden(decision.reason)
    const destroyed = await destroyDiscussions(
      tx,
      sql`SELECT id FROM discussions WHERE id = ${discussionId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'deleted a discussion permanently',
    })
    return ok({ fileIds: destroyed.fileIds })
  })
}

/**
 * The `discussions` array of `GET /trash`: membership is the scope, never who
 * trashed it (7.13), and a Discussion of a trashed Folder rides that Folder's
 * entry rather than appearing twice.
 */
export async function trashedDiscussions(
  db: Db,
  viewerId: string,
): Promise<TrashedDiscussion[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT d.id, d.title, d.folder_id, d.created_by, d.trashed_at,
               d.state, d.is_general,
               fo.name AS folder_name, m.access,
               (fo.owner_id = ${viewerId}) AS is_owner
          FROM discussions d
          ${joinVisibleFolder(viewerId, { folderId: sql`d.folder_id` })}
         WHERE d.trashed_at IS NOT NULL
         ORDER BY d.trashed_at DESC, d.id DESC`,
  )
  /* `restorable` is the restore route's own decision, read without the lock:
     a Trash row offers Restore only to a viewer the route would admit. */
  const factsByFolder = new Map<string, FolderActorFacts | null>()
  const listed: TrashedDiscussion[] = []
  for (const row of rows) {
    const folderId = String(row.folder_id)
    if (!factsByFolder.has(folderId)) {
      factsByFolder.set(
        folderId,
        await folderActorFacts(db, viewerId, folderId, { includeTrashed: true }),
      )
    }
    const facts = factsByFolder.get(folderId) ?? null
    const restorable =
      facts !== null &&
      (
        await lifecycleDecision(
          db,
          facts,
          {
            id: String(row.id),
            folderId,
            title: String(row.title),
            createdBy: String(row.created_by),
            state: row.state === 'resolved' ? 'resolved' : 'open',
            trashed: true,
            isGeneral: row.is_general === true,
            taskId: null,
          },
          'discussion.restore',
        )
      ).allowed
    listed.push({ ...shapeTrashedDiscussion(row, viewerId), restorable })
  }
  return listed
}

function shapeTrashedDiscussion(
  row: Record<string, unknown>,
  viewerId: string,
): TrashedDiscussion {
  const access = presetFromRow(row.access, viewerId, String(row.folder_id))
  return {
    id: String(row.id),
    title: String(row.title),
    folder_id: String(row.folder_id),
    folder_name: String(row.folder_name),
    deleted_at: toIso(row.trashed_at),
    created_by: String(row.created_by),
    is_owner: row.is_owner === true,
    my_access: access,
  }
}

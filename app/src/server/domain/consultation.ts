/*
The Consultation domain (issue #320, spec 7.28).

Issue #497 moves Discussion ↔ Task out of `discussions.task_id` and into the
`discussion_tasks` relation. The relation is a reference, not containment:
soft Trash preserves it, task moves do not move Discussions, and projections
show only live endpoints the viewer can currently read.
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
  LinkDiscussionTaskResponse,
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
  visibleFolder,
} from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { PAGE_TREE_EDIT_ACTION } from './page-tree.js'
import { ensureDiscussionTab, liveDiscussionTab, projectOf } from './project-tabs.js'
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

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ *
 * Reading rows
 * ------------------------------------------------------------------ */

/**
 * Discussion projections are viewer-relative only for `linked_tasks`.
 * Durable relation rows may point to a task in Trash or to a task that moved
 * into a Folder this viewer cannot read; neither endpoint leaks through the
 * other one. The edge itself remains in `discussion_tasks`.
 */
function discussionColumns(viewerId: string): SQL {
  return sql`
    d.id, d.folder_id, d.title, d.context, d.created_by, d.state,
    d.resolved_at, d.resolved_by, d.current_outcome_id, d.last_activity_at,
    d.created_at, d.updated_at, d.trashed_at, d.is_general,
    to_char(d.last_activity_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS activity_key,
    o.id AS o_id, o.statement AS o_statement, o.actor_id AS o_actor_id,
    o.source_comment_id AS o_source_comment_id, o.created_at AS o_created_at,
    COALESCE((
      SELECT json_agg(
               json_build_object(
                 'id', lt.id,
                 'title', lt.title,
                 'status', lt.status
               )
               ORDER BY lt.title, lt.id)
        FROM discussion_tasks dt
        JOIN tasks lt ON lt.id = dt.task_id
       WHERE dt.discussion_id = d.id
         AND lt.deleted_at IS NULL
         AND ${visibleFolder(sql`lt.folder_id`, viewerId)}
    ), '[]'::json) AS linked_tasks`
}

const DISCUSSION_FROM = sql`
  discussions d
  LEFT JOIN discussion_outcomes o ON o.id = d.current_outcome_id`

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
  const linkedTasks = arrayValue(row.linked_tasks).flatMap((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
    const task = value as Record<string, unknown>
    if (task.id === undefined || task.title === undefined) return []
    return [
      {
        id: String(task.id),
        title: String(task.title),
        status:
          task.status === 'completed'
            ? ('completed' as const)
            : task.status === 'abandoned'
              ? ('abandoned' as const)
              : ('pending' as const),
      },
    ]
  })
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
    linked_tasks: linkedTasks,
  }
}

function threadSummaryFromRow(
  row: Record<string, unknown>,
): Pick<Discussion, 'post_count' | 'last_post' | 'participant_ids'> {
  const ids = arrayValue(row.participant_ids)
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
    participant_ids: ids.map(String),
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
  viewerId: string,
  discussionId: string,
): Promise<Discussion | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT ${discussionColumns(viewerId)} FROM ${DISCUSSION_FROM}
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
  isGeneral: boolean
}

async function lockedDiscussion(
  tx: Executor,
  discussionId: string,
): Promise<LockedDiscussion | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, folder_id, title, created_by, state, trashed_at, is_general
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
  }
}

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
  const rows = await rowsOf(
    db,
    sql`WITH page AS (
          SELECT ${discussionColumns(facts.actorId)}, r.read_at AS viewer_read_at
            FROM ${DISCUSSION_FROM}
            JOIN folders df ON df.id = d.folder_id
            ${joinVisibleFolder(facts.actorId, { folder: 'df', member: 'dm' })}
            LEFT JOIN discussion_reads r
              ON r.discussion_id = d.id AND r.user_id = ${facts.actorId}::uuid
           WHERE df.project_id = (SELECT pf.project_id FROM folders pf WHERE pf.id = ${facts.folderId}::uuid)
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
    const made = await discussionById(tx, viewerId, id)
    return made === null ? notFound : ok(made)
  })
}

export async function readDiscussion(
  db: Db,
  viewerId: string,
  discussionId: string,
): Promise<ConsultationOutcome<Discussion>> {
  const folderId = await folderOfDiscussion(db, discussionId)
  if (folderId === null) return notFound
  const facts = await folderActorFacts(db, viewerId, folderId)
  if (facts === null) return notFound
  const decision = mayPerform(facts, 'discussion.read')
  if (!decision.allowed) return forbidden(decision.reason)
  const discussion = await discussionById(db, viewerId, discussionId)
  if (discussion === null || discussion.trashed_at !== null) return notFound
  const read = await rowsOf(
    db,
    sql`SELECT read_at FROM discussion_reads
         WHERE discussion_id = ${discussionId}::uuid
           AND user_id = ${viewerId}::uuid`,
  )
  return ok({ ...discussion, read_at: isoOrNull(read[0]?.read_at) })
}

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
 * Discussion ↔ Task relation and metadata edits (#497)
 * ------------------------------------------------------------------ */

/**
 * Add one edge while both endpoint rows are stable. The picker is project
 * scoped, so a Discussion on the Discussion tab can link a readable live Task
 * on Work or another page in the same project. The relation is still only a
 * reference: moving either endpoint later does not move the other one.
 */
async function addTaskLink(
  tx: Executor,
  viewerId: string,
  discussion: LockedDiscussion,
  taskId: string,
  createdViaTask: boolean,
): Promise<ConsultationOutcome<boolean>> {
  if (discussion.isGeneral) {
    return invalid('task_id', 'the General discussion is about the whole page')
  }
  const task = await rowsOf(
    tx,
    sql`SELECT t.id
          FROM tasks t
          JOIN folders tf ON tf.id = t.folder_id
          JOIN folders df ON df.id = ${discussion.folderId}::uuid
         WHERE t.id = ${taskId}::uuid
           AND t.deleted_at IS NULL
           AND tf.project_id = df.project_id
           AND ${visibleFolder(sql`t.folder_id`, viewerId)}
         FOR NO KEY UPDATE OF t`,
  )
  if (task.length === 0) {
    return invalid('task_id', 'must name a readable task of this project')
  }
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO discussion_tasks
          (discussion_id, task_id, created_via_task)
        VALUES (${discussion.id}::uuid, ${taskId}::uuid, ${createdViaTask})
        ON CONFLICT (discussion_id, task_id) DO NOTHING
        RETURNING discussion_id`,
  )
  return ok(inserted.length > 0)
}

async function touchDiscussion(tx: Executor, discussionId: string): Promise<void> {
  await tx.execute(
    sql`UPDATE discussions
           SET updated_at = now(), last_activity_at = now()
         WHERE id = ${discussionId}::uuid`,
  )
}

async function recordRelationEdit(
  tx: Executor,
  viewerId: string,
  facts: FolderActorFacts,
  detail: string,
): Promise<void> {
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'edited',
    subjectKind: 'folder',
    subjectId: facts.folderId,
    subjectName: facts.name,
    folderId: facts.folderId,
    detail,
  })
}

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

    let linkCreated = false
    if (body.task_id !== undefined) {
      const linked = await addTaskLink(tx, viewerId, discussion, body.task_id, false)
      if (linked.kind !== 'ok') return linked
      linkCreated = linked.value
    }

    const metadataChanged = body.title !== undefined || body.context !== undefined
    if (metadataChanged) {
      const title = body.title === undefined ? sql`title` : sql`${body.title}`
      const context =
        body.context === undefined
          ? sql`context`
          : sql`${contextValue(body.context)}`
      await tx.execute(
        sql`UPDATE discussions
               SET title = ${title}, context = ${context},
                   updated_at = now(), last_activity_at = now()
             WHERE id = ${discussionId}::uuid`,
      )
    } else if (linkCreated) {
      await touchDiscussion(tx, discussionId)
    }

    if (metadataChanged || linkCreated) {
      await recordRelationEdit(
        tx,
        viewerId,
        facts,
        metadataChanged ? 'edited a discussion' : 'linked a task to a discussion',
      )
    }
    const updated = await discussionById(tx, viewerId, discussionId)
    return updated === null ? notFound : ok(updated)
  })
}

/** Explicit #497 add-link route. Duplicate links are deliberate idempotent
 * success (`created: false`), never a surfaced unique-constraint error. */
export async function linkDiscussionTask(
  db: Db,
  viewerId: string,
  discussionId: string,
  taskId: string,
): Promise<ConsultationOutcome<LinkDiscussionTaskResponse>> {
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
    const linked = await addTaskLink(tx, viewerId, discussion, taskId, false)
    if (linked.kind !== 'ok') return linked
    if (linked.value) {
      await touchDiscussion(tx, discussionId)
      await recordRelationEdit(tx, viewerId, facts, 'linked a task to a discussion')
    }
    const projection = await discussionById(tx, viewerId, discussionId)
    return projection === null
      ? notFound
      : ok({ created: linked.value, discussion: projection })
  })
}

/** Explicit #497 unlink. The Task is intentionally not re-resolved: an edge
 * can outlive a move or soft Trash, and a user allowed to edit the Discussion
 * must be able to remove that stale reference without learning anything new
 * about the Task. Missing pairs are idempotent 204 at the route. */
export async function unlinkDiscussionTask(
  db: Db,
  viewerId: string,
  discussionId: string,
  taskId: string,
): Promise<ConsultationOutcome<null>> {
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
    if (discussion.isGeneral) {
      return invalid('task_id', 'the General discussion is about the whole page')
    }
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM discussion_tasks
           WHERE discussion_id = ${discussionId}::uuid
             AND task_id = ${taskId}::uuid
           RETURNING discussion_id`,
    )
    if (removed.length > 0) {
      await touchDiscussion(tx, discussionId)
      await recordRelationEdit(tx, viewerId, facts, 'unlinked a task from a discussion')
    }
    return ok(null)
  })
}

/**
 * `POST /tasks/:id/discussion` remains the create-new convenience used by the
 * current task UI. `created_via_task` records provenance only so repeated
 * calls can reuse the Discussion this route made in the Task's *current*
 * Folder. Other linked Discussions never suppress creation. After a Task
 * move the old Discussion stays put and a new convenience Discussion may be
 * created in the destination Folder.
 */
export async function discussTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<ConsultationOutcome<{ created: boolean; discussion: Discussion; discussionTabId: string | null }>> {
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

    const mayCreate = mayPerform(facts, 'discussion.create')
    const project = await projectOf(tx, folderId)
    const rootFacts = project === null ? null : await folderActorFacts(tx, viewerId, project)
    const mayAddTab =
      mayCreate.allowed && rootFacts !== null && !rootFacts.isDefault &&
      mayPerform(rootFacts, PAGE_TREE_EDIT_ACTION).allowed
    const tabId = mayAddTab
      ? await ensureDiscussionTab(tx, viewerId, folderId)
      : project === null ? null : await liveDiscussionTab(tx, project)
    const discussionTabId =
      tabId !== null && (await folderActorFacts(tx, viewerId, tabId)) !== null ? tabId : null

    const existing = await rowsOf(
      tx,
      sql`SELECT d.id
            FROM discussion_tasks dt
            JOIN discussions d ON d.id = dt.discussion_id
           WHERE dt.task_id = ${taskId}::uuid
             AND dt.created_via_task
             AND d.folder_id = ${folderId}::uuid
             AND d.trashed_at IS NULL
           ORDER BY d.created_at ASC, d.id ASC
           LIMIT 1`,
    )
    if (existing[0]?.id !== undefined) {
      const found = await discussionById(tx, viewerId, String(existing[0].id))
      return found === null ? notFound : ok({ created: false, discussion: found, discussionTabId })
    }

    if (!mayCreate.allowed) return forbidden(mayCreate.reason)
    const title =
      Array.from(String(row.title).trim()).slice(0, DISCUSSION_TITLE_MAX).join('').trim() ||
      'Untitled task'
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO discussions (folder_id, title, created_by)
          VALUES (${folderId}::uuid, ${title}, ${viewerId}::uuid)
          RETURNING id`,
    )
    const discussionId = String(inserted[0]?.id)
    await tx.execute(
      sql`INSERT INTO discussion_tasks
            (discussion_id, task_id, created_via_task)
          VALUES (${discussionId}::uuid, ${taskId}::uuid, true)`,
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
    const made = await discussionById(tx, viewerId, discussionId)
    return made === null ? notFound : ok({ created: true, discussion: made, discussionTabId })
  })
}

/* ------------------------------------------------------------------ *
 * Resolve and reopen
 * ------------------------------------------------------------------ */

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
    const resolved = await discussionById(tx, viewerId, discussionId)
    return resolved === null ? notFound : ok(resolved)
  })
}

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
    const reopened = await discussionById(tx, viewerId, discussionId)
    return reopened === null ? notFound : ok(reopened)
  })
}

/* ------------------------------------------------------------------ *
 * Trash: soft lifecycle preserves relation rows; permanent purge cascades
 * only the relation rows through 0066's foreign keys.
 * ------------------------------------------------------------------ */

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
    const restored = await discussionById(tx, viewerId, discussionId)
    return restored === null ? notFound : ok(restored)
  })
}

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

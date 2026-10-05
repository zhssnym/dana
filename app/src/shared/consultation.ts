/*
The Consultation contract: a Folder's Discussions, resolved by recording an
Outcome (migration 0029). State is `open | resolved`. Outcomes are append-only:
a changed conclusion is reopen then resolve again, so old Outcome ids keep
their meaning. A thread may also close with no Outcome. `context` is plain text.
*/
import { z } from 'zod'

import { taskStatus } from './tasks.js'

export const DISCUSSION_STATES = ['open', 'resolved'] as const
export type DiscussionState = (typeof DISCUSSION_STATES)[number]

/** `discussions_title_length_check`: 1..200 after trimming. */
export const DISCUSSION_TITLE_MAX = 200
/** `discussions_context_length_check`, the comment body's own limit. */
export const DISCUSSION_CONTEXT_MAX = 4000
/** `discussion_outcomes_statement_length_check`: 1..4000 after trimming,
 * 4000 so that `Use as outcome` can snapshot any comment whole. */
export const OUTCOME_STATEMENT_MAX = 4000
/** The migrated General discussion's title. Display only: use `is_general`. */
export const GENERAL_DISCUSSION_TITLE = 'General discussion'

export const DISCUSSION_LIST_LIMIT_DEFAULT = 50
export const DISCUSSION_LIST_LIMIT_MAX = 100

/** One `discussion_outcomes` row. Immutable once written. */
export const outcomeSchema = z.object({
  id: z.uuid(),
  discussion_id: z.uuid(),
  statement: z.string(),
  actor_id: z.uuid(),
  /** Set by `Use as outcome`; nulled if that comment is deleted. The statement is a snapshot. */
  source_comment_id: z.uuid().nullable(),
  created_at: z.string(),
  /** Whether this is the Discussion's current Outcome. */
  current: z.boolean(),
})
export type Outcome = z.infer<typeof outcomeSchema>

/** A Task reference, only while the viewer can read the Task. */
export const linkedTaskSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: taskStatus,
})
export type LinkedTask = z.infer<typeof linkedTaskSchema>

export const discussionSchema = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  title: z.string(),
  context: z.string().nullable(),
  created_by: z.uuid(),
  state: z.enum(DISCUSSION_STATES),
  resolved_at: z.string().nullable(),
  resolved_by: z.uuid().nullable(),
  current_outcome_id: z.uuid().nullable(),
  /** Null when open or closed without a decision. */
  current_outcome: outcomeSchema.nullable(),
  /** List rows only. */
  post_count: z.number().int().optional(),
  /** Newest post; preview is at most 140 chars, empty for pictures only. */
  last_post: z.object({ author_id: z.uuid(), preview: z.string(), created_at: z.string() }).nullable().optional(),
  /** Distinct post authors, most recent first, at most 5. */
  participant_ids: z.array(z.uuid()).optional(),
  /** Last time this viewer opened the thread; list and GET /discussions/:id only. */
  read_at: z.string().nullable().optional(),
  last_activity_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Non-null when the Discussion is in Trash. */
  trashed_at: z.string().nullable(),
  /** The Folder's General discussion (a flag, not the title). Resolving or
   * trashing it needs Full control; it never has Task links. */
  is_general: z.boolean(),
  /** Live Tasks linked to it that the viewer can read; others are omitted. */
  linked_tasks: z.array(linkedTaskSchema),
})
export type Discussion = z.infer<typeof discussionSchema>

export interface DiscussionListResponse {
  discussions: Discussion[]
  /** Null on the last page. */
  next_cursor: string | null
}

const title = z
  .string()
  .trim()
  .min(1)
  .max(DISCUSSION_TITLE_MAX)

const context = z.string().max(DISCUSSION_CONTEXT_MAX)

/** POST a Discussion into a Folder's Consultation. */
export const createDiscussionBody = z.object({
  title,
  /** Empty or absent is stored as null. */
  context: context.nullable().optional(),
})
export type CreateDiscussionBody = z.infer<typeof createDiscussionBody>

/** PATCH, only while open. `task_id` adds a link (never replaces); prefer
 * POST /discussions/:id/tasks. */
export const updateDiscussionBody = z
  .object({
    title: title.optional(),
    /** null or '' clears the context. */
    context: context.nullable().optional(),
    task_id: z.uuid().optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.context !== undefined ||
      body.task_id !== undefined,
    { error: 'must change title, context or add a task link' },
  )
export type UpdateDiscussionBody = z.infer<typeof updateDiscussionBody>

/** Adding an existing pair answers 200 with `created: false`. */
export const linkDiscussionTaskBody = z.object({ task_id: z.uuid() })
export type LinkDiscussionTaskBody = z.infer<typeof linkDiscussionTaskBody>

export const linkDiscussionTaskResponse = z.object({
  created: z.boolean(),
  discussion: discussionSchema,
})
export type LinkDiscussionTaskResponse = z.infer<typeof linkDiscussionTaskResponse>

/**
 * Resolve. `statement` records an Outcome; `source_comment_id` snapshots that
 * comment unless `statement` is also sent. `{}` closes with no Outcome.
 */
export const resolveDiscussionBody = z
  .object({
    statement: z.string().trim().min(1).max(OUTCOME_STATEMENT_MAX).optional(),
    source_comment_id: z.uuid().optional(),
  })
export type ResolveDiscussionBody = z.infer<typeof resolveDiscussionBody>

/** An Outcome is only ever created by resolving. */
export const recordOutcomeBody = resolveDiscussionBody
export type RecordOutcomeBody = ResolveDiscussionBody

export const reopenDiscussionBody = z.object({})

export const DISCUSSION_LIST_STATES = ['open', 'resolved', 'all'] as const
export type DiscussionListState = (typeof DISCUSSION_LIST_STATES)[number]

/** Most recent activity first (`discussions_folder_activity_idx`), trashed excluded. */
export const discussionListQuery = z.object({
  state: z.enum(DISCUSSION_LIST_STATES).default('all'),
  /** Case-insensitive substring over title and context. */
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DISCUSSION_LIST_LIMIT_MAX)
    .default(DISCUSSION_LIST_LIMIT_DEFAULT),
})
export type DiscussionListQuery = z.infer<typeof discussionListQuery>

/*
Cursor: the last row's (last_activity_at, id). Build it from the database's
text of the timestamp, never a JS Date, which drops microseconds.
*/
const CURSOR_PATTERN =
  /^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:.]+(?:Z|[+-][0-9:]+)?)~([0-9a-f-]{36})$/i

export interface DiscussionCursor {
  lastActivityAt: string
  id: string
}

export function encodeDiscussionCursor(cursor: DiscussionCursor): string {
  return `${cursor.lastActivityAt}~${cursor.id}`
}

/** Null when malformed; routes answer 422. */
export function decodeDiscussionCursor(raw: string): DiscussionCursor | null {
  const match = CURSOR_PATTERN.exec(raw)
  if (match === null) return null
  const [, lastActivityAt, id] = match
  if (lastActivityAt === undefined || id === undefined) return null
  return { lastActivityAt, id }
}

/*
The Consultation contract (issue #320, product authority #212 R1, R2, R4),
which both sides import: a Folder's Consultation is a list of Discussions, and
a Discussion is resolved by recording an Outcome.

Storage is migration 0029: `discussions`, `discussion_outcomes`, and
`comments.discussion_id`. The rules this file restates rather than invents:

- **State is exactly `open | resolved`.** There are no Discussion types.
- **Resolving always creates a new Outcome**, and it becomes current in the
  same transaction (`discussions_resolution_check` makes a resolved row
  without a current Outcome impossible). So "Record outcome" *is* the resolve
  body, and "Use as outcome" is the same body naming `source_comment_id`.
- **Outcomes are append-only.** Nothing edits a statement. A changed
  conclusion is reopen (which clears `current_outcome_id` and deletes
  nothing) then resolve again (a new Outcome). Every earlier Outcome id keeps
  resolving to exactly what it said.
- **`context` is plain text**, at most 4000 characters, not rich content.

**A request field declared here and read by no route is dropped with a 200**
(the silent-drop hazard `shared/tasks.ts` describes); nothing below is
`.strict()`. Every field must be read by the Consultation routes.
*/
import { z } from 'zod'

export const DISCUSSION_STATES = ['open', 'resolved'] as const
export type DiscussionState = (typeof DISCUSSION_STATES)[number]

/** `discussions_title_length_check`: 1..200 after trimming. */
export const DISCUSSION_TITLE_MAX = 200
/** `discussions_context_length_check`, the comment body's own limit. */
export const DISCUSSION_CONTEXT_MAX = 4000
/** `discussion_outcomes_statement_length_check`: 1..4000 after trimming,
 * 4000 so that `Use as outcome` can snapshot any comment whole. */
export const OUTCOME_STATEMENT_MAX = 4000
/** The title migration 0029 gave each Folder's migrated conversation, and
 * the legacy post gives the one it creates. Display only: which Discussion
 * is the General one is `is_general`, never this title. */
export const GENERAL_DISCUSSION_TITLE = 'General discussion'

export const DISCUSSION_LIST_LIMIT_DEFAULT = 50
export const DISCUSSION_LIST_LIMIT_MAX = 100

/* ------------------------------------------------------------------ *
 * Response shapes
 * ------------------------------------------------------------------ */

/** One `discussion_outcomes` row. Immutable once written. */
export const outcomeSchema = z.object({
  id: z.uuid(),
  discussion_id: z.uuid(),
  statement: z.string(),
  actor_id: z.uuid(),
  /** Set when made by `Use as outcome`; nulled if that comment is later
   * deleted. The statement is a snapshot and never follows the comment. */
  source_comment_id: z.uuid().nullable(),
  created_at: z.string(),
  /** Server-derived: whether this is its Discussion's current Outcome. An
   * Outcome that is not current is previous (superseded or reopened past). */
  current: z.boolean(),
})
export type Outcome = z.infer<typeof outcomeSchema>

/** One `discussions` row as the API answers it. */
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
  /** The current Outcome inline, so a list row can show it; null when open. */
  current_outcome: outcomeSchema.nullable(),
  last_activity_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  /** Non-null when the Discussion is in Trash. */
  trashed_at: z.string().nullable(),
  /** The Folder's General discussion: the thread the pre-Consultation client
   * reads and writes as the Folder conversation (4.31). A flag, not the
   * title, so renaming it changes nothing. Resolving or trashing it needs
   * Full control. */
  is_general: z.boolean(),
})
export type Discussion = z.infer<typeof discussionSchema>

export interface DiscussionListResponse {
  discussions: Discussion[]
  /** Opaque; absent/null when this is the last page. */
  next_cursor: string | null
}

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

const title = z
  .string()
  .trim()
  .min(1)
  .max(DISCUSSION_TITLE_MAX)

const context = z.string().max(DISCUSSION_CONTEXT_MAX)

/** POST a Discussion into a Folder's Consultation. */
export const createDiscussionBody = z.object({
  title,
  /** Plain text. Empty or absent is stored as null. */
  context: context.nullable().optional(),
})
export type CreateDiscussionBody = z.infer<typeof createDiscussionBody>

/** PATCH a Discussion's metadata. Only while open (#320). */
export const updateDiscussionBody = z
  .object({
    title: title.optional(),
    /** null or '' clears the context. */
    context: context.nullable().optional(),
  })
  .refine((body) => body.title !== undefined || body.context !== undefined, {
    error: 'must change title or context',
  })
export type UpdateDiscussionBody = z.infer<typeof updateDiscussionBody>

/**
 * Resolve, which always records a new current Outcome.
 *
 * - `Record outcome`: send `statement`.
 * - `Use as outcome`: send `source_comment_id`; the server snapshots that
 *   comment's body as the statement unless `statement` is also sent, in
 *   which case `statement` is the snapshot and the comment is provenance.
 *   The comment must belong to this Discussion.
 */
export const resolveDiscussionBody = z
  .object({
    statement: z.string().trim().min(1).max(OUTCOME_STATEMENT_MAX).optional(),
    source_comment_id: z.uuid().optional(),
  })
  .refine(
    (body) => body.statement !== undefined || body.source_comment_id !== undefined,
    { error: 'an Outcome needs a statement or a source comment', path: ['statement'] },
  )
export type ResolveDiscussionBody = z.infer<typeof resolveDiscussionBody>

/** "Record outcome" is the resolve body: an Outcome is only ever created by
 * resolving (reopen first when already resolved). */
export const recordOutcomeBody = resolveDiscussionBody
export type RecordOutcomeBody = ResolveDiscussionBody

/** Reopen carries nothing. */
export const reopenDiscussionBody = z.object({})

/* ------------------------------------------------------------------ *
 * The list query
 * ------------------------------------------------------------------ */

export const DISCUSSION_LIST_STATES = ['open', 'resolved', 'all'] as const
export type DiscussionListState = (typeof DISCUSSION_LIST_STATES)[number]

/**
 * GET a Folder's Discussions: most recent activity first
 * (`last_activity_at DESC, id DESC`, served by
 * `discussions_folder_activity_idx`), trashed ones excluded.
 */
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
The cursor is the last row's (last_activity_at, id), keyset order.

**Build it from the database's own text of `last_activity_at`**
(`last_activity_at::text` or an ISO rendering at microsecond precision), never
from a JS Date: timestamptz holds microseconds and a Date holds milliseconds,
so a cursor through a Date resumes at the wrong row (shared/views.ts, Q6).
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

/** null for anything malformed; a route answers 422 on null. */
export function decodeDiscussionCursor(raw: string): DiscussionCursor | null {
  const match = CURSOR_PATTERN.exec(raw)
  if (match === null) return null
  const [, lastActivityAt, id] = match
  if (lastActivityAt === undefined || id === undefined) return null
  return { lastActivityAt, id }
}

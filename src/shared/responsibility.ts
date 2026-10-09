/*
The Responsibility document, one per membership, versioned whole. Never parse
it for permissions. Each schema's .transform() fixes key order so the JSON's
sha256 is a stable content identity; blocks refuse unknown keys so nothing is
silently dropped from a stored document.
*/
import { z } from 'zod'

import { richContent } from './rich-content.js'
import { folderAccessPreset } from './folder-access.js'

/** Payload version. A reader refuses a version it does not know. */
export const RESPONSIBILITY_DOCUMENT_VERSION = 1

export const MAX_RESPONSIBILITY_BLOCKS = 200

/** Bullet depth 0 to 2. */
export const MAX_RESPONSIBILITY_BULLET_DEPTH = 2

export const MAX_RESPONSIBILITY_HEADING_LEVEL = 3

export const MAX_RESPONSIBILITY_BYTES = 256 * 1024

const paragraphBlock = z
  .object({ kind: z.literal('paragraph'), content: richContent })
  .catchall(z.never())
  .transform(({ kind, content }) => ({ kind, content }))

const bulletBlock = z
  .object({
    kind: z.literal('bullet'),
    content: richContent,
    depth: z
      .int()
      .min(0)
      .max(MAX_RESPONSIBILITY_BULLET_DEPTH, {
        error: `must be at most ${MAX_RESPONSIBILITY_BULLET_DEPTH}`,
      }),
  })
  .catchall(z.never())
  .transform(({ kind, content, depth }) => ({ kind, content, depth }))

const headingBlock = z
  .object({
    kind: z.literal('heading'),
    content: richContent,
    level: z
      .int()
      .min(1)
      .max(MAX_RESPONSIBILITY_HEADING_LEVEL, {
        error: `must be at most ${MAX_RESPONSIBILITY_HEADING_LEVEL}`,
      }),
  })
  .catchall(z.never())
  .transform(({ kind, content, level }) => ({ kind, content, level }))

export const responsibilityBlock = z.discriminatedUnion('kind', [
  paragraphBlock,
  bulletBlock,
  headingBlock,
])
export type ResponsibilityBlock = z.infer<typeof responsibilityBlock>

export const responsibilityDocument = z
  .object({
    version: z.literal(RESPONSIBILITY_DOCUMENT_VERSION, {
      error: `must be ${RESPONSIBILITY_DOCUMENT_VERSION}`,
    }),
    blocks: z.array(responsibilityBlock).max(MAX_RESPONSIBILITY_BLOCKS, {
      error: `must hold at most ${MAX_RESPONSIBILITY_BLOCKS} blocks`,
    }),
  })
  .catchall(z.never())
  .superRefine((value, ctx) => {
    if (
      new TextEncoder().encode(JSON.stringify(value)).length >
      MAX_RESPONSIBILITY_BYTES
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'This Responsibility document is too large.',
      })
    }
  })
  // Key order is fixed here only; `blocks` is copied so the caller's array is never hashed.
  .transform(({ version, blocks }) => ({ version, blocks: [...blocks] }))
export type ResponsibilityDocument = z.infer<typeof responsibilityDocument>

/**
 * The canonical payload of a member with no document, so "none" and "empty"
 * are one state: saving it against no document writes nothing.
 */
export const EMPTY_RESPONSIBILITY: ResponsibilityDocument = {
  version: RESPONSIBILITY_DOCUMENT_VERSION,
  blocks: [],
}

/**
 * PUT /folders/:id/members/:userId/responsibility. `base_revision` is the
 * content hash last read; stale is 409. No mutation_id: the body is the whole
 * state, so a replay equals the current content and writes nothing.
 */
export const putResponsibilityBody = z.object({
  content: responsibilityDocument,
  base_revision: z
    .string()
    .min(1, { error: 'is required' })
    .max(128, { error: 'must be at most 128 characters' }),
})
export type PutResponsibilityBody = z.infer<typeof putResponsibilityBody>

/**
 * Its own route, not a field on the Access patch, which admits self-edits: a
 * member must not grant themselves this.
 */
export const putSelfEditGrantBody = z.object({ enabled: z.boolean() })
export type PutSelfEditGrantBody = z.infer<typeof putSelfEditGrantBody>

export const responsibilityActor = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})
export type ResponsibilityActor = z.infer<typeof responsibilityActor>

/** History transitions: two content revisions plus standing changes, in one ordered list. */
export const RESPONSIBILITY_TRANSITIONS = [
  'responsibility_created',
  'responsibility_updated',
  'responsibility_ended',
  'self_edit_granted',
  'self_edit_revoked',
] as const
export type ResponsibilityTransition =
  (typeof RESPONSIBILITY_TRANSITIONS)[number]
export const responsibilityTransition = z.enum(RESPONSIBILITY_TRANSITIONS)

export const RESPONSIBILITY_REVISION_TRANSITIONS = [
  'responsibility_created',
  'responsibility_updated',
] as const

/**
 * One history entry. `revision_no` and `content` are both present (a revision)
 * or both null (a standing change); a CHECK enforces it. `actor` is never null.
 */
export const responsibilityHistoryEntry = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  member_id: z.uuid(),
  responsibility_id: z.uuid().nullable(),
  transition: responsibilityTransition,
  revision_no: z.int().positive().nullable(),
  content: responsibilityDocument.nullable(),
  actor: responsibilityActor,
  effective_at: z.iso.datetime(),
})
export type ResponsibilityHistoryEntry = z.infer<
  typeof responsibilityHistoryEntry
>

/**
 * A member's current standing. `revision` is never null (no document has the
 * empty payload's hash), so a first save is an ordinary concurrency write.
 * `content` null means no document; empty `blocks` means deliberately cleared.
 */
export const responsibilityStanding = z.object({
  responsibility_id: z.uuid().nullable(),
  revision: z.string(),
  current_revision_id: z.uuid().nullable(),
  revision_no: z.int().nonnegative(),
  content: responsibilityDocument.nullable(),
  updated_at: z.iso.datetime().nullable(),
  updated_by: responsibilityActor.nullable(),
  /** False once the membership ended; revisions stay with the Folder. */
  active: z.boolean(),
})
export type ResponsibilityStanding = z.infer<typeof responsibilityStanding>

export const getResponsibilityResponse = z.object({
  member_id: z.uuid(),
  responsibility: responsibilityStanding,
})
export type GetResponsibilityResponse = z.infer<
  typeof getResponsibilityResponse
>

/** `committed` false is a no-op: the content already was the current content. */
export const putResponsibilityResponse = z.object({
  member_id: z.uuid(),
  committed: z.boolean(),
  responsibility: responsibilityStanding,
})
export type PutResponsibilityResponse = z.infer<
  typeof putResponsibilityResponse
>

/** Newest first, capped at 1000 rows with `truncated` (10.3). */
export const getResponsibilityHistoryResponse = z.object({
  entries: z.array(responsibilityHistoryEntry),
  truncated: z.boolean(),
})
export type GetResponsibilityHistoryResponse = z.infer<
  typeof getResponsibilityHistoryResponse
>

/**
 * Member details for the member panel. The `viewer_may_*` flags only decide
 * whether to draw a control; routes still decide what may happen.
 */
export const folderMemberDetails = z.object({
  user: responsibilityActor,
  is_owner: z.boolean(),
  joined_at: z.iso.datetime(),
  bio: z.string().nullable(),
  bio_content: richContent.nullable(),
  bio_author: responsibilityActor.nullable(),
  bio_last_editor: responsibilityActor.nullable(),
  bio_updated_at: z.iso.datetime().nullable(),
  viewer_may_edit_bio: z.boolean(),

  access: folderAccessPreset,
  viewer_may_change_access: z.boolean(),

  can_edit_own_responsibilities: z.boolean(),
  viewer_may_change_self_edit_grant: z.boolean(),
  viewer_may_edit_responsibility: z.boolean(),

  responsibility: responsibilityStanding,

  /* Pending Tasks assigned to this member; informational, never Responsibility truth. */
  assigned_open_task_count: z.int().nonnegative(),

  history: z.object({
    responsibility_path: z.string(),
    access_path: z.string(),
  }),
})
export type FolderMemberDetails = z.infer<typeof folderMemberDetails>

export const getFolderMemberDetailsResponse = folderMemberDetails
export const patchMemberBioBody = z.object({
  bio: z.string().trim().max(500).nullable().optional(),
  content: richContent.nullable().optional(),
  base_updated_at: z.iso.datetime().nullable().optional(),
}).superRefine((body, ctx) => {
  if ((body.bio === undefined) === (body.content === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'Send bio or content.' })
  }
  if (body.content !== null && body.content !== undefined) {
    const text = body.content.runs.map((run) => run.text).join('').trim()
    if (text.length > 500 || body.content.runs.some((run) => run.mention !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: 'Overview supports up to 500 characters, with bold, italic, and links.' })
    }
  }
})
export type GetFolderMemberDetailsResponse = z.infer<
  typeof getFolderMemberDetailsResponse
>

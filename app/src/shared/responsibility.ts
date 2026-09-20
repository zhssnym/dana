/*
The Responsibility document contract, shared by the browser, the server and
the suite (issue #230; product authority #209 R5 for the representation, R7
section O for the self-edit grant, R10 and the accepted R10B for the
lifecycle and the revisions).

## What a Responsibility is, in one paragraph, because everything here follows
## from it

It is **one rich document belonging to a member's membership in one Folder**:
optional, Folder-visible in M1, the authoritative current statement of what
that person is expected to handle — and **not** authorization. R5 rejected the
atomic-statement model (R-A) and the single plain-text field (R-B) and chose
R-C, so nothing here makes a paragraph a semantic row and nothing here parses
the prose. #230 says it outright and it is the sentence worth repeating where
somebody might be tempted: *Responsibility text must never be parsed or
inferred to grant permission.*

## Why the document is a snapshot rather than a block table

The Folder page (`page-document.ts`) stores one row per block, because blocks
there carry identity that Tasks, images and the outline all point at. A
Responsibility document has no such traffic: nothing links to a bullet inside
one, and R5 says in terms not to require "one database semantic record per
bullet/paragraph". So the canonical payload below is the whole document, and
it is stored and versioned whole. That is also what makes the revision rule
cheap to state: a revision **is** a snapshot of this object.

## The canonical payload, which is the load-bearing idea in this file

Two saves are "the same" when their **canonical payloads are equal**, never
when the objects are identical, and the canonicalization is the parse. Every
schema below ends in a `.transform()` that rebuilds its object with a fixed
key order and with absent optional keys genuinely absent, so
`JSON.stringify(parsed)` is a canonical form and its sha256 is a content
identity two clients can compute independently. That is what
`identical replay produces no duplicate revision` means (R10, #230 acceptance
proof 9), and it is why it cannot be got wrong by a client that reorders its
keys or sends `bold: undefined`.

`richContent` from `rich-content.ts` is reused rather than re-declared: it
already fixes its own key order, already caps a paragraph at 4000 characters
and 64 KiB, and already refuses an unsafe `href` while admitting an internal
`/...` one, which is what "Dana Links where the shared safe composer supports
them" resolves to today. A second rich-text dialect would be a second thing
to keep safe.

## Why the block objects refuse unknown keys

`.catchall(z.never())`, which `richContent` itself uses, in the leaf module
this file imports it from. 11.14's ruling — no `.strict()` on request bodies — is
about request *envelopes*, where an unknown key is a client sending something
this version does not know about and 7.0 tolerates it. This is different: the
object is **stored and replayed as the truth of what somebody wrote**, so a
silently dropped key is a document that does not round-trip (#230 acceptance
proof 24), and it would also make the canonical hash disagree with the bytes
the author sent.
*/
import { z } from 'zod'

import { richContent } from './rich-content.js'
import { folderAccessPreset } from './folder-access.js'

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

/**
 * The payload version. R5 asks for "future-safe document versioning": a
 * reader that meets a version it does not know refuses rather than guesses,
 * and a later shape bumps this rather than widening the union in place.
 */
export const RESPONSIBILITY_DOCUMENT_VERSION = 1

/** A document holds at most this many blocks. Chosen an order of magnitude
 * below the page's 500: a Responsibility that needs 200 paragraphs is a
 * personnel record, which R5 puts in M2 and #230 forbids approximating here. */
export const MAX_RESPONSIBILITY_BLOCKS = 200

/** Bullets nest three levels, 0 to 2, on `MAX_SECTION_DEPTH`'s precedent:
 * the ceiling is written down exactly once and raising it is a contract
 * change. */
export const MAX_RESPONSIBILITY_BULLET_DEPTH = 2

/** Headings are "lightweight" (#230), which is the page's three levels. */
export const MAX_RESPONSIBILITY_HEADING_LEVEL = 3

/** The whole serialized document is capped well below the page transaction's
 * 2 MiB. It is one member's statement of scope, not a workspace. */
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
  // The canonicalization. Key order is fixed here and nowhere else, and
  // `blocks` is rebuilt rather than passed through so that the array the
  // caller owns can never be the array that is hashed.
  .transform(({ version, blocks }) => ({ version, blocks: [...blocks] }))
export type ResponsibilityDocument = z.infer<typeof responsibilityDocument>

/**
 * The canonical payload of a member who has **no** Responsibility document.
 *
 * This is the decision that makes "no document" and "an empty document" one
 * state rather than two, and it is worth stating rather than discovering.
 * #230 requires both that a member may have zero Responsibility "without
 * fabricated content" (proof 1) and that a no-op save creates no revision
 * (proof 9). If an absent document had no canonical payload, a client that
 * saved an empty document against a member who had none would either
 * fabricate a row or get an answer the rule does not cover. Treating absence
 * as this value settles both: saving it against a member who has none writes
 * nothing at all, and saving it against a member who has content is an
 * ordinary change that clears the document and keeps every prior revision.
 */
export const EMPTY_RESPONSIBILITY: ResponsibilityDocument = {
  version: RESPONSIBILITY_DOCUMENT_VERSION,
  blocks: [],
}

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

/**
 * PUT /folders/:id/members/:userId/responsibility.
 *
 * `base_revision` is the content identity the caller last read, and it is
 * required. R10: "stale concurrent edits must resolve using the same
 * optimistic-concurrency discipline as Dana's current page-document model
 * rather than silently overwriting another person's revision" — so this is
 * `documentTransaction.base_revision` under a different roof, the same
 * sha256-of-the-canonical-payload token, refused the same way with a 409.
 *
 * There is deliberately **no `mutation_id`** and no receipts table beside
 * this one, which is the one place this contract departs from the page
 * document's. The page needs a retry identity because its operations are
 * relative — `create_task` twice creates two Tasks — so a replayed
 * transaction is not the same as the original. This body carries the whole
 * intended state absolutely, so a replay is recognised by the state itself:
 * a commit whose content already equals the current content writes nothing
 * and answers the current revision. #230 asks for "idempotent retry/mutation
 * identity **where required**", and here it is not.
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
 * PUT /folders/:id/members/:userId/self-edit-grant.
 *
 * R7 section O's grant as a boolean and nothing else. It is its own route
 * rather than a field on the Access patch because it is a different act
 * governed by a different action: the Access patch admits a member lowering
 * *themselves*, and a grant that admitted the same shape would be a member
 * granting themselves the right to write their own Responsibility.
 */
export const putSelfEditGrantBody = z.object({ enabled: z.boolean() })
export type PutSelfEditGrantBody = z.infer<typeof putSelfEditGrantBody>

/* ------------------------------------------------------------------ *
 * Projections
 * ------------------------------------------------------------------ */

/** 7.0's person shape, as every other projection on this surface uses it. */
export const responsibilityActor = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})
export type ResponsibilityActor = z.infer<typeof responsibilityActor>

/**
 * The append-only record's transition vocabulary.
 *
 * Three of the five carry content and are the "revisions" R10 requires; two
 * record the standing changes that #230 wants history-visible — the self-edit
 * grant being toggled, and active Responsibility standing ending with the
 * membership. They share one table and one ordered read because the member
 * panel renders them as one list, and splitting them would make the panel
 * merge two feeds and guess at the order.
 */
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

/** The transitions that carry a content snapshot: the revisions proper. */
export const RESPONSIBILITY_REVISION_TRANSITIONS = [
  'responsibility_created',
  'responsibility_updated',
] as const

/**
 * One entry of the append-only record.
 *
 * `revision_no` and `content` are present together or absent together, which
 * the table's own CHECK enforces as well as this schema: an entry with
 * content is a revision, and an entry without is a standing change.
 *
 * `actor` is never null. Unlike Access history, which admits a null actor for
 * the migration that initialized the model, nothing here is written by the
 * system: 0025 creates no Responsibility documents, because R10's "do not
 * fabricate" applies to a migration more than to anything else.
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
 * The current Responsibility standing of one member, which is what both the
 * document read and the member-details projection carry.
 *
 * `revision` is the concurrency token and is **never null**: a member with no
 * document has the canonical empty payload's hash, so a client always has
 * something to send as `base_revision` and the first save of a member's first
 * document is an ordinary optimistic-concurrency write rather than a special
 * case.
 *
 * `content` *is* nullable, and the difference from `revision` is the point:
 * null means there is no document, and #230 proof 1 is that nothing fabricates
 * one. A client renders the empty state from `content === null` and never
 * from an empty `blocks` array, which is a document somebody deliberately
 * cleared.
 */
export const responsibilityStanding = z.object({
  responsibility_id: z.uuid().nullable(),
  revision: z.string(),
  current_revision_id: z.uuid().nullable(),
  revision_no: z.int().nonnegative(),
  content: responsibilityDocument.nullable(),
  updated_at: z.iso.datetime().nullable(),
  updated_by: responsibilityActor.nullable(),
  /** True while the member is active. False on a document whose membership
   * ended: R10 keeps the revisions with the Folder and stops showing the
   * document as an active member Responsibility. */
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

/**
 * The answer to a commit. `committed` false is the no-op: the content the
 * caller sent already *is* the current content, so no revision was written
 * and the standing returned is the one that was already there.
 */
export const putResponsibilityResponse = z.object({
  member_id: z.uuid(),
  committed: z.boolean(),
  responsibility: responsibilityStanding,
})
export type PutResponsibilityResponse = z.infer<
  typeof putResponsibilityResponse
>

export const getResponsibilityHistoryResponse = z.object({
  entries: z.array(responsibilityHistoryEntry),
})
export type GetResponsibilityHistoryResponse = z.infer<
  typeof getResponsibilityHistoryResponse
>

/* ------------------------------------------------------------------ *
 * The member-details read contract (#230 "Member-details backend contract")
 * ------------------------------------------------------------------ */

/**
 * One Folder-contextual member, in the five logical groups #230 names.
 *
 * It is a read contract for a UI this issue deliberately does not build, so
 * every group carries exactly what #230 lists and nothing invented beside it.
 * Two fields are *viewer-dependent* and say so in their names — a projection
 * that told everybody what they may do would be a projection that
 * authorizes, which R8A forbids in terms. They answer "should this control be
 * rendered", and the answer to "may this happen" is still only the route's.
 */
export const folderMemberDetails = z.object({
  /* Identity */
  user: responsibilityActor,
  is_owner: z.boolean(),
  joined_at: z.iso.datetime(),

  /* Access (#228) */
  access: folderAccessPreset,
  viewer_may_change_access: z.boolean(),

  /* The self-edit grant (#230). Folder-visible like Access itself: knowing
     who may write their own Responsibility is part of reading the roster. */
  can_edit_own_responsibilities: z.boolean(),
  viewer_may_change_self_edit_grant: z.boolean(),
  viewer_may_edit_responsibility: z.boolean(),

  /* Responsibilities */
  responsibility: responsibilityStanding,

  /* Current work: informational only, and #230 says so twice. It is a count
     of the Folder's `pending` Tasks currently assigned to this member -- 4.5's
     word for open work -- and it is never Responsibility truth. */
  assigned_open_task_count: z.int().nonnegative(),

  /* History affordance: the two routes a panel calls, rather than a payload
     it would otherwise have to be told how to build. R9A keeps the general
     History browser out of M1 and this is the "lightweight affordance" it
     admits instead. */
  history: z.object({
    responsibility_path: z.string(),
    access_path: z.string(),
  }),
})
export type FolderMemberDetails = z.infer<typeof folderMemberDetails>

export const getFolderMemberDetailsResponse = folderMemberDetails
export type GetFolderMemberDetailsResponse = z.infer<
  typeof getFolderMemberDetailsResponse
>

/*
The 7.27 Folder facet domain (issue #210, M1-F).

Routes validate and map outcomes to statuses; every decision that touches rows
is here, behind the 10.2 rule that no query leaves this file without being
scoped to the viewer or to a folder the caller has already resolved access on.
Results are discriminated unions rather than thrown statuses, which is
`domain/folders.ts`'s shape and for its reason.

## The four things to know before reading it

**Natives are created with the folder and never lazily.** `createNativeFacets`
runs inside `POST /folders`' own transaction, beside the owner membership
(7.4), and migration 0027 backfilled the four for every folder that already
existed. Lazy creation would mean a GET writes, two members race
`folder_facets_folder_native_kind_idx`, and a Can-view member's read either
creates rows or answers differently from a Can-edit member's. #210's "stable
internal identity" is a fact of the folder rather than of whoever looked first.

**A facet's name is resolved on the read and stored nowhere.** `resolveFacetName`
is the one function that knows the rule, and a Work facet's name is its H1
block's `text` **at this moment** -- so renaming the heading renames the facet,
and there is deliberately no rename path that could disagree with it.

**A private facet is invisible to every other member, Full control and the
structural owner included.** That is `facet.read` in the action table, which
has no preset bar at all, and here it is the `AND (owner_id IS NULL OR
owner_id = <viewer>)` clause written **inside the FROM clause** of every read,
so a query that forgot the gate would return nothing rather than somebody
else's writing.

**A document-bearing facet uses 4.17's `page_blocks` scoped by `facet_id`.** #210 began with blank facets; #211 adds native Purpose; #213 adds native Results on the same terms.
`applyFacetDocument` below is a facet-scoped sibling of
`domain/page-document.ts`'s `applyDocument` rather than a parameterization of
it, and that is a decision worth stating. The folder page's applier carries
Tasks, Sections, folder references, a `files` scope and a previous-outline
diff. A facet refuses `create_task`, semantic `section` and `folder_ref`; #211
admits list nesting for a facet-homed list item while keeping Section membership
folder-only. Threading a third home through that function
would have put a branch inside every one of those rules; what is here instead
is the subset a facet actually admits, with the refusals named. The **wire
contract is 7.16's, unchanged**: the same `document_transaction` body, the
same `base_revision` token, the same `{revision, blocks, items}` read.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  DEFAULT_FACET_NAMES,
  isBlankFacetKind,
  isDocumentNativeFacetKind,
  isHideableFacetKind,
  isNativeFacetKind,
  isRenameableFacetKind,
} from '../../shared/facets.js'
import type { Facet, FacetKind } from '../../shared/facets.js'
import type {
  DocumentOperation,
  DocumentTransaction,
  PageBlock,
  PageView,
} from '../../shared/pages.js'
import type { TrashedFacet } from '../../shared/trash.js'
import { isListKind } from '../../shared/page-document.js'
import { fileReclaimedAt } from './pages.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash } from './document-hash.js'
import { recordEvent } from './events.js'
import { mayPerform, presetOf } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { initialKeys, keyBetween } from './fractional-index.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/**
 * The name rule, and the only place it is written. Exported because 7.22's
 * export resolves a facet's name exactly
 * as 7.27 does -- a second copy of this rule is how an export comes to read
 * back tabs nobody recognises.
 *
 * Main and Consultation are fixed. Purpose and Results are their override or
 * their default, and **NULL is the default rather than an absence**, which is
 * why Reset is a write of NULL rather than a write of the word. A Work facet
 * is its H1's text, read on this row by the join in `facetSelect`; an H1 whose
 * text is empty answers the empty string, because that is what the heading
 * says and inventing a name for it would be a second source.
 */
export function resolveFacetName(
  kind: FacetKind,
  displayName: string | null,
  h1Text: string | null,
): string {
  if (kind === 'work') return h1Text ?? ''
  if (isBlankFacetKind(kind)) return displayName ?? ''
  if (isRenameableFacetKind(kind)) {
    return displayName ?? DEFAULT_FACET_NAMES[kind as 'purpose' | 'results']
  }
  return DEFAULT_FACET_NAMES[kind as 'main' | 'consultation']
}

function facetFromRow(row: Record<string, unknown>): Facet {
  const kind = String(row.kind) as FacetKind
  const displayName = nullableString(row.display_name)
  const ownerId = nullableString(row.owner_id)
  return {
    id: String(row.id),
    kind,
    name: resolveFacetName(kind, displayName, nullableString(row.h1_text)),
    display_name: displayName,
    hidden: row.hidden === true,
    /* A projection of `owner_id`, and they cannot disagree:
       `folder_facets_owner_kind_check` makes the two equivalent in the
       database. Sent because a client drawing #210's privacy treatment should
       not have to know that. */
    private: ownerId !== null,
    owner_id: ownerId,
    position: String(row.position),
    h1_block_id: nullableString(row.h1_block_id),
    updated_at: toIso(row.updated_at),
  }
}

/* ------------------------------------------------------------------ *
 * The read
 * ------------------------------------------------------------------ */

/**
 * Every facet of one folder that one viewer may see, in 7.27's effective
 * order.
 *
 * **The privacy scope is in the FROM clause.** `owner_id IS NULL OR owner_id =
 * <viewer>` is what makes a private facet absent from every other member's
 * read rather than filtered out afterwards by somebody who remembered; the
 * caller has already resolved folder membership, and this is the second scope
 * on top of it.
 *
 * **The stored position is the order** (round 2). Main used to be forced
 * first here; tabs are now dragged freely on the row, so Main (shown as
 * "Work") sits wherever a person put it. A folder nobody has reordered still
 * holds its creation keys, Main first, and the client draws that as the default
 * Purpose · Work · Results · Discussion.
 */
function facetSelect(viewerId: string, folderId: string, extra: SQL = sql``): SQL {
  return sql`
    SELECT f.id, f.kind, f.owner_id, f.display_name, f.hidden, f.position,
           f.h1_block_id, f.updated_at, f.deleted_at,
           h1.text AS h1_text
      FROM folder_facets f
      LEFT JOIN page_blocks h1 ON h1.id = f.h1_block_id
     WHERE f.folder_id = ${folderId}::uuid
       AND (f.owner_id IS NULL OR f.owner_id = ${viewerId}::uuid)${extra}
     ORDER BY f.position ASC, f.id ASC`
}

export async function listFacets(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<Facet[]> {
  const rows = await rowsOf(
    db,
    facetSelect(viewerId, folderId, sql` AND f.deleted_at IS NULL`),
  )
  return rows.map(facetFromRow)
}

/**
 * The owning Folder of one live native Purpose or Results facet, before viewer access is
 * considered. The route that exposes this fact immediately resolves that
 * Folder through `accessOf`; keeping the two steps separate is deliberate so
 * the id-bearing route carries the same explicit Folder gate as every other
 * facet read while still refusing a missing/other-kind/deleted facet alike.
 *
 * Hidden is deliberately absent: hide is presentation state and a valid Dana
 * Link may still focus a hidden Purpose without changing the shared setting.
 */
export async function nativeDocumentFacetFolderId(
  db: Db,
  facetId: string,
): Promise<string | null> {
  const found = await rowsOf(
    db,
    sql`SELECT ff.folder_id
          FROM folder_facets ff
          JOIN folders fo ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
         WHERE ff.id = ${facetId}::uuid
           AND ff.kind IN ('purpose', 'results')
           AND ff.deleted_at IS NULL`,
  )
  const row = found[0]
  return row === undefined ? null : String(row.folder_id)
}

/* ------------------------------------------------------------------ *
 * Creating the natives with the folder (7.4)
 * ------------------------------------------------------------------ */

/**
 * The four native facets, in the same transaction as the folder and its owner
 * membership.
 *
 * The positions are `initialKeys(4)` -- `a0`, `a1`, `a2`, `a3` -- which is
 * exactly what migration 0027's backfill wrote as literals, because a
 * migration cannot call this function. The two must stay in step.
 *
 * `created_by` is provenance and never authority (#228's authorship rule): it
 * is the folder's creator here and the actor everywhere else, and no gate ever
 * reads it.
 */
export async function createNativeFacets(
  tx: Executor,
  folderId: string,
  creatorId: string,
): Promise<void> {
  const keys = initialKeys(4)
  const values = (['main', 'purpose', 'consultation', 'results'] as const).map(
    (kind, index) =>
      sql`(${folderId}::uuid, ${kind}, ${keys[index] as string}, ${creatorId}::uuid)`,
  )
  await tx.execute(
    sql`INSERT INTO folder_facets (folder_id, kind, position, created_by)
        VALUES ${sql.join(values, sql`, `)}`,
  )
}

/**
 * Every private facet one person holds in one folder, deleted permanently
 * with its blocks.
 *
 * A private facet is the owner's own writing that no other member may ever
 * read, so nothing in the folder has a claim on it once the owner is gone.
 * When a membership ends by any path it goes with them.
 *
 * **Deleted and not trashed**, which is the whole point. A `deleted_at` here would leave a row nobody may read -- the former
 * member is no longer in the folder, so `trashedFacets` cannot see it, and
 * every other member is refused by `facet.read`, which admits no preset -- and
 * nobody may restore, because restoring needs a membership that has ended.
 * That is an orphan with a thirty-day clock on it, and the adversarial review
 * of 16ce81b found it one step earlier: the row simply survived.
 *
 * `page_blocks_facet_id_fkey` is `ON DELETE CASCADE`, so the document goes in
 * the same statement. `files` rows are the folder's and survive, to be
 * reclaimed by 7.19's own sweep if nothing else wears them.
 *
 * **Shared facets are untouched.** They are Folder data, and a person leaving
 * takes none of it -- the same rule `tasks` keeps two statements away in
 * R-CLEAN, where a leaver's assignments are unassigned rather than deleted.
 */
export async function deletePrivateFacetsOf(
  tx: Executor,
  folderId: string,
  memberId: string,
): Promise<string[]> {
  const removed = await rowsOf(
    tx,
    sql`DELETE FROM folder_facets
         WHERE folder_id = ${folderId}::uuid AND owner_id = ${memberId}::uuid
         RETURNING id`,
  )
  return removed.map((row) => String(row.id))
}

/* ------------------------------------------------------------------ *
 * The locked read every write begins with
 * ------------------------------------------------------------------ */

interface LockedFacet {
  id: string
  folderId: string
  kind: FacetKind
  ownerId: string | null
  displayName: string | null
  hidden: boolean
  position: string
  h1BlockId: string | null
  updatedAt: string
  deletedAt: string | null
}

/**
 * One facet of this folder, under `FOR UPDATE`, or null.
 *
 * **Reading it under the lock is the whole of the transactional requirement
 * `whenOwnPrivateFacet` carries**, which is #228's Assigned-work rule said for
 * a different column: the `owner_id` a gate reads must be the one the write
 * will see, so that a facet converted to shared a moment ago cannot authorize
 * through a projection that is merely fresh. Every caller below reads this and
 * hands `ownerId` to `mayPerform` as `facetOwnerId`.
 *
 * It is deliberately **not** scoped by `owner_id`, unlike `facetSelect`: a
 * write path must be able to tell "somebody else's private facet" from "no
 * such row" in order to answer 404 for both deliberately rather than by
 * accident, and to refuse a share of a facet that is not the actor's.
 */
async function lockedFacet(
  tx: Executor,
  folderId: string,
  facetId: string,
  /**
   * `false` for a pure read, and read the sentence under it before passing
   * `true` anywhere new.
   *
   * **A lock is only worth taking in the transaction that writes.** Commit 16ce81b
   * added this argument and its commit message claimed the lock "is what makes
   * the `owner_id` a gate reads the one the write will see"; that claim was
   * **false as the code then stood**, and the adversarial review of that commit
   * said so. `facetPageGate` opened a transaction of its own, took
   * `FOR UPDATE`, and **committed** -- releasing the lock -- before
   * `applyFacetDocument` opened a second transaction to do the writing. A
   * conversion landing between the two was authorized by a row the write never
   * saw, which is precisely the window the lock exists to close.
   *
   * It is true now because the gate and the write are one transaction:
   * `facetPageGateIn` is called *inside* `applyFacetDocument`'s own
   * `inTransaction`, and `facetPageGate` below is the read-only wrapper the
   * GET uses, which locks nothing.
   */
  lock = true,
): Promise<LockedFacet | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT id, folder_id, kind, owner_id, display_name, hidden, position,
               h1_block_id, updated_at, deleted_at
          FROM folder_facets
         WHERE id = ${facetId}::uuid AND folder_id = ${folderId}::uuid
         ${lock ? sql`FOR UPDATE` : sql``}`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    kind: String(row.kind) as FacetKind,
    ownerId: nullableString(row.owner_id),
    displayName: nullableString(row.display_name),
    hidden: row.hidden === true,
    position: String(row.position),
    h1BlockId: nullableString(row.h1_block_id),
    updatedAt: toIso(row.updated_at),
    deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : toIso(row.deleted_at),
  }
}

/**
 * Whether this facet is one the viewer may see at all (10.2).
 *
 * A private facet belonging to somebody else answers the same as a row that
 * does not exist, which is why both are `null` at every call site.
 */
function visibleTo(facet: LockedFacet, viewerId: string): boolean {
  return facet.ownerId === null || facet.ownerId === viewerId
}

/* ------------------------------------------------------------------ *
 * Outcomes
 * ------------------------------------------------------------------ */

/** A 422 the route turns into `sendFieldValidationError`, naming the field. */
export interface FacetFieldRefusal {
  kind: 'invalid'
  field: string
  message: string
}

export type FacetOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | FacetFieldRefusal
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; message: string }

const notFound = { kind: 'not_found' } as const
const invalid = (field: string, message: string): FacetFieldRefusal => ({
  kind: 'invalid',
  field,
  message,
})
const conflict = (message: string) => ({ kind: 'conflict', message }) as const

/* ------------------------------------------------------------------ *
 * POST /folders/:id/facets
 * ------------------------------------------------------------------ */

export interface CreateFacetInput {
  kind: FacetKind
  h1BlockId?: string | undefined
  displayName?: string | undefined
  afterFacetId?: string | null | undefined
}

/**
 * The refusal order, and the reason it is this way round:
 * **existence first** (10.2, so nothing leaks), **then the body**, because an
 * authority refusal must be able to name what it refused, **then the preset**,
 * **then state**, which is only meaningful on a body already valid and an
 * actor already permitted.
 *
 * The caller has already answered 404 for a non-member. What is left here is
 * 422, then 403, then the 409 the partial unique index enforces in this same
 * transaction.
 */
export async function createFacet(
  db: Db,
  facts: FolderActorFacts,
  input: CreateFacetInput,
): Promise<FacetOutcome<Facet>> {
  return inTransaction(db, async (tx) => {
    const folderId = facts.folderId
    const actorId = facts.actorId

    if (isNativeFacetKind(input.kind)) {
      return invalid(
        'kind',
        'a native facet exists from the moment the Folder does and is not created',
      )
    }
    if (input.kind === 'work') {
      if (input.h1BlockId === undefined) {
        return invalid('h1_block_id', 'a Work facet names the H1 it is a view of')
      }
      if (input.displayName !== undefined) {
        return invalid(
          'display_name',
          "a Work facet's name is its H1's and is not set here",
        )
      }
      /* A depth-1 Section of *this* folder's page. Depth is the
         `section_block_id` relation and nothing else (4.17, #218): a Section
         with no parent Section is an H1. Scoped to the folder, so a block id
         from somewhere else answers the same 422 as one that does not exist
         and discloses nothing either way (10.2). */
      const heading = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM page_blocks
             WHERE id = ${input.h1BlockId}::uuid
               AND folder_id = ${folderId}::uuid
               AND kind = 'section'
               AND section_block_id IS NULL`,
      )
      if (heading.length === 0) {
        return invalid(
          'h1_block_id',
          "must name an H1 section of this Folder's own page",
        )
      }
    } else {
      if (input.h1BlockId !== undefined) {
        return invalid(
          'h1_block_id',
          'only a Work facet is a view of an H1',
        )
      }
      if (input.displayName === undefined) {
        return invalid('display_name', 'a blank facet is created with a name')
      }
    }

    /* 403, and `facetOwnerId` is the actor exactly when the requested facet
       would be the actor's own private one. Nothing else may pass it, which
       is what keeps `whenOwnPrivateFacet` from admitting Can contribute to
       create shared structure. */
    const decision = mayPerform(facts, 'facet.create', {
      facetOwnerId: input.kind === 'private_blank' ? actorId : null,
    })
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }

    const position = await positionAfter(
      tx,
      actorId,
      folderId,
      input.afterFacetId ?? undefined,
    )
    if (position === null) {
      return invalid('after_facet_id', 'must name a facet of this Folder you can see')
    }

    /* The 409 is the database's, in this transaction, rather than a read
       followed by a write: two members creating a Work facet over one H1 at
       once both pass a SELECT and one loses the unique index. Caught by
       SQLSTATE and never by the server's prose, which this cluster
       translates. */
    let inserted
    try {
      inserted = await rowsOf(
        tx,
        sql`INSERT INTO folder_facets
              (folder_id, kind, owner_id, display_name, position, h1_block_id, created_by)
            VALUES (${folderId}::uuid, ${input.kind},
                    ${input.kind === 'private_blank' ? actorId : null}::uuid,
                    ${input.displayName ?? null},
                    ${position},
                    ${input.h1BlockId ?? null}::uuid,
                    ${actorId}::uuid)
            RETURNING id`,
      )
    } catch (error) {
      if (uniqueViolation(error)) {
        return conflict('That heading already has a Work facet.')
      }
      throw error
    }
    const id = String(inserted[0]?.id)
    await recordEvent(tx, {
      actorId,
      verb: 'created',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: facts.name,
      folderId,
      detail: 'added a facet',
    })
    const created = await rowsOf(
      tx,
      facetSelect(actorId, folderId, sql` AND f.id = ${id}::uuid`),
    )
    const row = created[0]
    if (row === undefined) return notFound
    return { kind: 'ok', value: facetFromRow(row) } as const
  })
}

/** SQLSTATE 23505. Never the message: the server's prose is translated into
 * the cluster's language, so nothing may read it. */
function uniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (code === '23505') return true
  const cause = (error as { cause?: unknown } | null)?.cause
  return cause !== undefined && cause !== null && uniqueViolation(cause)
}

/**
 * A position immediately after `afterFacetId`, or at the end when it is
 * absent. Null when the anchor names nothing the caller can see.
 *
 * The anchor is read through the viewer's own scope, so a private facet of
 * somebody else's is not an anchor anybody can aim at.
 */
async function positionAfter(
  tx: Executor,
  viewerId: string,
  folderId: string,
  afterFacetId: string | undefined,
): Promise<string | null> {
  const visible = await rowsOf(
    tx,
    facetSelect(viewerId, folderId, sql` AND f.deleted_at IS NULL`),
  )
  const positions = visible.map((row) => String(row.position))
  if (afterFacetId === undefined) {
    const last = positions.length === 0 ? null : (positions[positions.length - 1] as string)
    return keyBetween(last, null)
  }
  const index = visible.findIndex((row) => String(row.id) === afterFacetId)
  if (index < 0) return null
  const lower = positions[index] as string
  const upper = index + 1 < positions.length ? (positions[index + 1] as string) : null
  /* Two rows can share a position -- the shared order and the private order
     are written by different routes against different rules -- so an anchor
     whose neighbour sits at the same key has no room between them. Appending
     after the whole list is the honest answer rather than a throw: the caller
     asked for a place, and the one place that always exists is the end. */
  if (upper !== null && upper <= lower) {
    return keyBetween(positions[positions.length - 1] as string, null)
  }
  return keyBetween(lower, upper)
}

/* ------------------------------------------------------------------ *
 * PATCH /folders/:id/facets/:facetId
 * ------------------------------------------------------------------ */

export interface PatchFacetInput {
  displayName?: string | null | undefined
  hidden?: boolean | undefined
  updatedAt?: string | undefined
}

export async function patchFacet(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
  input: PatchFacetInput,
): Promise<FacetOutcome<Facet>> {
  return inTransaction(db, async (tx) => {
    const facet = await lockedFacet(tx, facts.folderId, facetId)
    if (facet === null || !visibleTo(facet, facts.actorId) || facet.deletedAt !== null) {
      return notFound
    }

    // 422 before 403, so a refusal can name what it refused.
    if (input.displayName !== undefined) {
      if (isBlankFacetKind(facet.kind)) {
        if (input.displayName === null) {
          return invalid('display_name', 'a blank facet keeps a name of its own')
        }
      } else if (!isRenameableFacetKind(facet.kind)) {
        return invalid(
          'display_name',
          facet.kind === 'work'
            ? "a Work facet's name is its H1's and changes with it"
            : 'this facet has a fixed name',
        )
      }
    }
    if (input.hidden !== undefined && !isHideableFacetKind(facet.kind)) {
      return invalid(
        'hidden',
        facet.kind === 'main'
          ? 'Main is always present and cannot be hidden'
          : 'a custom facet is deleted rather than hidden',
      )
    }

    /* Two actions, one route, and each asked only when its field arrived. A
       patch carrying both must satisfy both, which is the strict reading and
       the recoverable one. */
    const target = { facetOwnerId: facet.ownerId }
    if (input.displayName !== undefined) {
      const decision = mayPerform(facts, 'facet.rename', target)
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    }
    if (input.hidden !== undefined) {
      const decision = mayPerform(facts, 'facet.hide', target)
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    }

    // 7.0's stale-write token, last, because it is state.
    if (input.updatedAt !== undefined && input.updatedAt !== facet.updatedAt) {
      return conflict('Someone else changed this facet. Reload to see it.')
    }

    const sets = []
    if (input.displayName !== undefined) sets.push(sql`display_name = ${input.displayName}`)
    if (input.hidden !== undefined) sets.push(sql`hidden = ${input.hidden}`)
    sets.push(sql`updated_at = now()`)
    await tx.execute(
      sql`UPDATE folder_facets SET ${sql.join(sets, sql`, `)}
           WHERE id = ${facetId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: facts.actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: input.hidden === undefined ? 'renamed a facet' : 'changed a facet',
    })
    return readOne(tx, facts.actorId, facts.folderId, facetId)
  })
}

async function readOne(
  tx: Executor,
  viewerId: string,
  folderId: string,
  facetId: string,
): Promise<FacetOutcome<Facet>> {
  const rows = await rowsOf(
    tx,
    facetSelect(viewerId, folderId, sql` AND f.id = ${facetId}::uuid`),
  )
  const row = rows[0]
  if (row === undefined) return notFound
  return { kind: 'ok', value: facetFromRow(row) } as const
}

/* ------------------------------------------------------------------ *
 * PUT /folders/:id/facets/order
 * ------------------------------------------------------------------ */

/**
 * The shared sequence, and **the list is the whole truth**, as 7.16's
 * `set_outline` is: no partial order and no merge. A list that omits a facet
 * every member can see is 422, a list naming one twice is 422, a list
 * carrying a private id is 422. Main may stand anywhere (round 2).
 *
 * The write is one key per row from `initialKeys`, so the stored sequence
 * matches the requested one exactly rather than approximately, and the private
 * facets' own keys are untouched -- which is invariant 11: one shared-order
 * write changes the order every member reads, and changes nobody's private
 * arrangement.
 */
export async function setFacetOrder(
  db: Db,
  facts: FolderActorFacts,
  order: readonly string[],
): Promise<FacetOutcome<Facet[]>> {
  return inTransaction(db, async (tx) => {
    const rows = await rowsOf(
      tx,
      sql`SELECT id, kind, owner_id FROM folder_facets
           WHERE folder_id = ${facts.folderId}::uuid AND deleted_at IS NULL
           FOR UPDATE`,
    )
    const shared = rows.filter((row) => row.owner_id === null)
    const sharedIds = new Set(shared.map((row) => String(row.id)))
    /*
    **The caller's own private facets, and only the caller's** (adversarial
    review of 16ce81b). The helpful "use my-order instead" refusal below fires
    for one of these and for nothing else.

    It used to be asked of every private row of the Folder, which made the two
    refusals a **10.2 oracle**: send a uuid, and a different sentence came back
    depending on whether it was somebody else's private facet or nothing at
    all. That is the existence disclosure the whole privacy rule is about, and
    `facet.read` admits no preset precisely so that nobody learns a private
    facet is there. The comment that stood here claimed the opposite -- that
    another member's private id "is unknown to this list either way" -- and was
    wrong about its own code: the lookup read `rows`, which holds both halves,
    rather than `shared`.

    A caller naming their own private facet has told this route nothing it did
    not already know, so pointing them at the right one costs nothing. Every
    other id -- another member's private facet, a facet of another Folder, a
    uuid that names nothing -- answers the same sentence.
    */
    const ownPrivate = new Set(
      rows
        .filter(
          (row) =>
            row.owner_id !== null && String(row.owner_id) === facts.actorId,
        )
        .map((row) => String(row.id)),
    )
    const requested = new Set(order)

    if (requested.size !== order.length) {
      return invalid('order', 'names a facet more than once')
    }
    for (const id of order) {
      if (sharedIds.has(id)) continue
      if (ownPrivate.has(id)) {
        return invalid(
          'order',
          "a private facet's place is its owner's and is written through my-order",
        )
      }
      return invalid('order', 'names a facet that is not in this Folder')
    }
    if (order.length !== sharedIds.size) {
      return invalid(
        'order',
        'is the whole order and must carry every shared facet of this Folder',
      )
    }

    const decision = mayPerform(facts, 'facet.reorder', { facetOwnerId: null })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const

    /* Keys from `a1` on, never `a0`: a written order must never be mistaken
       for the untouched creation keys (Main `a0`, Purpose `a1`, Consultation
       `a2`, Results `a3`), which the client draws as the default order. */
    const keys = initialKeys(order.length + 1).slice(1)
    for (const [index, id] of order.entries()) {
      await tx.execute(
        sql`UPDATE folder_facets SET position = ${keys[index] as string}, updated_at = now()
             WHERE id = ${id}::uuid`,
      )
    }
    const listed = await rowsOf(
      tx,
      facetSelect(facts.actorId, facts.folderId, sql` AND f.deleted_at IS NULL`),
    )
    return { kind: 'ok', value: listed.map(facetFromRow) } as const
  })
}

/* ------------------------------------------------------------------ *
 * PUT /folders/:id/facets/my-order
 * ------------------------------------------------------------------ */

export interface FacetPlacement {
  facetId: string
  afterFacetId: string | null
}

/**
 * The caller's own private facets and nothing else.
 *
 * **Membership-gated rather than preset-gated**, which is
 * `personal.view_preferences`: #228's personal-actions rule puts a member's
 * own arrangement of rows only they can see outside Folder Access entirely.
 * That is also why private order needs no table of its own -- it rewrites
 * `position` on rows nobody else can read.
 *
 * Another member's facet id answers **404** rather than 403, which is 10.2's
 * grammar for a row whose existence the caller may not learn.
 *
 * `after_facet_id: null` means "first among the facets after Main". Main is
 * first for everybody by 7.27's read order, so "before Main" is not a place
 * this route can be asked for.
 */
export async function setMyFacetOrder(
  db: Db,
  viewerId: string,
  folderId: string,
  placements: readonly FacetPlacement[],
): Promise<FacetOutcome<Facet[]>> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folder_facets
           WHERE folder_id = ${folderId}::uuid AND owner_id = ${viewerId}::uuid
           FOR UPDATE`,
    )
    const visible = await rowsOf(
      tx,
      facetSelect(viewerId, folderId, sql` AND f.deleted_at IS NULL`),
    )
    const byId = new Map(visible.map((row) => [String(row.id), row]))
    const main = visible.find((row) => String(row.kind) === 'main')
    if (main === undefined) return notFound

    for (const placement of placements) {
      const row = byId.get(placement.facetId)
      if (row === undefined || row.owner_id === null) return notFound
      if (String(row.owner_id) !== viewerId) return notFound
      if (
        placement.afterFacetId !== null &&
        !byId.has(placement.afterFacetId)
      ) {
        return notFound
      }
    }

    /* The target sequence, built by moving each placed facet in turn, and then
       re-keyed in one pass. Only the caller's own private rows are written:
       every shared row keeps the key it had, which is the half of invariant 11
       that says a private write changes nobody else's order. */
    const sequence = visible.map((row) => String(row.id))
    for (const placement of placements) {
      const from = sequence.indexOf(placement.facetId)
      if (from >= 0) sequence.splice(from, 1)
      const anchor =
        placement.afterFacetId === null
          ? String(main.id)
          : placement.afterFacetId
      const at = sequence.indexOf(anchor)
      sequence.splice(at + 1, 0, placement.facetId)
    }

    /* One pass down the target sequence. A shared row fixes the running lower
       bound at its stored key; a private row takes a key strictly between that
       bound and the **next shared row's** key, which is what makes a run of
       several private facets between two shared ones come out in order. */
    let lower: string = String(main.position)
    for (const [index, id] of sequence.entries()) {
      const row = byId.get(id)
      if (row === undefined) continue
      if (row.owner_id === null) {
        lower = String(row.position)
        continue
      }
      let upper: string | null = null
      for (let ahead = index + 1; ahead < sequence.length; ahead += 1) {
        const next = byId.get(sequence[ahead] as string)
        if (next !== undefined && next.owner_id === null) {
          upper = String(next.position)
          break
        }
      }
      /* A shared neighbour below the running bound would make `keyBetween`
         throw, and it is reachable: the shared order is rewritten by a route
         this one does not lock against reading. Appending above the bound is
         the recoverable answer, and it keeps this facet after the thing it was
         placed after, which is what the caller asked for. */
      const key = upper !== null && upper > lower ? keyBetween(lower, upper) : keyBetween(lower, null)
      await tx.execute(
        sql`UPDATE folder_facets SET position = ${key}, updated_at = now()
             WHERE id = ${id}::uuid AND owner_id = ${viewerId}::uuid`,
      )
      lower = key
    }

    const listed = await rowsOf(
      tx,
      facetSelect(viewerId, folderId, sql` AND f.deleted_at IS NULL`),
    )
    return { kind: 'ok', value: listed.map(facetFromRow) } as const
  })
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/facets/:facetId/share
 * ------------------------------------------------------------------ */

/**
 * Private to shared, and **there is no inverse**: the same path in reverse is
 * 409, because shared to private is a private *copy* and the copy is out of
 * this slice (#210).
 *
 * The id, the document and the position are all kept. Keeping the id is the
 * whole point of doing this as a conversion rather than as a copy: every link
 * to the facet, and every `page_blocks.facet_id` under it, still resolves.
 */
export async function shareFacet(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
): Promise<FacetOutcome<Facet>> {
  return inTransaction(db, async (tx) => {
    const facet = await lockedFacet(tx, facts.folderId, facetId)
    if (facet === null || !visibleTo(facet, facts.actorId) || facet.deletedAt !== null) {
      return notFound
    }
    const decision = mayPerform(facts, 'facet.convert_to_shared', {
      facetOwnerId: facet.ownerId,
    })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    /* **And the actor must be the owner**, which the table cannot say: it
       answers "may this preset do this" rather than "is this the right
       person". Both conditions, neither alone. A Can-edit member who is not
       the owner reaches here and is refused, which is the point. */
    if (facet.ownerId !== null && facet.ownerId !== facts.actorId) {
      return {
        kind: 'forbidden',
        reason: 'Only the person a private facet belongs to can share it.',
      } as const
    }
    if (facet.ownerId === null) {
      return conflict(
        'This facet is already shared. To make a private one, create a private copy instead.',
      )
    }
    await tx.execute(
      sql`UPDATE folder_facets
             SET owner_id = NULL, kind = 'shared_blank', updated_at = now()
           WHERE id = ${facetId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: facts.actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'shared a facet with the Folder',
    })
    return readOne(tx, facts.actorId, facts.folderId, facetId)
  })
}

/* ------------------------------------------------------------------ *
 * DELETE /folders/:id/facets/:facetId
 * ------------------------------------------------------------------ */

/**
 * Trash, which is `deleted_at` and nothing else.
 *
 * **Deleting a Work facet changes no block, no Task and no Section** -- it is
 * a way into part of Main and never a second copy of it. The other direction
 * is the FK's: deleting the H1 destroys its Work facet outright rather than
 * trashing it, because 7.16's `delete_block` is permanent and an unrestorable
 * Trash row is worse than none.
 *
 * A native is 409 rather than 422: the body was fine and the actor was
 * permitted; what is wrong is the state of the thing they named, and the
 * answer says to hide it instead.
 */
export async function deleteFacet(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
): Promise<FacetOutcome<null>> {
  return inTransaction(db, async (tx) => {
    const facet = await lockedFacet(tx, facts.folderId, facetId)
    if (facet === null || !visibleTo(facet, facts.actorId) || facet.deletedAt !== null) {
      return notFound
    }
    const decision = mayPerform(facts, 'facet.delete', { facetOwnerId: facet.ownerId })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    if (isNativeFacetKind(facet.kind)) {
      return conflict('A native facet is hidden rather than deleted.')
    }
    await tx.execute(
      sql`UPDATE folder_facets SET deleted_at = now(), updated_at = now()
           WHERE id = ${facetId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: facts.actorId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: facts.folderId,
      subjectName: facts.name,
      folderId: facts.folderId,
      detail: 'moved a facet to Trash',
    })
    return { kind: 'ok', value: null } as const
  })
}

/* ------------------------------------------------------------------ *
 * Trash: the listing, the restore and the permanent delete (7.13)
 * ------------------------------------------------------------------ */

/**
 * The `facets` array of `GET /api/v1/trash`.
 *
 * Membership is the scope, never who deleted (7.13), and the privacy clause
 * rides on top of it exactly as it does on the live read: a member's trashed
 * private facet is theirs alone to see and to restore.
 */
export async function trashedFacets(
  db: Db,
  viewerId: string,
): Promise<TrashedFacet[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT ff.id, ff.kind, ff.display_name, ff.folder_id,
               fo.name AS folder_name, ff.deleted_at, m.access,
               (fo.owner_id = ${viewerId}) AS is_owner,
               h1.text AS h1_text
          FROM folder_facets ff
          JOIN folder_members m
            ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
          JOIN folders fo ON fo.id = ff.folder_id AND fo.deleted_at IS NULL
          LEFT JOIN page_blocks h1 ON h1.id = ff.h1_block_id
         WHERE ff.deleted_at IS NOT NULL
           AND (ff.owner_id IS NULL OR ff.owner_id = ${viewerId}::uuid)
         ORDER BY ff.deleted_at DESC, ff.id DESC`,
  )
  return rows.map((row): TrashedFacet => {
    const access = presetOf(row.access)
    if (access === null) {
      throw new Error(
        `folder_members.access holds an unknown preset for ${viewerId} in ${String(row.folder_id)}`,
      )
    }
    const kind = String(row.kind) as FacetKind
    return {
      id: String(row.id),
      name: resolveFacetName(
        kind,
        nullableString(row.display_name),
        nullableString(row.h1_text),
      ),
      kind,
      folder_id: String(row.folder_id),
      folder_name: String(row.folder_name),
      deleted_at: toIso(row.deleted_at),
      is_owner: row.is_owner === true,
      my_access: access,
    }
  })
}

/**
 * The actor's Folder facts over a facet that may be trashed, and whose folder
 * may be trashed too.
 *
 * `accessOf` refuses a trashed folder by design, correctly: the ordinary
 * surface must not see one. 7.13's acts are the exception and need the same
 * facts over the rows that predicate hides, so this is that read and nothing
 * more -- the identical move `trashedTaskFacts` makes in `domain/trash.ts`.
 */
async function trashedFacetFacts(
  tx: Executor,
  viewerId: string,
  facetId: string,
): Promise<{ facts: FolderActorFacts; folderTrashed: boolean } | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT ff.folder_id, fo.name, fo.is_default, m.access,
               (fo.owner_id = ${viewerId}) AS is_owner,
               (fo.deleted_at IS NOT NULL) AS folder_trashed
          FROM folder_facets ff
          JOIN folder_members m
            ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
          JOIN folders fo ON fo.id = ff.folder_id
         WHERE ff.id = ${facetId}::uuid`,
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
    facts: {
      folderId: String(row.folder_id),
      actorId: viewerId,
      access,
      isOwner: row.is_owner === true,
      isDefault: row.is_default === true,
      name: String(row.name),
    },
    folderTrashed: row.folder_trashed === true,
  }
}

/**
 * `POST /api/v1/facets/:id/restore`, mirroring `/folders/:id/restore`.
 *
 * **409 when the facet's folder is itself trashed**, because the facet is not
 * separately restorable while the thing it belongs to is waiting in Trash: the
 * folder comes back as one entry and its facets ride its fate, which is 4.5's
 * rule for a task read one table over.
 */
export async function restoreFacet(
  db: Db,
  viewerId: string,
  facetId: string,
): Promise<FacetOutcome<Facet>> {
  return inTransaction(db, async (tx) => {
    const read = await trashedFacetFacts(tx, viewerId, facetId)
    if (read === null) return notFound
    const facet = await lockedFacet(tx, read.facts.folderId, facetId)
    if (facet === null || !visibleTo(facet, viewerId) || facet.deletedAt === null) {
      return notFound
    }
    const decision = mayPerform(read.facts, 'facet.delete', {
      facetOwnerId: facet.ownerId,
    })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    if (read.folderTrashed) {
      return conflict('Restore the Folder first; its facets come back with it.')
    }
    /* A Work facet whose H1 has been restored alongside it can collide with a
       Work facet somebody made over the same heading meanwhile. The partial
       unique index is what notices, in this transaction, and the answer is a
       409 rather than a 500. */
    try {
      await tx.execute(
        sql`UPDATE folder_facets SET deleted_at = NULL, updated_at = now()
             WHERE id = ${facetId}::uuid`,
      )
    } catch (error) {
      if (uniqueViolation(error)) {
        return conflict('That heading already has a Work facet.')
      }
      throw error
    }
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'folder',
      subjectId: read.facts.folderId,
      subjectName: read.facts.name,
      folderId: read.facts.folderId,
      detail: 'restored a facet from Trash',
    })
    return readOne(tx, viewerId, read.facts.folderId, facetId)
  })
}

/**
 * The 11.7 collection, in the shape `destroyFolders` and `destroyTasks` next
 * door have: `doomed` is a query answering facet ids and carries its own lock
 * clause, so the purge's `SKIP LOCKED` claim and the endpoint's `FOR UPDATE`
 * read as the same act.
 *
 * **It collects no `files` rows and that is not an omission.** A `files` row
 * is scoped to a folder (4.16), and a folder survives its facet; the blocks
 * that named those files cascade away through `page_blocks_facet_id_fkey`, and
 * what reclaims the now-unreferenced pictures is 7.19's sweep, whose
 * `fileIsUnreferenced()` already asks `page_blocks` without caring which home
 * a block had. No new foreign key into `files(id)` is created by #210, so
 * `guard-reclaim-reference-arms` is untouched by this change.
 */
export async function destroyFacets(
  executor: Executor,
  doomed: SQL,
): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed})
        DELETE FROM folder_facets WHERE id IN (SELECT id FROM doomed)
        RETURNING id`,
  )
  return rows.map((row) => String(row.id))
}

/**
 * `DELETE /api/v1/trash/facets/:id`: **Full control with ownership ignored**,
 * which is the Task rule of 7.13's 2026-09-20 correction rather than the
 * Folder's custody-and-Full-control pair. Permanently destroying one facet of
 * a folder is an administrative act inside a folder that survives it, which is
 * exactly what destroying a Task is.
 *
 * It runs through the 11.7 collection above rather than writing a delete
 * beside it.
 */
export async function destroyFacet(
  db: Db,
  viewerId: string,
  facetId: string,
): Promise<FacetOutcome<null>> {
  return inTransaction(db, async (tx) => {
    const read = await trashedFacetFacts(tx, viewerId, facetId)
    if (read === null) return notFound
    const facet = await lockedFacet(tx, read.facts.folderId, facetId)
    if (facet === null || !visibleTo(facet, viewerId) || facet.deletedAt === null) {
      return notFound
    }
    const decision = mayPerform(read.facts, 'task.destroy')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
    await destroyFacets(tx, sql`SELECT id FROM folder_facets WHERE id = ${facetId}::uuid`)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: read.facts.folderId,
      subjectName: read.facts.name,
      folderId: read.facts.folderId,
      detail: 'deleted a facet permanently',
    })
    return { kind: 'ok', value: null } as const
  })
}

/* ------------------------------------------------------------------ *
 * The facet document (7.16's contract, facet-scoped)
 * ------------------------------------------------------------------ */

/**
 * A facet's page, or null when the caller may not see the facet.
 *
 * The shape is 7.16's `PageView` exactly: `revision`, `blocks`, `items`, and
 * an always-empty `task_placements`, because **no Task row ever belongs to a
 * facet** and the absence is #210's core rule rather than a gap. It is sent
 * rather than omitted so that one client reader serves both pages.
 */
function facetBlockFromRow(row: Record<string, unknown>): PageBlock {
  return {
    id: String(row.id),
    kind: String(row.kind) as PageBlock['kind'],
    position: Number(row.position),
    page_position: nullableString(row.page_position),
    section_block_id: null,
    list_parent_block_id: nullableString(row.list_parent_block_id),
    checked: row.checked === null || row.checked === undefined ? null : Boolean(row.checked),
    rich_content: (row.rich_content ?? null) as PageBlock['rich_content'],
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    file_width: nullableInt(row.file_width),
    file_height: nullableInt(row.file_height),
    file_reclaimed_at: fileReclaimedAt(row),
    file_name: nullableString(row.file_name),
    ref_folder_id: null,
    width_pct: row.width_pct === null || row.width_pct === undefined ? null : Number(row.width_pct),
    updated_at: toIso(row.updated_at),
  }
}

async function facetDocumentMetadata(
  tx: Executor,
  facetId: string,
): Promise<{ revision: string }> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT id, kind, text, rich_content, file_id, width_pct, checked,
               list_parent_block_id, page_position, position
          FROM page_blocks WHERE facet_id = ${facetId}::uuid ORDER BY id`,
  )
  /* The facet id is inside the hash, and that is load-bearing rather than
     decorative. `page_document_receipts` is keyed (actor, folder, mutation),
     with no room for a facet, so a client that sent one mutation id to two
     documents of one folder would otherwise be handed the other document's
     receipt and told `replayed: true`. With the id in the hash it is told
     `stale` instead, which is the honest answer to "this retry identity
     already belongs to a different edit". */
  return { revision: documentHash({ facet: facetId, blocks, tasks: [] }) }
}

export async function facetPageView(
  db: Db,
  facetId: string,
): Promise<PageView> {
  return inTransaction(db, async (tx) => {
    const blocks = await rowsOf(
      tx,
      sql`SELECT b.id, b.kind, b.position, b.page_position, b.checked,
                 b.list_parent_block_id, b.rich_content, b.text, b.file_id, b.width_pct, b.updated_at, b.file_reclaimed_at,
                 f.width AS file_width, f.height AS file_height, f.name AS file_name
            FROM page_blocks b
            LEFT JOIN files f ON f.id = b.file_id
           WHERE b.facet_id = ${facetId}::uuid
           ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
    )
    const metadata = await facetDocumentMetadata(tx, facetId)
    return {
      revision: metadata.revision,
      task_placements: [],
      blocks: blocks.map(facetBlockFromRow),
      items: blocks.map((row) => ({ kind: 'block' as const, id: String(row.id) })),
    }
  })
}

/**
 * A refusal from the facet document applier. The four kinds map onto 7.16's
 * own answers: `stale` is 409, `not_found` is 404, and `invalid` is the 422
 * the route formats with the field name.
 */
export class FacetDocumentRefusal extends Error {
  constructor(
    /** `forbidden` joined the three on 2026-09-21: the page gate now runs
     * inside this function's own transaction, so its 403 has to leave by the
     * same door its 404 does. */
    readonly outcome: 'stale' | 'not_found' | 'invalid' | 'forbidden',
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

/**
 * 7.16's document transaction over a facet's own blocks.
 *
 * **Three operational things are refused here that the folder page admits**:
 *
 * - `create_task`, because no Task row ever belongs to a facet (#210's core
 *   rule, and the reason no column on `tasks` names one);
 * - a `section` block, because a facet document has no Sections --
 *   `page_blocks_section_membership_check` says the same thing in the database
 *   and was already exactly right before #210 touched anything;
 * - a `folder_ref` block, because a facet is a view of one Folder and a
 *   reference out of it is Main's to carry.
 *
 * #211 supersedes #210's temporary no-nested-list limitation: a nested list
 * item is admitted only when both ends are list items of this same facet and
 * the parent occurs earlier in the final outline. Migration 0028 widens the
 * database CHECK in the same direction.
 *
 * A media block's `file_id` is scoped to the facet's **folder**, which is
 * `domain/pages.ts`'s `fileScopeCondition` for a folder-homed page: a facet
 * belongs to one folder and its pictures are that folder's.
 */
export async function applyFacetDocument(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
  body: DocumentTransaction,
): Promise<PageView> {
  const viewerId = facts.actorId
  const folderId = facts.folderId
  return inTransaction(db, async (tx) => {
    /*
    **The gate runs here, inside the transaction that writes**, and that is a
    correction rather than a tidy-up (adversarial review of 16ce81b). It used
    to run in `facetPageGate`, which opened a transaction of its own and
    committed before this one started: the `FOR UPDATE` it took was released
    before the first statement of the write, so a conversion landing in that
    window was authorized by a row this function never saw. #228's
    Assigned-work rule -- the fact a gate reads must be the fact the mutation
    sees, in one snapshot under one lock -- is what `whenOwnPrivateFacet`
    inherits, and it was not being kept.

    Everything below therefore runs against a facet row this transaction holds
    a lock on until it commits.
    */
    const gated = await facetPageGateIn(tx, facts, facetId, true)
    if (gated.kind === 'not_found') {
      throw new FacetDocumentRefusal('not_found', 'Not found.')
    }
    if (gated.kind === 'forbidden') {
      throw new FacetDocumentRefusal('forbidden', gated.reason)
    }
    /* `facetPageGateIn` answers only those three and `ok`, so this arm is
       unreachable; it exists because a discriminated union with an unhandled
       member is a defect waiting for the day somebody adds one. */
    if (gated.kind !== 'ok') {
      throw new FacetDocumentRefusal('invalid', gated.message, 'operations')
    }

    const hash = documentHash({ facet: facetId, body })
    const receipts = await rowsOf(
      tx,
      sql`SELECT payload_hash, committed_revision FROM page_document_receipts
           WHERE actor_id = ${viewerId}::uuid AND folder_id = ${folderId}::uuid
             AND mutation_id = ${body.mutation_id}::uuid`,
    )
    const receipt = receipts[0]
    if (receipt !== undefined) {
      if (receipt.payload_hash !== hash) {
        throw new FacetDocumentRefusal(
          'stale',
          'This retry identity already belongs to a different edit.',
        )
      }
      const replayed = await facetPageViewIn(tx, facetId)
      return {
        ...replayed,
        mutation: {
          mutation_id: body.mutation_id,
          committed_revision: String(receipt.committed_revision),
          replayed: true,
          created_task_ids: [],
        },
      }
    }

    const before = await facetDocumentMetadata(tx, facetId)
    if (before.revision !== body.base_revision) {
      throw new FacetDocumentRefusal(
        'stale',
        'The page changed. Your draft is retained; reconcile it with the current page.',
      )
    }

    const stored = await rowsOf(
      tx,
      sql`SELECT id, kind, list_parent_block_id FROM page_blocks WHERE facet_id = ${facetId}::uuid FOR UPDATE`,
    )
    const original = new Set(stored.map((row) => String(row.id)))
    const blocks = new Set(original)

    const writes = new Map<string, Extract<DocumentOperation, { op: 'put_block' }>>()
    const storedKinds = new Map(
      stored.map((row) => [String(row.id), String(row.kind)]),
    )
    /**
     * Every id the operations **name**, whether or not it survives the merge.
     *
     * This set exists because the merged set does not answer the question.
     * `blocks` is what the document will hold when the transaction is done, so
     * an id that a `put_block` added and a `delete_block` took away again is
     * absent from it -- and that pair is exactly what the adversarial review
     * of 16ce81b used to reach somebody else's rows. The scope check below
     * reads this instead, so an id is audited because it was *mentioned*, not
     * because it happened to still be in the document afterwards.
     */
    const named = new Set<string>()
    let outline: { id: string; kind: 'block' | 'task'; listParent: string | null }[] = []

    for (const op of body.operations) {
      if (op.op === 'create_task') {
        throw new FacetDocumentRefusal(
          'invalid',
          'a facet holds no Tasks; create it on the Folder page instead',
          'operations',
        )
      }
      if (op.op === 'put_block') {
        if (op.block_kind === 'section') {
          throw new FacetDocumentRefusal(
            'invalid',
            'a facet document has no Sections',
            'operations',
          )
        }
        if (op.block_kind === 'folder_ref') {
          throw new FacetDocumentRefusal(
            'invalid',
            'a folder reference belongs on the Folder page',
            'operations',
          )
        }
        writes.set(op.id, op)
        blocks.add(op.id)
        named.add(op.id)
        continue
      }
      if (op.op === 'delete_block') {
        if (!blocks.delete(op.id)) {
          /* **404 and not the 422 below, on 10.2.** With no `put_block` beside
             it the caller has named a block this document does not hold and
             has asked for nothing to be written; "Block not found" says
             nothing about whether the id exists somewhere else, which is the
             answer a prober must get. The 422 below fires only where the
             caller also tried to *write* the id, which 7.16's own folder-page
             applier already answers with a refusal naming the clash. */
          throw new FacetDocumentRefusal('not_found', 'Block not found.')
        }
        named.add(op.id)
        continue
      }
      outline = op.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        listParent: item.list_parent_block_id,
      }))
    }

    if (blocks.size > 500) {
      throw new FacetDocumentRefusal('invalid', 'A page holds at most 500 blocks.', 'operations')
    }

    const seen = new Set<string>()
    for (const item of outline) {
      if (item.kind !== 'block' || !blocks.has(item.id) || seen.has(item.id)) {
        throw new FacetDocumentRefusal(
          'invalid',
          'The outline has unknown or repeated identities.',
          'operations',
        )
      }
      seen.add(item.id)
      if (item.listParent !== null) {
        const itemKind = writes.get(item.id)?.block_kind ?? storedKinds.get(item.id)
        const parentKind =
          writes.get(item.listParent)?.block_kind ?? storedKinds.get(item.listParent)
        if (itemKind === undefined || !isListKind(itemKind)) {
          throw new FacetDocumentRefusal(
            'invalid',
            'only a bullet, numbered or checklist item is a nested list item',
            'list_parent_block_id',
          )
        }
        if (
          !blocks.has(item.listParent) ||
          !seen.has(item.listParent) ||
          parentKind === undefined ||
          !isListKind(parentKind)
        ) {
          throw new FacetDocumentRefusal(
            'invalid',
            'a list item nests under an earlier list item of this facet document',
            'list_parent_block_id',
          )
        }
      }
    }
    if (seen.size !== blocks.size) {
      throw new FacetDocumentRefusal(
        'invalid',
        'The outline must retain every undeleted block.',
        'operations',
      )
    }

    /* The file scope, asked only of the blocks this transaction writes and
       never of the merged document -- the scoping #220's adversarial review
       settled for the folder page, transcribed rather than re-argued. A file
       must be in this facet's folder; a file that is elsewhere and a file that
       does not exist answer the same thing (10.2). */
    for (const write of writes.values()) {
      if (write.file_id === null) continue
      const files = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM files
             WHERE id = ${write.file_id}::uuid AND folder_id = ${folderId}::uuid`,
      )
      if (files.length === 0) {
        throw new FacetDocumentRefusal(
          'invalid',
          'must name a file you can reach',
          'file_id',
        )
      }
    }

    /*
    **The scope check, and it is the one this function got wrong.** Found by
    the adversarial review of 16ce81b: `[put_block(victimId),
    delete_block(victimId), set_outline(...)]` made the id vanish from the
    merged set before the collision check read it, and the write pass then
    issued `DELETE FROM page_blocks WHERE id = $1` with no `facet_id` clause.
    **Any block in Dana could be deleted by anyone holding its id**, through a
    private facet in their own Desk, with no membership of the folder it lived
    in.

    Three things close it, and each is load-bearing on its own:

    1. **This check reads `named` rather than the merged set**, so an id is
       audited because the operations mentioned it. `original` holds every
       block this facet has, so an id outside it that exists anywhere at all --
       another facet, a folder page, a shelf page, or a Task -- is not this
       facet's to write.
    2. **Deletions are derived rather than accumulated**, below: `original`
       minus the final set, which is `page-document.ts`'s own shape and cannot
       name a row the facet did not already hold.
    3. **The statement carries `AND facet_id = $facetId`.** Redundant given (2)
       and written anyway, because (2) is an invariant of twenty lines of
       merging while this is a clause on the statement that does the damage.

    `tasks` is in the union for the reason 7.16's applier puts it there: ids
    are one space across the two tables, and a block minted over a Task's id
    would make one identity name two things.
    */
    const foreign = [...named].filter((id) => !original.has(id))
    if (foreign.length > 0) {
      const ids = sql.join(
        foreign.map((id) => sql`${id}::uuid`),
        sql`, `,
      )
      const clashes = await rowsOf(
        tx,
        sql`SELECT id FROM page_blocks WHERE id IN (${ids})
            UNION ALL
            SELECT id FROM tasks WHERE id IN (${ids})`,
      )
      if (clashes.length > 0) {
        throw new FacetDocumentRefusal(
          'invalid',
          "names a block this facet does not hold; an identity that already exists elsewhere is not this facet's to write",
          'operations',
        )
      }
    }

    /* Every refusal precedes the first write, and the deletions are whatever
       is left of this facet's **own** blocks after the merge -- never a set the
       operations built. */
    const removed = [...original].filter((id) => !blocks.has(id))
    for (const id of [...writes.keys()]) {
      /* A block put and then deleted in one transaction is written by neither
         pass. Without this it would be inserted after being "removed", which
         is the merged set's own semantics said out loud. */
      if (!blocks.has(id)) writes.delete(id)
    }
    for (const id of removed) {
      await tx.execute(
        sql`DELETE FROM page_blocks
             WHERE id = ${id}::uuid AND facet_id = ${facetId}::uuid`,
      )
    }
    for (const write of writes.values()) {
      await tx.execute(
        sql`INSERT INTO page_blocks
              (id, facet_id, kind, position, text, rich_content, file_id, width_pct, checked)
            VALUES (${write.id}::uuid, ${facetId}::uuid, ${write.block_kind}, 0,
                    ${write.text},
                    ${write.rich_content === null ? null : JSON.stringify(write.rich_content)}::jsonb,
                    ${write.file_id}::uuid, ${write.width_pct},
                    ${write.block_kind === 'checklist' ? (write.checked ?? false) : null})
            ON CONFLICT (id) DO UPDATE
               SET kind = EXCLUDED.kind, text = EXCLUDED.text,
                   rich_content = EXCLUDED.rich_content,
                   file_id = EXCLUDED.file_id, width_pct = EXCLUDED.width_pct,
                   checked = EXCLUDED.checked,
                   file_reclaimed_at = CASE
                     WHEN EXCLUDED.file_id IS NULL AND EXCLUDED.kind = page_blocks.kind
                     THEN page_blocks.file_reclaimed_at END,
                   updated_at = now()`,
      )
    }
    /* **`AND facet_id` here is the same belt-and-braces the DELETE two loops
       above carries, and it is unreachable today for the same reason.** Every
       id in `outline` was checked against `blocks` a hundred lines up, and
       `blocks` is seeded from this facet's own rows and can only have grown by
       ids the scope check cleared -- so an `item.id` that is not this facet's
       cannot exist by the time this loop runs. The clause is written anyway,
       because that argument is an invariant of a long merge and this is a
       clause on the statement that would do the damage. The same sentence, in
       the same words, as the delete's: the adversarial review of 16ce81b found
       the merge wrong once. */
    const keys = initialKeys(outline.length)
    for (const [index, item] of outline.entries()) {
      await tx.execute(
        sql`UPDATE page_blocks
               SET page_position = ${keys[index] as string}, position = ${index},
                   list_parent_block_id = ${item.listParent}::uuid
             WHERE id = ${item.id}::uuid AND facet_id = ${facetId}::uuid`,
      )
    }

    const committed = await facetDocumentMetadata(tx, facetId)
    // An object, not an array: only an array-valued receipt marks the Folder
    // page itself as on the document path (pages.ts), and a facet document's
    // write must not shut the deployed client's legacy Folder page writer.
    await tx.execute(
      sql`INSERT INTO page_document_receipts
            (actor_id, folder_id, mutation_id, payload_hash, committed_revision, created_task_ids)
          VALUES (${viewerId}::uuid, ${folderId}::uuid, ${body.mutation_id}::uuid,
                  ${hash}, ${committed.revision}, ${JSON.stringify({ facet_id: facetId })}::jsonb)`,
    )
    const view = await facetPageViewIn(tx, facetId)
    return {
      ...view,
      mutation: {
        mutation_id: body.mutation_id,
        committed_revision: committed.revision,
        replayed: false,
        created_task_ids: [],
      },
    }
  })
}

/** `facetPageView`'s body, for a caller that already has a transaction. */
async function facetPageViewIn(tx: Executor, facetId: string): Promise<PageView> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.position, b.page_position, b.checked,
               b.list_parent_block_id, b.rich_content, b.text, b.file_id, b.width_pct, b.updated_at, b.file_reclaimed_at,
               f.width AS file_width, f.height AS file_height, f.name AS file_name
          FROM page_blocks b
          LEFT JOIN files f ON f.id = b.file_id
         WHERE b.facet_id = ${facetId}::uuid
         ORDER BY b.page_position ASC NULLS LAST, b.position, b.updated_at, b.id`,
  )
  const metadata = await facetDocumentMetadata(tx, facetId)
  return {
    revision: metadata.revision,
    task_placements: [],
    blocks: blocks.map(facetBlockFromRow),
    items: blocks.map((row) => ({ kind: 'block' as const, id: String(row.id) })),
  }
}

/**
 * The gate the two facet page routes share, and the one place the two
 * different answers live.
 *
 * A **shared** blank facet's document is ordinary shared Work and is governed
 * by the existing `folder.page.edit`. A **private** one is governed by
 * `facet.read` alone, which no preset satisfies -- so Full control and the
 * structural owner are refused by the same line that refuses everybody else.
 *
 * A **Work facet has no page of its own**: it reads and writes
 * `/folders/:id/page`, and asking for its page is 404 rather than an empty
 * document, because an empty document would be a second place to write that
 * nothing ever reads back.
 */
async function facetPageGateIn(
  tx: Executor,
  facts: FolderActorFacts,
  facetId: string,
  writing: boolean,
): Promise<FacetOutcome<LockedFacet>> {
  const facet = await lockedFacet(tx, facts.folderId, facetId, writing)
  if (
    facet === null ||
    !visibleTo(facet, facts.actorId) ||
    facet.deletedAt !== null ||
    !(isBlankFacetKind(facet.kind) || isDocumentNativeFacetKind(facet.kind))
  ) {
    return notFound
  }
  const action = facet.ownerId === null ? 'folder.page.edit' : 'facet.read'
  /* A shared facet's *read* is any member's, which is `folder.read`; only
     the write takes `folder.page.edit`. A private facet's read and write are
     the same question, because the only person who may read it is the only
     person who may write it. */
  const asked = facet.ownerId === null && !writing ? 'folder.read' : action
  const decision = mayPerform(facts, asked, { facetOwnerId: facet.ownerId })
  if (!decision.allowed) {
    return { kind: 'forbidden', reason: decision.reason } as const
  }
  return { kind: 'ok', value: facet } as const
}

/** The **read** gate, for `GET /folders/:id/facets/:facetId/page` and nothing
 * else. It locks nothing, because a read has no write to serialise against;
 * the write path reaches the same rule through `facetPageGateIn` inside its
 * own transaction, which is what keeps the answer and the write together. */
export async function facetPageGate(
  db: Db,
  facts: FolderActorFacts,
  facetId: string,
): Promise<FacetOutcome<{ facetId: string }>> {
  return inTransaction(db, async (tx) => {
    const gated = await facetPageGateIn(tx, facts, facetId, false)
    if (gated.kind !== 'ok') return gated
    return { kind: 'ok', value: { facetId: gated.value.id } } as const
  })
}

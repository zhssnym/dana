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
Its page and its writer live in facet-document.ts, in the documents brick,
so that the one body writer stays above this brick.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  DEFAULT_FACET_NAMES,
  isBlankFacetKind,
  isHideableFacetKind,
  isNativeFacetKind,
  isRenameableFacetKind,
  NATIVE_TAB_ORDER,
} from '../../shared/facets.js'
import type { Facet, FacetKind } from '../../shared/facets.js'
import type { TrashedFacet } from '../../shared/trash.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import {
  joinVisibleFolder,
  mayPerform,
  presetFromRow,
  resolveScoped,
} from './folder-access.js'
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

export interface LockedFacet {
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
export async function lockedFacet(
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
export function visibleTo(facet: LockedFacet, viewerId: string): boolean {
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

/**
 * Re-keys an untouched Folder's built-ins (each at its creation key, Main
 * `a0`, Purpose `a1`, Consultation `a2`, Results `a3`, hidden ones included:
 * the client's `untouched()`) in the order
 * the client draws them, below every other row, so the stored order becomes
 * the drawn one without moving anything anybody sees. A no-op otherwise.
 */
async function materialiseUntouchedOrder(tx: Executor, folderId: string): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, kind, owner_id, position, hidden, deleted_at FROM folder_facets
         WHERE folder_id = ${folderId}::uuid
         ORDER BY position ASC, id ASC
         FOR UPDATE`,
  )
  /* The tab row asks `untouched()` of every tab, hidden ones included (a
     hidden built-in is not a reorder), and an absent built-in does not count
     against it; Main must stand at `a0`. The same rule here. */
  const native = (kind: string) =>
    rows.find((row) => row.owner_id === null && String(row.kind) === kind && row.deleted_at === null)
  const creation: Record<string, string> = { main: 'a0', purpose: 'a1', consultation: 'a2', results: 'a3' }
  if (native('main') === undefined) return
  if (!Object.entries(creation).every(([kind, key]) => native(kind) === undefined || String(native(kind)!.position) === key)) return
  const natives = NATIVE_TAB_ORDER.map((kind) => native(kind)).filter((row) => row !== undefined)
  const nativeIds = new Set(natives.map((row) => String(row.id)))
  const others = rows.filter((row) => !nativeIds.has(String(row.id)))
  let upper: string | null = others.length === 0 ? null : String(others[0]!.position)
  const keys: string[] = []
  if (upper === null) {
    keys.push(...initialKeys(natives.length + 1).slice(1))
  } else {
    for (let index = 0; index < natives.length; index += 1) {
      upper = keyBetween(null, upper)
      keys.unshift(upper)
    }
  }
  for (const [index, row] of natives.entries()) {
    await tx.execute(
      sql`UPDATE folder_facets SET position = ${keys[index] as string}, updated_at = now()
           WHERE id = ${String(row.id)}::uuid`,
    )
  }
}

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
 * `after_facet_id: null` means "before the first facet the caller can see":
 * the front of the row. Main no longer stands first (round 2), so null is not
 * "after Main".
 *
 * **An untouched Folder is materialised first.** While the built-ins hold
 * their creation keys the client draws them in `NATIVE_TAB_ORDER`, not in
 * stored order, and would go on doing so after this route re-keyed only a
 * private row -- the dragged tab would snap back. So the built-ins are
 * first re-keyed, in that drawn order, below every other row of the Folder
 * (every member's private rows included). Every other key is kept, so what
 * each member sees is exactly what they saw; the Folder simply stops being
 * "untouched", and the drop lands where it was made.
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
    await materialiseUntouchedOrder(tx, folderId)
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
      const at =
        placement.afterFacetId === null
          ? -1
          : sequence.indexOf(placement.afterFacetId)
      sequence.splice(at + 1, 0, placement.facetId)
    }

    /* One pass down the target sequence. A shared row fixes the running lower
       bound at its stored key; a private row takes a key strictly between that
       bound and the **next shared row's** key, which is what makes a run of
       several private facets between two shared ones come out in order. */
    let lower: string | null = null
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
      const key: string = upper !== null && (lower === null || upper > lower) ? keyBetween(lower, upper) : keyBetween(lower, null)
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
          ${joinVisibleFolder(viewerId, { folderId: sql`ff.folder_id` })}
          LEFT JOIN page_blocks h1 ON h1.id = ff.h1_block_id
         WHERE ff.deleted_at IS NOT NULL
           AND (ff.owner_id IS NULL OR ff.owner_id = ${viewerId}::uuid)
         ORDER BY ff.deleted_at DESC, ff.id DESC`,
  )
  return rows.map((row): TrashedFacet => {
    const access = presetFromRow(row.access, viewerId, String(row.folder_id))
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
  return resolveScoped(tx, 'facet', facetId, viewerId, {
    row: 'any',
    folder: 'any',
  })
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

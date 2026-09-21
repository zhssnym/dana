/*
The Responsibility document, its immutable revisions and R7 section O's
self-edit grant (issue #230; product authority #209 R5, R7 section O, R10 and
the accepted R10B).

## What this module owns and what it borrows

It owns four things: the current document, the append-only record beside it,
the grant, and the member-details projection over all three. It borrows
everything about *authority* from `folder-access.ts` — #230 is explicit that
Responsibility mutations consume #228's resolver and invent no second
permission model — and everything about *canonical content* from
`shared/responsibility.ts` and `page-document.ts`.

Nothing here reads the prose. #230's sentence is worth repeating at the top of
the file that could most easily break it: Responsibility text must never be
parsed or inferred to grant permission.

## The three rules that shape every write below

**One. A commit is a state, not an edit.** The body carries the whole intended
document, so "did anything change" is a comparison of two canonical payloads
and never a diff. That is what makes the no-op rule exact (proof 9) and it is
also why there is no mutation-id receipts table beside this one, unlike the
page transaction: a replay is recognised by the state it carries.

**Two. Identity is the canonical hash, and canonical means the parse.** Every
schema in `shared/responsibility.ts` ends in a transform that fixes key order
and drops absent optionals, so `documentHash(parsed)` — the very function the
Folder page transaction uses for its `base_revision` — is a content identity
two independent clients compute the same way. Object identity is never
consulted and neither is `updated_at`.

**Three. The current document and its new revision commit together or not at
all.** Every function below that writes takes an `Executor` inside one
transaction opened by its caller, behind the folder row lock the rest of the
membership surface already takes, in that order. `recordAccessTransition` is
the shape being copied and the reason is R10's, stated as R9's was: a function
that opened its own transaction could not promise atomicity however carefully
it were called.

## Why absence and emptiness are one state

A member who has written nothing has no row. A member who deliberately cleared
their document has a row whose payload is `{version: 1, blocks: []}`. Those are
different facts — the second has revisions and an actor and a time — and the
projection keeps them apart through `content: null` versus `content: {blocks:
[]}`. But their *canonical payloads are equal*, which is what makes the no-op
rule total: saving an empty document against a member who has none writes
nothing and fabricates nothing (proof 1), and `EMPTY_RESPONSIBILITY`'s hash is
the `base_revision` a first save sends, so a first save is an ordinary
optimistic-concurrency write rather than a special case.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  EMPTY_RESPONSIBILITY,
  responsibilityDocument,
} from '../../shared/responsibility.js'
import type {
  ResponsibilityDocument,
  ResponsibilityHistoryEntry,
  ResponsibilityStanding,
  ResponsibilityTransition,
} from '../../shared/responsibility.js'
import { LIST_ROW_CAP } from '../../shared/list-cap.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { documentHash } from './document-hash.js'
import { recordEvent } from './events.js'
import { lockedMembership, mayPerform } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'

/* ------------------------------------------------------------------ *
 * Canonical content
 * ------------------------------------------------------------------ */

/**
 * The content identity of a document: sha256 over the canonical payload.
 *
 * `documentHash` is imported rather than re-implemented so that there is one
 * answer in Dana to "are these two documents the same", and so that the day
 * somebody changes it, both surfaces change together. It lives in
 * `document-hash.ts` rather than in `page-document.ts`, where it was declared,
 * because importing that file from here closes a cycle -- the reasoning is in
 * the module it moved to.
 */
export function responsibilityHash(content: ResponsibilityDocument): string {
  return documentHash(content)
}

/** The hash a member with no document has. A constant, so that a client's
 * first save and its hundredth send the same kind of token. */
export const EMPTY_RESPONSIBILITY_HASH = responsibilityHash(
  EMPTY_RESPONSIBILITY,
)

/**
 * A stored payload read back into the canonical shape.
 *
 * It re-parses rather than casting. A jsonb column is `unknown` however
 * confidently a type says otherwise, and a row written by an older version of
 * this schema must be refused loudly rather than served as a document nobody
 * can round-trip (proof 24). The throw is deliberate and matches
 * `presetOf`'s neighbour in `folder-access.ts`: every default here would be a
 * guess about what somebody wrote.
 */
function storedDocument(value: unknown, where: string): ResponsibilityDocument {
  const parsed = responsibilityDocument.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      `a stored Responsibility document is not readable at ${where}`,
    )
  }
  return parsed.data
}

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

interface Person {
  id: string
  display_name: string | null
  avatar_url: string | null
}

function personFrom(
  id: unknown,
  displayName: unknown,
  avatarUrl: unknown,
): Person | null {
  if (id === null || id === undefined) return null
  return {
    id: String(id),
    display_name: nullableString(displayName),
    avatar_url: nullableString(avatarUrl),
  }
}

/** The standing of a member who has never written anything. Built rather than
 * stored, which is proof 1: nothing fabricates a row to answer this. */
export function emptyStanding(): ResponsibilityStanding {
  return {
    responsibility_id: null,
    revision: EMPTY_RESPONSIBILITY_HASH,
    current_revision_id: null,
    revision_no: 0,
    content: null,
    updated_at: null,
    updated_by: null,
    active: true,
  }
}

/* ------------------------------------------------------------------ *
 * Reading the current standing
 * ------------------------------------------------------------------ */

/**
 * The current Responsibility standing of every named member of one Folder,
 * in **one statement** however many members are named.
 *
 * The batching is the point rather than an optimization, and it is acceptance
 * proof 22. A projection that read one member at a time would be correct and
 * would make the member list of a twenty-five-person Folder twenty-six
 * queries; the same shape then spreads to the panel, to the export and to
 * whatever reads them next. So the domain function takes a list and the route
 * passes one id, and AC-573 drives it with six members and counts statements.
 *
 * The join to the history table is on the unique `(responsibility_id,
 * revision_no)` index and carries the current revision's own id, so a caller
 * that wants to name the revision does not pay a second round trip for it.
 *
 * Ended documents are included and marked `active: false`. R10 keeps them
 * with the Folder and stops showing them as an *active member*
 * Responsibility; the caller decides which of the two it is rendering, and
 * `standingOfActive` below is the read that refuses to see them at all.
 */
export async function standingOf(
  executor: Executor,
  folderId: string,
  memberIds: readonly string[],
): Promise<Map<string, ResponsibilityStanding>> {
  const standings = new Map<string, ResponsibilityStanding>()
  for (const memberId of memberIds) standings.set(memberId, emptyStanding())
  if (memberIds.length === 0) return standings

  const ids = JSON.stringify([...memberIds])
  const found = await rowsOf(
    executor,
    sql`SELECT r.id, r.member_id, r.content, r.content_hash,
               r.current_revision_no, r.updated_at, r.ended_at,
               h.id AS revision_id,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
          FROM folder_responsibilities r
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = r.member_id
          LEFT JOIN folder_responsibility_history h
            ON h.responsibility_id = r.id
           AND h.revision_no = r.current_revision_no
          LEFT JOIN users u ON u.id = r.updated_by
         WHERE r.folder_id = ${folderId}::uuid
         ORDER BY (r.ended_at IS NULL) ASC, r.ended_at ASC, r.created_at ASC`,
  )
  /* Last write wins, and the ORDER BY is what makes the winner the right row:
     a member who rejoined has an ended document *and* a current one, and the
     ended one must not be the answer. Ascending on `ended_at IS NULL` puts
     false first and true last, so the active row -- if there is one -- is the
     last to be written into the map. */
  for (const row of found) {
    const memberId = String(row.member_id)
    const endedAt = nullableIso(row.ended_at)
    standings.set(memberId, {
      responsibility_id: String(row.id),
      revision: String(row.content_hash),
      current_revision_id: nullableString(row.revision_id),
      revision_no: Number(row.current_revision_no),
      content: storedDocument(
        row.content,
        `folder_responsibilities ${String(row.id)}`,
      ),
      updated_at: nullableIso(row.updated_at),
      updated_by: personFrom(
        row.actor_id,
        row.actor_display_name,
        row.actor_avatar_url,
      ),
      active: endedAt === null,
    })
  }
  return standings
}

/**
 * One member's **active** standing, or the empty standing when they have
 * none.
 *
 * An ended document is not the current Responsibility of anybody, so this
 * answers the empty standing for a member whose only document belongs to a
 * membership that ended. That is R10's rejoin rule read from the read side:
 * nothing silently reactivates, because nothing silently *shows*.
 */
export async function activeStandingOf(
  executor: Executor,
  folderId: string,
  memberId: string,
): Promise<ResponsibilityStanding> {
  const all = await standingOf(executor, folderId, [memberId])
  const standing = all.get(memberId) ?? emptyStanding()
  return standing.active ? standing : emptyStanding()
}

/* ------------------------------------------------------------------ *
 * The append-only record
 * ------------------------------------------------------------------ */

interface HistoryInput {
  folderId: string
  memberId: string
  responsibilityId: string | null
  transition: ResponsibilityTransition
  revisionNo: number | null
  content: ResponsibilityDocument | null
  actorId: string
}

/**
 * One append-only entry, written in the caller's transaction.
 *
 * There is deliberately no update and no delete beside it, and no endpoint
 * anywhere reaches one: R10 makes a correction a new revision rather than a
 * rewrite of the past, and #230 forbids an ordinary action that deletes an
 * old revision at all.
 */
async function recordResponsibilityTransition(
  tx: Executor,
  entry: HistoryInput,
): Promise<void> {
  const content =
    entry.content === null ? null : JSON.stringify(entry.content)
  const hash =
    entry.content === null ? null : responsibilityHash(entry.content)
  await tx.execute(
    sql`INSERT INTO folder_responsibility_history
          (folder_id, member_id, responsibility_id, transition, revision_no,
           content, content_hash, actor_id)
        VALUES (${entry.folderId}::uuid, ${entry.memberId}::uuid,
                ${entry.responsibilityId}::uuid, ${entry.transition},
                ${entry.revisionNo}, ${content}::jsonb, ${hash},
                ${entry.actorId}::uuid)`,
  )
}

/**
 * The Folder's Responsibility record, or one member's slice of it, **newest
 * first**, capped, and saying so when the cap cut.
 *
 * **Newest first and the flag are one decision, taken out of this branch's
 * second adversarial review and ruled on issue #230**
 * https://github.com/zhssnym/dana/issues/230#issuecomment-5754627068
 * **(Ruling 3, 2026-09-21).** Oldest-first with a silent cap is the worst of
 * both: a member with more entries than the limit was served the *oldest*
 * page and told nothing, so the panel that wants "what changed lately"
 * rendered the first fortnight of a folder's life forever and looked correct
 * doing it. Newest first makes the truncated tail the part nobody asked for,
 * and `truncated` is 10.3's list-response rule applied here rather than an
 * invention: a short list is never silently short.
 *
 * **The cap is 10.3's own and not a number of this route's**, which is the
 * rest of that ruling: `LIST_ROW_CAP` is imported rather than restated,
 * because 10.3's first row is a rule about list responses — `GET /labels`
 * took it on 2026-09-20 for that reason — and a second cap here would be the
 * contract decision 10.3 says its table has not taken. `truncated` is
 * strictly `>`: a record holding exactly the cap is complete and says so.
 *
 * **What the cap does not make this is a paged read.** The worst case of this
 * answer is a thousand entries each carrying a document snapshot, bounded by
 * the 256 KiB content cap and by nothing else. A paged read, or a list shape
 * without `content` beside a per-revision body route, is the real answer and
 * is a contract decision for a later issue (same ruling).
 *
 * R9A's boundary applies here exactly as it does to Access history: #230 owns
 * the truth of these records and makes them renderable by Folder History and
 * by a member-specific recent view. Filtering, search and grouping are the M2
 * History product's and are deliberately absent — inventing a query language
 * here is the duplication R9A warns about by name.
 *
 * This joins nothing to `folder_members`. An entry about somebody who has
 * left is the point rather than an edge case (proof 14), and the *reader's*
 * membership is what the route's gate settles (proof 15).
 */
export interface ResponsibilityHistoryPage {
  entries: ResponsibilityHistoryEntry[]
  truncated: boolean
}

export async function responsibilityHistoryOf(
  executor: Executor,
  folderId: string,
  options: { memberId?: string; limit?: number } = {},
): Promise<ResponsibilityHistoryPage> {
  const member =
    options.memberId === undefined
      ? sql``
      : sql` AND h.member_id = ${options.memberId}`
  const limit = Math.min(
    Math.max(options.limit ?? LIST_ROW_CAP, 1),
    LIST_ROW_CAP,
  )
  /* One row past the cap, which is how `truncated` is answered without a
     second COUNT over the same predicate: if the extra row came back the cap
     cut, and it is dropped before anyone sees it. */
  /* **`ORDER BY h.effective_at DESC, h.id DESC` has no monotonic tie-break,
     and that is deliberate rather than overlooked** (Ruling 5,
     https://github.com/zhssnym/dana/issues/230#issuecomment-5754627068).
     `id` is a random uuid and carries no order, and `effective_at` defaults
     to transaction time, which is identical for every row one transaction
     writes — so two entries appended by one transaction for one member would
     tie, and `id DESC` would break that tie arbitrarily rather than by age.
     The tie is unreachable today because every writer appends exactly one
     entry per transaction per (folder, member): `setSelfEditGrant`,
     `writeRevision` and `endResponsibilityStanding` are the three, and each
     records one transition for the member it names. **The first writer to
     append two entries for one member in one transaction owes this query a
     monotonic tie-break** — a sequence, or a per-member ordinal — and adding
     one is that change's job, not a later reader's guess at what the order
     was meant to be. */
  const found = await rowsOf(
    executor,
    sql`SELECT h.id, h.folder_id, h.member_id, h.responsibility_id,
               h.transition, h.revision_no, h.content, h.effective_at,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
          FROM folder_responsibility_history h
          JOIN users u ON u.id = h.actor_id
         WHERE h.folder_id = ${folderId}::uuid${member}
         ORDER BY h.effective_at DESC, h.id DESC
         LIMIT ${limit + 1}`,
  )
  const truncated = found.length > limit
  const page = truncated ? found.slice(0, limit) : found
  const entries = page.map((row) => {
    const actor = personFrom(
      row.actor_id,
      row.actor_display_name,
      row.actor_avatar_url,
    )
    if (actor === null) {
      // Unreachable behind the NOT NULL column and its inner join, and loud
      // rather than anonymised: #230 forbids fabricating a different
      // historical actor, and a null one here would be exactly that.
      throw new Error(
        `a Responsibility history row has no actor at ${String(row.id)}`,
      )
    }
    return {
      id: String(row.id),
      folder_id: String(row.folder_id),
      member_id: String(row.member_id),
      responsibility_id: nullableString(row.responsibility_id),
      transition: String(row.transition) as ResponsibilityTransition,
      revision_no:
        row.revision_no === null || row.revision_no === undefined
          ? null
          : Number(row.revision_no),
      content:
        row.content === null || row.content === undefined
          ? null
          : storedDocument(
              row.content,
              `folder_responsibility_history ${String(row.id)}`,
            ),
      actor,
      effective_at: toIso(row.effective_at),
    }
  })
  return { entries, truncated }
}

/* ------------------------------------------------------------------ *
 * The write
 * ------------------------------------------------------------------ */

/** The locked current document of one member, or null when they have none. */
interface LockedDocument {
  id: string
  contentHash: string
  revisionNo: number
}

async function lockedDocument(
  tx: Executor,
  folderId: string,
  memberId: string,
): Promise<LockedDocument | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT id, content_hash, current_revision_no
          FROM folder_responsibilities
         WHERE folder_id = ${folderId}::uuid
           AND member_id = ${memberId}::uuid
           AND ended_at IS NULL
         FOR UPDATE`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    contentHash: String(row.content_hash),
    revisionNo: Number(row.current_revision_no),
  }
}

/**
 * The write both the route and the two activation paths reach, once the
 * caller has decided the act is authorized.
 *
 * It is the whole of proof 8 and proof 12 in six statements: upsert the
 * current document, append the revision that describes the state it now
 * holds, and record the generic History line. Every one of them is in the
 * caller's transaction.
 */
async function writeRevision(
  tx: Executor,
  folderId: string,
  memberId: string,
  actorId: string,
  content: ResponsibilityDocument,
  existing: LockedDocument | null,
  folderName: string,
): Promise<{ responsibilityId: string; revisionNo: number }> {
  const hash = responsibilityHash(content)
  const payload = JSON.stringify(content)
  let responsibilityId: string
  let revisionNo: number
  if (existing === null) {
    const created = await rowsOf(
      tx,
      sql`INSERT INTO folder_responsibilities
            (folder_id, member_id, content, content_hash,
             current_revision_no, updated_by)
          VALUES (${folderId}::uuid, ${memberId}::uuid, ${payload}::jsonb,
                  ${hash}, 1, ${actorId}::uuid)
          RETURNING id`,
    )
    const row = created[0]
    if (row === undefined) {
      throw new Error('the Responsibility document insert returned no row')
    }
    responsibilityId = String(row.id)
    revisionNo = 1
  } else {
    responsibilityId = existing.id
    revisionNo = existing.revisionNo + 1
    await tx.execute(
      sql`UPDATE folder_responsibilities
             SET content = ${payload}::jsonb, content_hash = ${hash},
                 current_revision_no = ${revisionNo},
                 updated_at = now(), updated_by = ${actorId}::uuid
           WHERE id = ${responsibilityId}::uuid`,
    )
  }
  await recordResponsibilityTransition(tx, {
    folderId,
    memberId,
    responsibilityId,
    transition: revisionNo === 1 ? 'responsibility_created' : 'responsibility_updated',
    revisionNo,
    content,
    actorId,
  })
  /* The generic History line R9A permits and R10 describes: a projection of
     the structured revision above, never a second authoritative copy. 4.13's
     verb list is a CHECK constraint, so this rides 'edited' with the
     predicate in `detail`, exactly as an Access change does. Proof 23 is that
     the *structured* row carries actor, subject and kind, so a reader never
     has to parse this sentence to know what happened. */
  const subject = await rowsOf(
    tx,
    sql`SELECT display_name FROM users WHERE id = ${memberId}::uuid`,
  )
  const name = nullableString(subject[0]?.display_name)
  await recordEvent(tx, {
    actorId,
    verb: 'edited',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: folderName,
    folderId,
    detail:
      actorId === memberId
        ? 'updated their Responsibilities'
        : `updated ${name ?? 'a member'}'s Responsibilities`,
    recipients: actorId === memberId ? undefined : [memberId],
  })
  return { responsibilityId, revisionNo }
}

export type CommitResponsibilityResult =
  | { kind: 'committed'; standing: ResponsibilityStanding }
  /** The content sent already *is* the current content, so no revision was
   * written. Both an identical replay and a client re-sending what it has. */
  | { kind: 'unchanged'; standing: ResponsibilityStanding }
  /** `base_revision` does not match the authoritative current content and the
   * content sent is not the current content either: somebody else committed
   * in between (R10's optimistic-concurrency rule, proof 10). */
  | { kind: 'stale'; standing: ResponsibilityStanding }
  /** The named person is not an active member of this Folder. */
  | { kind: 'not_member' }
  /** The actor may not write this member's Responsibility. */
  | { kind: 'forbidden'; reason: string }

/**
 * Commit a Responsibility document state.
 *
 * The order inside the transaction is the whole design, and each step is
 * there because leaving it out breaks a named proof.
 *
 * 1. **Lock the Folder row**, first, exactly as every other membership
 *    operation on this surface does. Same lock, same order, so they queue
 *    rather than deadlock — the lock-order inversion #228 fixed in
 *    `patchTask` is the standing reminder that this is not a formality.
 * 2. **Lock the target's membership row** and read the self-edit grant off
 *    it. This is R7's transactional requirement applied to R7 section O's
 *    grant: the fact that authorizes is read under the lock of the write it
 *    authorizes, so a grant revoked a moment ago cannot let a request through
 *    on a projection that was merely fresh.
 * 3. **Decide**, through `mayPerform` and nothing else.
 * 4. **Compare canonical payloads before comparing revisions.** A commit
 *    whose content already equals the current content is a no-op whatever
 *    `base_revision` says — which is what makes a retry after a successful
 *    commit safe without a receipts table, and is proof 9.
 * 5. **Then** refuse a stale base (proof 10).
 * 6. Write.
 */
export async function commitResponsibility(
  db: Db,
  facts: FolderActorFacts,
  memberId: string,
  body: { content: ResponsibilityDocument; base_revision: string },
): Promise<CommitResponsibilityResult> {
  const folderId = facts.folderId
  const actorId = facts.actorId
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, memberId)
    if (target === null) return { kind: 'not_member' } as const

    const decision = mayPerform(facts, 'responsibility.manage', {
      memberId,
      selfEditGranted: target.canEditOwnResponsibilities,
    }).allowed
      ? { allowed: true as const }
      : mayPerform(facts, 'responsibility.edit.own', {
          memberId,
          selfEditGranted: target.canEditOwnResponsibilities,
        })
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }

    const existing = await lockedDocument(tx, folderId, memberId)
    const currentHash = existing?.contentHash ?? EMPTY_RESPONSIBILITY_HASH
    const nextHash = responsibilityHash(body.content)

    if (nextHash === currentHash) {
      return {
        kind: 'unchanged',
        standing: await activeStandingOf(tx, folderId, memberId),
      } as const
    }
    if (body.base_revision !== currentHash) {
      return {
        kind: 'stale',
        standing: await activeStandingOf(tx, folderId, memberId),
      } as const
    }

    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}::uuid`,
    )
    await writeRevision(
      tx,
      folderId,
      memberId,
      actorId,
      body.content,
      existing,
      String(named[0]?.name ?? ''),
    )
    return {
      kind: 'committed',
      standing: await activeStandingOf(tx, folderId, memberId),
    } as const
  })
}

/* ------------------------------------------------------------------ *
 * Activation: the initial content an authorized grantor may supply
 * ------------------------------------------------------------------ */

/**
 * The first revision of a member who is being activated with initial
 * content, written in the activation's own transaction.
 *
 * Two things #230 asks for, both of them here rather than at either call
 * site. **Attribution is the grantor's**: the actor recorded is the
 * administrator who added the member or wrote the invite, never the recipient
 * who accepted it, and proof 13 reads exactly this row. And **nothing is
 * fabricated**: a caller with no initial content does not call this, and a
 * caller whose initial content is canonically empty gets no row either, which
 * is the `EMPTY_RESPONSIBILITY` rule applied at the one moment it would
 * otherwise be tempting to write a placeholder.
 */
export async function createInitialResponsibility(
  tx: Executor,
  folderId: string,
  memberId: string,
  grantorId: string,
  content: ResponsibilityDocument,
  folderName: string,
): Promise<void> {
  if (responsibilityHash(content) === EMPTY_RESPONSIBILITY_HASH) return
  await writeRevision(
    tx,
    folderId,
    memberId,
    grantorId,
    content,
    null,
    folderName,
  )
}

/* ------------------------------------------------------------------ *
 * Lifecycle: the end of active standing
 * ------------------------------------------------------------------ */

/**
 * Close a member's active Responsibility standing, in the membership
 * operation's own transaction.
 *
 * R10: "current active Responsibility standing ends in the same governed
 * membership operation ... document/revision history is retained with the
 * Folder ... nothing is transferred to another member". So this stamps
 * `ended_at` and appends one entry, and deletes nothing at all. The partial
 * unique index frees the (folder, member) pair as it does so, which is what
 * makes a later rejoin start from nothing.
 *
 * A member who has no document has nothing to end, and nothing is recorded
 * for them: an entry saying a Responsibility ended where none existed would
 * be a fabrication of exactly the kind R10 forbids.
 */
export async function endResponsibilityStanding(
  tx: Executor,
  folderId: string,
  memberId: string,
  actorId: string,
): Promise<void> {
  const ended = await rowsOf(
    tx,
    sql`UPDATE folder_responsibilities SET ended_at = now()
         WHERE folder_id = ${folderId}::uuid
           AND member_id = ${memberId}::uuid
           AND ended_at IS NULL
        RETURNING id`,
  )
  const row = ended[0]
  if (row === undefined) return
  await recordResponsibilityTransition(tx, {
    folderId,
    memberId,
    responsibilityId: String(row.id),
    transition: 'responsibility_ended',
    revisionNo: null,
    content: null,
    actorId,
  })
}

/* ------------------------------------------------------------------ *
 * The self-edit grant
 * ------------------------------------------------------------------ */

export type SetSelfEditGrantResult =
  | { kind: 'changed'; enabled: boolean }
  | { kind: 'unchanged'; enabled: boolean }
  | { kind: 'not_member' }
  /** The target is the structural owner. R7 section M keeps the owner's own
   * standing out of another administrator's hands, and #230 restates it for
   * this grant: Full control may toggle it "for a non-owner/current member". */
  | { kind: 'target_is_owner' }

/**
 * Turn one member's self-edit grant on or off, atomically with the entry that
 * records it.
 *
 * #230: "changes to this grant must be recorded/history-visible as
 * consequential standing", which is why the entry is not optional and why an
 * unchanged toggle records nothing — an append-only record describes changes,
 * the same rule `changeMemberAccess` applies to `unchanged`.
 *
 * The owner refusal exists for R7 section M's reason rather than for
 * symmetry. The owner's route back to full authority is custody recovery, and
 * an administrator who could rewrite the owner's own standing would be
 * administering the anchor the recovery hangs from. An owner who is Full
 * control needs no grant, and an owner who has lowered themselves recovers
 * rather than asks.
 */
export async function setSelfEditGrant(
  db: Db,
  actorId: string,
  folderId: string,
  memberId: string,
  enabled: boolean,
): Promise<SetSelfEditGrantResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, memberId)
    if (target === null) return { kind: 'not_member' } as const
    if (target.isOwner) return { kind: 'target_is_owner' } as const
    if (target.canEditOwnResponsibilities === enabled) {
      return { kind: 'unchanged', enabled } as const
    }
    await tx.execute(
      sql`UPDATE folder_members
             SET can_edit_own_responsibilities = ${enabled}
           WHERE folder_id = ${folderId}::uuid AND user_id = ${memberId}::uuid`,
    )
    const document = await rowsOf(
      tx,
      sql`SELECT id FROM folder_responsibilities
           WHERE folder_id = ${folderId}::uuid
             AND member_id = ${memberId}::uuid
             AND ended_at IS NULL`,
    )
    await recordResponsibilityTransition(tx, {
      folderId,
      memberId,
      responsibilityId: nullableString(document[0]?.id),
      transition: enabled ? 'self_edit_granted' : 'self_edit_revoked',
      revisionNo: null,
      content: null,
      actorId,
    })
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u WHERE u.id = ${memberId})
                   AS target_name
            FROM folders f WHERE f.id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: enabled
        ? `enabled ${String(named[0]?.target_name ?? 'a member')} to edit their own Responsibilities`
        : `stopped ${String(named[0]?.target_name ?? 'a member')} editing their own Responsibilities`,
      recipients: [memberId],
    })
    return { kind: 'changed', enabled } as const
  })
}

/* ------------------------------------------------------------------ *
 * The member-details projection (#230 "Member-details backend contract")
 * ------------------------------------------------------------------ */

export interface MemberDetailsRow {
  user: Person
  isOwner: boolean
  joinedAt: string
  access: FolderAccessPreset
  canEditOwnResponsibilities: boolean
  assignedOpenTaskCount: number
  responsibility: ResponsibilityStanding
}

/**
 * The Folder-contextual details of every named member, in a **constant**
 * number of statements.
 *
 * Three statements for any number of members: the membership rows, their
 * assigned open Task counts, and `standingOf`'s single batched read. Acceptance
 * proof 22 is that this does not become one query per member, and AC-573
 * asserts it by counting statements through a wrapping executor rather than
 * by reading the code.
 *
 * It returns domain rows and not the wire shape. The two viewer-dependent
 * flags on the wire — may this viewer change the Access, may they change the
 * grant — are the route's to compute from `mayPerform`, because a projection
 * that answered them would be a projection that authorizes, which R8A forbids
 * by name.
 */
export async function memberDetailsOf(
  executor: Executor,
  folderId: string,
  memberIds: readonly string[],
): Promise<Map<string, MemberDetailsRow>> {
  const details = new Map<string, MemberDetailsRow>()
  if (memberIds.length === 0) return details
  const ids = JSON.stringify([...memberIds])

  const members = await rowsOf(
    executor,
    sql`SELECT u.id, u.display_name, u.avatar_url, m.access,
               m.can_edit_own_responsibilities, m.created_at AS joined_at,
               (m.user_id = f.owner_id) AS is_owner
          FROM folder_members m
          JOIN folders f ON f.id = m.folder_id
          JOIN users u ON u.id = m.user_id
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = m.user_id
         WHERE m.folder_id = ${folderId}::uuid`,
  )
  const counts = await rowsOf(
    executor,
    sql`SELECT t.assignee_id, count(*)::int AS n
          FROM tasks t
          JOIN jsonb_array_elements_text(${ids}::jsonb) AS wanted(member_id)
            ON wanted.member_id::uuid = t.assignee_id
         WHERE t.folder_id = ${folderId}::uuid
           AND t.deleted_at IS NULL
           AND t.status = 'pending'
         GROUP BY t.assignee_id`,
  )
  const byMember = new Map<string, number>()
  for (const row of counts) {
    byMember.set(String(row.assignee_id), Number(row.n))
  }
  const standings = await standingOf(
    executor,
    folderId,
    members.map((row) => String(row.id)),
  )

  for (const row of members) {
    const id = String(row.id)
    const standing = standings.get(id) ?? emptyStanding()
    details.set(id, {
      user: {
        id,
        display_name: nullableString(row.display_name),
        avatar_url: nullableString(row.avatar_url),
      },
      isOwner: row.is_owner === true,
      joinedAt: toIso(row.joined_at),
      access: String(row.access) as FolderAccessPreset,
      canEditOwnResponsibilities: row.can_edit_own_responsibilities === true,
      assignedOpenTaskCount: byMember.get(id) ?? 0,
      /* An ended document is not an active member's Responsibility. A member
         who rejoined and whose old document is still on the Folder reads as
         having none, which is R10's rejoin rule seen from the panel. */
      responsibility: standing.active ? standing : emptyStanding(),
    })
  }
  return details
}

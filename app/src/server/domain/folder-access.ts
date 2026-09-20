/*
The Folder authorization layer's impure half (issue #228; product authority
accepted #209 R8A for the ladder, #228's own authorization-resolver section
for this shape, R9 for the history).

## The table moved, and nothing else did

**`src/shared/folder-actions.ts` now holds the action vocabulary, the rules
table and `mayPerform`**, moved there unchanged on 2026-09-20 because the
client needs the same answers to decide what to draw and was hand-copying them
into a second, drifting ladder. That file's header carries the argument, the
four records every `why` cites, and the rule that a projection never
authorizes. Read it first; this file assumes it.

Every name it exports is re-exported below, so a caller that imported
`atLeast`, `mayPerform`, `ruleFor` or `FOLDER_ACTIONS` from here still does.
That is deliberate: a route asks its own domain for an authorization answer,
and the import path is not the interesting part of that sentence.

## What is left here

Everything that touches the database, because none of it can live in
`src/shared/`:

- `folderActorFacts` -- the durable facts, resolved against the caller's own
  transaction and snapshot;
- `otherFullControlCount` and `wouldStrand` -- the continuity invariant;
- `recordAccessTransition` and `accessHistoryOf` -- R9's append-only history;
- `lockedMembership` -- the row lock every Access write serializes behind.

**Projections never authorize.** The client may hide a control, and since the
move it computes that from the same table; the answer to "may this happen" is
only ever reached through a route, on facts read here.
*/
import { sql } from 'drizzle-orm'

import type {
  FolderAccessPreset,
  FolderAccessTransition,
} from '../../shared/folder-access.js'
import { presetOf } from '../../shared/folder-actions.js'
import type { FolderActorFacts } from '../../shared/folder-actions.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

/* The pure half, re-exported so that every server caller and every criterion
 * reaches it where it has always reached it. `src/shared/folder-actions.ts`
 * is the definition; this is one line of plumbing and never a second copy. */
export {
  FOLDER_ACTIONS,
  atLeast,
  mayPerform,
  presetOf,
  ruleFor,
} from '../../shared/folder-actions.js'
export type {
  FolderAction,
  FolderActionDecision,
  FolderActionTarget,
  FolderActorFacts,
} from '../../shared/folder-actions.js'

/* ------------------------------------------------------------------ *
 * Reading the facts
 * ------------------------------------------------------------------ */

/**
 * The actor's durable facts about one Folder, or null when the Folder does
 * not exist, is in Trash, or the actor is not a member -- which 10.2 makes
 * one answer, 404, never 403.
 *
 * Takes an `Executor` rather than a handle so a caller inside a transaction
 * resolves against the same snapshot it will write in. Every `Db` is an
 * `Executor`, so the ordinary read costs nothing extra.
 *
 * `includeTrashed` is for the two acts 7.13 performs *on* a trashed Folder --
 * restore and permanent destruction -- which must resolve access to a row the
 * ordinary predicate hides.
 */
export async function folderActorFacts(
  executor: Executor,
  actorId: string,
  folderId: string,
  options: { includeTrashed?: boolean } = {},
): Promise<FolderActorFacts | null> {
  const trashed =
    options.includeTrashed === true ? sql`` : sql` AND f.deleted_at IS NULL`
  const found = await rowsOf(
    executor,
    sql`SELECT (f.owner_id = ${actorId}) AS is_owner, f.is_default, f.name,
               m.access
        FROM folders f
        JOIN folder_members m ON m.folder_id = f.id
        WHERE f.id = ${folderId} AND m.user_id = ${actorId}${trashed}`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    // Unreachable behind the column's CHECK, and loud rather than guessed:
    // every default here would be a guess about what somebody may do.
    throw new Error(
      `folder_members.access holds an unknown preset for ${actorId} in ${folderId}`,
    )
  }
  return {
    folderId,
    actorId,
    access,
    isOwner: row.is_owner === true,
    isDefault: row.is_default === true,
    name: String(row.name),
  }
}

/* ------------------------------------------------------------------ *
 * The Full-control continuity invariant
 * ------------------------------------------------------------------ */

/**
 * How many *other* active members of this Folder hold Full control.
 *
 * "Human" is every member in M1: Dana has no AI member rows, and R8A is
 * explicit that a future AI Full control must not satisfy the sole-custodian
 * invariant. When those rows arrive, this predicate is the one place that has
 * to learn to exclude them, which is why it is a named function with this
 * paragraph attached rather than a count inlined at four call sites.
 *
 * Callers take the Folder row `FOR UPDATE` first. The count is only true for
 * as long as nothing else may change a membership row, and every operation
 * that could -- demote, remove, leave, transfer -- takes that same lock in
 * the same order, so they queue rather than interleave.
 */
export async function otherFullControlCount(
  tx: Executor,
  folderId: string,
  excludingUserId: string,
): Promise<number> {
  const found = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM folder_members
        WHERE folder_id = ${folderId} AND user_id <> ${excludingUserId}
          AND access = 'full_control'`,
  )
  return Number(found[0]?.n ?? 0)
}

/**
 * Whether removing, demoting or releasing `userId`'s Full control would leave
 * the Folder with no active human Full-control member.
 *
 * A Folder whose subject does not hold Full control cannot be the last one,
 * so the answer is false without a count; that ordering also keeps the
 * personal default Folder, which has exactly one member, out of the invariant
 * entirely when it is being left through a path that never had Full control.
 */
export async function wouldStrandFolder(
  tx: Executor,
  folderId: string,
  userId: string,
  heldAccess: FolderAccessPreset,
): Promise<boolean> {
  if (heldAccess !== 'full_control') return false
  return (await otherFullControlCount(tx, folderId, userId)) === 0
}

/* ------------------------------------------------------------------ *
 * The append-only history (R9)
 * ------------------------------------------------------------------ */

export interface AccessTransition {
  folderId: string
  memberId: string
  previousAccess: FolderAccessPreset | null
  newAccess: FolderAccessPreset | null
  /** Null only for a governed system transition, which in M1 is migration
   * initialization and nothing else; the table's CHECK agrees. */
  actorId: string | null
  transition: FolderAccessTransition
}

/**
 * One append-only transition row, written in the caller's transaction.
 *
 * It takes an `Executor` and opens nothing, which is R9 section 3's atomicity
 * requirement expressed as a type: the Access write and its history row must
 * commit together or not at all, and a function that opened its own
 * transaction could not promise that however carefully it were called.
 *
 * There is deliberately no update and no delete beside it. R9 section 15
 * makes corrections a new transition rather than a rewrite of the past.
 */
export async function recordAccessTransition(
  tx: Executor,
  entry: AccessTransition,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO folder_access_history
          (folder_id, member_id, previous_access, new_access, actor_id,
           transition)
        VALUES (${entry.folderId}::uuid, ${entry.memberId}::uuid,
                ${entry.previousAccess}, ${entry.newAccess},
                ${entry.actorId}::uuid, ${entry.transition})`,
  )
}

export interface AccessHistoryRow {
  id: string
  folder_id: string
  member_id: string
  previous_access: FolderAccessPreset | null
  new_access: FolderAccessPreset | null
  actor: { id: string; display_name: string | null; avatar_url: string | null } | null
  transition: FolderAccessTransition
  effective_at: string
}

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * The Folder's Access history, or one member's slice of it, oldest first.
 *
 * R9A draws the boundary this read respects: #228 owns the truth of these
 * records and makes them renderable by Folder History and by a member-specific
 * recent view; filtering, search and grouping are the M2 History product's and
 * are deliberately absent. `limit` exists so a member panel can ask for the
 * last few without inventing a query language.
 *
 * The history survives the membership it describes (R9 section 9), so this
 * joins nothing to `folder_members`: a row about somebody who has left is the
 * point rather than an edge case.
 */
export async function accessHistoryOf(
  executor: Executor,
  folderId: string,
  options: { memberId?: string; limit?: number } = {},
): Promise<AccessHistoryRow[]> {
  const member =
    options.memberId === undefined
      ? sql``
      : sql` AND h.member_id = ${options.memberId}`
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500)
  const found = await rowsOf(
    executor,
    sql`SELECT h.id, h.folder_id, h.member_id, h.previous_access,
               h.new_access, h.transition, h.effective_at,
               u.id AS actor_id, u.display_name AS actor_display_name,
               u.avatar_url AS actor_avatar_url
        FROM folder_access_history h
        LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.folder_id = ${folderId}${member}
        ORDER BY h.effective_at ASC, h.id ASC
        LIMIT ${limit}`,
  )
  return found.map((row) => ({
    id: String(row.id),
    folder_id: String(row.folder_id),
    member_id: String(row.member_id),
    previous_access: presetOf(row.previous_access),
    new_access: presetOf(row.new_access),
    actor:
      row.actor_id === null || row.actor_id === undefined
        ? null
        : {
            id: String(row.actor_id),
            display_name: nullableString(row.actor_display_name),
            avatar_url: nullableString(row.actor_avatar_url),
          },
    transition: String(row.transition) as FolderAccessTransition,
    effective_at: toIso(row.effective_at),
  }))
}

/* ------------------------------------------------------------------ *
 * The locked membership read every administration act begins with
 * ------------------------------------------------------------------ */

export interface LockedMembership {
  userId: string
  access: FolderAccessPreset
  isOwner: boolean
  /** R7 section O's explicit narrow grant (issue #230), read under the same
   * `FOR UPDATE` as the preset beside it. Every write that consults it reads
   * it here, so a grant revoked by a concurrent administrator cannot
   * authorize a write that started before the revocation committed. */
  canEditOwnResponsibilities: boolean
}

/**
 * One member's row, held for the rest of the transaction.
 *
 * R9 section 16 requires that two racing Access changes serialize or refuse
 * rather than both record a transition claiming the same `from`. This is the
 * lock that makes the first of those true: the row is taken `FOR UPDATE`, so
 * the second caller waits and then reads the first caller's result as its own
 * `from`. The optional `expected` preset in the request body is the second
 * half -- a caller who knows what it saw may insist on it.
 */
export async function lockedMembership(
  tx: Executor,
  folderId: string,
  userId: string,
): Promise<LockedMembership | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT m.user_id, m.access, m.can_edit_own_responsibilities,
               (f.owner_id = m.user_id) AS is_owner
        FROM folder_members m
        JOIN folders f ON f.id = m.folder_id
        WHERE m.folder_id = ${folderId} AND m.user_id = ${userId}
        FOR UPDATE OF m`,
  )
  const row = found[0]
  if (row === undefined) return null
  const access = presetOf(row.access)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${userId} in ${folderId}`,
    )
  }
  return {
    userId: String(row.user_id),
    access,
    isOwner: row.is_owner === true,
    canEditOwnResponsibilities: row.can_edit_own_responsibilities === true,
  }
}

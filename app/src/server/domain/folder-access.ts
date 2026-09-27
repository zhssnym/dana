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
import type { SQL } from 'drizzle-orm'

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
 * Access resolution: the 10.2 chokepoint fact
 * ------------------------------------------------------------------ */

/**
 * What every call site of `accessOf` has always had -- ownership, the default
 * flag and the folder's name, which the share-grant email renders -- plus,
 * since issue #228, the member's persisted
 * Access preset and the two ids the resolver needs.
 *
 * It *is* `FolderActorFacts` rather than a shape of its own, so that the
 * twenty-odd existing gates can hand what they already resolved straight to
 * `mayPerform` without a second read and without a conversion that could
 * lose a field.
 */
export type FolderAccess = FolderActorFacts

/** Null means the folder does not exist, is in Trash, or the viewer is not a
 * member, which 10.2 makes the same answer: 404, never 403.
 *
 * The executor rather than the handle, so a caller inside a transaction
 * resolves access against the same snapshot it will write in; task moves
 * need exactly that, and every Db is an Executor.
 *
 * A second name for `folderActorFacts`, kept because "resolve the folder"
 * and "decide the action" are two steps that should keep two names. It moved
 * here from `folders.ts` so that lower modules (files, invites) reach it
 * without importing the Folder module and closing an import cycle. */
export async function accessOf(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<FolderAccess | null> {
  return folderActorFacts(executor, viewerId, folderId)
}


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
  const found = await resolveScoped(executor, 'folder', folderId, actorId, {
    folder: options.includeTrashed === true ? 'any' : 'live',
  })
  return found === null ? null : found.facts
}

/* ------------------------------------------------------------------ *
 * The one visibility check (10.2)
 * ------------------------------------------------------------------ */

/*
Who sees a row is one sentence: the viewer is a member of the row's Folder,
and that Folder is not in Trash unless the caller is one of 7.13's acts on
Trash. Lists, search and single-row reads say it through the three helpers
below rather than writing the join again, so a query cannot drop half of it.

- `visibleFolder` is the sentence as a predicate, for a WHERE or an EXISTS.
- `joinVisibleFolder` is the same sentence as joins, for a query that also
  reads the Folder or the membership row (name, preset, shelf).
- `resolveScoped` is one row by id with the actor's facts, for the gates.

Aliases are code, never input: `alias` refuses anything but a short
identifier, because it is spliced into SQL raw.
*/

/** Which Folders a read admits: the ordinary surface sees `live` ones only;
 * Trash's own acts see `trashed` or `any`. */
export type FolderTrash = 'live' | 'trashed' | 'any'

function alias(name: string): SQL {
  if (!/^[a-z_][a-z0-9_]{0,15}$/.test(name)) {
    throw new Error(`not a SQL alias: ${name}`)
  }
  return sql.raw(name)
}

function trashClause(folder: SQL, trashed: FolderTrash): SQL {
  if (trashed === 'live') return sql` AND ${folder}.deleted_at IS NULL`
  if (trashed === 'trashed') return sql` AND ${folder}.deleted_at IS NOT NULL`
  return sql``
}

/**
 * True when the Folder whose id is `folderId` (a column, such as
 * sql`t.folder_id`) is visible to `viewerId`.
 */
export function visibleFolder(
  folderId: SQL,
  viewerId: string,
  options: { trashed?: FolderTrash } = {},
): SQL {
  const trashed = trashClause(sql`vis_f`, options.trashed ?? 'live')
  return sql`EXISTS (SELECT 1 FROM folders vis_f
      JOIN folder_members vis_m ON vis_m.folder_id = vis_f.id
     WHERE vis_f.id = ${folderId} AND vis_m.user_id = ${viewerId}${trashed})`
}

/**
 * The same check as joins, binding `folder` (default `fo`) and `member`
 * (default `m`) for the columns the caller reads.
 *
 * With `folderId`, it joins `folders` on that column first. Without it, the
 * caller's FROM already holds the Folder under `folder`, and only the
 * membership join is added (carrying the trash clause in its ON, which for an
 * inner join is the same as a WHERE).
 */
export function joinVisibleFolder(
  viewerId: string,
  options: {
    folderId?: SQL
    folder?: string
    member?: string
    trashed?: FolderTrash
  } = {},
): SQL {
  const f = alias(options.folder ?? 'fo')
  const m = alias(options.member ?? 'm')
  const trashed = trashClause(f, options.trashed ?? 'live')
  const membership = sql`JOIN folder_members ${m}
      ON ${m}.folder_id = ${f}.id AND ${m}.user_id = ${viewerId}`
  return options.folderId === undefined
    ? sql`${membership}${trashed}`
    : sql`JOIN folders ${f} ON ${f}.id = ${options.folderId}${trashed}
    ${membership}`
}

/** The rows `resolveScoped` reads, each with its alias and whether it has a
 * trash column of its own. A comment has none: it leaves with its Discussion
 * or its Folder. */
const SCOPED = {
  folder: { table: 'folders', as: 'fo', trash: true },
  task: { table: 'tasks', as: 't', trash: true },
  comment: { table: 'comments', as: 'c', trash: false },
  facet: { table: 'folder_facets', as: 'ff', trash: true },
} as const

export type ScopedKind = keyof typeof SCOPED

export interface Scoped {
  /** The row as the caller's `columns` asked for it. */
  row: Record<string, unknown>
  facts: FolderActorFacts
  folderTrashed: boolean
}

/**
 * One row by id, with the actor's Folder facts from the same statement, or
 * null when the row, its Folder or the membership is not there -- 10.2's one
 * answer, 404, never 403.
 *
 * `columns` are read beside the facts; they may name the row's alias (`t`,
 * `c`, `ff`, or `fo` for a folder), the Folder as `fo` and the membership as
 * `m`. `row` and `folder` say which trash states are admitted, `live` by
 * default. `lock` takes the row itself `FOR UPDATE` and nothing else.
 */
export async function resolveScoped(
  executor: Executor,
  kind: ScopedKind,
  id: string,
  viewerId: string,
  options: {
    columns?: SQL
    row?: FolderTrash
    folder?: FolderTrash
    where?: SQL
    lock?: boolean
  } = {},
): Promise<Scoped | null> {
  const scoped = SCOPED[kind]
  const r = alias(scoped.as)
  const folder = options.folder ?? 'live'
  const from =
    kind === 'folder'
      ? sql`FROM folders fo ${joinVisibleFolder(viewerId, { trashed: folder })}`
      : sql`FROM ${alias(scoped.table)} ${r} ${joinVisibleFolder(viewerId, {
          folderId: sql`${r}.folder_id`,
          trashed: folder,
        })}`
  const rowTrash =
    kind === 'folder' || !scoped.trash
      ? sql``
      : trashClause(r, options.row ?? 'live')
  const columns =
    options.columns === undefined ? sql`` : sql`${options.columns}, `
  const where =
    options.where === undefined ? sql`` : sql` AND ${options.where}`
  const lock = options.lock === true ? sql` FOR UPDATE OF ${r}` : sql``
  const found = await rowsOf(
    executor,
    sql`SELECT ${columns}fo.id AS scoped_folder_id,
               fo.name AS scoped_folder_name,
               fo.is_default AS scoped_folder_is_default,
               (fo.owner_id = m.user_id) AS scoped_is_owner,
               m.access AS scoped_access,
               (fo.deleted_at IS NOT NULL) AS scoped_folder_trashed
        ${from}
        WHERE ${r}.id = ${id}${rowTrash}${where}${lock}`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    row,
    facts: factsFromRow(
      {
        folder_id: row.scoped_folder_id,
        folder_name: row.scoped_folder_name,
        folder_is_default: row.scoped_folder_is_default,
        is_owner: row.scoped_is_owner,
        access: row.scoped_access,
      },
      viewerId,
    ),
    folderTrashed: row.scoped_folder_trashed === true,
  }
}

/**
 * The actor's facts off a row a visibility join already scoped, reading
 * `folder_id`, `folder_name`, `folder_is_default`, `is_owner` and `access`.
 */
export function factsFromRow(
  row: Record<string, unknown>,
  viewerId: string,
): FolderActorFacts {
  const folderId = String(row.folder_id)
  return {
    folderId,
    actorId: viewerId,
    access: presetFromRow(row.access, viewerId, folderId),
    isOwner: row.is_owner === true,
    isDefault: row.folder_is_default === true,
    name: String(row.folder_name),
  }
}

/**
 * A membership row's preset, **refused rather than defaulted**: the column's
 * CHECK makes an unknown value unreachable, and every default here would be a
 * guess about what somebody may do.
 */
export function presetFromRow(
  value: unknown,
  viewerId: string,
  folderId: string,
): FolderAccessPreset {
  const access = presetOf(value)
  if (access === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for ${viewerId} in ${folderId}`,
    )
  }
  return access
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

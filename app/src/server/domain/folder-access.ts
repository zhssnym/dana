// Folder authorization, database half. The action table and `mayPerform` live in src/shared/folder-actions.ts
// and are re-exported here. Projections never authorize: only a route, on facts read here, decides.
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

/** The facts every `accessOf` caller gets, ready to hand to `mayPerform`. */
export type FolderAccess = FolderActorFacts

/**
 * Null when the folder is missing, in Trash, or the viewer is not a member: 404, never 403 (10.2).
 * Lives here so lower modules can use it without an import cycle through folders.ts.
 */
export async function accessOf(
  executor: Executor,
  viewerId: string,
  folderId: string,
): Promise<FolderAccess | null> {
  return folderActorFacts(executor, viewerId, folderId)
}

/**
 * The project of `folderId`, or null. Membership rows live on the project root only, so every membership read
 * and write uses this id. Callers gate on the page first.
 */
export async function projectOf(executor: Executor, folderId: string): Promise<string | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT project_id FROM folders WHERE id = ${folderId}::uuid`,
  )
  const project = rows[0]?.project_id
  return project === undefined || project === null ? null : String(project)
}

/** `folderId`'s project as SQL. */
export function projectIdOf(folderId: string): SQL {
  return sql`(SELECT pr_f.project_id FROM folders pr_f WHERE pr_f.id = ${folderId}::uuid)`
}

/**
 * The actor's facts about one Folder, or null when missing, in Trash, or not a member (404, 10.2).
 * `includeTrashed` is for restore and permanent destruction.
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

/*
Visibility: the viewer is a member of the row's project and the Folder is not in Trash.
Use these helpers instead of writing the join again. `alias` accepts only short identifiers: it is spliced into SQL raw.
 */

/** Which Folders a read admits. `any` is live and trashed, not archived. */
export type FolderTrash = 'live' | 'trashed' | 'archived' | 'any'

function alias(name: string): SQL {
  if (!/^[a-z_][a-z0-9_]{0,15}$/.test(name)) {
    throw new Error(`not a SQL alias: ${name}`)
  }
  return sql.raw(name)
}

function trashClause(folder: SQL, trashed: FolderTrash): SQL {
  if (trashed === 'live') return sql` AND ${folder}.deleted_at IS NULL AND ${folder}.archived_at IS NULL`
  if (trashed === 'trashed') return sql` AND ${folder}.deleted_at IS NOT NULL`
  if (trashed === 'archived') return sql` AND ${folder}.archived_at IS NOT NULL`
  return sql` AND ${folder}.archived_at IS NULL`
}

/** True when the Folder in column `folderId` (e.g. sql`t.folder_id`) is visible to `viewerId`. */
export function visibleFolder(
  folderId: SQL,
  viewerId: string,
  options: { trashed?: FolderTrash } = {},
): SQL {
  const trashed = trashClause(sql`vis_f`, options.trashed ?? 'live')
  return sql`EXISTS (SELECT 1 FROM folders vis_f
      JOIN folder_members vis_m ON vis_m.folder_id = vis_f.project_id
     WHERE vis_f.id = ${folderId} AND vis_m.user_id = ${viewerId}${trashed})`
}

/**
 * The same check as joins, binding `folder` (default `fo`) and `member` (default `m`).
 * Without `folderId`, the caller's FROM already holds the Folder.
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
      ON ${m}.folder_id = ${f}.project_id AND ${m}.user_id = ${viewerId}`
  return options.folderId === undefined
    ? sql`${membership}${trashed}`
    : sql`JOIN folders ${f} ON ${f}.id = ${options.folderId}${trashed}
    ${membership}`
}

/** A comment has no trash column: it leaves with its Discussion or its Folder. */
const SCOPED = {
  folder: { table: 'folders', as: 'fo', trash: true },
  task: { table: 'tasks', as: 't', trash: true },
  comment: { table: 'comments', as: 'c', trash: false },
} as const

export type ScopedKind = keyof typeof SCOPED

export interface Scoped {
  row: Record<string, unknown>
  facts: FolderActorFacts
  folderTrashed: boolean
}

/**
 * One row by id with the actor's facts, or null (404, 10.2). `columns` may use the row's alias, `fo` and `m`.
 * `lock` takes only the row itself FOR UPDATE.
 */
export async function resolveScoped(
  executor: Executor,
  kind: ScopedKind,
  id: string,
  viewerId: string,
  options: {
    columns?: SQL
    row?: Exclude<FolderTrash, 'archived'>
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
      : options.row === 'trashed'
        ? sql` AND ${r}.deleted_at IS NOT NULL`
        : options.row === 'any'
          ? sql``
          : sql` AND ${r}.deleted_at IS NULL`
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

/** Facts from a row a visibility join already scoped. */
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

/** Throws rather than defaulting: a default would be a guess about authority. */
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

/**
 * How many other active members hold Full control. Exclude future AI members here (R8A).
 * Callers lock the Folder row first, as every membership change does.
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

/** Whether removing `userId`'s Full control would leave no human Full-control member. */
export async function wouldStrandFolder(
  tx: Executor,
  folderId: string,
  userId: string,
  heldAccess: FolderAccessPreset,
): Promise<boolean> {
  if (heldAccess !== 'full_control') return false
  return (await otherFullControlCount(tx, folderId, userId)) === 0
}

export interface AccessTransition {
  folderId: string
  memberId: string
  previousAccess: FolderAccessPreset | null
  newAccess: FolderAccessPreset | null
  /** Null only for system transitions (migration initialization); the table's CHECK agrees. */
  actorId: string | null
  transition: FolderAccessTransition
}

/** One append-only transition row, in the caller's transaction, so it commits with the Access write. Never updated. */
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

/** The Access history, oldest first. Joins nothing to folder_members: history outlives membership. */
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

export interface LockedMembership {
  userId: string
  access: FolderAccessPreset
  isOwner: boolean
  /** Read under the same FOR UPDATE, so a concurrently revoked grant cannot authorize this write. */
  canEditOwnResponsibilities: boolean
}

/**
 * One member's row, locked FOR UPDATE for the transaction, so racing Access changes serialize.
 * The optional `expected` preset lets a caller insist on what it saw.
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

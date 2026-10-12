// Folders and membership (7.4, 5.3, 5.4, R-CLEAN, 8.8, 8.9, 8.11). Every query is scoped to the viewer
// or to a folder whose access the caller resolved. Results are discriminated unions; routes map statuses.
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import type { Folder, PageKind, SectionProgress } from '../../shared/folders.js'
import type { LabelRef } from '../../shared/labels.js'
import type { ResponsibilityDocument } from '../../shared/responsibility.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recomputeReminders } from '../time/reminder-recompute.js'
import { recordEvent } from './events.js'
import {
  folderActorFacts,
  lockedMembership,
  mayPerform,
  otherFullControlCount,
  projectIdOf,
  presetOf,
  recordAccessTransition,
} from './folder-access.js'
import { joinVisibleFolder } from './folder-access.js'
import type { FolderAccess } from './folder-access.js'
import { folderPersonalLabelsFor } from './labels.js'
import {
  createInitialResponsibility,
  endResponsibilityStanding,
} from './responsibility.js'
import {
  PAGE_TREE_EDIT_ACTION,
  appendHomeBlock,
  lastChildPosition,
  lockPageTree,
  mayAddChildUnder,
  releaseSurvivors,
  removeHomeBlock,
  trashPageSubtree,
  visibleParentPredicate,
} from './page-tree.js'
import { pagesTabFor } from './project-tabs.js'
import { ensureShelf } from './shelves.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function folderFromRow(
  row: Record<string, unknown>,
  personalLabels: LabelRef[],
): Folder {
  /* The viewer's own preset, from `m` (the viewer's membership, never the owner's). Refused rather than defaulted. */
  const myAccess = presetOf(row.my_access)
  if (myAccess === null) {
    throw new Error(
      `folder_members.access holds an unknown preset for the viewer of folder ${String(row.id)}`,
    )
  }
  return {
    id: String(row.id),
    name: String(row.name),
    is_default: row.is_default === true,
    is_owner: row.is_owner === true,
    member_count: Number(row.member_count),
    counts: {
      pending: Number(row.pending),
      completed: Number(row.completed),
    },
    progress: {
      done: Number(row.one_off_done),
      total: Number(row.one_off_total),
      recurring_active: Number(row.recurring_active),
    },
    my_shelf: nullableString(row.my_shelf),
    my_color: nullableString(row.my_color),
    my_access: myAccess,
    /* The viewer's own Personal Labels on this folder; Folder Labels classify its tasks, not the folder. */
    personal_labels: personalLabels,
    icon: nullableString(row.icon),
    color: nullableString(row.color),
    cover_file_id: nullableString(row.cover_file_id),
    cover_preset: nullableString(row.cover_preset),
    cover_focal_y: Number(row.cover_focal_y ?? 50),
    description: nullableString(row.description),
    /* `folderSelect` nulls both unless the parent is live and the viewer is a member of it. */
    parent_folder_id: nullableString(row.parent_folder_id),
    child_position: nullableString(row.child_position),
    project_id: String(row.project_id),
    kind: pageKindOf(row.kind),
    tab_position: nullableString(row.tab_position),
  }
}

/** A stored `folders.kind`, or null for a root whose kind is unpicked. */
export function pageKindOf(value: unknown): PageKind | null {
  return value === 'doc' || value === 'work' || value === 'discussion' ? value : null
}

/** A Task superseded by a later occurrence of its series (8.5). A null series_id never matches. */
const supersededOccurrence = sql`EXISTS (
  SELECT 1 FROM tasks s
   WHERE s.series_id = t.series_id AND s.id <> t.id
     AND (s.created_at, s.id) > (t.created_at, t.id))`

/**
 * One query for the list and the single view; the membership join is the scope (10.2).
 * `m` is the viewer's own membership: `my_access` must come from it, never from the owner's row.
 */
function folderSelect(viewerId: string, folderId?: string) {
  const scope =
    folderId === undefined ? sql`` : sql` AND f.id = ${folderId}`
  return sql`
    SELECT f.id, f.name, f.is_default,
           (f.owner_id = ${viewerId}) AS is_owner,
           f.icon, f.color, f.cover_file_id, f.cover_preset, f.cover_focal_y,
           f.description, f.kind,
           -- Step 8: whoever sees a page sees its project.
           f.project_id, f.tab_position,
           -- Wave 2: a hidden or trashed parent is no parent to this viewer.
           CASE WHEN ${visibleParentPredicate(viewerId)}
                THEN f.parent_folder_id END AS parent_folder_id,
           CASE WHEN ${visibleParentPredicate(viewerId)}
                THEN f.child_position END AS child_position,
           -- Step 8: the membership row is the project's. A shelf holds
           -- projects; colour is the project's for every page of it.
           CASE WHEN f.id = f.project_id THEN m.shelf_name END AS my_shelf,
           m.color AS my_color,
           m.access AS my_access,
           (SELECT count(*)::int FROM folder_members mm
             WHERE mm.folder_id = f.project_id) AS member_count,
           c.pending, c.completed, c.one_off_done, c.one_off_total,
           c.recurring_active
    FROM folders f
    ${joinVisibleFolder(viewerId, { folder: 'f' })}
    -- One pass over the folder's live tasks for all five counts (#205).
    CROSS JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE t.status = 'pending')::int AS pending,
        count(*) FILTER (WHERE t.status = 'completed')::int AS completed,
        -- A completed occurrence keeps its series_id and loses its rule to
        -- the successor (8.5), so a null rule alone would count every
        -- finished occurrence as one-off and grow the total forever. Only
        -- an occurrence with a later one in its series is left out: a task
        -- whose repeat was turned off keeps its series_id too, and it is
        -- one-off work that must still count once done.
        count(*) FILTER (WHERE t.status = 'completed'
                           AND t.recurrence_rule IS NULL
                           AND NOT ${supersededOccurrence})::int AS one_off_done,
        count(*) FILTER (WHERE t.recurrence_rule IS NULL
                           AND (t.status = 'pending'
                                OR (t.status = 'completed'
                                    AND NOT ${supersededOccurrence})))::int AS one_off_total,
        count(*) FILTER (WHERE t.status = 'pending'
                           AND t.recurrence_rule IS NOT NULL)::int AS recurring_active
        FROM tasks t
       WHERE t.folder_id = f.id AND t.deleted_at IS NULL
    ) c
    WHERE true${scope}
    ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC`
}

/** Personal Labels in one batched second statement, so joining them cannot multiply the folder rows. */
async function withPersonalLabels(
  db: Db,
  viewerId: string,
  rows: Record<string, unknown>[],
): Promise<Folder[]> {
  const labels = await folderPersonalLabelsFor(
    db,
    viewerId,
    rows.map((row) => String(row.id)),
  )
  return rows.map((row) => folderFromRow(row, labels.get(String(row.id)) ?? []))
}

/** GET /folders, in 7.4's order: is_default first, then lower(name), id. */
export async function listFolders(db: Db, viewerId: string): Promise<Folder[]> {
  return withPersonalLabels(db, viewerId, await rowsOf(db, folderSelect(viewerId)))
}

/** GET /folders for pre-tab clients: other project tabs left out, pages under a tab listed under the root. */
export function withoutProjectTabs(folders: readonly Folder[]): Folder[] {
  const tabProject = new Map(
    folders
      .filter((f) => f.tab_position !== null && f.id !== f.project_id)
      .map((f) => [f.id, f.project_id]),
  )
  return folders
    .filter((f) => !tabProject.has(f.id))
    .map((f) => {
      const lifted = f.parent_folder_id == null ? undefined : tabProject.get(f.parent_folder_id)
      return lifted === undefined ? f : { ...f, parent_folder_id: lifted }
    })
}

export async function folderView(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<Folder | null> {
  const found = await rowsOf(db, folderSelect(viewerId, folderId))
  if (found.length === 0) return null
  const [folder] = await withPersonalLabels(db, viewerId, found)
  return folder ?? null
}

/**
 * Per-Section progress for GET /folders/:id, zeros included. A Task counts only toward its own Section,
 * and only when that Section is in this folder.
 */
export async function sectionProgressOf(
  db: Executor,
  folderId: string,
): Promise<SectionProgress[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT b.id,
               count(t.id) FILTER (WHERE t.status = 'completed'
                 AND t.recurrence_rule IS NULL
                 AND NOT ${supersededOccurrence})::int AS one_off_done,
               count(t.id) FILTER (WHERE t.recurrence_rule IS NULL
                 AND (t.status = 'pending'
                      OR (t.status = 'completed'
                          AND NOT ${supersededOccurrence})))::int AS one_off_total,
               count(t.id) FILTER (WHERE t.status = 'pending'
                 AND t.recurrence_rule IS NOT NULL)::int AS recurring_active
          FROM page_blocks b
          LEFT JOIN tasks t
            ON t.section_block_id = b.id
           AND t.folder_id = b.folder_id
           AND t.deleted_at IS NULL
         WHERE b.folder_id = ${folderId}::uuid AND b.kind = 'section'
         GROUP BY b.id
         ORDER BY b.id`,
  )
  return rows.map((row) => ({
    section_block_id: String(row.id),
    done: Number(row.one_off_done),
    total: Number(row.one_off_total),
    recurring_active: Number(row.recurring_active),
  }))
}

export type CreateFolderResult =
  | { kind: 'created'; folder: Folder }
  | { kind: 'folder_cap' }

/*
The 10.3 cap counts custom projects. The count and insert share a transaction behind a lock on the owner's
user row (the folders themselves cannot be locked: the one that would break the cap does not exist yet).
 */
export async function createFolder(
  db: Db,
  viewerId: string,
  name: string,
  description: string | null = null,
  kind: PageKind | null = 'work',
): Promise<CreateFolderResult> {
  return inTransaction(db, async (tx) => {
    const id = await insertOwnedFolder(tx, viewerId, {
      name,
      description,
      parentId: null,
      childPosition: null,
      kind,
    })
    if (id === null) return { kind: 'folder_cap' }
    return {
      kind: 'created',
      folder: {
        id,
        name,
        is_default: false,
        is_owner: true,
        member_count: 1,
        counts: { pending: 0, completed: 0 },
        my_shelf: null,
        my_color: null,
        /* The creator is the only member, written as `full_control` in `insertOwnedFolder`. */
        my_access: 'full_control',
        personal_labels: [],
        icon: null,
        color: null,
        cover_file_id: null,
        cover_preset: null,
        cover_focal_y: 50,
        description,
        parent_folder_id: null,
        child_position: null,
        project_id: id,
        kind,
        tab_position: 'a0',
      },
    }
  })
}

/**
 * The 10.3 cap on custom projects, behind the account's row lock: true when adding `adding` would pass 200.
 * Only project roots count, so a collaborator's sub-pages cannot spend the owner's cap.
 */
export async function projectCapReached(
  tx: Executor,
  viewerId: string,
  adding: number,
): Promise<boolean> {
  await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
  const owned = await rowsOf(
    tx,
    sql`SELECT count(*)::int AS n FROM folders
        WHERE owner_id = ${viewerId} AND NOT is_default
          AND deleted_at IS NULL AND id = project_id`,
  )
  return Number(owned[0]?.n ?? 0) + adding > 200
}

/**
 * The insert every new owned page shares: cap check, row, a new project's Full-control membership and transition,
 * and the `created` event. Null at the cap. A root is a new project; a sub-page joins its parent's.
 */
async function insertOwnedFolder(
  tx: Executor,
  viewerId: string,
  input: {
    id?: string
    name: string
    description: string | null
    parentId: string | null
    childPosition: string | null
    kind: PageKind | null
  },
): Promise<string | null> {
  // Trashed folders do not count, and only project roots do.
  if (input.parentId === null && (await projectCapReached(tx, viewerId, 1))) return null

  const newId = input.id ?? randomUUID()
  const project =
    input.parentId === null
      ? sql`${newId}::uuid`
      : sql`(SELECT p.project_id FROM folders p WHERE p.id = ${input.parentId}::uuid)`
  const kind = input.parentId === null ? input.kind : (input.kind ?? 'doc')
  /* A page's owner is its project's, so 8.10 never deletes a page out of a surviving project. */
  const owner =
    input.parentId === null
      ? sql`${viewerId}::uuid`
      : sql`(SELECT p.owner_id FROM folders p WHERE p.id = ${input.parentId}::uuid)`
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO folders (id, owner_id, name, description,
                             parent_folder_id, child_position,
                             project_id, kind, tab_position)
        VALUES (${newId}::uuid, ${owner}, ${input.name},
                ${input.description}, ${input.parentId}::uuid,
                ${input.childPosition}, ${project}, ${kind},
                ${input.parentId === null ? 'a0' : null})
        RETURNING id`,
  )
  const id = String(inserted[0]?.id)
  if (input.parentId === null) await insertCreatorMembership(tx, viewerId, id)
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'created',
    subjectKind: 'folder',
    subjectId: id,
    subjectName: input.name,
    folderId: id,
  })
  return id
}

/** Only a project root holds membership rows; a sub-page's people are its project's. */
async function insertCreatorMembership(tx: Executor, viewerId: string, id: string): Promise<void> {
  /* Owner and Full control are separate facts from here on. `created_owner`, not `member_added`,
  marks the first standing in history. Same transaction as the membership (R9). */
  await tx.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${id}::uuid, ${viewerId}::uuid, 'full_control')`,
  )
  await recordAccessTransition(tx, {
    folderId: id,
    memberId: viewerId,
    previousAccess: null,
    newAccess: 'full_control',
    actorId: viewerId,
    transition: 'created_owner',
  })
}

export type CreateSubPageResult =
  | { kind: 'created'; id: string }
  | { kind: 'folder_cap' }
  /** The parent is missing, trashed or not the actor's: 404 (10.2). */
  | { kind: 'parent_not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'default_parent' }
  | { kind: 'too_deep' }
  /** The parent is a Discussion page, which holds threads: 422. */
  | { kind: 'discussion_parent' }

/**
 * A new page under `parentId` in the caller's transaction. Needs `folder.page.edit` on the parent; takes the tree lock
 * before reading. Its home block is appended to the parent's Main document unless `homeBlock` is false.
 */
export async function createSubPage(
  tx: Executor,
  actorId: string,
  parentId: string,
  input: { id?: string; name: string; description?: string | null; homeBlock?: boolean; kind?: PageKind | null },
): Promise<CreateSubPageResult> {
  await lockPageTree(tx)
  const parent = await folderActorFacts(tx, actorId, parentId)
  if (parent === null) return { kind: 'parent_not_found' }
  const decision = mayPerform(parent, PAGE_TREE_EDIT_ACTION)
  if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
  if (parent.isDefault) return { kind: 'default_parent' }
  const parentKind = await rowsOf(tx, sql`SELECT kind FROM folders WHERE id = ${parentId}::uuid`)
  if (parentKind[0]?.kind === 'discussion') return { kind: 'discussion_parent' }
  /* A page added inside a Work tab lands in the project's Pages tab. */
  if (input.homeBlock !== false && parentKind[0]?.kind === 'work') {
    const pages = await pagesTabFor(tx, actorId, parentId)
    if (pages !== null) parentId = pages
  }
  if (!(await mayAddChildUnder(tx, parentId))) return { kind: 'too_deep' }

  const id = await insertOwnedFolder(tx, actorId, {
    id: input.id,
    name: input.name,
    description: input.description ?? null,
    parentId,
    childPosition: await lastChildPosition(tx, parentId),
    kind: input.kind ?? 'doc',
  })
  if (id === null) return { kind: 'folder_cap' }
  if (input.homeBlock !== false) await appendHomeBlock(tx, parentId, id)
  return { kind: 'created', id }
}

export async function createSubPageIn(
  db: Db,
  actorId: string,
  parentId: string,
  input: { name: string; description?: string | null; kind?: PageKind | null },
): Promise<CreateSubPageResult> {
  return inTransaction(db, (tx) => createSubPage(tx, actorId, parentId, input))
}

export interface FolderProfilePatch {
  name?: string
  icon?: string | null
  color?: string | null
  coverFileId?: string | null
  coverPreset?: string | null
  coverFocalY?: number
  description?: string | null
}

export type PatchProfileResult = 'patched' | 'cover_not_here'

/** Rename and identity in one write and one event. A cover must be an image-kinded file of this folder. */
export async function patchFolderProfile(
  db: Db,
  actorId: string,
  folderId: string,
  patch: FolderProfilePatch,
): Promise<PatchProfileResult> {
  return inTransaction(db, async (tx) => {
    /* No copy is needed: the cover must be this folder's own file. If this clause ever widens, add the copy too. */
    if (patch.coverFileId !== undefined && patch.coverFileId !== null) {
      const cover = await rowsOf(
        tx,
        sql`SELECT 1 AS present FROM files
            WHERE id = ${patch.coverFileId} AND folder_id = ${folderId}
              AND kind IN ('cover', 'image')`,
      )
      if (cover.length === 0) return 'cover_not_here' as const
    }
    const sets = []
    if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
    if (patch.icon !== undefined) sets.push(sql`icon = ${patch.icon}`)
    if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
    /* One source: a file clears the preset and a preset clears the file. */
    if (patch.coverFileId !== undefined) {
      sets.push(sql`cover_file_id = ${patch.coverFileId}`)
      if (patch.coverFileId !== null) sets.push(sql`cover_preset = NULL`)
    }
    if (patch.coverPreset !== undefined) {
      sets.push(sql`cover_preset = ${patch.coverPreset}`)
      if (patch.coverPreset !== null) sets.push(sql`cover_file_id = NULL`)
    }
    if (patch.coverFocalY !== undefined) {
      sets.push(sql`cover_focal_y = ${patch.coverFocalY}`)
    }
    if (patch.description !== undefined) {
      sets.push(sql`description = ${patch.description}`)
    }
    if (sets.length === 0) return 'patched' as const
    const named = await rowsOf(
      tx,
      sql`UPDATE folders SET ${sql.join(sets, sql`, `)}
          WHERE id = ${folderId} RETURNING name`,
    )
    // subject_name is the new name: the one the line will be read under (4.13).
    await recordEvent(tx, {
      actorId,
      verb: patch.name !== undefined ? 'renamed' : 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: patch.name !== undefined ? undefined : 'changed the look',
    })
    return 'patched' as const
  })
}

export interface DeletedCounts {
  tasks_open: number
  tasks_completed: number
  tasks_abandoned: number
}

/** 8.8 via 7.13: count, then mark the folder trashed, in one transaction so the counts match. Members are notified. */
export async function deleteFolder(
  db: Db,
  actorId: string,
  folderId: string,
): Promise<DeletedCounts> {
  return inTransaction(db, async (tx) => {
    /* Trashed from outside its parent's document, the page leaves that document too. */
    await lockPageTree(tx)
    await removeHomeBlock(tx, folderId)
    return (await trashFolderSubtree(tx, actorId, folderId)).counts
  })
}

/**
 * The Trash move in the caller's transaction. The caller has gated `folder.trash` and refused a default folder.
 * Descendants the actor may trash go too, stamped `trashed_with_folder_id`; counts are the initiator's own.
 */
export async function trashFolderSubtree(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<{ counts: DeletedCounts; trashedWith: string[] }> {
  const counts = (
    await rowsOf(
      tx,
      sql`SELECT
            (count(*) FILTER (WHERE status = 'pending'))::int AS open,
            (count(*) FILTER (WHERE status = 'completed'))::int AS completed,
            (count(*) FILTER (WHERE status = 'abandoned'))::int AS abandoned
          FROM tasks WHERE folder_id = ${folderId} AND deleted_at IS NULL`,
    )
  )[0]
  const marked = await rowsOf(
    tx,
    sql`UPDATE folders SET deleted_at = now(), trashed_with_folder_id = NULL
        WHERE id = ${folderId} RETURNING name`,
  )
  await recordEvent(tx, {
    actorId,
    verb: 'deleted',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: String(marked[0]?.name ?? ''),
    folderId,
    detail: 'moved to Trash for 30 days',
    recipients: await memberIdsOf(tx, folderId),
  })
  const trashedWith = await trashPageSubtree(tx, actorId, folderId)
  return {
    counts: {
      tasks_open: Number(counts?.open ?? 0),
      tasks_completed: Number(counts?.completed ?? 0),
      tasks_abandoned: Number(counts?.abandoned ?? 0),
    },
    trashedWith,
  }
}

/** Deletes `memberId`'s private `folder_facets` rows in `folderId` with their blocks (R-CLEAN, 4.30). */
async function deletePrivateFacetsOf(tx: Executor, folderId: string, memberId: string): Promise<void> {
  await tx.execute(
    sql`DELETE FROM folder_facets
        WHERE folder_id = ${folderId}::uuid AND owner_id = ${memberId}::uuid`,
  )
}

/** The recipients of a folder-scoped fan-out (4.14); recordEvent drops the actor. */
export async function memberIdsOf(
  executor: Executor,
  folderId: string,
): Promise<string[]> {
  const rows = await rowsOf(
    executor,
    sql`SELECT user_id FROM folder_members WHERE folder_id = ${projectIdOf(folderId)}`,
  )
  return rows.map((row) => String(row.user_id))
}

/** 8.8's deletion: one statement; named cascades take the rest. Shared with 8.10 step 3. */
export async function deleteFolderRow(
  tx: Executor,
  folderId: string,
): Promise<void> {
  await releaseSurvivors(tx, [folderId])
  await tx.execute(sql`DELETE FROM folders WHERE id = ${folderId}`)
}

export interface MyMembershipPatch {
  /** The Shelf this folder sits on for this viewer. */
  shelf?: string | null
  color?: string | null
}

/**
 * Absent leaves a column alone, null clears it. A shelf name creates its shelf if missing, in the same transaction,
 * so a membership never names a missing shelf. Clearing leaves the shelf standing.
 */
export async function setMyMembership(
  db: Db,
  viewerId: string,
  folderId: string,
  patch: MyMembershipPatch,
): Promise<void> {
  const sets: SQL[] = []
  if (patch.shelf !== undefined) sets.push(sql`shelf_name = ${patch.shelf}`)
  if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
  if (sets.length === 0) return
  const shelf = patch.shelf
  await inTransaction(db, async (tx) => {
    await tx.execute(
      sql`UPDATE folder_members SET ${sql.join(sets, sql`, `)}
          WHERE folder_id = ${folderId} AND user_id = ${viewerId}`,
    )
    if (typeof shelf === 'string') await ensureShelf(tx, viewerId, shelf)
  })
}

export interface MemberElement {
  user: {
    id: string
    display_name: string | null
    avatar_url: string | null
  }
  role: string
  /** The member's current Access preset. */
  access: FolderAccessPreset
  joined_at: string
  is_owner: boolean
}

export interface PendingInviteElement {
  id: string
  email: string
  task_id: string | null
  /** The preset this invite grants on acceptance. Shown to Full control only. */
  access: FolderAccessPreset | null
  created_at: string
  last_sent_at: string
}

/** 7.4's members array, in 7.0's person shape (no email). Ordered by join instant, then id. */
export async function membersOf(
  db: Db,
  folderId: string,
): Promise<MemberElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT u.id, u.display_name, u.avatar_url,
               m.role, m.access, m.created_at AS joined_at,
               (m.user_id = f.owner_id) AS is_owner
        FROM folder_members m
        JOIN folders f ON f.id = m.folder_id
        JOIN users u ON u.id = m.user_id
        WHERE m.folder_id = ${projectIdOf(folderId)}
        ORDER BY m.created_at ASC, u.id ASC`,
  )
  return found.map((row) => {
    const access = presetOf(row.access)
    if (access === null) {
      throw new Error(
        `folder_members.access holds an unknown preset in ${folderId}`,
      )
    }
    return {
      user: {
        id: String(row.id),
        display_name: nullableString(row.display_name),
        avatar_url: nullableString(row.avatar_url),
      },
      role: String(row.role),
      /* `role` stays 'member' beside `access`: removing it would be a contract change. */
      access,
      joined_at: toIso(row.joined_at),
      is_owner: row.is_owner === true,
    }
  })
}

export async function pendingInvitesOf(
  db: Db,
  folderId: string,
): Promise<PendingInviteElement[]> {
  const found = await rowsOf(
    db,
    sql`SELECT id, email, task_id, access, created_at, last_sent_at
        FROM invites
        WHERE folder_id = ${projectIdOf(folderId)} AND status = 'pending'
        ORDER BY created_at ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    task_id: nullableString(row.task_id),
    access: presetOf(row.access),
    created_at: toIso(row.created_at),
    last_sent_at: toIso(row.last_sent_at),
  }))
}

export type AddMemberResult =
  | { kind: 'added'; targetEmail: string | null }
  | { kind: 'default_folder' }
  | { kind: 'already_member' }
  | { kind: 'not_connected' }
  | { kind: 'member_cap' }

/*
5.3's add, guards in 7.4's order: 409 default, 409 already member, 422 no roster connection, 422 at the cap.
The folder row lock ties the count to the insert. ON CONFLICT DO NOTHING settles a double add of the same person.
A nonexistent target fails the connection guard, so nothing reveals whether the id is real.
 */
export async function addMember(
  db: Db,
  actorId: string,
  folderId: string,
  targetId: string,
  access: FolderAccess,
  /** Required, no default: a direct add records `null -> preset` with the administrator as actor. */
  granted: FolderAccessPreset,
  /** Optional initial Responsibility content; an empty document writes nothing. */
  initialResponsibility?: ResponsibilityDocument,
): Promise<AddMemberResult> {
  // is_default never changes after creation, so this needs no row read.
  if (access.isDefault) return { kind: 'default_folder' }

  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )

    const already = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${targetId}`,
    )
    if (already.length > 0) return { kind: 'already_member' }

    const connected = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM connections
          WHERE user_a_id = least(${actorId}::uuid, ${targetId}::uuid)
            AND user_b_id = greatest(${actorId}::uuid, ${targetId}::uuid)`,
    )
    if (connected.length === 0) return { kind: 'not_connected' }

    const count = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folder_members
          WHERE folder_id = ${folderId}`,
    )
    if (Number(count[0]?.n ?? 0) >= 25) return { kind: 'member_cap' }

    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${targetId}::uuid, ${granted})
          ON CONFLICT DO NOTHING
          RETURNING user_id`,
    )
    if (inserted.length === 0) return { kind: 'already_member' }

    // R9 section 6, in the same transaction as the grant it describes.
    await recordAccessTransition(tx, {
      folderId,
      memberId: targetId,
      previousAccess: null,
      newAccess: granted,
      actorId,
      transition: 'member_added',
    })

    /* The first revision is attributed to the administrator who chose it, not the member it describes. */
    if (initialResponsibility !== undefined) {
      await createInitialResponsibility(
        tx,
        folderId,
        targetId,
        actorId,
        initialResponsibility,
        access.name,
      )
    }

    // The share-grant email address (5.3). Null only for a soft-deleted account; the caller then skips the send.
    const target = await rowsOf(
      tx,
      sql`SELECT email, display_name FROM users
          WHERE id = ${targetId} AND deleted_at IS NULL`,
    )
    // 'edited' carries a member add (no verb of its own). No fan-out: the share-grant email is the notice.
    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: `added ${String(target[0]?.display_name ?? 'a member')}`,
    })
    return { kind: 'added', targetEmail: nullableString(target[0]?.email) }
  })
}

export async function isMember(
  db: Db,
  folderId: string,
  userId: string,
): Promise<boolean> {
  const found = await rowsOf(
    db,
    sql`SELECT 1 AS present FROM folder_members
        WHERE folder_id = ${projectIdOf(folderId)} AND user_id = ${userId}`,
  )
  return found.length > 0
}

export async function otherMemberCount(
  db: Db,
  folderId: string,
  excludingUserId: string,
): Promise<number> {
  const found = await rowsOf(
    db,
    sql`SELECT count(*)::int AS n FROM folder_members
        WHERE folder_id = ${projectIdOf(folderId)} AND user_id <> ${excludingUserId}`,
  )
  return Number(found[0]?.n ?? 0)
}

/*
R-CLEAN (5.3) in one transaction. An owner leaving first hands ownership to the earliest-joined member
(ties to the lower user id). Then unassign the leaver's tasks, delete their My Day entries for this folder,
delete the membership, and if one member remains assign them every unassigned task (INV-5).
The leaver's pending invites stay.
 */
export async function removeMembership(
  db: Db,
  folderId: string,
  leaverId: string,
  options: { transferOwnership: boolean; actorId: string },
): Promise<void> {
  await inTransaction(db, async (tx) => {
    if (options.transferOwnership) {
      await transferOwnership(tx, folderId, leaverId)
    }
    /* Record `preset -> null` before the row goes. Not locked here: every concurrent path locks the folder row first. */
    const standing = await rowsOf(
      tx,
      sql`SELECT access FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${leaverId}`,
    )
    const heldAccess = presetOf(standing[0]?.access)
    if (heldAccess !== null) {
      await recordAccessTransition(tx, {
        folderId,
        memberId: leaverId,
        previousAccess: heldAccess,
        newAccess: null,
        actorId: options.actorId,
        transition:
          options.actorId === leaverId ? 'member_left' : 'member_removed',
      })
    }
    await runRClean(tx, folderId, leaverId, { actorId: options.actorId })
    // 'left' when the leaver acted, 'removed' when someone else did (4.13).
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u
                   WHERE u.id = ${leaverId}) AS leaver_name
          FROM folders f WHERE f.id = ${folderId}`,
    )
    const left = options.actorId === leaverId
    await recordEvent(tx, {
      actorId: options.actorId,
      verb: left ? 'left' : 'removed',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: left
        ? undefined
        : `removed ${String(named[0]?.leaver_name ?? 'a member')}`,
      recipients: left ? undefined : [leaverId],
    })
  })
}

/*
R-CLEAN's body, shared by removal, leave and 8.10 step 4 (which calls this, not removeMembership).
Every duty of ending a membership belongs here, or account deletion misses it.
 */
export async function runRClean(
  tx: Executor,
  folderId: string,
  leaverId: string,
  /** Who ended this membership; defaults to the leaver. */
  options: { actorId?: string } = {},
): Promise<void> {
  /*
  End the member's active Responsibility here, not in `removeMembership`, so account deletion ends it too.
  Step 7 scrubs the user row instead of deleting it, so no cascade would ever do this. History stays.
   */
  await endResponsibilityStanding(
    tx,
    folderId,
    leaverId,
    options.actorId ?? leaverId,
  )
  /* Delete the leaver's private facets in the same transaction (4.30). */
  await deletePrivateFacetsOf(tx, folderId, leaverId)
  /* `folderId` is a project root: the membership covers tasks on every page. */
  const changedAssignments = await rowsOf(tx,
    sql`WITH old AS (
          SELECT id, assignee_id FROM tasks
           WHERE project_id = ${folderId} AND ${leaverId}::uuid = ANY(assignee_ids)
           FOR UPDATE
        )
        UPDATE tasks t SET assignee_ids = array_remove(t.assignee_ids, ${leaverId}::uuid),
                           updated_at = now()
          FROM old WHERE t.id = old.id
        RETURNING t.id, old.assignee_id AS previous_assignee_id`,
  )
  await tx.execute(
    sql`DELETE FROM my_day_entries
        WHERE user_id = ${leaverId}
          AND task_id IN (SELECT id FROM tasks WHERE project_id = ${folderId})`,
  )
  /* Rows migration 0062 left on other pages go too: the old instance reads them during a deploy. */
  await tx.execute(
    sql`DELETE FROM folder_members
        WHERE user_id = ${leaverId}
          AND (folder_id = ${folderId}
               OR folder_id IN (SELECT id FROM folders WHERE project_id = ${folderId} AND id <> ${folderId}))`,
  )

  const remaining = await rowsOf(
    tx,
    sql`SELECT user_id FROM folder_members WHERE folder_id = ${folderId}`,
  )
  const only = remaining.length === 1 ? remaining[0] : undefined
  if (only !== undefined) {
    await tx.execute(
      sql`UPDATE tasks SET assignee_id = ${String(only.user_id)}, updated_at = now()
          WHERE project_id = ${folderId} AND assignee_id IS NULL`,
    )
  }
  for (const row of changedAssignments) {
    if (String(row.previous_assignee_id) === leaverId) {
      await recomputeReminders(tx, { kind: 'assignee_id', taskId: String(row.id) })
    }
  }
}

/**
 * 8.9: ownership goes to the earliest-joined member, ties to the lower user id; only owner_id changes.
 * Also called by 8.10 step 2 inside its transaction.
 */
export async function transferOwnership(
  tx: Executor,
  folderId: string,
  departingOwnerId: string,
): Promise<void> {
  const successor = await rowsOf(
    tx,
    sql`SELECT user_id FROM folder_members
        WHERE folder_id = ${folderId} AND user_id <> ${departingOwnerId}
        ORDER BY created_at ASC, user_id ASC
        LIMIT 1`,
  )
  const heir = successor[0]
  if (heir === undefined) {
    // The route's sole-member 409 should prevent this; throwing beats breaking INV-2.
    throw new Error(`folder ${folderId} has no member to transfer to (8.9)`)
  }
  // Every page of the project has the project's owner.
  await tx.execute(
    sql`UPDATE folders SET owner_id = ${String(heir.user_id)}
        WHERE project_id = ${folderId}`,
  )
}

export type ChangeAccessResult =
  | { kind: 'changed'; previous: FolderAccessPreset; next: FolderAccessPreset }
  /** The named person is not a member of this folder. */
  | { kind: 'not_member' }
  /** The target already holds the preset: nothing changes and nothing is recorded. */
  | { kind: 'unchanged'; access: FolderAccessPreset }
  /** `expected_access` does not match the current value: another administrator got there first. */
  | { kind: 'stale'; actual: FolderAccessPreset }
  /** The target is the owner and the actor is not: a Full-control member may not demote the owner. */
  | { kind: 'target_is_owner' }
  /** The change would leave no active human Full-control member (R5). */
  | { kind: 'would_strand' }

/**
 * Change one member's Access with its history row. In one transaction: member still active, expected preset matches,
 * owner rule, Full-control continuity, then write and append. Locks the folder row first, as every membership change does.
 * Self-demotion is recorded as `self_demoted`.
 */
export async function changeMemberAccess(
  db: Db,
  actorId: string,
  folderId: string,
  targetId: string,
  next: FolderAccessPreset,
  options: { expected?: FolderAccessPreset } = {},
): Promise<ChangeAccessResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const target = await lockedMembership(tx, folderId, targetId)
    if (target === null) return { kind: 'not_member' } as const

    if (options.expected !== undefined && options.expected !== target.access) {
      return { kind: 'stale', actual: target.access } as const
    }
    if (target.access === next) {
      return { kind: 'unchanged', access: target.access } as const
    }
    /* Only the owner changes the owner's Access, so delegates cannot administer away the custody anchor. */
    if (target.isOwner && targetId !== actorId) {
      return { kind: 'target_is_owner' } as const
    }
    /* Continuity binds self-demotion too: an owner may lower themselves only if another Full-control human exists. */
    if (
      target.access === 'full_control' &&
      (await otherFullControlCount(tx, folderId, targetId)) === 0
    ) {
      return { kind: 'would_strand' } as const
    }

    /* Rows migration 0062 left on other pages follow, so the old instance never applies an earlier preset. */
    await tx.execute(
      sql`UPDATE folder_members SET access = ${next}
          WHERE user_id = ${targetId}
            AND (folder_id = ${folderId}
                 OR folder_id IN (SELECT id FROM folders WHERE project_id = ${folderId} AND id <> ${folderId}))`,
    )
    await recordAccessTransition(tx, {
      folderId,
      memberId: targetId,
      previousAccess: target.access,
      newAccess: next,
      actorId,
      transition: targetId === actorId ? 'self_demoted' : 'access_changed',
    })
    const named = await rowsOf(
      tx,
      sql`SELECT f.name,
                 (SELECT u.display_name FROM users u WHERE u.id = ${targetId})
                   AS target_name
          FROM folders f WHERE f.id = ${folderId}`,
    )
    /* The History line projects the structured transition; it rides 'edited' because the verb list is a CHECK. */
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: `changed ${String(named[0]?.target_name ?? 'a member')}'s access to ${next}`,
      recipients: targetId === actorId ? undefined : [targetId],
    })
    return { kind: 'changed', previous: target.access, next } as const
  })
}

export type OwnerRecoveryResult =
  | { kind: 'recovered'; previous: FolderAccessPreset }
  | { kind: 'unchanged' }
  | { kind: 'not_member' }

/**
 * The owner restoring their own Access to Full control. The route checks `owner.custody_recovery`, owner-only,
 * so a lowered owner can always climb back. Recorded as its own transition kind.
 */
export async function recoverOwnerFullControl(
  db: Db,
  ownerId: string,
  folderId: string,
): Promise<OwnerRecoveryResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId} FOR UPDATE`,
    )
    const held = await lockedMembership(tx, folderId, ownerId)
    if (held === null) return { kind: 'not_member' } as const
    if (held.access === 'full_control') return { kind: 'unchanged' } as const
    await tx.execute(
      sql`UPDATE folder_members SET access = 'full_control'
          WHERE folder_id = ${folderId} AND user_id = ${ownerId}`,
    )
    await recordAccessTransition(tx, {
      folderId,
      memberId: ownerId,
      previousAccess: held.access,
      newAccess: 'full_control',
      actorId: ownerId,
      transition: 'owner_recovered_full_control',
    })
    const named = await rowsOf(
      tx,
      sql`SELECT name FROM folders WHERE id = ${folderId}`,
    )
    await recordEvent(tx, {
      actorId: ownerId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: String(named[0]?.name ?? ''),
      folderId,
      detail: 'restored Full control using owner recovery',
    })
    return { kind: 'recovered', previous: held.access } as const
  })
}

/** Whether `userId` holds Full control of `folderId`: the successor-eligibility test (R6). */
export async function isEligibleSuccessor(
  executor: Executor,
  folderId: string,
  userId: string,
): Promise<boolean> {
  const found = await rowsOf(
    executor,
    sql`SELECT 1 AS present FROM folder_members
        WHERE folder_id = ${folderId} AND user_id = ${userId}
          AND access = 'full_control'`,
  )
  return found.length > 0
}

export interface OwnedSharedFolder {
  id: string
  name: string
  hasEligibleSuccessor: boolean
}

/**
 * The account's owned folders that others are still in, each with whether an eligible successor exists.
 * `DELETE /me` resolves these first (R6). Default folders are excluded.
 */
export async function ownedSharedFolders(
  executor: Executor,
  ownerId: string,
): Promise<OwnedSharedFolder[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT f.id, f.name,
               EXISTS (SELECT 1 FROM folder_members s
                        WHERE s.folder_id = f.id AND s.user_id <> ${ownerId}
                          AND s.access = 'full_control') AS heir
        FROM folders f
        WHERE f.owner_id = ${ownerId} AND NOT f.is_default
          AND f.deleted_at IS NULL
          -- Step 8: every page follows its project's owner, so only the project is named.
          AND f.id = f.project_id
          AND EXISTS (SELECT 1 FROM folder_members m
                       WHERE m.folder_id = f.id AND m.user_id <> ${ownerId})
        ORDER BY lower(f.name) ASC, f.id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    hasEligibleSuccessor: row.heir === true,
  }))
}

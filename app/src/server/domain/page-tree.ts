// The page tree: `parent_folder_id` and `child_position` on folders. Reads filter by the viewer's access,
// and an upward walk stops at the first inaccessible or trashed ancestor, so its id never leaves the server.
// Structural writes take `lockPageTree` first: concurrent moves could otherwise form a cycle no CHECK sees.
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { FolderCrumb } from '../../shared/folders.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform, presetOf, recordAccessTransition, visibleFolder } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { keyBetween } from './fractional-index.js'
import { seededItems } from './page-order.js'

/** Levels from a root (depth 1) down to the deepest page, inclusive. */
export const PAGE_TREE_MAX_DEPTH = 20

/** The one advisory key every tree move and sub-page creation takes. Arbitrary but fixed. */
const PAGE_TREE_LOCK_KEY = '4927008461390308709'

export const PAGE_TREE_EDIT_ACTION = 'folder.page.edit' as const

export async function lockPageTree(tx: Executor): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${PAGE_TREE_LOCK_KEY}::bigint)`,
  )
}

/** The SQL predicate "the viewer may see the parent of `f`", so a hidden parent's id never reaches the wire. */
export function visibleParentPredicate(viewerId: string) {
  return visibleFolder(sql`f.parent_folder_id`, viewerId)
}

/**
 * Each page's breadcrumb, root first, as the viewer may see it. Stops at the first trashed or non-member ancestor;
 * the depth cap also bounds a cycle. The caller has checked access to the starting pages.
 */
export async function visibleAncestors(
  executor: Executor,
  viewerId: string,
  folderIds: readonly string[],
): Promise<Map<string, FolderCrumb[]>> {
  const result = new Map<string, FolderCrumb[]>()
  const unique = [...new Set(folderIds)]
  if (unique.length === 0) return result
  const rows = await rowsOf(
    executor,
    sql`WITH RECURSIVE up (start_id, depth, id, parent_id, name, icon, color) AS (
          -- Step 7: above a tab (not the project's own) stands its project.
          SELECT f.id, 0, f.id, COALESCE(f.parent_folder_id, NULLIF(f.project_id, f.id)),
                 f.name, f.icon, f.color
            FROM folders f
           WHERE f.id IN (${sql.join(
             unique.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
          UNION ALL
          SELECT u.start_id, u.depth + 1, p.id, COALESCE(p.parent_folder_id, NULLIF(p.project_id, p.id)),
                 p.name, p.icon, p.color
            FROM up u
            JOIN folders p ON p.id = u.parent_id
           WHERE u.depth < ${PAGE_TREE_MAX_DEPTH}
             AND ${visibleFolder(sql`p.id`, viewerId)})
        SELECT start_id, depth, id, name, icon, color
          FROM up WHERE depth > 0
         ORDER BY start_id, depth DESC`,
  )
  for (const row of rows) {
    const start = String(row.start_id)
    const crumbs = result.get(start) ?? []
    crumbs.push({
      id: String(row.id),
      name: String(row.name),
      icon: row.icon === null || row.icon === undefined ? null : String(row.icon),
      color:
        row.color === null || row.color === undefined ? null : String(row.color),
    })
    result.set(start, crumbs)
  }
  return result
}

/** `folderId` up to its root, over every row regardless of state or access. Capped, so a cycle reads as too deep. */
async function chainUp(tx: Executor, folderId: string): Promise<string[]> {
  const rows = await rowsOf(
    tx,
    sql`WITH RECURSIVE up (id, parent_id, depth) AS (
          SELECT id, parent_folder_id, 1 FROM folders WHERE id = ${folderId}::uuid
          UNION ALL
          SELECT f.id, f.parent_folder_id, u.depth + 1
            FROM up u JOIN folders f ON f.id = u.parent_id
           WHERE u.depth <= ${PAGE_TREE_MAX_DEPTH})
        SELECT id FROM up ORDER BY depth`,
  )
  return rows.map((row) => String(row.id))
}

/** Levels in the subtree rooted at `folderId`, itself included (a leaf is 1). */
async function subtreeHeight(tx: Executor, folderId: string): Promise<number> {
  const rows = await rowsOf(
    tx,
    sql`WITH RECURSIVE down (id, depth) AS (
          SELECT id, 1 FROM folders WHERE id = ${folderId}::uuid
          UNION ALL
          SELECT c.id, d.depth + 1
            FROM down d JOIN folders c ON c.parent_folder_id = d.id
           WHERE d.depth <= ${PAGE_TREE_MAX_DEPTH})
        SELECT max(depth)::int AS height FROM down`,
  )
  return Number(rows[0]?.height ?? 1)
}

export async function mayAddChildUnder(
  tx: Executor,
  parentId: string,
): Promise<boolean> {
  return (await chainUp(tx, parentId)).length < PAGE_TREE_MAX_DEPTH
}

export async function lastChildPosition(
  tx: Executor,
  parentId: string,
): Promise<string> {
  const rows = await rowsOf(
    tx,
    sql`SELECT max(child_position) AS last FROM folders
         WHERE parent_folder_id = ${parentId}::uuid`,
  )
  const last = rows[0]?.last
  return keyBetween(last === null || last === undefined ? null : String(last), null)
}

export type MoveFolderResult =
  | { kind: 'moved' }
  /** The page, parent or `after_id` page is missing, trashed or not the actor's: one answer (10.2). */
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  /** 422s: default folders stay roots and hold no children; no cycles; depth at most 20; `after_id` must be a sibling. */
  | { kind: 'default_folder' }
  | { kind: 'cycle' }
  | { kind: 'too_deep' }
  | { kind: 'not_a_sibling' }
  /** A tab stays in its project's tab row, a project with tabs stays a project, and a Discussion holds no pages. */
  | { kind: 'not_movable'; reason: string }

/**
 * Moves `folderId` under `parentId` (null: root). `afterId` lands it after that sibling, null first, undefined last.
 * Takes the tree lock (re-entrant). The page's home `page` block moves in the same transaction.
 */
export async function moveFolder(
  tx: Executor,
  actorId: string,
  folderId: string,
  parentId: string | null,
  afterId?: string | null,
): Promise<MoveFolderResult> {
  await lockPageTree(tx)
  const page = await folderActorFacts(tx, actorId, folderId)
  if (page === null) return { kind: 'not_found' }
  const onPage = mayPerform(page, PAGE_TREE_EDIT_ACTION)
  if (!onPage.allowed) return { kind: 'forbidden', reason: onPage.reason }
  const before = await rowsOf(
    tx,
    sql`SELECT parent_folder_id, project_id, tab_position, kind FROM folders WHERE id = ${folderId}::uuid`,
  )
  const priorParent = before[0]?.parent_folder_id
  const oldParent =
    priorParent === null || priorParent === undefined ? null : String(priorParent)
  const projectId = String(before[0]?.project_id)
  const isTab = before[0]?.tab_position !== null && before[0]?.tab_position !== undefined
  const isRoot = projectId === folderId

  if (parentId === null && isTab) {
    return reorderTab(tx, actorId, page, projectId, afterId)
  }
  if (parentId === null) {
    /* A sub-page moved to the top becomes its own project; ON UPDATE CASCADE carries its sub-pages,
    and it keeps the old project's people. */
    await promoteToProjects(tx, [{ id: folderId, projectId }], actorId)
    await removeHomeBlock(tx, folderId)
    await recordMove(tx, actorId, page)
    return { kind: 'moved' }
  }
  if (isTab && !isRoot) {
    return { kind: 'not_movable', reason: 'A tab stays in its project; move it along the tab row instead.' }
  }
  if (isRoot) {
    const tabs = await rowsOf(
      tx,
      sql`SELECT 1 FROM folders WHERE project_id = ${folderId}::uuid AND id <> ${folderId}::uuid
            AND tab_position IS NOT NULL LIMIT 1`,
    )
    if (tabs.length > 0) {
      return { kind: 'not_movable', reason: 'A project with more than one tab stays a project.' }
    }
    if (before[0]?.kind === 'discussion') {
      return { kind: 'not_movable', reason: 'A Discussion page stays a tab.' }
    }
  }

  const parent = await folderActorFacts(tx, actorId, parentId)
  if (parent === null) return { kind: 'not_found' }
  const onParent = mayPerform(parent, PAGE_TREE_EDIT_ACTION)
  if (!onParent.allowed) return { kind: 'forbidden', reason: onParent.reason }
  // The default folder stays a root, and nothing goes under one either.
  if (page.isDefault || parent.isDefault) return { kind: 'default_folder' }
  const target = await rowsOf(tx, sql`SELECT project_id, kind FROM folders WHERE id = ${parentId}::uuid`)
  if (target[0]?.kind === 'discussion') {
    return { kind: 'not_movable', reason: 'A Discussion page holds threads, not pages.' }
  }
  const targetProject = String(target[0]?.project_id)
  /* A page's people are its project's, so a move into another project is allowed only when
  both have the same owner and the same people at the same presets. */
  if (targetProject !== projectId && !(await samePeople(tx, projectId, targetProject))) {
    return {
      kind: 'not_movable',
      reason: "This page can't move there: that project isn't shared with the same people.",
    }
  }

  const chain = await chainUp(tx, parentId)
  if (chain.includes(folderId)) return { kind: 'cycle' }
  if (chain.length + (await subtreeHeight(tx, folderId)) > PAGE_TREE_MAX_DEPTH) {
    return { kind: 'too_deep' }
  }

  const siblings = await rowsOf(
    tx,
    sql`SELECT id, child_position FROM folders
         WHERE parent_folder_id = ${parentId}::uuid AND id <> ${folderId}::uuid
           AND child_position IS NOT NULL
         ORDER BY child_position, id`,
  )
  const keys = siblings.map((row) => String(row.child_position))
  let position: string
  if (afterId === undefined) {
    position = keyBetween(keys[keys.length - 1] ?? null, null)
  } else if (afterId === null) {
    position = keyBetween(null, keys[0] ?? null)
  } else {
    /* A body id: gated like the parent, 404 before any 422, so a stranger's id is never confirmed. */
    const after = await folderActorFacts(tx, actorId, afterId)
    if (after === null) return { kind: 'not_found' }
    const index = siblings.findIndex((row) => String(row.id) === afterId)
    if (index < 0) return { kind: 'not_a_sibling' }
    const lower = keys[index] ?? null
    /* Equal neighbours cannot be split, so land after the run of equal keys. */
    const upper = keys.slice(index + 1).find((key) => lower === null || key > lower)
    position = keyBetween(lower, upper ?? null)
  }
  if (targetProject !== projectId && isRoot) await leaveProject(tx, actorId, folderId, targetProject)
  /* The page joins the parent's project; ON UPDATE CASCADE carries its sub-pages.
  A root that becomes a sub-page stops being a tab, and an unpicked one becomes a Doc. */
  await tx.execute(
    sql`UPDATE folders SET parent_folder_id = ${parentId}::uuid,
                           child_position = ${position},
                           project_id = ${targetProject}::uuid,
                           tab_position = NULL,
                           kind = COALESCE(kind, 'doc')
         WHERE id = ${folderId}::uuid`,
  )
  if (targetProject !== projectId) {
    /* A former root holds no people of its own (the target has the same people). */
    if (isRoot) await tx.execute(sql`DELETE FROM folder_members WHERE folder_id = ${folderId}::uuid`)
  }
  if (oldParent !== parentId) {
    await removeHomeBlock(tx, folderId)
    await appendHomeBlock(tx, parentId, folderId)
  }
  await recordMove(tx, actorId, page)
  return { kind: 'moved' }
}

/** True when both projects have the same owner and people at the same presets. */
async function samePeople(tx: Executor, projectId: string, otherId: string): Promise<boolean> {
  const differs = await rowsOf(
    tx,
    sql`SELECT 1 FROM folders a JOIN folders b ON b.id = ${otherId}::uuid
         WHERE a.id = ${projectId}::uuid AND a.owner_id <> b.owner_id
        UNION ALL
        (SELECT 1 FROM (
           (SELECT user_id, access FROM folder_members WHERE folder_id = ${projectId}::uuid
            EXCEPT SELECT user_id, access FROM folder_members WHERE folder_id = ${otherId}::uuid)
           UNION ALL
           (SELECT user_id, access FROM folder_members WHERE folder_id = ${otherId}::uuid
            EXCEPT SELECT user_id, access FROM folder_members WHERE folder_id = ${projectId}::uuid)
         ) d)
        LIMIT 1`,
  )
  return differs.length === 0
}

/**
 * Before a project root joins `targetProject`: invalidate its pending invites and move its Responsibilities
 * there, ending each active one, so they stay readable in the project's history.
 */
async function leaveProject(
  tx: Executor,
  actorId: string,
  folderId: string,
  targetProject: string,
): Promise<void> {
  await tx.execute(
    sql`UPDATE invites SET status = 'invalidated', responded_at = now()
         WHERE folder_id = ${folderId}::uuid AND status = 'pending'`,
  )
  await tx.execute(
    sql`WITH ended AS (
          UPDATE folder_responsibilities SET ended_at = now()
           WHERE folder_id = ${folderId}::uuid AND ended_at IS NULL
          RETURNING id, member_id
        )
        INSERT INTO folder_responsibility_history (folder_id, member_id, responsibility_id, transition, actor_id)
        SELECT ${folderId}::uuid, member_id, id, 'responsibility_ended', ${actorId}::uuid FROM ended`,
  )
  await tx.execute(
    sql`UPDATE folder_responsibilities SET folder_id = ${targetProject}::uuid WHERE folder_id = ${folderId}::uuid`,
  )
  await tx.execute(
    sql`UPDATE folder_responsibility_history SET folder_id = ${targetProject}::uuid
         WHERE folder_id = ${folderId}::uuid`,
  )
}

/** A tab moved along its project's tab row. `afterId` must be a tab of the same project. */
async function reorderTab(
  tx: Executor,
  actorId: string,
  page: FolderActorFacts,
  projectId: string,
  afterId: string | null | undefined,
): Promise<MoveFolderResult> {
  await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${projectId}::uuid FOR UPDATE`)
  const tabs = await rowsOf(
    tx,
    sql`SELECT id, tab_position FROM folders
         WHERE project_id = ${projectId}::uuid AND tab_position IS NOT NULL
           AND id <> ${page.folderId}::uuid
         ORDER BY tab_position, id`,
  )
  const keys = tabs.map((row) => String(row.tab_position))
  let position: string
  if (afterId === undefined) {
    position = keyBetween(keys[keys.length - 1] ?? null, null)
  } else if (afterId === null) {
    position = keyBetween(null, keys[0] ?? null)
  } else {
    const after = await folderActorFacts(tx, actorId, afterId)
    if (after === null) return { kind: 'not_found' }
    const index = tabs.findIndex((row) => String(row.id) === afterId)
    if (index < 0) return { kind: 'not_a_sibling' }
    const lower = keys[index] ?? null
    const upper = keys.slice(index + 1).find((key) => lower === null || key > lower)
    position = keyBetween(lower, upper ?? null)
  }
  await tx.execute(
    sql`UPDATE folders SET tab_position = ${position} WHERE id = ${page.folderId}::uuid`,
  )
  await recordMove(tx, actorId, page)
  return { kind: 'moved' }
}

async function recordMove(
  tx: Executor,
  actorId: string,
  page: FolderActorFacts,
): Promise<void> {
  await recordEvent(tx, {
    actorId,
    verb: 'edited',
    subjectKind: 'folder',
    subjectId: page.folderId,
    subjectName: page.name,
    folderId: page.folderId,
    detail: 'moved the page',
  })
}

/*
Home blocks: every live sub-page with a live parent has exactly one `page` block in its parent's Main document.
Lock order: the tree lock, then the document's folder row, then the sub-page's row.
 */

export async function homeBlockOf(
  tx: Executor,
  folderId: string,
): Promise<{ id: string; folderId: string } | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, folder_id FROM page_blocks
         WHERE kind = 'page' AND ref_folder_id = ${folderId}::uuid`,
  )
  const row = rows[0]
  return row === undefined ? null : { id: String(row.id), folderId: String(row.folder_id) }
}

/** Appends the home block at the top level of `parentId`'s Main document, under the parent's folder row lock. */
export async function appendHomeBlock(
  tx: Executor,
  parentId: string,
  folderId: string,
): Promise<string> {
  await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${parentId}::uuid FOR UPDATE`)
  const items = await seededItems(tx, parentId)
  const last = items[items.length - 1]?.pagePosition ?? null
  const counted = await rowsOf(
    tx,
    sql`SELECT coalesce(max(position), -1)::int AS last FROM page_blocks
         WHERE folder_id = ${parentId}::uuid`,
  )
  const id = randomUUID()
  await tx.execute(
    sql`INSERT INTO page_blocks (id, folder_id, kind, position, page_position, ref_folder_id)
        VALUES (${id}::uuid, ${parentId}::uuid, 'page',
                ${Number(counted[0]?.last ?? -1) + 1}, ${keyBetween(last, null)},
                ${folderId}::uuid)`,
  )
  return id
}

/** Under that document's folder row lock. */
export async function removeHomeBlock(tx: Executor, folderId: string): Promise<void> {
  const home = await homeBlockOf(tx, folderId)
  if (home === null) return
  await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${home.folderId}::uuid FOR UPDATE`)
  await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${home.id}::uuid`)
}

/** After a restore: a live page under a live parent gets its home block back if missing. */
export async function ensureHomeBlock(tx: Executor, folderId: string): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT f.parent_folder_id FROM folders f
          JOIN folders p ON p.id = f.parent_folder_id AND p.deleted_at IS NULL AND p.archived_at IS NULL
         WHERE f.id = ${folderId}::uuid AND f.deleted_at IS NULL AND f.archived_at IS NULL`,
  )
  const parent = rows[0]?.parent_folder_id
  if (parent === null || parent === undefined) return
  if ((await homeBlockOf(tx, folderId)) !== null) return
  await appendHomeBlock(tx, String(parent), folderId)
}

/**
 * Restores a trashed page with its set and records `restored`, in the caller's transaction.
 * The caller has gated `folder.restore`.
 */
export async function restoreTrashedPage(
  tx: Executor,
  actorId: string,
  folderId: string,
  name: string,
): Promise<void> {
  await tx.execute(
    sql`UPDATE folders SET deleted_at = NULL, trashed_with_folder_id = NULL
        WHERE id = ${folderId}::uuid`,
  )
  await restorePageSubtree(tx, actorId, folderId)
  await recordEvent(tx, {
    actorId,
    verb: 'restored',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: name,
    folderId,
    detail: 'restored from Trash',
  })
}

/**
 * Trashes the descendants the actor may trash, stamped with `trashed_with_folder_id = folderId` so restore
 * brings back this set. One the actor may not trash stays live with its subtree and keeps its parent pointer.
 * The caller trashes `folderId` itself in the same transaction.
 */
export async function trashPageSubtree(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<string[]> {
  const trashed: string[] = []
  let frontier = [folderId]
  for (let depth = 0; depth < PAGE_TREE_MAX_DEPTH && frontier.length > 0; depth += 1) {
    const children = await rowsOf(
      tx,
      /* A project root's other tabs go with it. */
      sql`SELECT c.id FROM folders c
           WHERE (c.parent_folder_id IN (${sql.join(
                    frontier.map((id) => sql`${id}::uuid`),
                    sql`, `,
                  )})
                  OR (c.project_id IN (${sql.join(
                        frontier.map((id) => sql`${id}::uuid`),
                        sql`, `,
                      )})
                      AND c.tab_position IS NOT NULL AND c.id <> c.project_id))
             AND c.deleted_at IS NULL
           FOR UPDATE OF c`,
    )
    const next: string[] = []
    for (const row of children) {
      const facts = await folderActorFacts(tx, actorId, String(row.id))
      if (facts === null || facts.isDefault) continue
      if (!mayPerform(facts, 'folder.trash').allowed) continue
      next.push(facts.folderId)
    }
    trashed.push(...next)
    frontier = next
  }
  if (trashed.length === 0) return trashed
  const named = await rowsOf(
    tx,
    sql`UPDATE folders SET deleted_at = now(), trashed_with_folder_id = ${folderId}::uuid
         WHERE id IN (${sql.join(
           trashed.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})
        RETURNING id, name`,
  )
  for (const row of named) {
    const id = String(row.id)
    const members = await rowsOf(
      tx,
      sql`SELECT m.user_id FROM folders f JOIN folder_members m ON m.folder_id = f.project_id
           WHERE f.id = ${id}::uuid`,
    )
    await recordEvent(tx, {
      actorId,
      verb: 'deleted',
      subjectKind: 'folder',
      subjectId: id,
      subjectName: String(row.name),
      folderId: id,
      detail: 'moved to Trash for 30 days',
      recipients: members.map((member) => String(member.user_id)),
    })
  }
  return trashed
}

/** The actor's facts on a trashed row, or null when not a member. */
async function trashedFacts(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<FolderActorFacts | null> {
  return folderActorFacts(tx, actorId, folderId, { includeTrashed: true })
}

/**
 * Restores the rows trashed with `folderId` that the actor may restore; others are released from the set
 * and stay in Trash on their own. The caller restores `folderId` itself.
 */
export async function restorePageSubtree(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<string[]> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id, name FROM folders
         WHERE trashed_with_folder_id = ${folderId}::uuid
         FOR UPDATE`,
  )
  const restored: string[] = []
  for (const row of rows) {
    const id = String(row.id)
    const facts = await trashedFacts(tx, actorId, id)
    if (facts !== null && mayPerform(facts, 'folder.restore').allowed) {
      await tx.execute(
        sql`UPDATE folders SET deleted_at = NULL, trashed_with_folder_id = NULL
             WHERE id = ${id}::uuid`,
      )
      await recordEvent(tx, {
        actorId,
        verb: 'restored',
        subjectKind: 'folder',
        subjectId: id,
        subjectName: String(row.name),
        folderId: id,
        detail: 'restored from Trash',
      })
      restored.push(id)
    } else {
      await tx.execute(
        sql`UPDATE folders SET trashed_with_folder_id = NULL
             WHERE id = ${id}::uuid`,
      )
    }
  }
  return restored
}

/**
 * The ids trashed with `folderId` that the actor may destroy. The rest are released by ON DELETE SET NULL
 * and stay in Trash on their own.
 */
export async function destroyableTrashedWith(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<string[]> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM folders
         WHERE trashed_with_folder_id = ${folderId}::uuid
         FOR UPDATE`,
  )
  const ids: string[] = []
  for (const row of rows) {
    const facts = await trashedFacts(tx, actorId, String(row.id))
    if (facts !== null && mayPerform(facts, 'folder.destroy').allowed) {
      ids.push(facts.folderId)
    }
  }
  return ids
}

/**
 * Before `ids` are deleted, every surviving page the project cascade would take becomes its own project,
 * keeping its people.
 */
export async function releaseSurvivors(tx: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const list = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  const released = await rowsOf(
    tx,
    sql`SELECT id, project_id FROM folders
         WHERE id NOT IN (${list})
           AND (parent_folder_id IN (${list})
                OR (parent_folder_id IS NULL AND id <> project_id AND project_id IN (${list})))
         FOR UPDATE`,
  )
  await promoteToProjects(
    tx,
    released.map((row) => ({ id: String(row.id), projectId: String(row.project_id) })),
    null,
  )
}

/**
 * Each page becomes its own project with its sub-pages and keeps its old project's people.
 * The assignee FK is checked per statement against the project, so assignments are held aside and restored.
 */
export async function promoteToProjects(
  tx: Executor,
  pages: readonly { id: string; projectId: string }[],
  actorId: string | null,
): Promise<void> {
  if (pages.length === 0) return
  const projects = [...new Set(pages.map((page) => page.projectId))]
  const held = await rowsOf(
    tx,
    sql`WITH old AS (
          SELECT id, assignee_ids FROM tasks
           WHERE assignee_id IS NOT NULL
             AND project_id IN (${sql.join(projects.map((id) => sql`${id}::uuid`), sql`, `)})
           FOR UPDATE
        )
        UPDATE tasks t SET assignee_id = NULL, assignee_ids = '{}'::uuid[]
          FROM old WHERE t.id = old.id
        RETURNING old.id, old.assignee_ids`,
  )
  /* Rows left unread on a page by migration 0062 must not become the new project's people. */
  await tx.execute(
    sql`DELETE FROM folder_members
         WHERE folder_id IN (${sql.join(pages.map((page) => sql`${page.id}::uuid`), sql`, `)})`,
  )
  /* Disable the folders_root_takes_project_people trigger for this write, which records history itself. */
  await tx.execute(sql`SELECT set_config('dana.promoting', 'on', true)`)
  await tx.execute(
    sql`UPDATE folders
           SET parent_folder_id = NULL, child_position = NULL,
               project_id = id, tab_position = COALESCE(tab_position, 'a0'), kind = COALESCE(kind, 'doc')
         WHERE id IN (${sql.join(pages.map((page) => sql`${page.id}::uuid`), sql`, `)})`,
  )
  await tx.execute(sql`SELECT set_config('dana.promoting', 'off', true)`)
  for (const page of pages) {
    const copied = await rowsOf(
      tx,
      sql`INSERT INTO folder_members (folder_id, user_id, access, can_edit_own_responsibilities, created_at)
          SELECT ${page.id}::uuid, m.user_id, m.access, m.can_edit_own_responsibilities, m.created_at
            FROM folder_members m WHERE m.folder_id = ${page.projectId}::uuid
          ON CONFLICT DO NOTHING
          RETURNING user_id, access`,
    )
    if (actorId === null) continue
    for (const row of copied) {
      const access = presetOf(row.access)
      if (access === null) throw new Error(`folder_members.access holds an unknown preset in ${page.projectId}`)
      await recordAccessTransition(tx, {
        folderId: page.id,
        memberId: String(row.user_id),
        previousAccess: null,
        newAccess: access,
        actorId,
        transition: 'member_added',
      })
    }
  }
  if (held.length > 0) {
    const back = JSON.stringify(held.map((row) => ({ t: String(row.id), a: row.assignee_ids })))
    await tx.execute(
      sql`UPDATE tasks t SET assignee_ids = ARRAY(
            SELECT person.value::uuid
              FROM jsonb_array_elements_text(h->'a') AS person(value)
             WHERE EXISTS (SELECT 1 FROM folder_members m
                            WHERE m.folder_id = t.project_id
                              AND m.user_id = person.value::uuid))
            FROM jsonb_array_elements(${back}::jsonb) AS h
           WHERE t.id = (h->>'t')::uuid`,
    )
  }
}

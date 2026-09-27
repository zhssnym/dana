/*
A project's tabs (step 7, migration 0061).

A project is its root `folders` row (`id = project_id`), and a tab is a
root-level page of the project with a `tab_position`; the root is always one.
This module adds tabs: `POST /folders/:id/tabs` (the picker and the "+"), and
the Discussion tab that "Discuss" on a task needs.

Every write takes the project root's row lock first, so two adds, a pick and
a Discuss on the same project queue rather than race, and "one live
Discussion per project" is decided under that lock
(`folders_one_discussion_per_project_idx` is the backstop).

Until step 8 moves members to the project, a new tab copies the root's
members and presets, each recorded as `member_added` by the actor, as a
sub-page copies its parent's.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { DEFAULT_TAB_NAMES } from '../../shared/folders.js'
import type { PageKind } from '../../shared/folders.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform, presetOf, recordAccessTransition } from './folder-access.js'
import { keyBetween } from './fractional-index.js'
import { PAGE_TREE_EDIT_ACTION, appendHomeBlock, lastChildPosition } from './page-tree.js'

export type TabKind = PageKind | 'usual'

export type AddTabResult =
  | { kind: 'ok'; projectId: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'conflict'; reason: string }

interface ProjectRoot {
  id: string
  kind: PageKind | null
  ownerId: string
  tabPosition: string
  name: string
}

/** The live project root of `pageId`, under its row lock, or null. */
async function lockedProjectOf(tx: Executor, pageId: string): Promise<ProjectRoot | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT r.id, r.kind, r.owner_id, r.tab_position, r.name
          FROM folders p JOIN folders r ON r.id = p.project_id
         WHERE p.id = ${pageId}::uuid AND r.deleted_at IS NULL
         FOR UPDATE OF r`,
  )
  const row = rows[0]
  if (row === undefined) return null
  const kind = row.kind
  return {
    id: String(row.id),
    kind: kind === 'doc' || kind === 'work' || kind === 'discussion' ? kind : null,
    ownerId: String(row.owner_id),
    tabPosition: String(row.tab_position),
    name: String(row.name),
  }
}

async function lastTabPosition(tx: Executor, projectId: string): Promise<string | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT max(tab_position) AS last FROM folders WHERE project_id = ${projectId}::uuid`,
  )
  const last = rows[0]?.last
  return last === null || last === undefined ? null : String(last)
}

/** One tab row, owned by the project's owner, with the root's people. */
async function insertTab(
  tx: Executor,
  actorId: string,
  root: ProjectRoot,
  kind: PageKind,
  name: string,
  position: string,
  quiet = false,
): Promise<string> {
  const id = randomUUID()
  await tx.execute(
    sql`INSERT INTO folders (id, owner_id, name, project_id, kind, tab_position)
        VALUES (${id}::uuid, ${root.ownerId}::uuid, ${name}, ${root.id}::uuid, ${kind}, ${position})`,
  )
  const copied = await rowsOf(
    tx,
    sql`INSERT INTO folder_members (folder_id, user_id, access, can_edit_own_responsibilities)
        SELECT ${id}::uuid, m.user_id, m.access, m.can_edit_own_responsibilities
          FROM folder_members m
          JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
         WHERE m.folder_id = ${root.id}::uuid
        RETURNING user_id, access`,
  )
  for (const row of copied) {
    const access = presetOf(row.access)
    if (access === null) throw new Error(`folder_members.access holds an unknown preset in ${root.id}`)
    await recordAccessTransition(tx, {
      folderId: id,
      memberId: String(row.user_id),
      previousAccess: null,
      newAccess: access,
      actorId,
      transition: 'member_added',
    })
  }
  if (quiet) return id
  await recordEvent(tx, {
    actorId,
    verb: 'created',
    subjectKind: 'folder',
    subjectId: id,
    subjectName: name,
    folderId: id,
    detail: `added a ${DEFAULT_TAB_NAMES[kind]} tab to ${root.name}`.slice(0, 200),
  })
  return id
}

/** The live Discussion tab of a project, or null. */
export async function liveDiscussionTab(tx: Executor, projectId: string): Promise<string | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM folders
         WHERE project_id = ${projectId}::uuid AND kind = 'discussion' AND deleted_at IS NULL`,
  )
  return rows[0] === undefined ? null : String(rows[0].id)
}

/**
 * `POST /folders/:id/tabs`. `pageId` is any page of the project; the actor
 * needs `folder.page.edit` on the project root. While the root's kind is
 * unpicked, `kind` picks it (`usual`: the root is Work, with Purpose before
 * it and Results and Discussion after). Once picked, `kind` adds one tab
 * after the last.
 */
export async function addTab(
  db: Db,
  actorId: string,
  pageId: string,
  kind: TabKind,
): Promise<AddTabResult> {
  return inTransaction(db, async (tx) => {
    if ((await folderActorFacts(tx, actorId, pageId)) === null) return { kind: 'not_found' }
    const root = await lockedProjectOf(tx, pageId)
    if (root === null) return { kind: 'not_found' }
    const facts = await folderActorFacts(tx, actorId, root.id)
    if (facts === null) return { kind: 'not_found' }
    const decision = mayPerform(facts, PAGE_TREE_EDIT_ACTION)
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    if (root.kind === null) {
      if (kind === 'usual') {
        await tx.execute(sql`UPDATE folders SET kind = 'work' WHERE id = ${root.id}::uuid`)
        await insertTab(tx, actorId, root, 'doc', 'Purpose', keyBetween(null, root.tabPosition))
        const results = keyBetween(root.tabPosition, null)
        await insertTab(tx, actorId, root, 'doc', 'Results', results)
        await insertTab(tx, actorId, root, 'discussion', DEFAULT_TAB_NAMES.discussion, keyBetween(results, null))
      } else {
        await tx.execute(sql`UPDATE folders SET kind = ${kind} WHERE id = ${root.id}::uuid`)
      }
      return { kind: 'ok', projectId: root.id }
    }
    if (kind === 'usual') {
      return { kind: 'invalid', reason: 'kind: this project already has its first tab; add a Doc, Work or Discussion tab.' }
    }
    if (kind === 'discussion' && (await liveDiscussionTab(tx, root.id)) !== null) {
      return { kind: 'conflict', reason: 'This project already has a Discussion tab.' }
    }
    await insertTab(tx, actorId, root, kind, DEFAULT_TAB_NAMES[kind], keyBetween(await lastTabPosition(tx, root.id), null))
    return { kind: 'ok', projectId: root.id }
  })
}

/** The project a page belongs to, or null for no such page. */
export async function projectOf(tx: Executor, pageId: string): Promise<string | null> {
  const rows = await rowsOf(tx, sql`SELECT project_id FROM folders WHERE id = ${pageId}::uuid`)
  return rows[0] === undefined ? null : String(rows[0].project_id)
}

/**
 * The live Discussion tab of `pageId`'s project, added after the last tab
 * when there is none ("Discuss" on a task, spec 7.28). The caller has gated
 * the actor on the task's page; the tab is structure the project needs for
 * the thread to be listed, not an edit of anybody's page.
 */
export async function ensureDiscussionTab(tx: Executor, actorId: string, pageId: string): Promise<string | null> {
  const root = await lockedProjectOf(tx, pageId)
  if (root === null) return null
  const existing = await liveDiscussionTab(tx, root.id)
  if (existing !== null) return existing
  return insertTab(
    tx,
    actorId,
    root,
    'discussion',
    DEFAULT_TAB_NAMES.discussion,
    keyBetween(await lastTabPosition(tx, root.id), null),
  )
}

/**
 * The project's Purpose tab: the first live Doc tab before the root's own
 * tab, as the usual project and migration 0061 place it. Null for a page
 * that is not a project root, or a project without one.
 */
export async function purposeTabOf(
  executor: Executor,
  projectId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await rowsOf(
    executor,
    sql`SELECT t.id, t.name FROM folders r
          JOIN folders t ON t.project_id = r.id AND t.id <> r.id
         WHERE r.id = ${projectId}::uuid AND r.project_id = r.id
           AND t.kind = 'doc' AND t.deleted_at IS NULL
           AND t.tab_position < r.tab_position
         ORDER BY t.tab_position, t.id
         LIMIT 1`,
  )
  const row = rows[0]
  return row === undefined ? null : { id: String(row.id), name: String(row.name) }
}

/**
 * A new Doc page beside `pageId`, in the caller's transaction, for a copy
 * or an import: on a project root, a Doc tab first or last in the tab row;
 * on a sub-page, a child Doc page with its home block. It has `pageId`'s
 * people. Records no event: the caller's act is the event.
 */
export async function addDocPage(
  tx: Executor,
  actorId: string,
  pageId: string,
  name: string,
  where: 'before' | 'after',
): Promise<string> {
  const root = await lockedProjectOf(tx, pageId)
  if (root === null) throw new Error(`no live project for ${pageId}`)
  if (root.id === pageId) {
    const edge = await rowsOf(
      tx,
      sql`SELECT min(tab_position) AS first, max(tab_position) AS last
            FROM folders WHERE project_id = ${root.id}::uuid`,
    )
    const first = edge[0]?.first == null ? null : String(edge[0].first)
    const last = edge[0]?.last == null ? null : String(edge[0].last)
    const position = where === 'before' ? keyBetween(null, first) : keyBetween(last, null)
    return insertTab(tx, actorId, root, 'doc', name, position, true)
  }
  const id = randomUUID()
  await tx.execute(
    sql`INSERT INTO folders (id, owner_id, name, parent_folder_id, child_position, project_id, kind)
        VALUES (${id}::uuid, ${actorId}::uuid, ${name}, ${pageId}::uuid,
                ${await lastChildPosition(tx, pageId)}, ${root.id}::uuid, 'doc')`,
  )
  const copied = await rowsOf(
    tx,
    sql`INSERT INTO folder_members (folder_id, user_id, access, can_edit_own_responsibilities)
        SELECT ${id}::uuid, m.user_id, m.access, m.can_edit_own_responsibilities
          FROM folder_members m WHERE m.folder_id = ${pageId}::uuid
        RETURNING user_id, access`,
  )
  for (const row of copied) {
    const access = presetOf(row.access)
    if (access === null) throw new Error(`folder_members.access holds an unknown preset in ${pageId}`)
    await recordAccessTransition(tx, {
      folderId: id,
      memberId: String(row.user_id),
      previousAccess: null,
      newAccess: access,
      actorId,
      transition: String(row.user_id) === actorId ? 'created_owner' : 'member_added',
    })
  }
  await appendHomeBlock(tx, pageId, id)
  return id
}

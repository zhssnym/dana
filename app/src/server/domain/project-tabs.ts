/*
A project's tabs (step 7, migration 0061).

A project is its root `folders` row (`id = project_id`), and a tab is a
root-level page of the project with a `tab_position`; the root is always one.
This module adds tabs: `POST /folders/:id/tabs` (the picker and the "+"), and
the Discussion tab that "Discuss" on a task needs. Desk is the one exception:
its root stays Work and every additional tab is Doc; it never gains a
Discussion tab.

Every write takes the project root's row lock first, so two adds, a pick and
a Discuss on the same project queue rather than race, and "one live
Discussion per project" is decided under that lock
(`folders_one_discussion_per_project_idx` is the backstop).

Since step 8 people belong to the project: a new tab or page stores no
membership rows, and its owner is the project's.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { DEFAULT_TAB_NAMES } from '../../shared/folders.js'
import type { PageKind } from '../../shared/folders.js'
import { DEFAULT_FACET_NAMES } from '../../shared/facets.js'
import type { Facet } from '../../shared/facets.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform } from './folder-access.js'
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
  isDefault: boolean
}

/** The live project root of `pageId`, under its row lock, or null. */
async function lockedProjectOf(tx: Executor, pageId: string): Promise<ProjectRoot | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT r.id, r.kind, r.owner_id, r.tab_position, r.name, r.is_default
          FROM folders p JOIN folders r ON r.id = p.project_id
         WHERE p.id = ${pageId}::uuid AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND r.deleted_at IS NULL AND r.archived_at IS NULL
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
    isDefault: row.is_default === true,
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

/** One tab row, owned by the project's owner; its people are the project's (step 8). */
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

/** Whether a page body holds any block or live task. */
async function holdsWriting(tx: Executor, pageId: string): Promise<boolean> {
  const rows = await rowsOf(
    tx,
    sql`SELECT (EXISTS (SELECT 1 FROM page_blocks WHERE folder_id = ${pageId}::uuid)
             OR EXISTS (SELECT 1 FROM tasks WHERE folder_id = ${pageId}::uuid AND deleted_at IS NULL)) AS held`,
  )
  return rows[0]?.held === true
}

/** The live Discussion tab of a project, or null. */
export async function liveDiscussionTab(tx: Executor, projectId: string): Promise<string | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT id FROM folders
         WHERE project_id = ${projectId}::uuid AND kind = 'discussion'
           AND deleted_at IS NULL AND archived_at IS NULL`,
  )
  return rows[0] === undefined ? null : String(rows[0].id)
}

/**
 * `POST /folders/:id/tabs`. `pageId` is any page of the project; the actor
 * needs `folder.page.edit` on the project root. While the root's kind is
 * unpicked, `kind` picks it (`usual`: the root is Work, with Purpose before
 * it and Results and Discussion after). Once picked, `kind` adds one tab
 * after the last. Desk is always Work plus Docs, so its endpoint accepts Doc
 * only and never changes the root's kind.
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

    if (root.isDefault) {
      if (kind !== 'doc') {
        return { kind: 'invalid', reason: 'kind: Desk can add documentation pages only.' }
      }
      if (root.kind === null) {
        await tx.execute(sql`UPDATE folders SET kind = 'work' WHERE id = ${root.id}::uuid`)
      }
      await insertTab(
        tx,
        actorId,
        root,
        'doc',
        DEFAULT_TAB_NAMES.doc,
        keyBetween(await lastTabPosition(tx, root.id), null),
      )
      return { kind: 'ok', projectId: root.id }
    }

    if (root.kind === null) {
      if (kind === 'usual') {
        await tx.execute(sql`UPDATE folders SET kind = 'work' WHERE id = ${root.id}::uuid`)
        await insertTab(tx, actorId, root, 'doc', 'Purpose', keyBetween(null, root.tabPosition))
        const results = keyBetween(root.tabPosition, null)
        await insertTab(tx, actorId, root, 'doc', 'Results', results)
        await insertTab(tx, actorId, root, 'discussion', DEFAULT_TAB_NAMES.discussion, keyBetween(results, null))
      } else {
        /* A Discussion page draws only threads and refuses writing, so
           picking it over a sub-page link or a task already on the root
           would hide them for good. */
        if (kind === 'discussion' && (await holdsWriting(tx, root.id))) {
          return {
            kind: 'conflict',
            reason: 'This project already holds pages or tasks; pick Doc, Work or the usual project.',
          }
        }
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

/**
 * Where a new sub-page of a Work tab goes: the project's live `Pages` Doc
 * tab, added right after that Work tab when there is none. Work holds
 * tasks, not page links; migration 0061 moved every root's page links and
 * children to a `Pages` tab, and "Add a page inside" keeps that shape.
 * Null when `workTabId` is not a live Work tab.
 */
export async function pagesTabFor(tx: Executor, actorId: string, workTabId: string): Promise<string | null> {
  const root = await lockedProjectOf(tx, workTabId)
  if (root === null) return null
  const work = await rowsOf(
    tx,
    sql`SELECT tab_position FROM folders
         WHERE id = ${workTabId}::uuid AND kind = 'work' AND tab_position IS NOT NULL
           AND deleted_at IS NULL AND archived_at IS NULL`,
  )
  if (work[0] === undefined) return null
  const existing = await rowsOf(
    tx,
    sql`SELECT id FROM folders
         WHERE project_id = ${root.id}::uuid AND tab_position IS NOT NULL AND kind = 'doc'
           AND name = 'Pages' AND deleted_at IS NULL AND archived_at IS NULL
         ORDER BY tab_position, id LIMIT 1`,
  )
  if (existing[0] !== undefined) return String(existing[0].id)
  const at = String(work[0].tab_position)
  const next = await rowsOf(
    tx,
    sql`SELECT min(tab_position) AS next FROM folders
         WHERE project_id = ${root.id}::uuid AND tab_position > ${at}
           AND deleted_at IS NULL AND archived_at IS NULL`,
  )
  const after = next[0]?.next == null ? null : String(next[0].next)
  return insertTab(tx, actorId, root, 'doc', 'Pages', keyBetween(at, after))
}

/** The project a page belongs to (defined beside the access resolver). */
export { projectOf } from './folder-access.js'

/**
 * The live Discussion tab of `pageId`'s project, added after the last tab
 * when there is none ("Discuss" on a task, spec 7.28). Desk deliberately
 * answers null: its one member has no Discussion surface.
 */
export async function ensureDiscussionTab(tx: Executor, actorId: string, pageId: string): Promise<string | null> {
  const root = await lockedProjectOf(tx, pageId)
  if (root === null || root.isDefault) return null
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
           AND t.kind = 'doc' AND t.deleted_at IS NULL AND t.archived_at IS NULL
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
 * project's people (step 8). Records no event: the caller's act is the event.
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
        VALUES (${id}::uuid, ${root.ownerId}::uuid, ${name}, ${pageId}::uuid,
                ${await lastChildPosition(tx, pageId)}, ${root.id}::uuid, 'doc')`,
  )
  await appendHomeBlock(tx, pageId, id)
  return id
}

/**
 * The retired 7.27 facet listing, read from the tab rows, for a client from
 * before step 7 (an installed PWA on the old bundle) until the contract
 * migration. On a project root: the root as `main`, and each live Doc or
 * Discussion tab as the facet it was (a migrated tab keeps its facet's id and
 * kind) or as a shared blank / consultation. Any other page answers its
 * `main` alone. A Work tab besides the root has no old shape and is left
 * out. The caller has gated the viewer on `pageId`.
 */
export async function legacyFacets(executor: Executor, pageId: string): Promise<Facet[]> {
  const rows = await rowsOf(
    executor,
    sql`SELECT t.id, t.kind, t.name, t.tab_position, t.created_at, (t.id = p.id) AS is_page,
               ff.kind AS facet_kind,
               (SELECT m.id FROM folder_facets m WHERE m.folder_id = p.id AND m.kind = 'main') AS main_id
          FROM folders p
          JOIN folders t ON (p.id = p.project_id AND t.project_id = p.id AND t.tab_position IS NOT NULL
                             AND t.deleted_at IS NULL AND t.archived_at IS NULL)
                         OR t.id = p.id
          LEFT JOIN folder_facets ff ON ff.id = t.id
         WHERE p.id = ${pageId}::uuid
         ORDER BY t.tab_position NULLS FIRST, t.id`,
  )
  const facets: Facet[] = []
  for (const row of rows) {
    const common = {
      hidden: false,
      private: false,
      owner_id: null,
      position: row.tab_position === null ? 'a0' : String(row.tab_position),
      h1_block_id: null,
      updated_at: new Date(row.created_at as string | Date).toISOString(),
    }
    if (row.is_page === true) {
      const id = row.main_id === null ? String(row.id) : String(row.main_id)
      facets.push({ ...common, id, kind: 'main', name: DEFAULT_FACET_NAMES.main, display_name: null })
      continue
    }
    const stored = row.facet_kind === null ? null : String(row.facet_kind)
    const kind =
      stored === 'purpose' || stored === 'results' || stored === 'shared_blank' || stored === 'consultation'
        ? stored
        : row.kind === 'doc' ? 'shared_blank' : row.kind === 'discussion' ? 'consultation' : null
    if (kind === null) continue
    const name = String(row.name)
    const display_name =
      kind === 'consultation' ? null
        : kind === 'shared_blank' ? name
          : name === DEFAULT_FACET_NAMES[kind] ? null : name
    facets.push({ ...common, id: String(row.id), kind, name, display_name })
  }
  return facets
}
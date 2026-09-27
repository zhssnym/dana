/*
Wave 2, pages in pages (migration 0039): the page tree's cross-row rules.

A page is a `folders` row; `parent_folder_id` names the page it sits under
and `child_position` orders it among its siblings. Sharing is per page
(Hassan's decision 1): a sub-page copies its parent's members once, at
creation, and nothing is inherited afterwards. So every read here that names
another page is filtered by the viewer's own membership of THAT page, and a
walk upward stops at the first ancestor the viewer is not a member of (or
that is trashed): an inaccessible ancestor truncates the breadcrumb and makes
the child a root in that viewer's sidebar, and its id and name never leave
the server.

Every function takes an `Executor` so a caller holding a transaction -- the
PATCH /folders/:id/location route today, the document transaction's future
`create_page` / `trash_page` ops tomorrow -- runs it on its own snapshot.

Structural writes (a sub-page's creation, a move) take one fixed advisory
transaction lock first, `lockPageTree`. The cycle and depth checks are
recursive reads over parent pointers, and two concurrent moves that each pass
their own check (A under B, B under A) would together make a cycle no CHECK
can see; one lock for the whole tree serialises them. Moves are rare and
short, so one key costs nothing worth a finer scheme.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { FolderCrumb } from '../../shared/folders.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform, visibleFolder } from './folder-access.js'
import type { FolderActorFacts } from './folder-access.js'
import { keyBetween } from './fractional-index.js'
import { seededItems } from './page-order.js'

/** Levels from a root (depth 1) down to the deepest page, inclusive. */
export const PAGE_TREE_MAX_DEPTH = 20

/** The one advisory key every tree move and sub-page creation takes. The
 * number is arbitrary and fixed; it only has to be unique among the app's
 * advisory keys ("Dana" "Tree" in ASCII). */
const PAGE_TREE_LOCK_KEY = '4927008461390308709'

/** The rights a structural tree act needs on each page it touches: adding a
 * sub-page to a page, moving a page, and being the page a move lands under
 * are all edits of that page's structure. */
export const PAGE_TREE_EDIT_ACTION = 'folder.page.edit' as const

export async function lockPageTree(tx: Executor): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${PAGE_TREE_LOCK_KEY}::bigint)`,
  )
}

/* ------------------------------------------------------------------ *
 * Viewer-filtered reads
 * ------------------------------------------------------------------ */

/**
 * The SQL predicate "the viewer may see the parent of `f`": it is live and
 * the viewer is a member of it. `folderSelect` reports `parent_folder_id` and
 * `child_position` only under this, so the list and the single view say the
 * same thing and a hidden parent's id never reaches the wire.
 */
export function visibleParentPredicate(viewerId: string) {
  return visibleFolder(sql`f.parent_folder_id`, viewerId)
}

/**
 * The breadcrumb of each page in `folderIds`, root first and nearest parent
 * last, as `viewerId` may see it: one recursive walk upward for the whole
 * batch, stopping at the first ancestor that is trashed or that the viewer is
 * not a member of, and never deeper than the tree may be (which also bounds a
 * walk over a cycle, were one ever written). A page with no visible parent
 * answers [] (absent from the map means the same).
 *
 * Does not check the viewer's access to the starting pages themselves: the
 * caller has resolved it (the folder view's gate, search's membership join).
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
          SELECT f.id, 0, f.id, f.parent_folder_id, f.name, f.icon, f.color
            FROM folders f
           WHERE f.id IN (${sql.join(
             unique.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
          UNION ALL
          SELECT u.start_id, u.depth + 1, p.id, p.parent_folder_id,
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

/* ------------------------------------------------------------------ *
 * Structure (callers hold `lockPageTree`)
 * ------------------------------------------------------------------ */

/** The ids on the chain from `folderId` up to its root, `folderId` first,
 * over every row whatever its state or anyone's access -- a trashed ancestor
 * comes back on restore, so it counts. Capped past the legal depth, so a
 * corrupt cycle still terminates and reads as too deep. */
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

/** Whether one more level fits under `parentId`. */
export async function mayAddChildUnder(
  tx: Executor,
  parentId: string,
): Promise<boolean> {
  return (await chainUp(tx, parentId)).length < PAGE_TREE_MAX_DEPTH
}

/** The sibling key that puts a new child last under `parentId`. */
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

/* ------------------------------------------------------------------ *
 * PATCH /folders/:id/location
 * ------------------------------------------------------------------ */

export type MoveFolderResult =
  | { kind: 'moved' }
  /** The page, the target parent or `after_id`'s page is missing, trashed
   * or not the actor's: one answer (10.2). */
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  /** 422s: the default folder stays a root and is never a parent; a page cannot go under itself or
   * its own descendant; the tree may not grow deeper than 20; `after_id`
   * must be a sibling under the target parent. */
  | { kind: 'default_folder' }
  | { kind: 'cycle' }
  | { kind: 'too_deep' }
  | { kind: 'not_a_sibling' }

/**
 * Moves `folderId` under `parentId` (null: make it a root). `afterId` lands
 * it right after that sibling; null puts it first; undefined puts it last.
 * A root has no sibling order of its own (roots are ordered by each viewer's
 * library), so `afterId` is ignored when `parentId` is null and the key is
 * cleared.
 *
 * Takes the tree lock itself (a no-op re-entry if the caller holds it: an
 * advisory xact lock is re-entrant within one transaction). The `page` block
 * that stands for the page in its parent's document moves in the same
 * transaction: a new parent gets it at the end of its document, a move to the
 * root removes it, and a reorder under the same parent leaves it where it is.
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
    sql`SELECT parent_folder_id FROM folders WHERE id = ${folderId}::uuid`,
  )
  const priorParent = before[0]?.parent_folder_id
  const oldParent =
    priorParent === null || priorParent === undefined ? null : String(priorParent)

  if (parentId === null) {
    await tx.execute(
      sql`UPDATE folders SET parent_folder_id = NULL, child_position = NULL
           WHERE id = ${folderId}::uuid`,
    )
    await removeHomeBlock(tx, folderId)
    await recordMove(tx, actorId, page)
    return { kind: 'moved' }
  }

  const parent = await folderActorFacts(tx, actorId, parentId)
  if (parent === null) return { kind: 'not_found' }
  const onParent = mayPerform(parent, PAGE_TREE_EDIT_ACTION)
  if (!onParent.allowed) return { kind: 'forbidden', reason: onParent.reason }
  // The default folder stays a root, and nothing goes under one either (the
  // same refusal POST /folders gives a default parent).
  if (page.isDefault || parent.isDefault) return { kind: 'default_folder' }

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
    /* A body id: gated here like the parent, 404 before any structural
       answer, so a stranger's page id is never confirmed by a 422. */
    const after = await folderActorFacts(tx, actorId, afterId)
    if (after === null) return { kind: 'not_found' }
    const index = siblings.findIndex((row) => String(row.id) === afterId)
    if (index < 0) return { kind: 'not_a_sibling' }
    const lower = keys[index] ?? null
    /* Equal neighbours cannot be split, so land after the run of equal keys
       (only reachable over keys written outside this function). */
    const upper = keys.slice(index + 1).find((key) => lower === null || key > lower)
    position = keyBetween(lower, upper ?? null)
  }
  await tx.execute(
    sql`UPDATE folders SET parent_folder_id = ${parentId}::uuid,
                           child_position = ${position}
         WHERE id = ${folderId}::uuid`,
  )
  if (oldParent !== parentId) {
    await removeHomeBlock(tx, folderId)
    await appendHomeBlock(tx, parentId, folderId)
  }
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

/* ------------------------------------------------------------------ *
 * Home blocks: a sub-page's `page` block in its parent's Main document
 * ------------------------------------------------------------------ */

/*
Lock order, so these never deadlock with a document transaction: the tree lock
first (`lockPageTree`), then the document's folder row, then the sub-page's row.
Every caller that changes a page's place takes the tree lock before anything
else, and so does a document transaction carrying a tree op (`actOnFolderPage`).

The invariant: every live sub-page whose parent is live has exactly one `page`
block, in the parent's Main document (`page_blocks_page_home_idx` holds "at
most one"; these functions keep "exactly"). The writers that change a page's
place outside a document transaction -- the sidebar "+", a move, the route
DELETE, a restore -- call these; the document transaction's own `create_page`
and `trash_page` write the block themselves. A document's revision is computed
from its rows, so writing rows is all it takes to keep the other document's
revision honest.
*/

/** The `page` block that is `folderId`'s home, wherever it is. */
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

/** Appends `folderId`'s home block at the end of `parentId`'s Main document:
 * top level (no Section, no parent block), after every item there is. Takes
 * the parent's folder row lock, the one the document transaction holds. */
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

/** Removes `folderId`'s home block from whichever document holds it, under
 * that document's folder row lock. */
export async function removeHomeBlock(tx: Executor, folderId: string): Promise<void> {
  const home = await homeBlockOf(tx, folderId)
  if (home === null) return
  await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${home.folderId}::uuid FOR UPDATE`)
  await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${home.id}::uuid`)
}

/** After a restore: a live page under a live parent gets its home block back,
 * at the end, when it has none. A page whose parent is in Trash reads as a
 * root for now and needs none. */
export async function ensureHomeBlock(tx: Executor, folderId: string): Promise<void> {
  const rows = await rowsOf(
    tx,
    sql`SELECT f.parent_folder_id FROM folders f
          JOIN folders p ON p.id = f.parent_folder_id AND p.deleted_at IS NULL
         WHERE f.id = ${folderId}::uuid AND f.deleted_at IS NULL`,
  )
  const parent = rows[0]?.parent_folder_id
  if (parent === null || parent === undefined) return
  if ((await homeBlockOf(tx, folderId)) !== null) return
  await appendHomeBlock(tx, String(parent), folderId)
}

/**
 * Brings a trashed page back in the caller's transaction: the row, the set
 * trashed with it (`restorePageSubtree`), and the `restored` event. The caller
 * has gated `folder.restore`. Shared by POST /folders/:id/restore and the
 * document transaction, where re-putting a trashed page's `page` block (the
 * editor's Undo of "Move page to Trash") restores it in place.
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

/* ------------------------------------------------------------------ *
 * Trash: the subtree rides its initiator
 * ------------------------------------------------------------------ */

/**
 * Trashes the live descendants of `folderId` that `actorId` may move to Trash
 * (`folder.trash`), stamping each with `trashed_with_folder_id = folderId` so
 * a restore brings back exactly this set and /trash lists only `folderId`.
 * The caller trashes `folderId` itself in the same transaction (the same
 * `now()`, so the 30-day purge takes the set together).
 *
 * **A descendant the actor may not trash stays live, with its own subtree.**
 * The walk does not descend through it: its children are its members'
 * business. It keeps its `parent_folder_id` pointer: the Folder object
 * already reports a trashed parent as null, so it reads as a root to
 * everybody while the parent is in Trash, and a restore of the parent simply
 * re-attaches it. Clearing the pointer would lose the place for good the day
 * the parent comes back.
 *
 * Answers the ids it trashed, deepest-first order not guaranteed.
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
      sql`SELECT c.id FROM folders c
           WHERE c.parent_folder_id IN (${sql.join(
             frontier.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
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
      sql`SELECT user_id FROM folder_members WHERE folder_id = ${id}::uuid`,
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

/** The facts of `actorId` on a trashed row, or null when not a member. */
async function trashedFacts(
  tx: Executor,
  actorId: string,
  folderId: string,
): Promise<FolderActorFacts | null> {
  return folderActorFacts(tx, actorId, folderId, { includeTrashed: true })
}

/**
 * The restore's other half: the rows trashed with `folderId`. Each one the
 * actor may restore (`folder.restore`) comes back; any other is released
 * from the set (its `trashed_with_folder_id` cleared) so it stays in Trash as
 * an entry of its own that its own members can see and restore. The caller
 * restores `folderId` itself in the same transaction.
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
 * The permanent delete's other half: the ids trashed with `folderId` that
 * `actorId` may destroy (`folder.destroy`). The caller destroys them with
 * `folderId` in one statement; the rest are released by the FK's ON DELETE
 * SET NULL and stay in Trash as entries of their own, never dangling.
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

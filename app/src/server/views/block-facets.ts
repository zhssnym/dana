import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { BlockFacetRef, GetProjectBlockFacetsResponse, PutBlockFacetsResponse } from '../../shared/block-facets.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { accessOf, folderActorFacts, mayPerform } from '../domain/folder-access.js'

export type SetBlockFacetsResult =
  | { kind: 'ok'; value: PutBlockFacetsResponse }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'invalid'; reason: string }

function refs(rows: readonly Record<string, unknown>[]): BlockFacetRef[] {
  return rows.map((row) => ({ id: String(row.id), name: String(row.name) }))
}

/** The only facet targets a block in `pageId`'s Work/project may name. */
export async function projectFacetOptions(
  executor: Executor,
  viewerId: string,
  pageId: string,
): Promise<BlockFacetRef[] | null> {
  if ((await accessOf(executor, viewerId, pageId)) === null) return null
  const rows = await rowsOf(
    executor,
    sql`SELECT tf.id, tf.name
          FROM folders p
          JOIN folders tf ON tf.project_id = p.project_id
         WHERE p.id = ${pageId}::uuid
           AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND tf.kind = 'doc' AND tf.tab_position IS NOT NULL
           AND tf.id <> tf.project_id
           AND tf.deleted_at IS NULL AND tf.archived_at IS NULL
         ORDER BY tf.tab_position, tf.id`,
  )
  return refs(rows)
}

/** Project-wide block-owned facet edges visible from `pageId`. */
export async function projectBlockFacets(
  executor: Executor,
  viewerId: string,
  pageId: string,
): Promise<GetProjectBlockFacetsResponse | null> {
  if ((await accessOf(executor, viewerId, pageId)) === null) return null
  const projectRows = await rowsOf(
    executor,
    sql`SELECT project_id FROM folders WHERE id = ${pageId}::uuid
         AND deleted_at IS NULL AND archived_at IS NULL`,
  )
  const project = projectRows[0]?.project_id
  if (project === undefined || project === null) return null
  const projectId = String(project)
  const rows = await rowsOf(
    executor,
    sql`SELECT pbf.block_id, tf.id, tf.name, tf.tab_position
          FROM page_block_facets pbf
          JOIN page_blocks b ON b.id = pbf.block_id
          LEFT JOIN folders sf ON sf.id = b.folder_id
          LEFT JOIN tasks st ON st.id = b.task_id AND st.deleted_at IS NULL
          JOIN folders tf ON tf.id = pbf.facet_id
         WHERE COALESCE(sf.project_id, st.project_id) = ${projectId}::uuid
           AND tf.project_id = ${projectId}::uuid
           AND tf.kind = 'doc' AND tf.tab_position IS NOT NULL
           AND tf.id <> tf.project_id
           AND tf.deleted_at IS NULL AND tf.archived_at IS NULL
         ORDER BY pbf.block_id, tf.tab_position, tf.id`,
  )
  const byBlock = new Map<string, BlockFacetRef[]>()
  for (const row of rows) {
    const blockId = String(row.block_id)
    const list = byBlock.get(blockId) ?? []
    list.push({ id: String(row.id), name: String(row.name) })
    byBlock.set(blockId, list)
  }
  return {
    project_id: projectId,
    blocks: [...byBlock.entries()].map(([block_id, facets]) => ({ block_id, facets })),
  }
}

interface BlockFacetSource {
  folderId: string
  projectId: string
  taskId: string | null
  actorAssigned: (actorId: string) => boolean
}

/**
 * Lock the page_block alone, then resolve its owner separately. Keeping the
 * row lock off the nullable joins matters on Postgres and also makes the two
 * source shapes explicit: a page block or a Task-document block, never Shelf.
 */
async function sourceOf(tx: Executor, blockId: string): Promise<BlockFacetSource | null> {
  const blocks = await rowsOf(
    tx,
    sql`SELECT folder_id, task_id, shelf_id
          FROM page_blocks
         WHERE id = ${blockId}::uuid
         FOR UPDATE`,
  )
  const block = blocks[0]
  if (block === undefined || block.shelf_id != null) return null

  if (block.folder_id != null) {
    const folders = await rowsOf(
      tx,
      sql`SELECT id, project_id FROM folders
           WHERE id = ${String(block.folder_id)}::uuid
             AND deleted_at IS NULL AND archived_at IS NULL`,
    )
    const folder = folders[0]
    if (folder === undefined || folder.project_id == null) return null
    return {
      folderId: String(folder.id),
      projectId: String(folder.project_id),
      taskId: null,
      actorAssigned: () => false,
    }
  }

  if (block.task_id == null) return null
  const tasks = await rowsOf(
    tx,
    sql`SELECT id, folder_id, project_id, assignee_ids
          FROM tasks
         WHERE id = ${String(block.task_id)}::uuid
           AND deleted_at IS NULL`,
  )
  const task = tasks[0]
  if (task === undefined || task.folder_id == null || task.project_id == null) return null
  const assigned = Array.isArray(task.assignee_ids) ? task.assignee_ids.map(String) : []
  return {
    folderId: String(task.folder_id),
    projectId: String(task.project_id),
    taskId: String(task.id),
    actorAssigned: (actorId) => assigned.includes(actorId),
  }
}

/** Atomic replacement of one block's exact, same-project facet set. */
export async function setBlockFacets(
  db: Db,
  actorId: string,
  blockId: string,
  facetIds: readonly string[],
): Promise<SetBlockFacetsResult> {
  return inTransaction(db, async (tx) => {
    const source = await sourceOf(tx, blockId)
    if (source === null) return { kind: 'not_found' }
    const facts = await folderActorFacts(tx, actorId, source.folderId)
    if (facts === null) return { kind: 'not_found' }
    const decision = source.taskId === null
      ? mayPerform(facts, 'folder.page.edit')
      : mayPerform(facts, 'task.edit', {
          assigneeId: source.actorAssigned(actorId) ? actorId : null,
        })
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    if (facetIds.length > 0) {
      const found = await rowsOf(
        tx,
        sql`SELECT id FROM folders
             WHERE id = ANY(${facetIds}::uuid[])
               AND project_id = ${source.projectId}::uuid
               AND kind = 'doc' AND tab_position IS NOT NULL
               AND id <> project_id
               AND deleted_at IS NULL AND archived_at IS NULL`,
      )
      if (found.length !== facetIds.length) {
        return { kind: 'invalid', reason: 'Choose facets from this project.' }
      }
    }

    await tx.execute(
      facetIds.length === 0
        ? sql`DELETE FROM page_block_facets WHERE block_id = ${blockId}::uuid`
        : sql`DELETE FROM page_block_facets
               WHERE block_id = ${blockId}::uuid
                 AND NOT (facet_id = ANY(${facetIds}::uuid[]))`,
    )
    for (const facetId of facetIds) {
      await tx.execute(
        sql`INSERT INTO page_block_facets (block_id, facet_id)
            VALUES (${blockId}::uuid, ${facetId}::uuid)
            ON CONFLICT (block_id, facet_id) DO NOTHING`,
      )
    }
    const current = await rowsOf(
      tx,
      sql`SELECT f.id, f.name FROM page_block_facets pbf
          JOIN folders f ON f.id = pbf.facet_id
         WHERE pbf.block_id = ${blockId}::uuid
         ORDER BY f.tab_position, f.id`,
    )
    return { kind: 'ok', value: { block_id: blockId, facets: refs(current) } }
  })
}

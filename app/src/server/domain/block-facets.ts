import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { BlockFacetRef, GetProjectBlockFacetsResponse, PutBlockFacetsResponse } from '../../shared/block-facets.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { accessOf, folderActorFacts, mayPerform } from './folder-access.js'

export type SetBlockFacetsResult =
  | { kind: 'ok'; value: PutBlockFacetsResponse }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'invalid'; reason: string }

function refs(rows: readonly Record<string, unknown>[]): BlockFacetRef[] {
  return rows.map((row) => ({ id: String(row.id), name: String(row.name) }))
}

/**
 * All persisted block-owned facet edges in the project of `pageId`.
 * The route gates `pageId`; this function repeats the visibility read so a
 * future caller cannot turn a project id into a relation oracle.
 */
export async function projectBlockFacets(
  executor: Executor,
  viewerId: string,
  pageId: string,
): Promise<GetProjectBlockFacetsResponse | null> {
  const access = await accessOf(executor, viewerId, pageId)
  if (access === null) return null
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

/** The exact source block and its authorization context, under the block lock. */
async function sourceOf(tx: Executor, blockId: string): Promise<{
  folderId: string
  projectId: string
  taskId: string | null
  actorAssigned: (actorId: string) => boolean
} | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT b.id, b.task_id,
               COALESCE(b.folder_id, t.folder_id) AS folder_id,
               COALESCE(sf.project_id, t.project_id) AS project_id,
               t.assignee_ids
          FROM page_blocks b
          LEFT JOIN folders sf ON sf.id = b.folder_id
          LEFT JOIN tasks t ON t.id = b.task_id AND t.deleted_at IS NULL
         WHERE b.id = ${blockId}::uuid
           AND b.shelf_id IS NULL
           AND (b.folder_id IS NOT NULL OR b.task_id IS NOT NULL)
         FOR UPDATE OF b`,
  )
  const row = rows[0]
  if (row === undefined || row.folder_id == null || row.project_id == null) return null
  const assigned = Array.isArray(row.assignee_ids) ? row.assignee_ids.map(String) : []
  return {
    folderId: String(row.folder_id),
    projectId: String(row.project_id),
    taskId: row.task_id == null ? null : String(row.task_id),
    actorAssigned: (actorId) => assigned.includes(actorId),
  }
}

/**
 * Replaces one block's whole facet set. A relationship is valid only when the
 * target is a live Doc tab of the source block's project. This is the backend
 * half of #488's "current Work only" rule; a forged id from another project
 * receives the same generic 422 as a non-facet id and discloses nothing about
 * which case it was.
 */
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
        sql`INSERT INTO page_block_facets (block_id, facet_id, created_by)
            VALUES (${blockId}::uuid, ${facetId}::uuid, ${actorId}::uuid)
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

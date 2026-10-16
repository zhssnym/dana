// Synced blocks (#720): a `synced` row names its source block in `text`. Every read gates on the
// source's own home, so a copy never shows content its reader cannot open where it lives.
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { isSyncableKind } from '../../shared/page-document.js'
import type { SyncedSource } from '../../shared/synced-blocks.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { visibleFolder } from './folder-access.js'

/** True when `viewerId` may read block `alias` through its Page, Facet, Task or Shelf. */
export function readableBlock(alias: string, viewerId: string): SQL {
  const b = sql.raw(alias)
  return sql`(
    (${b}.folder_id IS NOT NULL AND ${visibleFolder(sql`${b}.folder_id`, viewerId)}
      AND (${b}.page_facet_id IS NULL OR EXISTS (
        SELECT 1 FROM page_facets rb_pf WHERE rb_pf.id = ${b}.page_facet_id AND rb_pf.deleted_at IS NULL)))
    OR (${b}.task_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks rb_t WHERE rb_t.id = ${b}.task_id AND rb_t.deleted_at IS NULL
         AND ${visibleFolder(sql`rb_t.folder_id`, viewerId)}))
    OR (${b}.shelf_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM shelves rb_s WHERE rb_s.id = ${b}.shelf_id AND rb_s.user_id = ${viewerId}::uuid))
  )`
}

/** Why `sourceId` cannot be the source of a new synced block, or null. */
export async function syncedSourceProblem(
  tx: Executor,
  viewerId: string,
  sourceId: string,
): Promise<string | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT b.kind FROM page_blocks b WHERE b.id = ${sourceId}::uuid AND ${readableBlock('b', viewerId)}`,
  )
  const row = rows[0]
  if (row === undefined) return 'The original block is not available.'
  return isSyncableKind(String(row.kind)) ? null : 'This block cannot be synced.'
}

/** The source block and its home, or null when it is gone or the viewer cannot read it. */
export async function syncedSourceOf(
  tx: Executor,
  viewerId: string,
  sourceId: string,
): Promise<SyncedSource | null> {
  const rows = await rowsOf(
    tx,
    sql`SELECT b.id, b.kind, b.folder_id, b.task_id, b.shelf_id,
               pf.id AS facet_id, pf.page_id, f.name AS folder_name, pf.name AS facet_name,
               t.title AS task_title, s.name AS shelf_name,
               (SELECT count(DISTINCT COALESCE(c.page_facet_id, c.folder_id, c.task_id, c.shelf_id))
                  FROM page_blocks c
                 WHERE c.kind = 'synced' AND c.text = b.id::text AND ${readableBlock('c', viewerId)}) AS copies
          FROM page_blocks b
          LEFT JOIN page_facets pf ON pf.id = b.page_facet_id
          LEFT JOIN folders f ON f.id = COALESCE(pf.page_id, b.folder_id)
          LEFT JOIN tasks t ON t.id = b.task_id
          LEFT JOIN shelves s ON s.id = b.shelf_id
         WHERE b.id = ${sourceId}::uuid AND ${readableBlock('b', viewerId)}`,
  )
  const row = rows[0]
  if (row === undefined || !isSyncableKind(String(row.kind))) return null
  const copies = Number(row.copies)
  if (row.task_id !== null) {
    return { block_id: sourceId, home: 'task', home_id: String(row.task_id), facet_id: null, label: String(row.task_title), copies }
  }
  if (row.shelf_id !== null) {
    return { block_id: sourceId, home: 'shelf', home_id: String(row.shelf_id), facet_id: null, label: String(row.shelf_name), copies }
  }
  const facetName = row.facet_name === null ? null : String(row.facet_name)
  const pageName = String(row.folder_name ?? '')
  return {
    block_id: sourceId,
    home: 'folder',
    home_id: String(row.page_id ?? row.folder_id),
    facet_id: row.facet_id === null ? null : String(row.facet_id),
    label: facetName === null || facetName === 'Main' ? pageName : `${pageName} · ${facetName}`,
    copies,
  }
}

/** For each block in `blockIds` that has copies the viewer can open: how many documents hold one. */
export async function syncedCopyCounts(
  tx: Executor,
  viewerId: string,
  blockIds: readonly string[],
): Promise<Record<string, number>> {
  if (blockIds.length === 0) return {}
  const rows = await rowsOf(
    tx,
    sql`SELECT c.text AS source_id,
               count(DISTINCT COALESCE(c.page_facet_id, c.folder_id, c.task_id, c.shelf_id)) AS copies
          FROM page_blocks c
         WHERE c.kind = 'synced'
           AND c.text IN (${sql.join(blockIds.map((id) => sql`${id}`), sql`, `)})
           AND ${readableBlock('c', viewerId)}
         GROUP BY c.text`,
  )
  return Object.fromEntries(rows.map((row) => [String(row.source_id), Number(row.copies)]))
}

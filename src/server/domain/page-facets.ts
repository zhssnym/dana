import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { FolderAction } from '../../shared/folder-actions.js'
import { inTransaction } from '../database.js'
import { folderActorFacts, mayPerform } from './folder-access.js'
import { keyBetween, initialKeys } from './fractional-index.js'

import type { GetPageFacetsResponse } from '../../shared/page-facets.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

// The route verifies Page access before calling this reader.
export async function pageFacetsOf(
  db: Executor, pageId: string, trashed = false,
): Promise<GetPageFacetsResponse> {
  const rows = await rowsOf(db, sql`
    SELECT p.containing_facet_id, pf.id, pf.name, pf.position,
           pf.content_folder_id AS content_page_id
      FROM folders p
      LEFT JOIN page_facets pf
        ON pf.page_id = p.id
       AND ${trashed ? sql`pf.deleted_at IS NOT NULL` : sql`pf.deleted_at IS NULL`}
       AND (pf.content_folder_id IS NULL OR EXISTS (
         SELECT 1 FROM folders content
          WHERE content.id = pf.content_folder_id
            AND content.deleted_at IS NULL AND content.archived_at IS NULL
       ))
     WHERE p.id = ${pageId}::uuid
     ORDER BY pf.position COLLATE "C", pf.id
  `)
  return {
    page_id: pageId,
    containing_facet_id: rows[0]?.containing_facet_id == null
      ? null : String(rows[0].containing_facet_id),
    facets: rows.flatMap((row) => row.id == null ? [] : [{
      id: String(row.id),
      name: String(row.name),
      position: String(row.position),
      content_page_id: row.content_page_id == null ? null : String(row.content_page_id),
    }]),
  }
}

export type FacetWriteResult =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'invalid' }
  | { kind: 'conflict' }
  | { kind: 'last_facet' }
  | { kind: 'legacy_content' }

async function mayEditFacets(
  tx: Executor,
  actorId: string,
  pageId: string,
  action: FolderAction,
): Promise<Exclude<FacetWriteResult, { kind: 'ok' }> | null> {
  await rowsOf(tx, sql`SELECT id FROM folders WHERE id = ${pageId}::uuid FOR UPDATE`)
  const facts = await folderActorFacts(tx, actorId, pageId)
  if (facts === null) return { kind: 'not_found' }
  const permission = mayPerform(facts, action)
  return permission.allowed ? null : { kind: 'forbidden', reason: permission.reason }
}

export async function createPageFacet(
  db: Db, actorId: string, pageId: string,
  name: string, afterId?: string | null,
): Promise<FacetWriteResult> {
  return inTransaction(db, async (tx) => {
    const denied = await mayEditFacets(tx, actorId, pageId, 'facet.create')
    if (denied !== null) return denied
    const facets = await rowsOf(tx, sql`
      SELECT id, position FROM page_facets WHERE page_id = ${pageId}::uuid AND deleted_at IS NULL
      ORDER BY position COLLATE "C", id`)
    if (facets.length >= 200) return { kind: 'conflict' }
    const index = afterId === undefined ? facets.length :
      afterId === null ? 0 : facets.findIndex((facet) => facet.id === afterId) + 1
    if (index < 0 || (afterId !== null && afterId !== undefined && index === 0)) {
      return { kind: 'invalid' }
    }
    const lower = index === 0 ? null : String(facets[index - 1]?.position)
    const upper = index === facets.length ? null : String(facets[index]?.position)
    const position = keyBetween(lower, upper)
    await tx.execute(sql`
      INSERT INTO page_facets (id, page_id, content_folder_id, name, position)
      VALUES (${randomUUID()}::uuid, ${pageId}::uuid, NULL, ${name}, ${position})`)
    return { kind: 'ok' }
  })
}

export async function renamePageFacet(
  db: Db, actorId: string, pageId: string, facetId: string, name: string,
): Promise<FacetWriteResult> {
  return inTransaction(db, async (tx) => {
    const denied = await mayEditFacets(tx, actorId, pageId, 'facet.rename')
    if (denied !== null) return denied
    const updated = await rowsOf(tx, sql`
      UPDATE page_facets SET name = ${name}
      WHERE id = ${facetId}::uuid AND page_id = ${pageId}::uuid AND deleted_at IS NULL
      RETURNING id`)
    return updated.length ? { kind: 'ok' } : { kind: 'not_found' }
  })
}

export async function reorderPageFacets(
  db: Db, actorId: string, pageId: string, order: readonly string[],
): Promise<FacetWriteResult> {
  return inTransaction(db, async (tx) => {
    const denied = await mayEditFacets(tx, actorId, pageId, 'facet.reorder')
    if (denied !== null) return denied
    const existing = await rowsOf(tx, sql`
      SELECT id FROM page_facets WHERE page_id = ${pageId}::uuid AND deleted_at IS NULL`)
    const ids = new Set(existing.map((row) => String(row.id)))
    if (order.length !== ids.size || new Set(order).size !== order.length ||
        order.some((id) => !ids.has(id))) return { kind: 'conflict' }
    const keys = initialKeys(order.length)
    const placements = JSON.stringify(order.map((id, index) => [id, keys[index]]))
    await tx.execute(sql`
      UPDATE page_facets pf SET position = p.position
      FROM (
        SELECT (entry->>0)::uuid AS id, entry->>1 AS position
        FROM jsonb_array_elements(${placements}::jsonb) entry
      ) p
      WHERE pf.id = p.id AND pf.page_id = ${pageId}::uuid AND pf.deleted_at IS NULL`)
    return { kind: 'ok' }
  })
}

/** Trash is a reversible presentation change. IDs, writing, Tasks and child
 * Page ownership stay exactly where they were. Legacy-backed Facets must not
 * be hidden while old URLs and /folders writers still address them directly. */
export async function trashPageFacet(
  db: Db, actorId: string, pageId: string, facetId: string,
): Promise<FacetWriteResult> {
  return inTransaction(db, async (tx) => {
    const denied = await mayEditFacets(tx, actorId, pageId, 'facet.delete')
    if (denied !== null) return denied
    const rows = await rowsOf(tx, sql`
      SELECT content_folder_id FROM page_facets
       WHERE id = ${facetId}::uuid AND page_id = ${pageId}::uuid
         AND deleted_at IS NULL FOR UPDATE`)
    if (!rows.length) return { kind: 'not_found' }
    const count = await rowsOf(tx, sql`
      SELECT count(*)::int AS count FROM page_facets
       WHERE page_id = ${pageId}::uuid AND deleted_at IS NULL`)
    if (Number(count[0]?.count ?? 0) <= 1) return { kind: 'last_facet' }
    if (rows[0]?.content_folder_id !== null) return { kind: 'legacy_content' }
    await tx.execute(sql`
      UPDATE page_facets SET deleted_at = now()
       WHERE id = ${facetId}::uuid AND page_id = ${pageId}::uuid`)
    return { kind: 'ok' }
  })
}

export async function restorePageFacet(
  db: Db, actorId: string, pageId: string, facetId: string,
): Promise<FacetWriteResult> {
  return inTransaction(db, async (tx) => {
    const denied = await mayEditFacets(tx, actorId, pageId, 'facet.delete')
    if (denied !== null) return denied
    const rows = await rowsOf(tx, sql`
      SELECT id FROM page_facets
       WHERE id = ${facetId}::uuid AND page_id = ${pageId}::uuid
         AND deleted_at IS NOT NULL FOR UPDATE`)
    if (!rows.length) return { kind: 'not_found' }
    const live = await rowsOf(tx, sql`
      SELECT count(*)::int AS count FROM page_facets
       WHERE page_id = ${pageId}::uuid AND deleted_at IS NULL`)
    if (Number(live[0]?.count ?? 0) >= 200) return { kind: 'conflict' }
    await tx.execute(sql`
      UPDATE page_facets SET deleted_at = NULL
       WHERE id = ${facetId}::uuid AND page_id = ${pageId}::uuid`)
    return { kind: 'ok' }
  })
}

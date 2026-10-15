import { sql } from 'drizzle-orm'

import type { GetPageFacetsResponse } from '../../shared/page-facets.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'

// The route verifies Page access before calling this reader.
export async function pageFacetsOf(db: Executor, pageId: string): Promise<GetPageFacetsResponse> {
  const rows = await rowsOf(db, sql`
    SELECT p.containing_facet_id, pf.id, pf.name, pf.position,
           pf.content_folder_id AS content_page_id
      FROM folders p
      LEFT JOIN page_facets pf
        ON pf.page_id = p.id
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

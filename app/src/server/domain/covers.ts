/*
The 7.19 place-cover module: 4.20's per-viewer rows for Dana's own place
pages (RFC 0005 change control item 44, B1).

Three things this module is careful about.

**The scope is the caller, always.** Every statement below carries
`user_id = viewerId`, so there is no shape of request that reads or writes
another person's cover. That is the whole of this surface's authorization
and it is why there is no separate access resolution: a place page is
furniture, not an object somebody might or might not be a member of.

**A named file must be one the caller can read**, and the predicate is
`serveFile`'s, restated as a scope rather than re-derived: a folder-scoped
file is its members', and a file with no folder is any signed-in account's.
A file the caller cannot read answers 404 rather than 403, which is 10.2's
rule and the same answer a file that does not exist gets.

**Removal is the row's deletion**, because 4.20 admits no row with neither a
file nor a preset. That is also why the migration's foreign key cascades
where `folders.cover_file_id` sets null: deleting the picture has to delete
the cover, not leave a row the CHECK forbids.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { DEFAULT_FOCAL_Y } from '../../shared/covers.js'
import type { PlaceCover, PutPlaceCoverBody } from '../../shared/covers.js'
import { rowsOf } from './db.js'

function coverFromRow(row: Record<string, unknown>): PlaceCover {
  return {
    place: String(row.place) as PlaceCover['place'],
    file_id: row.file_id === null ? null : String(row.file_id),
    preset: row.preset === null ? null : String(row.preset),
    focal_y: Number(row.focal_y),
  }
}

export async function listPlaceCovers(
  db: Db,
  viewerId: string,
): Promise<PlaceCover[]> {
  const found = await rowsOf(
    db,
    sql`SELECT place, file_id, preset, focal_y
        FROM user_page_covers
        WHERE user_id = ${viewerId}
        ORDER BY place ASC`,
  )
  return found.map(coverFromRow)
}

export type PutPlaceCoverResult =
  | { kind: 'written'; cover: PlaceCover }
  /** The named file does not exist or is not the caller's to read (10.2). */
  | { kind: 'file_not_found' }

export async function putPlaceCover(
  db: Db,
  viewerId: string,
  place: string,
  body: PutPlaceCoverBody,
): Promise<PutPlaceCoverResult> {
  if (body.file_id !== undefined) {
    const readable = await rowsOf(
      db,
      sql`SELECT f.id
          FROM files f
          LEFT JOIN folders fo ON fo.id = f.folder_id
          WHERE f.id = ${body.file_id}
            AND (
              f.folder_id IS NULL
              OR (fo.deleted_at IS NULL AND EXISTS (
                SELECT 1 FROM folder_members m
                WHERE m.folder_id = f.folder_id AND m.user_id = ${viewerId}))
            )`,
    )
    if (readable.length === 0) return { kind: 'file_not_found' } as const
  }
  const written = await rowsOf(
    db,
    sql`INSERT INTO user_page_covers (user_id, place, file_id, preset, focal_y)
        VALUES (${viewerId}::uuid, ${place}, ${body.file_id ?? null}::uuid,
                ${body.preset ?? null}, ${body.focal_y ?? DEFAULT_FOCAL_Y})
        ON CONFLICT (user_id, place) DO UPDATE
          SET file_id = EXCLUDED.file_id,
              preset = EXCLUDED.preset,
              focal_y = EXCLUDED.focal_y,
              updated_at = now()
        RETURNING place, file_id, preset, focal_y`,
  )
  return {
    kind: 'written',
    cover: coverFromRow(written[0] as Record<string, unknown>),
  } as const
}

/** 7.19's removal: idempotent, because a cover nobody chose and a cover
 * somebody removed are the same state. */
export async function deletePlaceCover(
  db: Db,
  viewerId: string,
  place: string,
): Promise<void> {
  await db.execute(
    sql`DELETE FROM user_page_covers
        WHERE user_id = ${viewerId} AND place = ${place}`,
  )
}

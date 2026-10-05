// Per-viewer place covers (4.20, 7.19). Every statement is scoped to the viewer.
// A named file must be readable (`readableFileScope`) and a picture (kind cover or image); otherwise 404 (10.2).
// Removal deletes the row: 4.20 admits no row with neither a file nor a preset.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { DEFAULT_FOCAL_Y } from '../../shared/covers.js'
import type { PlaceCover, PutPlaceCoverBody } from '../../shared/covers.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import { coverFileFor, readableFileScope } from './files.js'

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
  /** Missing, unreadable, not a picture, or bytes gone: one answer for all, so no refusal says which (10.2). */
  | { kind: 'file_not_found' }
  /** 10.3's 1 GB quota, spent by the copy: 413. */
  | { kind: 'quota_exceeded' }

// The stored file is always one the person owns outright: anything else is copied first, on their quota,
// so the cover keeps drawing if they leave the folder. Their own folder-less cover is stored as is.
export async function putPlaceCover(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  place: string,
  body: PutPlaceCoverBody,
): Promise<PutPlaceCoverResult> {
  /** Bytes copied in the transaction below. If it throws, they are orphans and get removed. */
  const copied: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      let fileId: string | null = body.file_id ?? null
      if (body.file_id !== undefined) {
        const readable = await rowsOf(
          tx,
          sql`SELECT f.id FROM files f
              WHERE f.id = ${body.file_id}
                AND f.kind IN ('cover', 'image')
                AND ${readableFileScope(viewerId)}`,
        )
        if (readable.length === 0) return { kind: 'file_not_found' } as const

        const held = await coverFileFor(tx, store, viewerId, body.file_id, null)
        if (held.kind === 'bytes_missing') {
          return { kind: 'file_not_found' } as const
        }
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') copied.push(held.id)
        fileId = held.id
      }
      const written = await rowsOf(
        tx,
        sql`INSERT INTO user_page_covers (user_id, place, file_id, preset, focal_y)
            VALUES (${viewerId}::uuid, ${place}, ${fileId}::uuid,
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
    })
  } catch (error: unknown) {
    for (const id of copied) {
      try {
        await store.remove(id)
      } catch {
        // Cleanup failure must not replace the real error.
      }
    }
    throw error
  }
}

/** Idempotent: no cover and a removed cover are the same state. */
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

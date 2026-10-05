// Per-viewer place descriptions (4.22, 7.21). Every statement is scoped to the viewer.
// Clearing deletes the row, so a cleared description and an unwritten one look the same.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { PLACE_DESCRIPTION_PLACES } from '../../shared/place-descriptions.js'
import type {
  PlaceDescription,
  PutPlaceDescriptionBody,
} from '../../shared/place-descriptions.js'
import { rowsOf } from '../database.js'

/** Null for empty or whitespace-only text. */
function storedValue(description: string | null): string | null {
  const trimmed = description?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export async function listPlaceDescriptions(
  db: Db,
  viewerId: string,
): Promise<PlaceDescription[]> {
  const found = await rowsOf(
    db,
    sql`SELECT place, description
        FROM user_page_descriptions
        WHERE user_id = ${viewerId}`,
  )
  const written = new Map<string, string>()
  for (const row of found) {
    written.set(String(row.place), String(row.description))
  }
  return PLACE_DESCRIPTION_PLACES.map((place) => ({
    place,
    description: written.get(place) ?? null,
  }))
}

export async function putPlaceDescription(
  db: Db,
  viewerId: string,
  place: PlaceDescription['place'],
  body: PutPlaceDescriptionBody,
): Promise<PlaceDescription> {
  const value = storedValue(body.description)
  if (value === null) {
    await db.execute(
      sql`DELETE FROM user_page_descriptions
          WHERE user_id = ${viewerId} AND place = ${place}`,
    )
    return { place, description: null }
  }
  const written = await rowsOf(
    db,
    sql`INSERT INTO user_page_descriptions (user_id, place, description)
        VALUES (${viewerId}::uuid, ${place}, ${value})
        ON CONFLICT (user_id, place) DO UPDATE
          SET description = EXCLUDED.description,
              updated_at = now()
        RETURNING place, description`,
  )
  const row = written[0] as Record<string, unknown> | undefined
  return {
    place,
    description: row === undefined ? value : String(row.description),
  }
}

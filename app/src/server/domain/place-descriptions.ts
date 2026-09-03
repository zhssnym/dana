/*
The 7.21 place-description module: 4.22's per-viewer sentence under Dana's
own place pages (issue #68, from #21).

Three things this module is careful about, and two of them are its
neighbour's rules restated on purpose.

**The scope is the caller, always.** Every statement below carries
`user_id = viewerId`, so there is no shape of request that reads or writes
another person's words. That is the whole of this surface's authorization,
for the reason `covers.ts` gives about its own: a place page is furniture,
not an object somebody might or might not be a member of.

**The read is dense and the table is sparse.** The rows say what a person
wrote; the response says something about every one of 4.22's eight places,
null where they wrote nothing. The list is built from the shared constant
rather than from the rows, so the order is 9.1's fixed one and a place
nobody has ever written about still answers.

**Clearing is the row's deletion**, because 4.22 admits no row with no
words. A cleared description and one never written are the same state, so
they must have the same representation; an empty string kept in the table
would be a second way to spell absence and the first thing to disagree with
itself.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { PLACE_DESCRIPTION_PLACES } from '../../shared/place-descriptions.js'
import type {
  PlaceDescription,
  PutPlaceDescriptionBody,
} from '../../shared/place-descriptions.js'
import { rowsOf } from './db.js'

/** Null, and the same for a string of nothing but whitespace: see the shared
 * schema's note on what a person who empties the field has done. */
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

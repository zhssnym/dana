/*
The 7.19 place-cover module: 4.20's per-viewer rows for Dana's own place
pages (RFC 0005 change control item 44, B1).

Three things this module is careful about.

**The scope is the caller, always.** Every statement below carries
`user_id = viewerId`, so there is no shape of request that reads or writes
another person's cover. That is the whole of this surface's authorization
and it is why there is no separate access resolution: a place page is
furniture, not an object somebody might or might not be a member of.

**A named file must be a picture the caller can read**, which is two clauses
and 7.16's shelf gate exactly.

*Readable* is `serveFile`'s own predicate — imported since issues #20 and #100
rather than transcribed. It used to be transcribed here, under a sentence
saying it was "restated as a scope rather than re-derived", and the two then
diverged in the way that sentence exists to warn about: the copy admitted
**any** file with no folder to **anybody**, so a person could wear another
person's folder-less picture on their own Today page. Measured before the fix:
a second account's `PUT /place-covers/today { file_id: <the first account's
folder-less file> }` answered **200**. `readableFileScope` in
`domain/files.ts` is now the one definition, and the folder-less arm it
carries is owner-or-avatar.

*A picture* is `kind IN ('cover', 'image')`, and this clause was missing until
2026-09-03 while the other two gates that decide what a page may wear both
carried it: `patchShelf` (7.16), which shares this predicate, and
`patchFolderProfile` (7.4), which scopes by folder instead. It is not in
`readableFileScope` itself and must not be, because `serveFile` calls that
predicate too and serves voice notes and attachments as readily as pictures:
"may this account read these bytes" and "may this page wear this file" are
two questions, and only the second one is about kinds. **The gap was not a
confidentiality one and must not be described as one**:
`readableFileScope` admits every **avatar** to every signed-in account on
purpose (7.15, a member list renders other people's pictures), so what got
through was bytes the caller could already `GET`. What it cost was the other
two things a gate is for. A person could wear **another person's avatar** on
their own Today page — measured at 200, against 422 for the same file on a
shelf — which is precisely the defect this module's history above says was
closed, still open for the one folder-less kind that is not its owner's alone.
And a `voice` note or a plain attachment could be stored as a cover and drawn
as a broken image with the wrong mime, which is the reason `patchShelf`'s own
comment gives for the identical clause. AC-374 asserts both, and the arms that
must survive it: a folder-less `cover` of the caller's own, and an `image`
from a folder they are in.

A file this endpoint will not take answers 404 rather than 403 or 422, one
sentence for all three faults — absent, unreadable, not a picture — which is
10.2's rule and the answer 7.19 has always given. A shelf answers 422 for the
same body because its own PATCH found the shelf and faults one field of it;
that difference is 7.16's and 7.19's respectively, and neither moved here.

**Removal is the row's deletion**, because 4.20 admits no row with neither a
file nor a preset. That is also why the migration's foreign key cascades
where `folders.cover_file_id` sets null: deleting the picture has to delete
the cover, not leave a row the CHECK forbids.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { DEFAULT_FOCAL_Y } from '../../shared/covers.js'
import type { PlaceCover, PutPlaceCoverBody } from '../../shared/covers.js'
import { rowsOf } from '../database.js'
import { readableFileScope } from './files.js'

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
  /** The named file does not exist, is not the caller's to read, or is not a
   * picture; one answer for all three, so no refusal names which (10.2). */
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
      sql`SELECT f.id FROM files f
          WHERE f.id = ${body.file_id}
            AND f.kind IN ('cover', 'image')
            AND ${readableFileScope(viewerId)}`,
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

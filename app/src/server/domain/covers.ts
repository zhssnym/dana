/*
The 7.19 place-cover module: 4.20's per-viewer rows for Dana's own place
pages.

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
comment gives for the identical clause. The arms that must survive it: a
folder-less `cover` of the caller's own, and an `image` from a folder they
are in.

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
  /** The named file does not exist, is not the caller's to read, is not a
   * picture, or has no bytes left in the store; one answer for all four, so
   * no refusal names which (10.2). The fourth joined the list on 2026-09-04
   * with the copy below: a picture whose bytes are gone cannot be copied and
   * could not have been served either, so it is refused as the unreachable
   * file it is rather than stored as a cover that will never draw. */
  | { kind: 'file_not_found' }
  /** 10.3's 1 GB, spent by the copy. 413 with section 9's copy, which is
   * the answer an upload over the quota has always given. */
  | { kind: 'quota_exceeded' }

/*
The copy at set-time (issue #116, 2026-09-04; the primitive and the whole
reasoning are in `domain/files.ts`).

**A place cover used to store whatever readable file id it was handed, and
one of the shapes it admits is a picture living in a folder** — 7.16's kind
clause is `('cover','image')` precisely so a picture from a folder page can
dress Today. That is a cover which stops drawing the day its wearer leaves
the folder: `serveFile` refuses them, correctly, and 4.20's row sits there
naming a file they can no longer read, with nothing said. It is #116's second
half and it has been true since 7.19 was written.

So the file the row stores is now always one this person holds outright: a
folder-less `cover` of their own is stored as it is, and anything else — a
folder's picture, a `cover` somebody else owns and shares through a folder —
is copied first. Their quota pays for the copy, which is the honest price of
a picture that is theirs.

**What is deliberately not a copy: the same folder-less picture of their own
worn on two of their pages.** One upload can dress a shelf and a place page,
and both read back the same id; the sweep in
`domain/files.ts` counts references across every column, so removing it from
one page leaves the other alone. Copying there would buy independence that
reference counting already provides, at the cost of a contract the suite
asserts.
*/
export async function putPlaceCover(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  place: string,
  body: PutPlaceCoverBody,
): Promise<PutPlaceCoverResult> {
  /** Bytes written by a copy inside the transaction below. If it throws, the
   * row went with it and these are orphans nothing indexes, so they are
   * removed rather than left on the disk (11.7's own order, read backwards). */
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
        // The row is gone either way; unreachable bytes are not a failure
        // anybody can act on, and must not replace the real error below.
      }
    }
    throw error
  }
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

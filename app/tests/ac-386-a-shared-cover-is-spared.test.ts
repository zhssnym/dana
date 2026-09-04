/*
AC-386: given a cover file more than one thing references, then the reclaim
of AC-385 spares it until the last reference goes; and given a cover that
lives in a folder, then the reclaim never touches it at all.

**This is the half that decides whether the sweep is safe to run.** #116 said
so before any of it was built: "the previous cover" is ambiguous once one file
can dress two pages, because nothing stops a person setting the same `file_id`
on a shelf and on Today, and AC-373 fixes that they may. A sweep that counted
only the column it was invoked from would blank the other page — silently,
from a background pass, which is the worst place for it.

So the count is a query over **every** column that can name a file. Five
foreign keys reference `files(id)` and the predicate names all five; two of
them are asserted here from opposite directions, one through the API and one
planted, because a page block naming a picture is not a shape any cover
endpoint can produce and would otherwise never be tried.

**And a folder-scoped cover is out of scope by construction**, which is what
keeps the legacy rows of rule 3 working without a backfill. A cover set before
2026-09-04 may name a folder's file; the sweep takes only folder-less rows, so
it is never a candidate — and it needs no rescuing, because a folder's files
are listed in the folder and its members can delete them, and the folder's own
deletion already cascades them away with 8.8's purge removing the objects.

Spec: 7.19 as amended 2026-09-04, 4.16, 4.17, 4.20, 11.7; issue #116.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { runPass } from './reminders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac386')

const objects = new Map<string, Buffer>()
const memoryStore = {
  put: (id: string, bytes: Buffer): Promise<void> => {
    objects.set(id, bytes)
    return Promise.resolve()
  },
  get: (id: string): Promise<Buffer | null> =>
    Promise.resolve(objects.get(id) ?? null),
  remove: (id: string): Promise<void> => {
    objects.delete(id)
    return Promise.resolve()
  },
}

beforeAll(async () => {
  app = await startAuthTestApp({ fileStore: memoryStore })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function fileExists(fileId: string): Promise<boolean> {
  const found = (await app.db.execute(
    sql`SELECT 1 AS present FROM files WHERE id = ${fileId}::uuid`,
  )) as unknown as { rows: unknown[] }
  return found.rows.length > 0
}

/**
 * One reclaim, wound forward past the window.
 *
 * The tick's first pass marks whatever has stopped being worn and clears the
 * mark on whatever is worn again; the window then runs from that mark
 * (migration 0014), so a criterion that wants to see the delete has to age
 * the mark rather than the upload and run the tick again. Doing it in one
 * helper keeps every case below reading as one act, and keeps the aging
 * pointed at the fact the rule actually names — which is the correction
 * AC-385's header records.
 */
async function sweep(): Promise<void> {
  await runPass(app)
  await app.db.execute(
    sql`UPDATE files SET unreferenced_since = now() - interval '31 days'
        WHERE unreferenced_since IS NOT NULL`,
  )
  await runPass(app)
}

describe('AC-386 the reclaim spares what anything still names', () => {
  test('two pages, then one, then none; a page block; and a folder’s own cover', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac386 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    /* One picture on two pages, which AC-373 fixes as a supported shape and
       which is also the legacy shape #116 warned about: whatever else this
       sweep does, it must not take a file the other page is still wearing. */
    const shared = await uploadCoverOk(owner, null, 'ac386-shared.png')
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: shared,
      }),
      200,
      'the shelf wears it (spec 7.16)',
    )
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', {
        file_id: shared,
      }),
      200,
      'and Today wears the same file, one id on two pages (spec 7.19, AC-373)',
    )

    /* A picture that is a page block and nothing else, planted because no
       cover endpoint can make one: `putPage` writes `page_blocks.file_id`,
       and a sweep that read only the three cover columns would take it. */
    const onAPage = await uploadCoverOk(owner, null, 'ac386-block.png')
    await app.db.execute(
      sql`INSERT INTO page_blocks (shelf_id, kind, position, file_id)
          VALUES (${shelfId}::uuid, 'image', 1, ${onAPage}::uuid)`,
    )

    /* A folder's own cover, planted as the legacy rows of rule 3 are: a
       folder-scoped file worn by a shelf is a shape `patchShelf` no longer
       produces, and the sweep must leave it alone whatever references it. */
    const folderId = await createFolder(owner, 'ac386 folder')
    const inFolder = await uploadCoverOk(owner, folderId, 'ac386-folder.png')
    await app.db.execute(
      sql`UPDATE folders SET cover_file_id = ${inFolder}::uuid
          WHERE id = ${folderId}::uuid`,
    )

    await sweep()

    expect(
      await fileExists(shared),
      'two pages wear it, so the sweep leaves it (the reference count, #116)',
    ).toBe(true)
    expect(
      await fileExists(onAPage),
      'a page block is a reference too, which is why the query names every column that can hold a file id',
    ).toBe(true)
    expect(
      await fileExists(inFolder),
      'a folder-scoped cover is never a candidate: it is listed in its folder and its members can delete it (4.16)',
    ).toBe(true)

    // One reference removed. The other page must not notice.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_preset: 'gradient-dusk',
      }),
      200,
      'the shelf swaps its picture for a gradient (spec 7.16)',
    )
    await sweep()
    expect(
      await fileExists(shared),
      'Today still wears it, so replacing it on the shelf reclaims nothing — which is the whole reason this is a reference count and not a delete-on-replace',
    ).toBe(true)
    expect(objects.has(shared), 'bytes included').toBe(true)

    const stillDrawn = await owner.browser.json('/place-covers', 'GET')
    const today = (
      stillDrawn.json() as {
        covers?: Array<{ place?: unknown; file_id?: unknown }>
      }
    ).covers?.find((entry) => entry.place === 'today')
    expect(today?.file_id, 'and Today still names it').toBe(shared)
    expectStatus(
      await owner.browser.request(`/api/v1/files/${shared}`, { method: 'GET' }),
      200,
      'and still draws it (spec 7.15)',
    )

    // The last reference. Now, and only now, it is genuinely unused.
    expectStatus(
      await owner.browser.json('/place-covers/today', 'DELETE'),
      204,
      'Today’s cover is removed (spec 7.19)',
    )
    await sweep()
    expect(
      await fileExists(shared),
      'nothing names it any more, so it is reclaimed on the next pass',
    ).toBe(false)
    expect(objects.has(shared), 'and the bytes go with the row').toBe(false)

    expect(
      (await fileExists(onAPage)) && (await fileExists(inFolder)),
      'and the two the sweep must never touch are still there',
    ).toBe(true)
  })
})

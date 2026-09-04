/*
AC-388: given a shelf duplicate whose object write fails after the bytes have
landed, then there is no new shelf, no new files row, and no object left in
the store.

**#128 asks for exactly this and names both halves**: "On failure, do not
leave a half-duplicated shelf or an unattached copied file." They are two
different faults with two different mechanisms, and only one of them is free.
The shelf and the files row are in one transaction, so a throw rolls both
back and that half costs nothing. The bytes are not: a database transaction
cannot un-write a file, so `createFile`'s order — row first, then bytes, so a
store failure takes the row with it — leaves the reverse orphan whenever the
failure comes *after* the write. `duplicateShelf` answers it with a catch that
removes what the copy put in the store.

**How the failure is produced, said plainly because it decides what this
proves.** The injected store's `put` records the object and *then* throws,
which is a faithful model of a write that landed and a call that did not
return — a disk that filled on fsync, a network object store that timed out
after committing. It is the only way to reach the orphan branch from a test:
every other failure in that transaction happens before the write, where the
rollback alone is enough. The second arm holds the ordinary case, a `put` that
throws having written nothing, and asserts the same two things, so a
regression that removed the catch would still be caught by the first arm and a
regression that removed the transaction by both.

Spec: 7.16 as amended 2026-09-04, 4.16, 11.10; issue #128.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac388')

const objects = new Map<string, Buffer>()
/** 'ok' stores; 'after' stores and then throws; 'before' throws having
 * stored nothing. Set per arm below. */
let putMode: 'ok' | 'after' | 'before' = 'ok'

const failingStore = {
  put: (id: string, bytes: Buffer): Promise<void> => {
    if (putMode === 'before') {
      return Promise.reject(new Error('ac388: the object store refused'))
    }
    objects.set(id, bytes)
    if (putMode === 'after') {
      return Promise.reject(
        new Error('ac388: the object store failed after writing'),
      )
    }
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
  app = await startAuthTestApp({ fileStore: failingStore })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  putMode = 'ok'
  await cast.cleanup(app.db)
  await app.close()
})

async function countFiles(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT count(*)::int AS n FROM files WHERE owner_id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ n: unknown }> }
  return Number(found.rows[0]?.n ?? 0)
}

async function countShelves(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT count(*)::int AS n FROM shelves WHERE user_id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ n: unknown }> }
  return Number(found.rows[0]?.n ?? 0)
}

describe('AC-388 a duplicate that fails leaves no half of itself behind', () => {
  test('no shelf, no files row, and no object, whichever side of the write it fails on', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac388 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    const picture = await uploadCoverOk(owner, null, 'ac388-cover.png')
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: picture,
      }),
      200,
      'wearing a picture, so the duplicate has bytes to copy (spec 7.16)',
    )

    const shelvesBefore = await countShelves(owner.id)
    const filesBefore = await countFiles(owner.id)
    const objectsBefore = objects.size

    for (const mode of ['after', 'before'] as const) {
      putMode = mode
      const refused = await owner.browser.json(
        `/shelves/${shelfId}/duplicate`,
        'POST',
      )
      expect(
        refused.status,
        `a store failure ${mode} the write must not answer 201 (spec 7.0)`,
      ).toBe(500)

      expect(
        await countShelves(owner.id),
        `no half-duplicated shelf after a failure ${mode} the write (#128)`,
      ).toBe(shelvesBefore)
      expect(
        await countFiles(owner.id),
        `and no copied files row, the transaction having taken it (#128)`,
      ).toBe(filesBefore)
      expect(
        objects.size,
        `and no unattached object: a rollback cannot un-write a file, so the failure path removes it (#128)`,
      ).toBe(objectsBefore)
    }

    // And the original is untouched by either attempt, which is the thing a
    // person would actually notice.
    putMode = 'ok'
    const original = await owner.browser.json(`/shelves/${shelfId}`, 'GET')
    expect(
      (original.json() as { cover_file_id?: unknown }).cover_file_id,
      'the shelf that was duplicated still wears its own picture',
    ).toBe(picture)
    expectStatus(
      await owner.browser.request(`/api/v1/files/${picture}`, { method: 'GET' }),
      200,
      'and it still draws (spec 7.15)',
    )

    // With the store working, the same call succeeds: the refusals above are
    // the failure and not a broken endpoint.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}/duplicate`, 'POST'),
      201,
      'the duplicate lands once the store answers (spec 7.16 as amended)',
    )
  })
})

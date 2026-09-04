/*
AC-385: given a cover file that nothing references and that is older than the
30-day line, when the 11.7 pass runs, then its row and its bytes are gone and
its owner's quota is smaller by exactly its size.

**This is #116's first half.** A folder-less cover is listed by no surface and
reachable by no route: before this, replacing a shelf or place cover left the
old picture spending its owner's 1 GB (10.3) with nothing anywhere able to
delete it. `setAvatar` was the precedent and did the right thing for its own
one-picture feature; a cover could not simply copy it, because one file may
dress two pages and deleting on replace would blank the other. So it is a
sweep with a reference count, and the count is a query over every column that
can name a file rather than a counter column (AC-386 asserts the sparing
half).

**The 30 days are the point of this criterion and not an implementation
detail.** Reclaiming the instant a page stops naming a file is what everybody
reaches for and it is wrong: the caller is still holding that id, and AC-368
sets a shelf's cover, replaces it with a gradient, and sets the same picture
back, which is what a cover picker does. Nothing records when a reference was
dropped, so `created_at` is the lower bound available and the window is the
one Dana already uses everywhere it destroys anything (7.13's Trash, 8.8's
purge, 4.13's events at 90). Both arms are asserted below: the young file
survives the same pass that takes the aged one.

Aging by UPDATE is AC-213's precedent, and the injected store is AC-235's: a
removal from a store nothing reads is unobservable.

Spec: 7.19 as amended 2026-09-04, 4.16, 10.3, 11.7; issue #116.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { runPass } from './reminders-harness.js'
import { uploadCoverOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'ac385')

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

async function quotaSpent(userId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT coalesce(sum(bytes), 0)::bigint AS used
        FROM files WHERE owner_id = ${userId}::uuid`,
  )) as unknown as { rows: Array<{ used: unknown }> }
  return Number(found.rows[0]?.used ?? 0)
}

async function fileBytes(fileId: string): Promise<number> {
  const found = (await app.db.execute(
    sql`SELECT bytes FROM files WHERE id = ${fileId}::uuid`,
  )) as unknown as { rows: Array<{ bytes: unknown }> }
  return Number(found.rows[0]?.bytes ?? 0)
}

/** 30 days is the line; 31 puts a row over it. */
async function age(fileId: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE files SET created_at = now() - interval '31 days'
        WHERE id = ${fileId}::uuid`,
  )
}

describe('AC-385 the tick reclaims a cover nothing wears', () => {
  test('replaced, then cleared: the rows and the bytes go, and the young one stays', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const made = await owner.browser.json('/shelves', 'POST', {
      name: 'ac385 shelf',
    })
    expectStatus(made, 201, 'a shelf creates (spec 7.16)')
    const shelfId = String((made.json() as { id?: unknown }).id)

    const first = await uploadCoverOk(owner, null, 'ac385-first.png')
    const second = await uploadCoverOk(owner, null, 'ac385-second.png')
    expect(
      objects.has(first) && objects.has(second),
      'the injected store must hold both objects, or nothing here measures anything',
    ).toBe(true)

    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: first,
      }),
      200,
      'the shelf wears the first picture (spec 7.16)',
    )
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: second,
      }),
      200,
      'and then the second, which is the replacement #116 is about',
    )

    // Young, and therefore kept: a picker that switches to a gradient and
    // back must still find the id it is holding (AC-368's own flow).
    await runPass(app)
    expect(
      await fileExists(first),
      'a pass does not take a picture replaced a moment ago; the caller may still name it',
    ).toBe(true)
    expect(objects.has(first), 'and its bytes stay with the row').toBe(true)

    const size = await fileBytes(first)
    expect(size, 'the row records what it spends (4.16)').toBeGreaterThan(0)
    const before = await quotaSpent(owner.id)

    await age(first)
    await runPass(app)

    expect(
      await fileExists(first),
      'past 30 days with nothing wearing it, the row goes (spec 7.19 as amended)',
    ).toBe(false)
    expect(
      objects.has(first),
      'and the object goes with it, the row having been the only index to the bytes',
    ).toBe(false)
    expect(
      await quotaSpent(owner.id),
      'and the owner’s 1 GB is smaller by exactly that file (10.3)',
    ).toBe(before - size)

    // The cover the shelf is actually wearing survives the same sweep, aged
    // or not: it is referenced, which is the only question the sweep asks.
    await age(second)
    await runPass(app)
    expect(
      await fileExists(second),
      'a picture a page still wears is never reclaimed, whatever its age',
    ).toBe(true)

    // And clearing is a replacement too: the removal of the last reference.
    expectStatus(
      await owner.browser.json(`/shelves/${shelfId}`, 'PATCH', {
        cover_file_id: null,
        cover_preset: null,
      }),
      200,
      'the shelf takes its cover off (spec 7.16)',
    )
    await runPass(app)
    expect(
      await fileExists(second),
      'and the picture nothing wears any more goes on the same rule',
    ).toBe(false)
    expect(objects.has(second), 'bytes included').toBe(false)
  })
})

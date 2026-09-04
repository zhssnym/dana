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
back, which is what a cover picker does. The window is the one Dana already
uses everywhere it destroys anything (7.13's Trash, 8.8's purge, 4.13's events
at 90), and it runs **from the moment the last reference went**, which
migration 0014's `files.unreferenced_since` records because nothing else did.

**This criterion is written the way it is because its first version could not
see the bug.** It aged the file's `created_at`, which is what the reclaim read
at first, and that measures when the bytes arrived rather than when the cover
came off: a picture uploaded months ago and worn until this morning was, the
instant it was replaced, both unreferenced and old, so the very next tick took
it with no window at all — the one case the window exists for. The three arms
below are therefore about the *mark* and not about the upload: an old file
unworn only now survives the next tick; a file whose mark is a month old is
taken; and a file that is worn again inside the window loses its mark and
stays. Only the first of those is red against the `created_at` version, and it
is the one a person would have lost a picture to.

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

/** Backdates the mark the tick writes, which is what the window is measured
 * from (migration 0014). 30 days is the line; 31 puts a row over it. Aging by
 * UPDATE is AC-213's precedent; what is aged is the fact the rule names. */
async function ageTheMark(fileId: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE files SET unreferenced_since = now() - interval '31 days'
        WHERE id = ${fileId}::uuid`,
  )
}

/** Backdates the upload. Nothing in the rule reads this, which is the point
 * of the arm that uses it. */
async function ageTheUpload(fileId: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE files SET created_at = now() - interval '400 days'
        WHERE id = ${fileId}::uuid`,
  )
}

async function markOf(fileId: string): Promise<unknown> {
  const found = (await app.db.execute(
    sql`SELECT unreferenced_since FROM files WHERE id = ${fileId}::uuid`,
  )) as unknown as { rows: Array<{ unreferenced_since: unknown }> }
  return found.rows[0]?.unreferenced_since ?? null
}

describe('AC-385 the tick reclaims a cover nothing wears', () => {
  test('the window runs from the day it came off, not from the day it arrived', async () => {
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

    /* The picture is old — it has been the shelf's cover for over a year —
       and that must buy the reclaim nothing at all. This is the arm the
       first version of this criterion did not have, and the defect it hides
       loses a person a picture the moment they change a cover they have had
       a while. */
    await ageTheUpload(first)

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

    // Unworn as of this minute. One pass marks it; no pass may take it.
    await runPass(app)
    expect(
      await fileExists(first),
      'a picture that came off a moment ago is not reclaimed, however old the upload is: the window runs from the mark (migration 0014)',
    ).toBe(true)
    expect(objects.has(first), 'and its bytes stay with the row').toBe(true)
    expect(
      await markOf(first),
      'and the tick has recorded when it came off, which is the fact the rule reads',
    ).not.toBeNull()

    await runPass(app)
    expect(
      await fileExists(first),
      'a second pass does not move the mark forward or take the row',
    ).toBe(true)

    // Worn again inside the window: the mark goes and the row is safe.
    expectStatus(
      await owner.browser.json('/place-covers/today', 'PUT', {
        file_id: first,
      }),
      200,
      'the person puts the same picture on Today (spec 7.19, AC-373)',
    )
    await runPass(app)
    expect(
      await markOf(first),
      'wearing it again clears the mark, so the window starts over rather than running out under it',
    ).toBeNull()
    await ageTheMark(first)
    await runPass(app)
    expect(
      await fileExists(first),
      'and a cleared mark cannot be aged into a deletion: the row is worn',
    ).toBe(true)

    // Off again, and this time the mark is allowed to run out.
    expectStatus(
      await owner.browser.json('/place-covers/today', 'DELETE'),
      204,
      'Today’s cover is removed (spec 7.19)',
    )
    await runPass(app)
    const size = await fileBytes(first)
    expect(size, 'the row records what it spends (4.16)').toBeGreaterThan(0)
    const before = await quotaSpent(owner.id)

    await ageTheMark(first)
    await runPass(app)

    expect(
      await fileExists(first),
      'thirty days unworn, and the row goes (spec 7.19 as amended)',
    ).toBe(false)
    expect(
      objects.has(first),
      'and the object goes with it, the row having been the only index to the bytes',
    ).toBe(false)
    expect(
      await quotaSpent(owner.id),
      'and the owner’s 1 GB is smaller by exactly that file (10.3)',
    ).toBe(before - size)

    // The cover the shelf is actually wearing is never marked, so there is
    // nothing to age: it is referenced, which is the only question asked.
    expect(
      await markOf(second),
      'a picture a page wears carries no mark at all',
    ).toBeNull()
    await ageTheMark(second)
    await runPass(app)
    expect(
      await fileExists(second),
      'and even a mark planted under it is cleared before the delete looks',
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
    await ageTheMark(second)
    await runPass(app)
    expect(
      await fileExists(second),
      'and the picture nothing wears any more goes on the same rule',
    ).toBe(false)
    expect(objects.has(second), 'bytes included').toBe(false)
  })
})

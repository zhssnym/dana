/*
AC-360: given an uploaded avatar, then DELETE /me/avatar clears the column,
takes the stored row and its bytes with it, and answers the same way twice.

Written beside `ac-196-avatar-upload.test.ts`, whose pattern this follows
exactly: the profile is read back through the API rather than off the column,
because the URL the client renders is the fact that matters, and the same
`upload` harness puts a real PNG on the wire so the server decodes bytes
rather than trusting a mime.

**Why this criterion exists at all.** 7.15 set an avatar and cleared none, so
the prototype's Remove control on the Settings picture row had no route behind
it and the client drew it absent under DES-144 — recorded at RFC 0005 change
control item 55(f) as one of three controls "drawn absent rather than dead".
The owner waived section 7's freeze for the polish round of 2026-08-30 and the
route landed; this is the assertion that it means what the word Remove means.

**Three arms, and the third is the one a reader might not expect.** The column
going null is what every surface reads. The files row going with it is 10.3's
quota and the reason POST already deletes the picture it replaces: a Remove
that kept the row would spend an account's gigabyte on bytes nothing points at.
And the published id ceasing to serve is the same fault AC-234 pins one act
over — a folderless avatar is readable by any signed-in account, so bytes left
behind stay readable at an address the person cannot see or reach.

The idempotence arm is 10.2's discipline rather than a nicety: a second press
of a control whose work is already done is not an error, and a person who
reloads and presses again must not meet a 404 about a picture they can already
see is gone.

Spec: 7.15, 4.1, 4.16, 9.7.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p2r2')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function avatarUrlOf(response: { json(): unknown }): unknown {
  return (response.json() as { user?: { avatar_url?: unknown } }).user?.avatar_url
}

describe('AC-360 the picture can be taken away again', () => {
  test('an upload, a removal, and the profile reads null', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const landed = await upload(
      owner,
      '/me/avatar',
      {},
      { name: 'face.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 200, 'the avatar must land before a removal means anything (spec 7.15)')
    const served = String((landed.json() as { avatar_url?: unknown }).avatar_url)

    const before = await owner.browser.json('/me', 'GET')
    expectStatus(before, 200, 'the profile reads back (spec 7.1)')
    expect(
      typeof avatarUrlOf(before),
      'the column carries the picture before the removal (spec 4.1)',
    ).toBe('string')

    const removed = await owner.browser.json('/me/avatar', 'DELETE')
    expectStatus(removed, 204, 'the removal answers 204 with no body (spec 7.15)')
    expect(removed.body, 'a 204 carries nothing (spec 7.0)').toBe('')

    const after = await owner.browser.json('/me', 'GET')
    expectStatus(after, 200, 'the profile still reads back after the removal (spec 7.1)')
    expect(
      avatarUrlOf(after),
      'avatar_url is null once the picture is removed (spec 4.1, 7.15)',
    ).toBe(null)

    /* The stored row goes with the column: 10.3's quota is the reason POST
       already deletes the picture it replaces, and a removal that kept the
       row would spend an account's gigabyte on bytes nothing points at. */
    const rows = await app.db.execute(sql`
      SELECT count(*)::int AS n FROM files
       WHERE owner_id = ${owner.id}::uuid AND kind = 'avatar'`)
    expect(
      Number((rows.rows as Array<{ n: unknown }>)[0]?.n ?? -1),
      'no avatar row survives the removal (spec 4.16, 7.15)',
    ).toBe(0)

    /* And the bytes stop answering at the address the upload published,
       which is AC-234's fault one act over: a folderless avatar is readable
       by any signed-in account, so bytes left behind stay reachable. */
    const stale = await owner.browser.request(served)
    expectStatus(
      stale,
      404,
      'the removed picture stops being served at its published id (spec 7.15, 10.2)',
    )
  })

  test('a second removal is the same act, not an error', async () => {
    const [owner] = (await cast.of(app)) as [Actor]

    const landed = await upload(
      owner,
      '/me/avatar',
      {},
      { name: 'face.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 200, 'the avatar must land before a removal means anything (spec 7.15)')

    const first = await owner.browser.json('/me/avatar', 'DELETE')
    expectStatus(first, 204, 'the first removal answers 204 (spec 7.15)')

    const second = await owner.browser.json('/me/avatar', 'DELETE')
    expectStatus(
      second,
      204,
      'a removal on an account with no picture is the same act, never a 404 (spec 7.15, 10.2)',
    )

    const me = await owner.browser.json('/me', 'GET')
    expectStatus(me, 200, 'the profile reads back (spec 7.1)')
    expect(avatarUrlOf(me), 'and the column stays null (spec 4.1)').toBe(null)
  })
})

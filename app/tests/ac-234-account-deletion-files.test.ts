/*
AC-234: given a deleted account (8.10), then its avatar answers 404 to a
signed-in account that held the id, and no files row owned by the deleted
account remains.

This is F-1's pin, and the criterion the S14 security review most wanted to
exist. Before the fix, 8.10 ran steps 1 to 6 and never touched files: the
avatar row carries folder_id NULL, serveFile grants any signed-in account a
folderless read, and the id was published on every roster the person ever
appeared in, so "delete my account" left the photograph served at its old
address indefinitely. 8.10's step 6a (RFC 0005 change control item 18) is
what this asserts.

Spec: 8.10 step 6a, 7.15, 4.16.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['leaver', 'witness'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-234 account deletion takes the files with it', () => {
  test('the avatar 404s to a holder of its id, and no owned row survives', async () => {
    const [leaver, witness] = (await cast.of(app)) as [Actor, Actor]

    const avatar = await upload(leaver, '/me/avatar', {}, {
      name: 'me.png',
      type: 'image/png',
      bytes: ONE_PIXEL_PNG,
    })
    expectStatus(avatar, 200, 'the avatar must store before deletion is judged (spec 7.15)')
    const avatarUrl = String((avatar.json() as { avatar_url?: unknown }).avatar_url)

    // An upload in the account's own folder too, so the sweep is proven
    // wider than the folderless avatar row.
    const folderId = await createFolder(leaver, 's14 ac234 mine')
    const owned = await upload(
      leaver,
      '/files',
      { kind: 'file', folder_id: folderId },
      { name: 'diary.txt', type: 'text/plain', bytes: Buffer.from('ac234 diary', 'utf8') },
    )
    expectStatus(owned, 201, 'the folder file must store before deletion is judged')

    // The witness holds the published id and can read it today, folderless
    // files being readable by any signed-in account (7.15).
    const before = await witness.browser.request(avatarUrl)
    expectStatus(before, 200, 'any signed-in account reads a folderless avatar before deletion')

    const gone = await leaver.browser.json('/me', 'DELETE', { confirm: 'DELETE' })
    expectStatus(gone, 204, 'the 8.10 transaction must run for the criterion to mean anything')

    const after = await witness.browser.request(avatarUrl)
    expectStatus(
      after,
      404,
      'the deleted account\'s avatar must stop being served at its published id (8.10 step 6a)',
    )

    const rows = await app.db.execute(sql`
      SELECT count(*)::int AS n FROM files WHERE owner_id = ${leaver.id}::uuid`)
    expect(
      Number((rows.rows as Array<{ n: unknown }>)[0]?.n ?? -1),
      'no files row owned by the deleted account may remain (8.10 step 6a)',
    ).toBe(0)
  })
})

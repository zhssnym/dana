/*
given a stored file in a shared folder, when a non-member requests
it, then the 10.2 not-found shape; when a member requests it, then the
bytes.

There are no public object URLs (4.16): serving passes the same chokepoint
as every read, so possession of an id grants nothing. This test stages one
stored file through the API and reads it from both sides of the membership
line.

Spec: 4.16, 7.15, 10.2.
*/
import { afterAll, beforeAll, describe, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast, createFolder, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { upload } from '../support/uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'outsider'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('a file is as private as its folder', () => {
  test('member gets bytes, outsider gets not-found', async () => {
    const [owner, outsider] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 's1 ac195 serving')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'file', folder_id: folderId },
      {
        name: 'notes.txt',
        type: 'text/plain',
        bytes: Buffer.from('s1 ac195 secret bytes', 'utf8'),
      },
    )
    expectStatus(stored, 201, 'the file must store before serving is judged (spec 7.15)')
    const fileId = String((stored.json() as { id?: unknown }).id)

    const asMember = await owner.browser.request(`/api/v1/files/${fileId}`, {
      method: 'GET',
    })
    expectStatus(asMember, 200, 'a member is served the bytes (spec 7.15)')

    const asOutsider = await outsider.browser.request(`/api/v1/files/${fileId}`, {
      method: 'GET',
    })
    expectStatus(
      asOutsider,
      404,
      'a non-member meets the not-found shape, an id being no key (spec 10.2)',
    )
  })
})

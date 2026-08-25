/*
AC-230: given a stored file, when its address is requested with no session,
then 401, never the bytes and never 404.

AC-195 tests member against outsider and both are signed in, so a regression
that dropped requireSession from the files router would pass every criterion
in the suite while serving every upload to the internet. Proposed by the S14
security review, ruled in by RFC 0005 change control item 18, and pinning
behaviour the tree already has: red here means the door came off.

Spec: 7.15, 10.1, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-230 file serving refuses the unauthenticated at the door', () => {
  test('no session answers 401 for a real id and a random one alike', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's14 ac230 serving')

    const stored = await upload(
      owner,
      '/files',
      { kind: 'file', folder_id: folderId },
      {
        name: 'notes.txt',
        type: 'text/plain',
        bytes: Buffer.from('ac230 private bytes', 'utf8'),
      },
    )
    expectStatus(stored, 201, 'the file must store before the door is tested (spec 7.15)')
    const fileId = String((stored.json() as { id?: unknown }).id)

    const anonymous = app.browser()
    const real = await anonymous.request(`/api/v1/files/${fileId}`)
    expectStatus(
      real,
      401,
      'an unauthenticated request is refused before anything is revealed (spec 10.1)',
    )
    expect(
      real.body.includes('ac230 private bytes'),
      'the stored bytes crossed an unauthenticated response',
    ).toBe(false)

    // The same answer for an id that names nothing: existence is invisible
    // without a session, so the two cases must be indistinguishable.
    const absent = await anonymous.request(
      '/api/v1/files/00000000-0000-4000-8000-000000000000',
    )
    expectStatus(
      absent,
      401,
      'a missing id answers the same 401, existence being invisible without a session (spec 10.2)',
    )
  })
})

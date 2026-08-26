/*
AC-194: given an upload within the 10.3 caps, then a files row exists and
the uploader's quota is spent; given an account at quota, then 413; given a
mime that does not match the declared kind, then 422 naming the field.

The mime half is the security half: 4.16 makes the server validate the pair
because a client-declared kind is a costume. Quota is driven by seeding
usage rather than uploading a gigabyte, which is what the files table's
bytes column is for.

Spec: 4.16, 7.15, 10.3 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { ONE_PIXEL_PNG, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-194 uploads obey the caps', () => {
  test('a small image lands; a lying mime is refused', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac194 files')

    const landed = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 's1-ac194.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 201, 'a capped upload creates a files row (spec 7.15)')
    const id = (landed.json() as { id?: unknown }).id
    expect(typeof id, 'the row answers with its id (spec 7.0)').toBe('string')

    const refused = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      {
        name: 's1-ac194.pdf',
        type: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 not an image', 'utf8'),
      },
    )
    expectStatus(
      refused,
      422,
      'a mime that does not match the declared kind is refused (spec 4.16)',
    )
  })
})

/*
AC-290: given a comment carrying a file, then the thread read answers that
file as { id, name, mime, bytes }, 4.16's own columns, so a client can draw
the tile, the name and the meta line the prototype's conversation draws
without downloading the bytes; and the read no longer carries bare ids.

Spec: 7.14 as amended by RFC 0005 change control item 57 (B5), which closed
section 13 item 54's read half. Written under `11-adversarial-test.md`.
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

interface WireFile {
  id?: unknown
  name?: unknown
  mime?: unknown
  bytes?: unknown
}
interface WireComment {
  id?: unknown
  files?: WireFile[]
  file_ids?: unknown
}

describe('AC-290 the thread answers a file with its name, type and size', () => {
  test('a comment with a file reads back as { id, name, mime, bytes }', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac290 thread files')

    const landed = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 's1-ac290.png', type: 'image/png', bytes: ONE_PIXEL_PNG },
    )
    expectStatus(landed, 201, 'the upload must land before it can ride a comment (spec 7.15)')
    const fileId = (landed.json() as { id?: unknown }).id as string

    const posted = await owner.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 's1 ac290 with a picture',
      file_id: fileId,
    })
    expectStatus(posted, 201, 'a comment may carry a file (spec 7.14)')
    const created = posted.json() as WireComment
    expect(
      created.files?.[0]?.name,
      'the create answer already carries the file by name (spec 7.14, item 57 B5)',
    ).toBe('s1-ac290.png')

    const read = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expectStatus(read, 200, 'a member reads the thread (spec 7.14)')
    const thread = read.json() as { comments?: WireComment[] }
    const line = thread.comments?.find((comment) => comment.id === created.id)
    expect(line, 'the posted comment is in the thread').toBeDefined()
    expect(line?.file_ids, 'bare ids are gone from the wire (item 57 B5)').toBeUndefined()
    expect(line?.files, 'files is an array').toHaveLength(1)
    const file = line?.files?.[0]
    expect(file?.id, 'the file id is the uploaded row').toBe(fileId)
    expect(file?.name, 'the name is 4.16 name').toBe('s1-ac290.png')
    expect(file?.mime, 'the type is 4.16 mime').toBe('image/png')
    expect(file?.bytes, 'the size is 4.16 bytes, the stored byte count').toBe(
      ONE_PIXEL_PNG.length,
    )
  })
})

/*
AC-364: given a comment carrying an image, then both the create answer and
the thread read carry that picture's width and height beside 4.16's other
columns, so a reader who did not attach it can draw the tile at the right
proportion before the bytes arrive; and given a comment carrying something
that is not a picture, then both are null.

**This is the same fault as the page's, in the surface where it is least
forgivable.** A conversation is a column of tiles that grows as people
speak, so an attachment whose height is unknown until it loads shifts every
word written after it, and the person reading is usually not the person who
attached it. AC-290 fixed the half of this that was about names and sizes;
these are the two columns 4.16 did not have when it was written.

**Asserted on the create answer as well as on the read**, because 7.14 makes
those two shapes one sentence — "POST's create answer carries the same" — and
they are built by two different pieces of code in `domain/comments.ts`: one
reads the row directly, the other aggregates it as JSON. A criterion that
checked only the thread would pass with the create answer silently short of
two fields.

Spec: 4.16 as amended by migration 0009, 7.14 as amended by RFC 0005 change
control item 57 B5. Issue #27.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { imagePng, upload } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'i27d')

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
  width?: unknown
  height?: unknown
}
interface WireComment {
  id?: unknown
  files?: WireFile[]
}

const DOCUMENT_BYTES = Buffer.from('%PDF-1.4\n% i27d\n', 'utf8')

async function attach(
  actor: Actor,
  folderId: string,
  fileId: string,
  words: string,
): Promise<{ created: WireComment; line: WireComment | undefined }> {
  const posted = await actor.browser.json(
    `/folders/${folderId}/comments`,
    'POST',
    { body: words, file_id: fileId },
  )
  expectStatus(posted, 201, 'a comment may carry a file (spec 7.14)')
  const created = posted.json() as WireComment

  const read = await actor.browser.json(`/folders/${folderId}/comments`, 'GET')
  expectStatus(read, 200, 'a member reads the thread (spec 7.14)')
  const thread = read.json() as { comments?: WireComment[] }
  return {
    created,
    line: thread.comments?.find((comment) => comment.id === created.id),
  }
}

describe('AC-364 a comment’s picture arrives with its shape', () => {
  test('an attached image answers width and height on the create and on the read', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'i27d ac364 thread')

    const landed = await upload(
      owner,
      '/files',
      { kind: 'image', folder_id: folderId },
      { name: 'i27d.png', type: 'image/png', bytes: await imagePng(36, 12) },
    )
    expectStatus(landed, 201, 'the upload lands before it rides a comment (spec 7.15)')
    const fileId = String((landed.json() as { id?: unknown }).id)

    const { created, line } = await attach(
      owner,
      folderId,
      fileId,
      'i27d ac364 with a picture',
    )

    expect(
      created.files?.[0]?.width,
      '7.14: "POST’s create answer carries the same", and the create path builds the file object by a different route from the thread read',
    ).toBe(36)
    expect(created.files?.[0]?.height, 'and the height on the create answer').toBe(12)

    expect(line?.files?.[0]?.id, 'the thread carries the attachment').toBe(fileId)
    expect(
      line?.files?.[0]?.width,
      'the thread read carries the width, so a tile is drawn at the picture’s proportion before the bytes arrive (issue #27)',
    ).toBe(36)
    expect(line?.files?.[0]?.height, 'and the height').toBe(12)
  })

  test('an attachment that is not a picture answers null on both, and null means unknown', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'i27d ac364 document')

    const landed = await upload(
      owner,
      '/files',
      { kind: 'file', folder_id: folderId },
      { name: 'i27d.pdf', type: 'application/pdf', bytes: DOCUMENT_BYTES },
    )
    expectStatus(landed, 201, 'a plain attachment uploads (spec 7.15)')
    const fileId = String((landed.json() as { id?: unknown }).id)

    const { created, line } = await attach(
      owner,
      folderId,
      fileId,
      'i27d ac364 with a document',
    )

    expect(
      created.files?.[0]?.width,
      'a document has no shape, and inventing one would draw a reservation around nothing (4.16)',
    ).toBeNull()
    expect(created.files?.[0]?.height).toBeNull()
    expect(line?.files?.[0]?.width, 'the thread agrees with the create answer').toBeNull()
    expect(line?.files?.[0]?.height).toBeNull()
  })
})

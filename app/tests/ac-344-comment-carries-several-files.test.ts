/*
AC-344: given a comment posted with several file ids, then one comment is
created carrying all of them, the thread reads them back in the order they
were sent, and the one-file spelling still attaches its file.

Issue #22. 10.3 has said "Files per comment | 10" since it was written and
the endpoint took exactly one, so the limit and the product disagreed; Imran
ruled that the ten stands and the endpoint moves. This criterion is the
several-files half of that, and AC-345 is the boundary.

**Order is the part worth asserting and the part that was not free.** 7.14
says a comment's files are "ordered as attached", and the thread read orders
by `comment_files.created_at`. Inside one transaction `now()` is the
transaction's instant, identical for every row, so ten attachments written
with it would come back in whatever order the table felt like. The write
stamps each row a microsecond after the one before it for exactly this
assertion, and the case sends the ids in an order that is deliberately not
their upload order, so a read that happened to sort by the files' own
creation would fail here.

**The one-file spelling is asserted beside it because nothing else would
catch its loss.** There is no `.strict()` in `app/src/shared/`, so a field the
server stops reading is accepted, discarded and answered 201 with a comment
that has no file on it. The shipping client posts `file_id`; if a later change
drops the alias in favour of `file_ids` alone, every attachment made from that
client vanishes silently. This is the case that turns that into a red.

Spec: 7.14 (the write half as widened, and "ordered as attached"), 10.3
(Files per comment), 4.15, 4.16, 7.15.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'w4')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface ThreadFile {
  id: string
  name: string
  mime: string
  bytes: number
}
interface ThreadComment {
  id: string
  body: string | null
  files: ThreadFile[]
}

async function thread(actor: Actor, folderId: string): Promise<ThreadComment[]> {
  const read = await actor.browser.json(`/folders/${folderId}/comments`, 'GET')
  expectStatus(read, 200, 'the thread reads for a member (spec 7.14)')
  return (read.json() as { comments: ThreadComment[] }).comments
}

describe('AC-344: a comment carries several files', () => {
  test('AC-344: three files ride one comment, in the order sent', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'w4 ac344 several files')

    const first = await uploadImageOk(owner, folderId, 'w4-ac344-first.png')
    const second = await uploadImageOk(owner, folderId, 'w4-ac344-second.png')
    const third = await uploadImageOk(owner, folderId, 'w4-ac344-third.png')

    // Deliberately not the upload order: "ordered as attached" is the order
    // the caller wrote, and a read that sorted by the files' own creation
    // instants would answer first/second/third and pass a weaker case.
    const sent = [third, first, second]
    const posted = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'w4 ac344 three screenshots in one comment', file_ids: sent },
    )
    expectStatus(
      posted,
      201,
      'a comment may carry several files (spec 10.3, 7.14, issue #22)',
    )

    const created = posted.json() as ThreadComment
    expect(
      created.files.map((file) => file.id),
      "the create answer carries all three, in the order sent: 7.14's create answer is the read shape",
    ).toEqual(sent)

    const comments = await thread(owner, folderId)
    expect(
      comments.length,
      'three files made one comment and not three (Imran\'s ruling on issue #22)',
    ).toBe(1)
    const line = comments[0]
    expect(
      line?.files.map((file) => file.id),
      'and the thread reads them back in the order they were attached (spec 7.14)',
    ).toEqual(sent)
    for (const file of line?.files ?? []) {
      expect(
        file.name.length > 0 && file.mime === 'image/png' && file.bytes > 0,
        `each file carries 4.16's own columns, not a bare id: ${JSON.stringify(file)}`,
      ).toBe(true)
    }
  })

  test('AC-344: the one-file spelling still attaches its file', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'w4 ac344 the older spelling')
    const only = await uploadImageOk(owner, folderId, 'w4-ac344-alone.png')

    const posted = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'w4 ac344 one file, the older spelling', file_id: only },
    )
    expectStatus(posted, 201, 'file_id is still a comment\'s one file (spec 7.14)')
    expect(
      (posted.json() as ThreadComment).files.map((file) => file.id),
      'and it is attached rather than accepted and dropped, which is what a 201 with an empty files array would be',
    ).toEqual([only])

    const comments = await thread(owner, folderId)
    expect(
      comments[0]?.files.map((file) => file.id),
      'the thread agrees with the create answer (spec 7.14)',
    ).toEqual([only])
  })

  test('AC-344: an id from another folder refuses the whole comment', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const here = await createFolder(owner, 'w4 ac344 this folder')
    const elsewhere = await createFolder(owner, 'w4 ac344 another folder')
    const mine = await uploadImageOk(owner, here, 'w4-ac344-mine.png')
    const stranger = await uploadImageOk(owner, elsewhere, 'w4-ac344-stranger.png')

    const refused = await owner.browser.json(`/folders/${here}/comments`, 'POST', {
      body: 'w4 ac344 one good id and one from next door',
      file_ids: [mine, stranger],
    })
    expectStatus(
      refused,
      422,
      'every id must name a file of this folder (spec 7.14, 10.2)',
    )
    expect(
      await thread(owner, here),
      'and the refusal is whole: no comment was posted carrying the good half',
    ).toEqual([])
  })
})

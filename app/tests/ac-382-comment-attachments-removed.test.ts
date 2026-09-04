/*
AC-382: given a comment carrying words and attachments, when PATCH
/comments/:id sends `file_ids: []`, then every attachment is removed and the
words stay; and given a wordless comment, then the same empty list is 422
naming the field and nothing is removed, because a comment carrying neither
words nor files is a row the create half refuses outright.

Issue #94. Imran's ruling names removal explicitly — "add or remove
attachments from an existing comment" — so `[]` has to mean something, and the
only thing it can mean under "the full new set" is none.

**The wordless refusal is the half worth arguing about, so the argument is
here.** 4.15 admits a comment carrying files and no words, and
`postCommentBody`'s last refine refuses one carrying neither: "a comment
carries words or a file, at least one". An edit that emptied a wordless
comment would produce, through the back door, exactly the row the front door
refuses — a comment saying nothing, occupying a thread, with no way for its
author to tell it apart from a bug. Deleting the comment is what that person
means and DELETE /comments/:id is what does it. The refusal names `file_ids`
because that is the field that would have caused it; the body is not the
caller's mistake.

Spec: 7.14 as annotated 2026-09-04, 4.15, 10.3, 12.14.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'i94b')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface ThreadComment {
  id: string
  body: string | null
  files: { id: string }[]
}

async function attachmentRows(commentId: string): Promise<number> {
  const found = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM comment_files
        WHERE comment_id = ${commentId}::uuid`,
  )
  return Number(found[0]?.n ?? -1)
}

describe('AC-382: an empty list removes every attachment, unless nothing would be left', () => {
  test('words survive; the files go, on the wire and in the table', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94b ac382 remove them all')
    const one = await uploadImageOk(author, folderId, 'i94b-382-one.png')
    const two = await uploadImageOk(author, folderId, 'i94b-382-two.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'i94b ac382 words and two screenshots', file_ids: [one, two] },
    )
    expectStatus(posted, 201, 'a comment posts with two files (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id
    expect(await attachmentRows(commentId), 'two rows to remove').toBe(2)

    const emptied = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: [],
    })
    expectStatus(
      emptied,
      200,
      'removal is half of Imran’s ruling on #94, so the empty list must mean none',
    )
    expect(
      (emptied.json() as { comment?: ThreadComment }).comment?.files,
      'the fresh comment carries no attachment',
    ).toEqual([])
    expect(
      (emptied.json() as { comment?: ThreadComment }).comment?.body,
      'and the words are untouched: this edit was about the attachments',
    ).toBe('i94b ac382 words and two screenshots')

    expect(
      await attachmentRows(commentId),
      'the join rows are gone from comment_files rather than merely hidden from the read',
    ).toBe(0)

    const read = await author.browser.json(`/folders/${folderId}/comments`, 'GET')
    expectStatus(read, 200, 'the thread reads (spec 7.14)')
    expect(
      (read.json() as { comments: ThreadComment[] }).comments[0]?.files,
      'and the thread agrees',
    ).toEqual([])
  })

  test('a wordless comment cannot be emptied to nothing', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94b ac382 nothing would be left')
    const only = await uploadImageOk(author, folderId, 'i94b-382-only.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { file_ids: [only] },
    )
    expectStatus(posted, 201, '4.15 admits a comment carrying files and no words')
    const commentId = (posted.json() as ThreadComment).id

    const refused = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: [],
    })
    expectStatus(
      refused,
      422,
      'the create half refuses a comment carrying neither words nor files, and an edit must not produce through the back door the row the front door refuses',
    )
    const message = String(
      (refused.json() as { error?: { message?: unknown } }).error?.message ?? '',
    )
    expect(
      message.includes('file_ids'),
      `the 422 names the field that caused it (10.3); answered: ${message}`,
    ).toBe(true)

    expect(
      await attachmentRows(commentId),
      'and the refusal is whole: the attachment the person still has is still there',
    ).toBe(1)
  })

  test('an empty comment is deleted rather than emptied', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94b ac382 the door that does work')
    const only = await uploadImageOk(author, folderId, 'i94b-382-doomed.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { file_ids: [only] },
    )
    expectStatus(posted, 201, 'a wordless comment posts (spec 4.15)')
    const commentId = (posted.json() as ThreadComment).id

    const removed = await author.browser.json(`/comments/${commentId}`, 'DELETE')
    expectStatus(
      removed,
      204,
      'the refusal above is not a person trapped: deleting the comment is what they meant, and 7.14 has always offered it',
    )
    const read = await author.browser.json(`/folders/${folderId}/comments`, 'GET')
    expectStatus(read, 200, 'the thread reads (spec 7.14)')
    expect(
      (read.json() as { comments: ThreadComment[] }).comments,
      'and the thread is empty',
    ).toEqual([])
  })
})

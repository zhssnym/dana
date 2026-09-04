/*
AC-381: given a comment carrying attachments, when PATCH /comments/:id sends
`file_ids`, then the set becomes exactly those ids in that order and the
thread reads them back; given the field omitted, then the attachments are
untouched; and the answer carries the fresh comment beside the `edited` flag.

Issue #94. Imran ruled that attachment editing belongs in Dana — "A person
should be able to add or remove attachments from an existing comment without
having to delete the whole comment and post it again" — and until it was
built, `file_ids` on this endpoint parsed, was dropped, and was answered 200,
which is the first of the two loss shapes 11.15 names.

**The omitted case is the half that would rot quietly.** A field meaning "the
full new set" has an obvious wrong implementation that passes every
replacement assertion: treating absent as empty, and silently stripping the
attachments off every ordinary words-only edit the shipping client has been
sending since S12. Nothing else in this suite would see it, because nothing
else PATCHes a comment at all.

**Order is asserted for AC-344's reason, backwards.** 7.14's "ordered as
attached" is the caller's order, and inside one transaction `now()` is the
transaction's instant, so ten rows written with it come back in whatever order
the table feels like. The replacement stamps each a microsecond after the last
for exactly this read, and the case sends the ids in an order that is
deliberately neither their upload order nor the order they were first attached
in — so a read that happened to sort by the file's own creation, or a write
that kept the old rows' stamps, fails here.

Spec: 7.14 as annotated 2026-09-04, 4.15, 4.16, 10.3, 12.14.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { patchCommentResponse } from '../src/shared/comments.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'i94a')

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
  edited_at: string | null
}

async function thread(actor: Actor, folderId: string): Promise<ThreadComment[]> {
  const read = await actor.browser.json(`/folders/${folderId}/comments`, 'GET')
  expectStatus(read, 200, 'the thread reads for a member (spec 7.14)')
  return (read.json() as { comments: ThreadComment[] }).comments
}

describe('AC-381: an existing comment’s attachments can be replaced', () => {
  test('the set becomes exactly the ids sent, in that order', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94a ac381 replace the set')

    const first = await uploadImageOk(author, folderId, 'i94a-381-first.png')
    const second = await uploadImageOk(author, folderId, 'i94a-381-second.png')
    const third = await uploadImageOk(author, folderId, 'i94a-381-third.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'i94a ac381 the first draft', file_ids: [first, second] },
    )
    expectStatus(posted, 201, 'a comment posts with two files (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id

    // Neither the upload order nor the order they were first attached in.
    const replacement = [third, first]
    const edited = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: replacement,
    })
    expectStatus(
      edited,
      200,
      'attachment editing exists (Imran’s ruling on issue #94); a 200 that changed nothing is what this criterion was opened about',
    )

    /* The client parses every PATCH answer through this schema before it
       renders anything (`api/mutations.ts`), so a shape the browser would
       refuse has to fail here first rather than in somebody's tab. Nothing
       else in the suite parses this response at all. */
    const shape = patchCommentResponse.safeParse(edited.json())
    expect(
      shape.success,
      `the answer must satisfy the shared patchCommentResponse schema, which is what api/http.ts runs it through; zod said: ${JSON.stringify(shape.error?.issues ?? [])}`,
    ).toBe(true)

    const answer = edited.json() as { edited?: unknown; comment?: ThreadComment }
    expect(
      answer.edited,
      'the one-word answer the shipping client parses is unchanged (spec 7.14 as annotated)',
    ).toBe(true)
    expect(
      answer.comment?.files.map((file) => file.id),
      'and the answer carries the fresh comment, because the resolved file rows are something the caller cannot compute from the ids it sent',
    ).toEqual(replacement)
    for (const file of answer.comment?.files ?? []) {
      expect(
        file.name.length > 0 && file.mime === 'image/png' && file.bytes > 0,
        `each file carries 4.16's own columns, not a bare id: ${JSON.stringify(file)}`,
      ).toBe(true)
    }

    const [line] = await thread(author, folderId)
    expect(
      line?.files.map((file) => file.id),
      'the thread agrees: the set is exactly what was sent, in the order it was sent, and the file that was dropped is gone from it',
    ).toEqual(replacement)
    expect(
      line?.body,
      'the words are untouched by an edit that named only the attachments',
    ).toBe('i94a ac381 the first draft')
    expect(
      line?.edited_at,
      'and changing what a comment carries is an edit, so 4.15’s stamp is set',
    ).not.toBeNull()
  })

  test('an edit that names no file_ids leaves the attachments alone', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94a ac381 omitted means unchanged')
    const only = await uploadImageOk(author, folderId, 'i94a-381-kept.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'i94a ac381 words and one screenshot', file_ids: [only] },
    )
    expectStatus(posted, 201, 'a comment posts with one file (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id

    const edited = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      body: 'i94a ac381 the words, corrected',
    })
    expectStatus(edited, 200, 'the words edit as they always have (spec 7.14)')
    expect(
      (edited.json() as { comment?: ThreadComment }).comment?.files.map(
        (file) => file.id,
      ),
      'absent is not empty: an ordinary words-only edit, which is every edit the shipping client has ever sent, must not strip the attachments off',
    ).toEqual([only])

    const [line] = await thread(author, folderId)
    expect(
      line?.files.map((file) => file.id),
      'and the thread agrees, so nothing was stripped behind the answer',
    ).toEqual([only])
    expect(line?.body, 'while the words did change').toBe(
      'i94a ac381 the words, corrected',
    )
  })

  test('the attachments of a wordless comment can be edited', async () => {
    const [author] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(author, 'i94a ac381 no words at all')
    const before = await uploadImageOk(author, folderId, 'i94a-381-wordless-a.png')
    const after = await uploadImageOk(author, folderId, 'i94a-381-wordless-b.png')

    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { file_ids: [before] },
    )
    expectStatus(posted, 201, '4.15 admits a comment carrying files and no words')
    const commentId = (posted.json() as ThreadComment).id

    const edited = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: [after],
    })
    expectStatus(
      edited,
      200,
      'a required body would have made exactly the wordless comments the ones whose attachments can never be edited, since body is min(1) and there is no body to resend',
    )
    expect(
      (edited.json() as { comment?: ThreadComment }).comment?.files.map(
        (file) => file.id,
      ),
      'the swap lands',
    ).toEqual([after])
    expect(
      (edited.json() as { comment?: ThreadComment }).comment?.body,
      'and the comment is still wordless rather than having gained an empty string',
    ).toBeNull()
  })
})

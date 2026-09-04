/*
AC-383: given PATCH /comments/:id carrying an id the comment's folder does not
hold — one from another of the author's own folders, or one belonging to
somebody else entirely — then 422 naming `file_ids`, the same message for
both, and the comment's attachments are unchanged; given more than 10.3's
ten, or the same id twice, or the create half's `file_id` spelling, then 422;
and given a member of the folder who is not the author, then 403 and nothing
moves.

Issue #94. Three separate rules, all of them the create half's read backwards,
and each is a way the edit could have been built wrong.

**The scoping refusal discloses nothing, which is the reason both messages are
asserted equal rather than merely asserted to be 422.** A file of another
folder and a file of another person are the same answer here: if they differed,
the endpoint would have become an oracle for which uuids exist, one request at
a time, for anyone with one comment of their own to edit (10.2, DES-225).

**The refusal is whole, which the create half also promises.** One bad id in a
list refuses the whole edit rather than applying the good ones — a comment
that silently carries fewer files than the person chose is the failure this
endpoint has to be careful about, and the composer still holds their choice.

**And the gate is not widened.** Attachment editing is a second thing the
author may do to their own comment; it is not a reason for a folder member to
gain a verb they never had. AC-205 pins the words half of that rule and this
pins the attachments half, because a `file_ids` branch added ahead of the
authorship check would pass AC-205 unchanged.

Spec: 7.14 as annotated 2026-09-04, 10.2, 10.3, 11.14 (`z.never` rather than
`.strict()`), 12.14.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { COMMENT_FILE_CAP } from '../src/shared/comments.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import { uploadImageOk } from './uploads-harness.js'

let app: AuthTestApp
const cast = new Cast(['author', 'stranger', 'bystander'], 'i94c')

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
  files: { id: string }[]
}

async function attachedIds(commentId: string): Promise<string[]> {
  const found = await rows(
    app.db,
    sql`SELECT file_id FROM comment_files
        WHERE comment_id = ${commentId}::uuid
        ORDER BY created_at, file_id`,
  )
  return found.map((row) => String(row.file_id))
}

function messageOf(response: { json: () => unknown }): string {
  return String(
    (response.json() as { error?: { message?: unknown } }).error?.message ?? '',
  )
}

describe('AC-383: what an attachment edit refuses', () => {
  test('an id this folder does not hold is 422, and says nothing about whose it is', async () => {
    const [author, stranger] = (await cast.of(app)) as [Actor, Actor, Actor]
    const here = await createFolder(author, 'i94c ac383 this folder')
    const elsewhere = await createFolder(author, 'i94c ac383 my other folder')
    const theirs = await createFolder(stranger, 'i94c ac383 somebody else’s')

    const mine = await uploadImageOk(author, here, 'i94c-383-mine.png')
    const nextDoor = await uploadImageOk(author, elsewhere, 'i94c-383-next-door.png')
    const foreign = await uploadImageOk(stranger, theirs, 'i94c-383-foreign.png')

    const posted = await author.browser.json(`/folders/${here}/comments`, 'POST', {
      body: 'i94c ac383 one good screenshot',
      file_ids: [mine],
    })
    expectStatus(posted, 201, 'a comment posts with its own folder’s file (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id

    const ownOtherFolder = await author.browser.json(
      `/comments/${commentId}`,
      'PATCH',
      { file_ids: [mine, nextDoor] },
    )
    expectStatus(
      ownOtherFolder,
      422,
      'every id must name a file of this comment’s folder, which is createComment’s rule read backwards',
    )
    expect(
      messageOf(ownOtherFolder).includes('file_ids'),
      `the 422 names the field (10.3); answered: ${messageOf(ownOtherFolder)}`,
    ).toBe(true)

    const somebodyElses = await author.browser.json(
      `/comments/${commentId}`,
      'PATCH',
      { file_ids: [foreign] },
    )
    expectStatus(somebodyElses, 422, 'and a file of another account is refused too')
    expect(
      messageOf(somebodyElses),
      'the two refusals must read identically: a different answer for "exists but is not yours" would make this endpoint an oracle for which uuids exist (10.2, DES-225)',
    ).toBe(messageOf(ownOtherFolder))

    expect(
      await attachedIds(commentId),
      'and both refusals are whole: one bad id refuses the edit rather than applying the good half',
    ).toEqual([mine])
  })

  test('eleven ids, a repeated id, and the create half’s spelling are all 422', async () => {
    const [author] = (await cast.of(app)) as [Actor, Actor, Actor]
    const folderId = await createFolder(author, 'i94c ac383 the numbers')

    const kept = await uploadImageOk(author, folderId, 'i94c-383-kept.png')
    const posted = await author.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'i94c ac383 the boundary', file_ids: [kept] },
    )
    expectStatus(posted, 201, 'a comment posts (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id

    const eleven: string[] = []
    for (let index = 0; index <= COMMENT_FILE_CAP; index += 1) {
      eleven.push(await uploadImageOk(author, folderId, `i94c-383-cap-${String(index)}.png`))
    }
    expect(
      eleven.length,
      'the case must send one more than 10.3 allows, whatever that number is',
    ).toBe(COMMENT_FILE_CAP + 1)

    const tooMany = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: eleven,
    })
    expectStatus(
      tooMany,
      422,
      '10.3 caps a comment at ten files, and the edit is another way to reach that number',
    )
    expect(
      messageOf(tooMany).includes('file_ids'),
      `the 422 names the field (10.3); answered: ${messageOf(tooMany)}`,
    ).toBe(true)

    const ten = eleven.slice(0, COMMENT_FILE_CAP)
    const atTheCap = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: ten,
    })
    expectStatus(
      atTheCap,
      200,
      'and exactly ten is admitted, so the refusal above is the boundary rather than an off-by-one',
    )
    expect(
      (atTheCap.json() as { comment?: ThreadComment }).comment?.files.map(
        (file) => file.id,
      ),
      'all ten ride the comment, in the order sent',
    ).toEqual(ten)

    const twice = await author.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: [kept, kept],
    })
    expectStatus(
      twice,
      422,
      'comment_files is keyed on (comment_id, file_id), so the same id twice is a constraint violation wearing a 500 unless it is refused here',
    )

    const olderSpelling = await author.browser.json(
      `/comments/${commentId}`,
      'PATCH',
      { file_id: kept },
    )
    expectStatus(
      olderSpelling,
      422,
      '11.14 rules .strict() out for this folder and names z.never as what an endpoint uses to refuse one field; the create half’s alias has no meaning here and being told so beats a 200 that changed nothing (issue #94’s own complaint)',
    )
    expect(
      messageOf(olderSpelling).includes('file_id'),
      `and the refusal names the field, which a strict object could not do through this formatter (11.15); answered: ${messageOf(olderSpelling)}`,
    ).toBe(true)

    expect(
      await attachedIds(commentId),
      'none of the three refusals moved anything: the ten from the successful edit are still exactly the attachments',
    ).toEqual(ten)
  })

  test('a member who is not the author still cannot touch the attachments', async () => {
    const [author, , bystander] = (await cast.of(app)) as [Actor, Actor, Actor]
    await connect(app.db, author.id, bystander.id)
    const folderId = await createFolder(author, 'i94c ac383 the gate')
    await addMemberOk(author, folderId, bystander.id)

    const mine = await uploadImageOk(author, folderId, 'i94c-383-gate-mine.png')
    const theirs = await uploadImageOk(bystander, folderId, 'i94c-383-gate-theirs.png')

    const posted = await author.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 'i94c ac383 my comment, my attachment',
      file_ids: [mine],
    })
    expectStatus(posted, 201, 'the author comments (spec 7.14)')
    const commentId = (posted.json() as ThreadComment).id

    const refused = await bystander.browser.json(`/comments/${commentId}`, 'PATCH', {
      file_ids: [theirs],
    })
    expectStatus(
      refused,
      403,
      '4.15: only the author edits their comment. Attachment editing is a second thing that person may do, not a reason to widen who may do it; a file_ids branch placed ahead of the authorship check would pass AC-205 unchanged',
    )
    expect(
      await attachedIds(commentId),
      'and the 403 changed nothing',
    ).toEqual([mine])
  })
})

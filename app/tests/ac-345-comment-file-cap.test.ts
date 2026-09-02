/*
AC-345: given a comment naming ten files, then 201 and all ten are attached;
given eleven, then 422 naming file_ids and no comment is created; given the
same id twice, or file_ids sent beside file_id, then 422 and nothing is
created.

Issue #22, the boundary half of it. 10.3's row reads "Files per comment | 10"
and the endpoint took one, so the number had never been enforced anywhere: a
cap nothing measures is a sentence rather than a limit. The pass side is
asserted beside the fail side because a server that refuses everything
satisfies the fail side alone, which is the mistake this file exists not to
make.

The two adversarial cases are the ones the widening created rather than
inherited. `comment_files`'s primary key is (comment_id, file_id), so the same
id twice is a constraint violation wearing a 500 unless something refuses it
first; and two spellings of the same thing in one body have no order between
them that a caller could predict, so sending both is refused rather than
guessed at. Both must leave the thread empty: a 422 that had already written
the comment would be worse than either.

Spec: 10.3 (Files per comment), 7.14, 7.0 (422 naming the field), 4.15.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { COMMENT_FILE_CAP } from '../src/shared/comments.js'
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

interface ThreadComment {
  id: string
  files: { id: string }[]
}

async function threadIds(actor: Actor, folderId: string): Promise<string[]> {
  const read = await actor.browser.json(`/folders/${folderId}/comments`, 'GET')
  expectStatus(read, 200, 'the thread reads for a member (spec 7.14)')
  return (read.json() as { comments: ThreadComment[] }).comments.map((c) => c.id)
}

interface Stage {
  owner: Actor
  folderId: string
  /** Eleven stored files, so ten and eleven are the same fixture. */
  fileIds: string[]
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 'w4 ac345 the cap')
    const fileIds: string[] = []
    for (let index = 0; index <= COMMENT_FILE_CAP; index += 1) {
      fileIds.push(
        await uploadImageOk(owner, folderId, `w4-ac345-${String(index)}.png`),
      )
    }
    staged = { owner, folderId, fileIds }
  }
  return staged
}

describe('AC-345: ten files is the cap', () => {
  test('AC-345: the spec number is ten', () => {
    expect(
      COMMENT_FILE_CAP,
      '10.3 says "Files per comment | 10"; this constant is what the schema and the criterion both read',
    ).toBe(10)
  })

  test('AC-345: ten are accepted and all ten are attached', async () => {
    const { owner, folderId, fileIds } = await stage()
    const ten = fileIds.slice(0, COMMENT_FILE_CAP)
    const posted = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'w4 ac345 exactly the cap', file_ids: ten },
    )
    expectStatus(
      posted,
      201,
      'the cap is inclusive: ten files is a legal comment (spec 10.3)',
    )
    expect(
      (posted.json() as ThreadComment).files.map((file) => file.id),
      'and every one of the ten is attached, in order (spec 7.14)',
    ).toEqual(ten)
  })

  test('AC-345: eleven is refused and nothing is created', async () => {
    const { owner, folderId, fileIds } = await stage()
    const before = await threadIds(owner, folderId)
    const refused = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'w4 ac345 one over the cap', file_ids: fileIds },
    )
    expectStatus(
      refused,
      422,
      'eleven files is over 10.3\'s cap and is refused with the field named (spec 7.0)',
    )
    const envelope = refused.json() as { error?: { message?: unknown } }
    expect(
      String(envelope.error?.message ?? ''),
      'the 422 names file_ids, which is the field the caller sent (spec 10.3, 7.0)',
    ).toContain('file_ids')
    expect(
      await threadIds(owner, folderId),
      'and no comment was written by the refused request',
    ).toEqual(before)
  })

  test('AC-345 adversarial: the same id twice is refused, not deduplicated', async () => {
    const { owner, folderId, fileIds } = await stage()
    const before = await threadIds(owner, folderId)
    const twice = fileIds[0] as string
    const refused = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 'w4 ac345 the same file twice', file_ids: [twice, twice] },
    )
    expectStatus(
      refused,
      422,
      'comment_files is keyed (comment_id, file_id), so a repeat is refused rather than raised as a 500',
    )
    expect(
      await threadIds(owner, folderId),
      'and nothing was written; silently dropping one of the two would be the loss this endpoint is careful about',
    ).toEqual(before)
  })

  test('AC-345 adversarial: both spellings in one body are refused', async () => {
    const { owner, folderId, fileIds } = await stage()
    const before = await threadIds(owner, folderId)
    const refused = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      {
        body: 'w4 ac345 both spellings',
        file_id: fileIds[0],
        file_ids: [fileIds[1]],
      },
    )
    expectStatus(
      refused,
      422,
      'file_id and file_ids have no order between them, so the pair is refused rather than merged (spec 7.14)',
    )
    expect(
      await threadIds(owner, folderId),
      'and nothing was written',
    ).toEqual(before)
  })
})

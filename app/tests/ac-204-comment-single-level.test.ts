/*
AC-204: given a reply to a reply, then 422; comment threads hold one level.

The one-level rule is cross-row (a parent's parent must be null) and 4.15
says the API enforces it, restated at every write, because a CHECK cannot
see another row. That is exactly the kind of rule an implementation loses
in a refactor: the column allows the write, so only the handler stands in
the way. The test builds the legal half first, a comment and one reply, so
the refusal is measured against a thread the same handler just accepted.

Spec: 4.15, 7.14 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

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

describe('AC-204 one reply level', () => {
  test('a reply to a reply is refused with 422', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac204 thread')

    const comment = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 's1 ac204 the opening comment' },
    )
    expectStatus(comment, 201, 'a member must be able to comment (spec 7.14)')
    const commentId = (comment.json() as { id?: unknown }).id as string

    const reply = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 's1 ac204 the reply', parent_id: commentId },
    )
    expectStatus(reply, 201, 'one reply level is legal (spec 4.15)')
    const replyId = (reply.json() as { id?: unknown }).id as string

    const replyToReply = await owner.browser.json(
      `/folders/${folderId}/comments`,
      'POST',
      { body: 's1 ac204 too deep', parent_id: replyId },
    )
    expectStatus(
      replyToReply,
      422,
      'a reply to a reply must be refused; threads hold one level (spec 4.15)',
    )
    expect(
      String(replyToReply.status).startsWith('2'),
      'nothing may have been created by the refused write',
    ).toBe(false)
  })
})

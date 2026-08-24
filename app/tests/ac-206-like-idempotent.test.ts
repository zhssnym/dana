/*
AC-206: given the same user liking a comment twice, then one like exists;
unliking removes it.

A like is the whole reaction set (DES-146) and its storage is a primary key
over (comment_id, user_id), so the double PUT is the idempotency the schema
promises, asserted at the API where a naive INSERT would 500 instead.

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

describe('AC-206 a like is one bit', () => {
  test('two PUTs are one like; DELETE clears it', async () => {
    const [owner] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(owner, 's1 ac206 likes')
    const posted = await owner.browser.json(`/folders/${folderId}/comments`, 'POST', {
      body: 's1 ac206 likeable',
    })
    expectStatus(posted, 201, 'the comment stages (spec 7.14)')
    const commentId = String((posted.json() as { id?: unknown }).id)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const liked = await owner.browser.json(`/comments/${commentId}/like`, 'PUT')
      expect(
        [200, 201, 204].includes(liked.status),
        `the like lands idempotently; answered ${String(liked.status)}`,
      ).toBe(true)
    }
    const listed = await owner.browser.json(`/folders/${folderId}/comments`, 'GET')
    expectStatus(listed, 200, 'the thread reads (spec 7.14)')
    const likeCount = (JSON.stringify(listed.json()).match(/"likes":\s*(\d+)/) ??
      [])[1]
    expect(likeCount, 'two PUTs count once (spec 4.15)').toBe('1')

    const unliked = await owner.browser.json(`/comments/${commentId}/like`, 'DELETE')
    expect(
      [200, 204].includes(unliked.status),
      `the unlike lands; answered ${String(unliked.status)}`,
    ).toBe(true)
  })
})

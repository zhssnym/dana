/*
AC-205: given a comment in a folder, when a non-member reads or writes its
thread, then the 10.2 not-found shape; when the author or the folder owner
deletes it, then success; when another member tries, then 403.

Three roles, three answers, one thread. The author-or-owner delete rule is
4.15's and it is asserted from both sides so an implementation that checks
only one of the two grants cannot pass.

Spec: 4.15, 7.14, 10.2 (RFC 0005).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

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

let app: AuthTestApp
const cast = new Cast(['owner', 'author', 'bystander', 'outsider'])

async function comment(actor: Actor, folderId: string, body: string) {
  const posted = await actor.browser.json(`/folders/${folderId}/comments`, 'POST', {
    body,
  })
  expectStatus(posted, 201, 'a member comments (spec 7.14)')
  return String((posted.json() as { id?: unknown }).id)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-205 three roles at one thread', () => {
  test('outsider not-found; author and owner delete; bystander 403', async () => {
    const [owner, author, bystander, outsider] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
      Actor,
    ]
    for (const person of [author, bystander]) {
      await connect(app.db, owner.id, person.id)
    }
    const folderId = await createFolder(owner, 's1 ac205 thread')
    await addMemberOk(owner, folderId, author.id)
    await addMemberOk(owner, folderId, bystander.id)

    const outsiderRead = await outsider.browser.json(
      `/folders/${folderId}/comments`,
      'GET',
    )
    expectStatus(outsiderRead, 404, 'a non-member meets not-found (spec 10.2)')

    const byAuthor = await comment(author, folderId, 's1 ac205 the author speaks')

    const refused = await bystander.browser.json(
      `/comments/${byAuthor}`,
      'DELETE',
    )
    expectStatus(refused, 403, 'a mere member deletes nobody else’s words (spec 4.15)')

    const authorDelete = await author.browser.json(`/comments/${byAuthor}`, 'DELETE')
    expect(
      [200, 204].includes(authorDelete.status),
      `the author deletes their own; answered ${String(authorDelete.status)}`,
    ).toBe(true)

    const ownerTarget = await comment(author, folderId, 's1 ac205 for the owner')
    const ownerDelete = await owner.browser.json(`/comments/${ownerTarget}`, 'DELETE')
    expect(
      [200, 204].includes(ownerDelete.status),
      `the folder owner may moderate; answered ${String(ownerDelete.status)}`,
    ).toBe(true)
  })
})

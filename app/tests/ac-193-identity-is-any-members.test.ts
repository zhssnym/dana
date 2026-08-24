/*
AC-193: given a non-owner member, when they rename the folder, then 403;
when they set its icon, colour, cover, or description, then success, and
every member reads the same identity.

This is DES-225's name and dressing split as a wire fact: the name is
identity as address and stays the owner's, the dressing is content and is
any member's, one look for everybody (pricing decision D1).

Spec: 4.3, 7.4, 9.6 (RFC 0005).
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
const cast = new Cast(['owner', 'member'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-193 the name is the owner’s, the dressing is the folder’s', () => {
  test('member rename 403; member identity write lands for everyone', async () => {
    const [owner, member] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 's1 ac193 identity')
    await addMemberOk(owner, folderId, member.id)

    const rename = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 's1 ac193 stolen name',
    })
    expectStatus(rename, 403, 'rename is the owner’s (spec 9.6, v1 rule kept)')

    const dressed = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      icon: 'plane',
      color: '#1a92d1',
      description: 'the travel plans',
    })
    expectStatus(
      dressed,
      200,
      'a member dresses the shared page (spec 4.3, D1)',
    )

    const asOwner = await owner.browser.json(`/folders/${folderId}`, 'GET')
    expectStatus(asOwner, 200, 'the owner reads the folder (spec 7.4)')
    const body = asOwner.json() as Record<string, unknown>
    expect(body.icon, 'one icon for every member (spec 4.3)').toBe('plane')
    expect(body.color, 'one colour for every member (spec 4.3)').toBe('#1a92d1')
    expect(
      body.description,
      'one description for every member (spec 4.3)',
    ).toBe('the travel plans')
  })
})

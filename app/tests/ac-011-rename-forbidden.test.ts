/*
AC-011: given a non-owner member, when renaming the folder, then 403.

The permission matrix (5.4) marks rename owner-only, and 7.0 fixes the
grammar of refusals around it: a member who can see the folder but may not
act gets 403, while a non-member must get 404, never 403, so that the
response cannot leak the folder's existence. Both halves are here, because
an implementation that answers 403 to strangers passes the criterion as
written while violating the rule it rests on.

Spec: 5.4, 7.0, 7.4, 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'])

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined

const FOLDER_NAME = 'p2 ac011 shared'

/*
Staged lazily, the holder() pattern of the P1 files: a broken setup call
fails under the first test's name with the missing endpoint spelled out,
rather than as one anonymous beforeAll error that hides the criteria.
*/
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, stranger] = await cast.of(app)
    if (owner === undefined || member === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, FOLDER_NAME)
    await addMemberOk(owner, folderId, member.id)
    staged = { owner, member, stranger, folderId }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-011: renaming is refused to non-owner members', () => {
  test('AC-011: a non-owner member renaming the folder answers 403', async () => {
    const { member, folderId } = await stage()
    const response = await member.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac011 renamed by member',
    })
    expectStatus(
      response,
      403,
      'PATCH /folders/:id by a non-owner member must answer 403 (spec 5.4, 7.4)',
    )
  })

  test('AC-011: the refused rename changed nothing for any member', async () => {
    const { owner, member, folderId } = await stage()
    for (const viewer of [owner, member]) {
      const entry = await folderInList(viewer, folderId)
      expect(
        entry?.name,
        'a 403 rename must leave the name unchanged (spec 5.4)',
      ).toBe(FOLDER_NAME)
    }
  })

  test('AC-011 adversarial: the member still sees the folder after the refusal', async () => {
    // 403 is authenticated, visible, not permitted (7.0); the refusal must
    // not have cost the member anything.
    const { member, folderId } = await stage()
    const entry = await folderInList(member, folderId)
    expect(
      entry,
      'the refused member must still be a member (spec 5.4)',
    ).toBeDefined()
  })

  test('AC-011 adversarial: a non-member renaming answers 404, never 403', async () => {
    const { stranger, folderId } = await stage()
    const response = await stranger.browser.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac011 renamed by stranger' },
    )
    expectStatus(
      response,
      404,
      'an inaccessible folder must read as nonexistent (spec 7.0, 10.2)',
    )
  })

  test('AC-011 adversarial: no session answers 401', async () => {
    const { folderId } = await stage()
    const anonymous = app.browser()
    const response = await anonymous.json(
      `/folders/${folderId}`,
      'PATCH',
      { name: 'p2 ac011 renamed by nobody' },
      { csrf: 'omit' },
    )
    expectStatus(response, 401, 'no valid session must answer 401 (spec 7.0)')
  })

  test('AC-011: invariants hold afterwards', async () => {
    const { owner, member, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, member.id, stranger.id],
    )
  })
})

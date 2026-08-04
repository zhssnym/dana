/*
AC-020: given the owner is the sole member, when leaving, then 409 with the
delete-instead message.

5.3's owner-leave row guards on at least one other member existing, "else
409 with copy: delete the folder instead". The copy is normative, so it is
asserted, case-insensitively and against the response text rather than a
particular envelope path, because 7.0 fixes the envelope's fields but the
copy is the fact this criterion names. The refusal must also leave the
owner exactly where they were: still the owner, still a member, still able
to act. The default folder rides the same guard, since INV-3 keeps it
forever at one member.

Spec: 3 (INV-2, INV-3), 5.3, 7.0, 7.4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  membershipUserIds,
  removeMember,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'])

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) {
      throw new Error('cast must produce an actor')
    }
    const folderId = await createFolder(owner, 'p2 ac020 solo')
    staged = { owner, folderId }
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

describe('AC-020: the sole-member owner cannot leave', () => {
  test('AC-020: the leave answers 409 carrying the delete-instead copy', async () => {
    const { owner, folderId } = await stage()
    const response = await removeMember(owner, folderId, owner.id)
    expectStatus(
      response,
      409,
      'the sole-member owner leave must answer 409 (spec 5.3, 7.4)',
    )
    expect(
      response.body.toLowerCase(),
      'the 409 must carry the 5.3 copy: delete the folder instead',
    ).toContain('delete the folder instead')
  })

  test('AC-020: the refusal changed nothing and the owner still acts', async () => {
    const { owner, folderId } = await stage()
    expect(
      await membershipUserIds(app.db, folderId),
      'the membership must be exactly the owner still (spec 5.3)',
    ).toEqual([owner.id])
    const rename = await owner.browser.json(`/folders/${folderId}`, 'PATCH', {
      name: 'p2 ac020 still mine',
    })
    expectStatus(
      rename,
      200,
      'the refused leave must not have cost the owner their powers (spec 5.4)',
    )
  })

  test('AC-020 adversarial: the default folder answers the same 409', async () => {
    // INV-3 pins the default folder at exactly one member, so the sole
    // member guard is always the one that fires.
    const { owner } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    const response = await removeMember(owner, defaultId, owner.id)
    expectStatus(
      response,
      409,
      'leaving the default folder must answer 409 (spec 5.3, INV-3)',
    )
    expect(
      await folderInList(owner, defaultId),
      'the default folder must be untouched (INV-2)',
    ).toBeDefined()
  })

  test('AC-020: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    await expectFolderInvariants(app.db, [folderId, defaultId], [owner.id])
  })
})

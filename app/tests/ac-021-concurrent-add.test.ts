/*
AC-021: given two members race to add the same person, when both POST, then
one 201 and one 409 (INV-10).

The race is run as a race: two browsers, two sessions, both requests in
flight together. Whichever interleaving the server sees, INV-10 allows one
membership row, so one caller must win with 201 and the other must be told
409, never 500 (an unhandled unique violation) and never two 201s (a check
then insert with no guard). The share-grant email of 5.3 must follow the
winner alone, which is what distinguishes handling the race from merely
surviving it. The non-race form of the same 409 carries 5.3's copy.

Spec: 3 (INV-10), 5.3, 7.4; 11.8 for the observed email.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMember,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'second', 'target'])

interface Stage {
  owner: Actor
  second: Actor
  target: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second, target] = await cast.of(app)
    if (owner === undefined || second === undefined || target === undefined) {
      throw new Error('cast must produce three actors')
    }
    const db = app.db
    await connect(db, owner.id, second.id)
    // Both racers hold the roster edge to the target, so the connection
    // guard cannot decide the race for either of them.
    await connect(db, owner.id, target.id)
    await connect(db, second.id, target.id)
    const folderId = await createFolder(owner, 'p2 ac021 raced')
    await addMemberOk(owner, folderId, second.id)
    staged = { owner, second, target, folderId }
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

describe('AC-021: a raced double add produces one membership', () => {
  test('AC-021: the race answers one 201 and one 409', async () => {
    const { owner, second, target, folderId } = await stage()
    app.emails.clear()

    const [byOwner, bySecond] = await Promise.all([
      addMember(owner, folderId, target.id),
      addMember(second, folderId, target.id),
    ])

    const statuses = [byOwner.status, bySecond.status].sort((a, b) => a - b)
    expect(
      statuses,
      `two racing adds must split into one 201 and one 409 (INV-10, spec 5.3); answered ${String(byOwner.status)} and ${String(bySecond.status)}`,
    ).toEqual([201, 409])
  })

  test('AC-021: exactly one membership row exists for the target', async () => {
    const { owner, second, target, folderId } = await stage()
    const memberIds = await membershipUserIds(app.db, folderId)
    expect(
      memberIds.filter((id) => id === target.id),
      'INV-10 allows one membership per (folder, user)',
    ).toEqual([target.id])
    expect(memberIds.sort()).toEqual(
      [owner.id, second.id, target.id].sort(),
    )
  })

  test('AC-021 adversarial: the share-grant email followed the winner alone', async () => {
    const { target } = await stage()
    const grants = app.emails
      .shareGrants()
      .filter((email) => email.to === target.email)
    expect(
      grants.length,
      'one 201 means one share-grant email to the target, never two (spec 5.3, 11.8)',
    ).toBe(1)
  })

  test('AC-021: the added member can see the folder', async () => {
    const { target, folderId } = await stage()
    expect(
      await folderInList(target, folderId),
      'the winner add must have granted real access (spec 5.4)',
    ).toBeDefined()
  })

  test('AC-021 adversarial: the sequential repeat answers 409 with the already-a-member copy', async () => {
    const { owner, target, folderId } = await stage()
    const response = await addMember(owner, folderId, target.id)
    expectStatus(
      response,
      409,
      'adding a current member must answer 409 (spec 5.3, 7.4)',
    )
    expect(
      response.body.toLowerCase(),
      'the 409 carries the 5.3 copy: already a member',
    ).toContain('already a member')
  })

  test('AC-021: invariants hold afterwards', async () => {
    const { owner, second, target, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, second.id, target.id],
    )
  })
})

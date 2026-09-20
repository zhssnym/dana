/*
AC-024: given any member adds from their roster, then 201 and one
share-grant email is sent to the target.

Any member means the actor here is deliberately the non-owner, and the
roster edge is deliberately theirs alone: the owner holds no connection to
the target, so a 201 proves the add ran on the actor's roster and 5.4's
"add members" row really extends past the owner. The email is counted, not
just noticed: exactly one, to the target's address and nobody else's,
observed through the recorder the harness injects because 11.8 makes the
notification module log rather than send under test.

The membership listing of GET /folders/:id is asserted once here, since
this criterion is where membership becomes visible surface: 7.4 names
members [{user, role, joined_at, is_owner}], and exactly one element may
carry is_owner true.

Spec: 5.3, 5.4, 7.0, 7.4, 11.8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
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
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'adder', 'target', 'owners-friend'])

interface Stage {
  owner: Actor
  adder: Actor
  target: Actor
  ownersFriend: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, adder, target, ownersFriend] = await cast.of(app)
    if (
      owner === undefined ||
      adder === undefined ||
      target === undefined ||
      ownersFriend === undefined
    ) {
      throw new Error('cast must produce four actors')
    }
    const db = app.db
    await connect(db, owner.id, adder.id)
    // The roster edge under test belongs to the non-owner actor alone.
    await connect(db, adder.id, target.id)
    await connect(db, owner.id, ownersFriend.id)
    const folderId = await createFolder(owner, 'p2 ac024 granted')
    await addMemberOk(owner, folderId, adder.id)
    staged = { owner, adder, target, ownersFriend, folderId }
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

describe('AC-024: a roster add admits the target and mails them once', () => {
  test('AC-024: the non-owner member adds from their own roster, 201', async () => {
    const { adder, target, folderId } = await stage()
    app.emails.clear()
    const response = await addMember(adder, folderId, target.id)
    expectStatus(
      response,
      201,
      'any member adds from their roster (spec 5.3, 5.4, 7.4)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the membership row must exist (spec 5.3)',
    ).toContain(target.id)

    // Ruled at the shape review into frozen 7.4: POST members answers the
    // member element it created, and the person inside is 7.0's shape
    // without email, an address co-members have no claim to.
    const body = response.json() as {
      user?: Record<string, unknown>
      role?: unknown
      is_owner?: unknown
      joined_at?: unknown
    }
    expect(
      body.user?.id,
      'the 201 body is the member element it created (7.4 as ruled at the shape review)',
    ).toBe(target.id)
    expect(
      Object.keys(body.user ?? {}).sort(),
      'the created element carries the person shape and no email (7.4 as ruled at the shape review)',
    ).toEqual(['avatar_url', 'display_name', 'id'])
    expect(body.role, 'the role column admits only member (spec 4.4, 8.9)').toBe(
      'member',
    )
    expect(body.is_owner, 'the added member is no owner (spec 8.9)').toBe(false)
    expect(
      typeof body.joined_at,
      'the element carries its join instant (spec 7.4)',
    ).toBe('string')
  })

  test('AC-024: exactly one share-grant email went to the target', async () => {
    const { owner, adder, target } = await stage()
    const grants = app.emails.shareGrants()
    expect(
      grants.filter((email) => email.to === target.email).length,
      'one add sends one share-grant email to the target (spec 5.3, 11.8)',
    ).toBe(1)
    expect(
      grants.filter(
        (email) => email.to === adder.email || email.to === owner.email,
      ).length,
      'the share-grant goes to the target, never the actor or the owner (spec 5.3)',
    ).toBe(0)
  })

  test('AC-024: the target now reads the folder', async () => {
    const { target, folderId } = await stage()
    const entry = await folderInList(target, folderId)
    expect(
      entry,
      'the granted member must see the folder in their list (spec 5.4)',
    ).toBeDefined()
    expect(
      entry?.member_count,
      'the Folder object counts three members now (spec 7.0)',
    ).toBe(3)
    expect(entry?.is_owner, 'the target is no owner (spec 7.0)').toBe(false)
  })

  test('AC-024 adversarial: the members listing reflects the add', async () => {
    const { owner, folderId } = await stage()
    const response = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(
      response,
      200,
      'GET /folders/:id answers the folder detail to a member (spec 7.4)',
    )
    const body = response.json() as { members?: unknown }
    expect(
      Array.isArray(body.members),
      'the detail carries members [{user, role, joined_at, is_owner}] (spec 7.4)',
    ).toBe(true)
    const members = body.members as { is_owner?: unknown }[]
    expect(members.length, 'three memberships, three elements (spec 7.4)').toBe(3)
    expect(
      members.filter((member) => member.is_owner === true).length,
      'exactly one element carries is_owner true (spec 7.4, 8.9)',
    ).toBe(1)
    for (const element of members) {
      const user = (element as { user?: unknown }).user
      expect(
        typeof user === 'object' && user !== null,
        'each members element carries its person object (spec 7.4)',
      ).toBe(true)
      expect(
        Object.keys(user as Record<string, unknown>).sort(),
        'every member user object is the 7.0 person shape and carries no email (7.4 as ruled at the shape review)',
      ).toEqual(['avatar_url', 'display_name', 'id'])
    }
  })

  test('AC-024 adversarial: the owner adding from their roster works the same way', async () => {
    const { owner, ownersFriend, folderId } = await stage()
    app.emails.clear()
    const response = await addMember(owner, folderId, ownersFriend.id)
    expectStatus(
      response,
      201,
      'any member includes the owner (spec 5.3, 5.4)',
    )
    const grants = app.emails.shareGrants()
    expect(
      grants.filter((email) => email.to === ownersFriend.email).length,
      'the owner add mails its target once too (spec 5.3)',
    ).toBe(1)
  })

  test('AC-024: invariants hold afterwards', async () => {
    const { owner, adder, target, ownersFriend, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, adder.id, target.id, ownersFriend.id],
    )
  })
})

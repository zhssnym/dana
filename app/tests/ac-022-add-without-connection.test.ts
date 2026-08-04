/*
AC-022: given a member adds someone they hold no roster connection with,
when POST members, then 422.

The guard reads the actor's roster, not the folder's collective one (5.3:
"target has a roster connection with the actor"), so the sharpest case here
is a target connected to a different member: the unconnected member's add
answers 422 and the connected member's add of the very same target answers
201. Around it sit the rest of 7.4's guard taxonomy for the endpoint: 409
for the default folder, 422 for the 25-member cap at its exact boundary,
422 for a wrong-typed body field, and the ruled 400 for a non-object body.
Every refusal must also send nothing, because 5.3's share-grant email
belongs to successful adds alone.

Spec: 3 (INV-3), 5.3, 7.0, 7.4, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMember,
  addMemberOk,
  connect,
  createFolder,
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
  seedMembership,
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'confidant', 'orphan'])

interface Stage {
  owner: Actor
  /** Connected to the owner and to the orphan-side target. */
  confidant: Actor
  /** Connected to the confidant only, never to the owner. */
  orphan: Actor
  folderId: string
  /** A user connected to nobody at all. */
  hermitId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, confidant, orphan] = await cast.of(app)
    if (owner === undefined || confidant === undefined || orphan === undefined) {
      throw new Error('cast must produce three actors')
    }
    const db = app.db
    await connect(db, owner.id, confidant.id)
    await connect(db, confidant.id, orphan.id)
    const hermitId = await seedUser(db, 'hermit')
    cast.trackUser(hermitId)
    const folderId = await createFolder(owner, 'p2 ac022 guarded')
    await addMemberOk(owner, folderId, confidant.id)
    staged = { owner, confidant, orphan, folderId, hermitId }
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

describe('AC-022: adding outside the actor roster answers 422', () => {
  test('AC-022: adding a never-connected user answers 422 and grants nothing', async () => {
    const { owner, folderId, hermitId } = await stage()
    app.emails.clear()
    const response = await addMember(owner, folderId, hermitId)
    expectStatus(
      response,
      422,
      'no roster connection between actor and target must answer 422 (spec 5.3, 7.4)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the refused add must create no membership (spec 5.3)',
    ).not.toContain(hermitId)
    expect(
      app.emails.shareGrants().length,
      'a refused add must send nothing (spec 5.3)',
    ).toBe(0)
  })

  test('AC-022 adversarial: the guard reads the actor roster, not the folder one', async () => {
    // The same target, two actors: refused for the member without the
    // edge, admitted for the member with it. An implementation that pools
    // the folder members' rosters passes the first half and fails this.
    const { owner, confidant, orphan, folderId } = await stage()
    const byOwner = await addMember(owner, folderId, orphan.id)
    expectStatus(
      byOwner,
      422,
      'the owner holds no roster edge to this target, so 422 (spec 5.3: with the actor)',
    )
    const byConfidant = await addMember(confidant, folderId, orphan.id)
    expectStatus(
      byConfidant,
      201,
      'the member who does hold the edge admits the same target (spec 5.3)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
    ).toContain(orphan.id)
  })

  test('AC-022 adversarial: a nonexistent target reads as unconnected, 422', async () => {
    // 7.4 names this endpoint's refusals and a missing user holds no
    // roster connection with anyone; nothing in the list grants a 404.
    const { owner, folderId } = await stage()
    const response = await addMember(owner, folderId, randomUUID())
    expectStatus(
      response,
      422,
      'a nonexistent target has no roster connection and must answer 422 (spec 5.3, 7.4)',
    )
  })

  test('AC-022 adversarial: the default folder refuses members, 409, even connected ones', async () => {
    const { owner, confidant } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    const response = await addMember(owner, defaultId, confidant.id)
    expectStatus(
      response,
      409,
      'the default folder is never shared (spec 7.4, 5.3, INV-3)',
    )
    expect(
      await membershipUserIds(app.db, defaultId),
      'the default folder must still hold exactly its owner (INV-3)',
    ).toEqual([owner.id])
  })

  test('AC-022 adversarial: the 25-member cap refuses at exactly the boundary', async () => {
    // 10.3: members per folder, 25. The folder is filled to 24 directly
    // (setup, not the surface under test), then the 25th arrives through
    // the API and the 26th must not.
    const { owner } = await stage()
    const db = app.db
    const cappedFolderId = await createFolder(owner, 'p2 ac022 capped')
    for (let i = 0; i < 23; i += 1) {
      const fillerId = await seedUser(db, `filler-${String(i)}`)
      cast.trackUser(fillerId)
      await seedMembership(db, cappedFolderId, fillerId)
    }
    const twentyFifthId = await seedUser(db, 'twenty-fifth')
    const twentySixthId = await seedUser(db, 'twenty-sixth')
    cast.trackUser(twentyFifthId)
    cast.trackUser(twentySixthId)
    await connect(db, owner.id, twentyFifthId)
    await connect(db, owner.id, twentySixthId)

    const admitted = await addMember(owner, cappedFolderId, twentyFifthId)
    expectStatus(
      admitted,
      201,
      'the 25th member is inside the cap and must be admitted (spec 10.3)',
    )
    const refused = await addMember(owner, cappedFolderId, twentySixthId)
    expectStatus(
      refused,
      422,
      'the 26th member is over the cap and must answer 422 (spec 7.4, 10.3)',
    )
    expect(
      (await membershipUserIds(db, cappedFolderId)).length,
      'the folder must hold exactly 25 members (spec 10.3)',
    ).toBe(25)
    await expectFolderInvariants(db, [cappedFolderId], [owner.id])
  })

  test('AC-022 adversarial: a wrong-typed user_id answers 422, a non-object body 400', async () => {
    const { owner, folderId } = await stage()
    const wrongType = await owner.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      { user_id: 123 },
    )
    expectStatus(
      wrongType,
      422,
      'a wrong-typed field on a parsed object is a validation failure (spec 7.0)',
    )
    const nonObject = await owner.browser.api(`/folders/${folderId}/members`, {
      method: 'POST',
      body: JSON.stringify([{ user_id: randomUUID() }]),
      headers: { 'content-type': 'application/json' },
    })
    expectStatus(
      nonObject,
      400,
      'a body that parses to an array is malformed (spec 7.0; RFC 0001 P2 row)',
    )
  })

  test('AC-022: invariants hold afterwards', async () => {
    const { owner, confidant, orphan, folderId } = await stage()
    const defaultId = await defaultFolderOf(app.db, owner.id)
    await expectFolderInvariants(
      app.db,
      [folderId, defaultId],
      [owner.id, confidant.id, orphan.id],
    )
  })
})

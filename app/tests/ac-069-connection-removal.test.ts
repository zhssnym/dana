/*
AC-069: given a connection removal by either side, then both rosters drop
the pair, existing shared memberships stay intact, and a new share to that
person requires a fresh email invite.

A connection is one row serving two rosters (4.2, INV-9), so "either side"
is a real question: DELETE /connections/:userId must work identically
whichever of the pair calls it, and 7.3 says so. What the removal must not
touch is everything downstream of the roster: memberships granted while
connected survive, their folders and tasks unmoved, because the roster is
an addressing convenience and never an access control. And what the removal
must genuinely revoke is the shortcut: a member add of the removed person
answers 422 for the missing connection (7.4, 5.3), and an invite to their
email no longer converts, parking as a pending row instead, whose
acceptance is the fresh consent the criterion requires.

The roster surface itself is judged here too, since this file is where a
roster with two entries exists: frozen 7.3's element shape key-exact, and
its order, display_name ascending then id.

Rate-limit discipline: the owner issues one POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.3, 7.4, 5.3 (the roster-connection guard), 8.7 (conversion reads
the roster), 4.2, INV-9, 10.2.
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
  expectStatus,
  folderInList,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInviteOk,
  connectionCount,
  connectionPair,
  createInviteOk,
  deleteConnection,
  listConnections,
  requireInviteRow,
  rosterIds,
} from './sharing-harness.js'
import { createTaskOk, expectTaskInvariants, taskRow } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'partner', 'acquaintance'], 'p5')

interface Stage {
  owner: Actor
  partner: Actor
  acquaintance: Actor
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, partner, acquaintance] = await cast.of(app)
    if (
      owner === undefined ||
      partner === undefined ||
      acquaintance === undefined
    ) {
      throw new Error('cast must produce three actors')
    }
    // Two connections for the owner, so each removal arm has its own pair
    // and the roster has an order worth asserting.
    await connect(app.db, owner.id, partner.id)
    await connect(app.db, owner.id, acquaintance.id)
    const folderId = await createFolder(owner, 'p5 ac069 outlives')
    await addMemberOk(owner, folderId, partner.id)
    const task = await createTaskOk(
      owner,
      {
        title: 'p5 ac069 shared work',
        folder_id: folderId,
        assignee_id: partner.id,
      },
      'the shared folder holds real work the removal must not touch (spec 7.6)',
    )
    staged = { owner, partner, acquaintance, folderId, taskId: task.id }
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

describe('AC-069: removing a connection revokes the shortcut, not the shares', () => {
  test('AC-069: the roster reads frozen 7.3, ordered', async () => {
    const { owner, partner, acquaintance } = await stage()
    const roster = await listConnections(owner)
    expect(
      rosterIds(roster).sort(),
      'the premise: both connections are on the roster before either removal',
    ).toEqual([partner.id, acquaintance.id].sort())
    const names = roster.map((element) =>
      String(element.user.display_name ?? ''),
    )
    expect(
      [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      '7.3 sorts by display_name ascending, id: the list arrives ordered',
    ).toEqual(names)
  })

  test('AC-069: the non-initiating side may remove, and both rosters drop the pair', async () => {
    const { owner, acquaintance } = await stage()
    // The acquaintance calls, not the owner who seeded the pair: "either
    // side may call" is 7.3's sentence, and this is the side an
    // implementation keyed on user_a_id gets wrong.
    const response = await deleteConnection(acquaintance, owner.id)
    expectStatus(
      response,
      204,
      'either side of the pair may remove it (spec 7.3)',
    )
    expect(
      await connectionPair(app.db, owner.id, acquaintance.id),
      'the pair row is gone (spec 7.3, 4.2)',
    ).toEqual([])
    expect(
      rosterIds(await listConnections(owner)),
      'the owner\'s roster dropped the acquaintance',
    ).not.toContain(acquaintance.id)
    expect(
      rosterIds(await listConnections(acquaintance)),
      'and the acquaintance\'s roster dropped the owner: one row, both directions',
    ).not.toContain(owner.id)
  })

  test('AC-069: removing the sharing partner leaves every share intact', async () => {
    const { owner, partner, folderId, taskId } = await stage()
    expectStatus(
      await deleteConnection(partner, owner.id),
      204,
      'the partner removes the connection from their side (spec 7.3)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'existing shared memberships stay intact: the roster is not an access control (spec 7.3, AC-069)',
    ).toContain(partner.id)
    expect(
      await folderInList(partner, folderId),
      'the partner still reads the folder (spec 5.4)',
    ).toBeDefined()
    const row = await taskRow(app.db, taskId)
    expect(
      row?.assignee_id,
      'and the assignment survives: INV-4 binds membership, not connection',
    ).toBe(partner.id)
  })

  test('AC-069: a new share to that person requires a fresh email invite', async () => {
    const { owner, partner } = await stage()
    const newFolderId = await createFolder(owner, 'p5 ac069 second wave')

    const direct = await addMember(owner, newFolderId, partner.id)
    expectStatus(
      direct,
      422,
      'the roster shortcut is revoked: a member add without a connection answers 422 (spec 7.4, 5.3)',
    )

    const invite = await createInviteOk(
      owner,
      { email: partner.email, folder_id: newFolderId },
      'an invite to the removed person no longer converts: the conversion arm reads the roster as it stands (spec 8.7)',
    )
    expect(
      (await requireInviteRow(app.db, invite.id)).status,
      'so it parks as pending, awaiting fresh consent',
    ).toBe('pending')

    const body = await acceptInviteOk(
      partner,
      invite.id,
      'the removed person accepts the fresh invite (spec 7.5, 8.7)',
    )
    expect(
      body.connection_created,
      'acceptance re-mints the pair: the fresh email invite is the one road back',
    ).toBe(true)
    expect(
      await connectionPair(app.db, owner.id, partner.id),
      'one canonical row again (INV-9)',
    ).toHaveLength(1)
    expect(
      await membershipUserIds(app.db, newFolderId),
      'and the new share is granted through it',
    ).toContain(partner.id)
  })

  test('AC-069 adversarial: removing what is not there reads as nonexistent', async () => {
    const { owner, acquaintance } = await stage()
    expectStatus(
      await deleteConnection(owner, acquaintance.id),
      404,
      'the pair was already removed, and 7.3 answers 404 when no such connection exists',
    )
    const total = await connectionCount(app.db, owner.id)
    expect(
      total,
      'and nothing else was swept: the owner still holds exactly the re-minted partner pair',
    ).toBe(1)
  })

  test('AC-069: invariants hold afterwards', async () => {
    const { owner, partner, acquaintance, folderId, taskId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [folderId],
      [owner.id, partner.id, acquaintance.id],
    )
  })
})

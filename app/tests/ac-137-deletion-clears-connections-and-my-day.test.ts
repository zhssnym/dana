/*
AC-137: Given DELETE /me, then no connection row contains the user and both
former rosters drop them, no My Day entry of theirs remains anywhere, and
connections between other users are untouched.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text. This file proposed it, the AC-125 to AC-130 precedent for a batch
authored with its tests and numbered additively at a mid-package change
control. Routed by the RFC 0001 P5 row's kickoff decision: 8.10's steps
1 to 6, outcome by outcome, and this is steps 5 and 6 together, the two
sweeps whose outcome is an absence.

Two things give the absence teeth. The connection rows are deleted, not
merely excluded: 4.2 records that the users are soft-deleted so the CASCADE
never fires in practice and the deletion transaction removes rows
explicitly, and 7.3's excluding-soft-deleted clause is defense in depth
above that, not the mechanism. So the row count is asserted at zero and the
roster read on the wire beside it. And step 6 is a remainder sweep: steps 3
and 4 already took the entries their folders and memberships accounted for,
so the criterion asserts the end state, zero rows for the user anywhere,
which holds whichever step took each row.

The bystander pair is the control: two survivors' own connection, seeded
beside the departing user's two, must come through untouched, because a
sweep written by table rather than by user would pass every zero above and
fail exactly here.

DELETE /me is the P1 stub today, steps 7 and 8, so this file fails on the
connection rows surviving: wrong behavior, not absence. The roster read
fails on the unmounted 7.3 route beside it, this package's own missing
surface.

Spec: 8.10 steps 5 and 6, 4.2, 7.3 (roster read, soft-deleted exclusion),
4.7, 6 Q9.
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
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  connectionCount,
  connectionPair,
  deleteAccount,
  listConnections,
  myDayCountForUser,
  rosterIds,
} from './sharing-harness.js'
import { createTaskOk, pullIntoMyDayOk } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'north', 'south'], 'p5')

interface Stage {
  departing: Actor
  north: Actor
  south: Actor
  sharedFolderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing, north, south] = await cast.of(app)
    if (departing === undefined || north === undefined || south === undefined) {
      throw new Error('cast must produce three actors')
    }
    // The departing user connects to both survivors; the survivors connect
    // to each other, which is the row the sweep must not touch.
    await connect(app.db, departing.id, north.id)
    await connect(app.db, departing.id, south.id)
    await connect(app.db, north.id, south.id)

    // My Day entries in a folder that survives by transfer, so the row that
    // remains for step 6 is one steps 3 and 4 both had reason to miss.
    const sharedFolderId = await createFolder(departing, 'p5 ac137 pulled from')
    await addMemberOk(departing, sharedFolderId, north.id)
    const task = await createTaskOk(
      departing,
      {
        title: 'p5 ac137 pulled task',
        folder_id: sharedFolderId,
        assignee_id: north.id,
      },
      'the task the departing user pulls (spec 7.6)',
    )
    await pullIntoMyDayOk(departing, task.id, 'UTC', 'the departing pull')
    await pullIntoMyDayOk(north, task.id, 'UTC', 'the surviving pull')
    staged = { departing, north, south, sharedFolderId }
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

describe('AC-137: deletion erases the rosters\' memory of the account', () => {
  test('AC-137: every connection row containing the user is deleted', async () => {
    const { departing, north, south } = await stage()
    expect(
      await connectionCount(app.db, departing.id),
      'the premise: two connections stand before the deletion',
    ).toBe(2)

    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )

    expect(
      await connectionCount(app.db, departing.id),
      '8.10 step 5: the rows are deleted outright, 4.2\'s explicit removal, never left for 7.3\'s exclusion to hide',
    ).toBe(0)
    expect(
      await connectionPair(app.db, north.id, south.id),
      'and the survivors\' own pair is untouched: the sweep is by user, not by table',
    ).toHaveLength(1)
  })

  test('AC-137: both former rosters drop the account on the wire', async () => {
    const { departing, north, south } = await stage()
    expect(
      rosterIds(await listConnections(north)),
      'the first survivor\'s roster no longer lists the deleted account (spec 7.3, 6 Q9)',
    ).not.toContain(departing.id)
    expect(
      rosterIds(await listConnections(south)),
      'nor does the second\'s: one row served both directions and its deletion clears both',
    ).not.toContain(departing.id)
    expect(
      rosterIds(await listConnections(north)),
      'while the survivors still hold each other',
    ).toContain(south.id)
  })

  test('AC-137: no My Day entry of the account survives anywhere', async () => {
    const { departing, north } = await stage()
    expect(
      await myDayCountForUser(app.db, departing.id),
      '8.10 step 6, the remainder sweep: zero rows for the user, whichever earlier step took each (spec 8.10, 4.7)',
    ).toBe(0)
    expect(
      await myDayCountForUser(app.db, north.id),
      'the survivor\'s pull on the same task stands: entries are per user (INV-12)',
    ).toBe(1)
  })

  test('AC-137: invariants hold afterwards', async () => {
    const { north, south, sharedFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [sharedFolderId],
      [north.id, south.id],
    )
  })
})

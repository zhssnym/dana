/*
AC-136 (proposed): given DELETE /me by a member of others' folders, then
each membership is removed through R-CLEAN: their assigned tasks in the
folder unassigned, their My Day entries for its tasks deleted, and a folder
left with exactly one member has every task in it assigned to that member.

The number is proposed, not assigned; numbering section 12 additively is the
Integration Steward's at the mid-package change control, the AC-125 to
AC-130 precedent, and the text above is the transcription the amendment
would take. Routed by the RFC 0001 P5 row's kickoff decision: 8.10's steps
1 to 6, outcome by outcome, and this is step 4's.

Step 4 is deliberately not new machinery: it is 5.3's R-CLEAN, the block
AC-016 and AC-018 pin for removal and leave, run once per remaining
membership by the deletion transaction. What this criterion adds is the
caller: an implementation that revokes the memberships without the cleanup,
or sweeps my_day_entries by user without scoping to the folder's tasks,
satisfies AC-016 and still corrupts here. So the fixture puts the departing
member in two folders shaped to disagree: a three-member folder where the
survivors' rows must be left alone, and a two-member folder that drops to
one, where INV-5's sweep must then assign everything, the unassigned task
and the just-unassigned one alike, to the remaining member.

DELETE /me is the P1 stub today, steps 7 and 8, so this file fails on the
memberships surviving whole: wrong behavior, not absence.

Spec: 8.10 step 4, 5.3 (R-CLEAN), 8.8 (removal never deletes a task),
INV-4, INV-5, INV-10, 4.7.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { deleteAccount, myDayCountForUser } from './sharing-harness.js'
import {
  createTaskOk,
  myDayRows,
  pullIntoMyDayOk,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'host', 'cohost', 'soleHost'], 'p5')

interface Stage {
  departing: Actor
  host: Actor
  cohost: Actor
  soleHost: Actor
  threeFolderId: string
  twoFolderId: string
  /** In the three-member folder. */
  assignedId: string
  pulledId: string
  /** In the two-member folder. */
  wasUnassignedId: string
  wasDepartingsId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing, host, cohost, soleHost] = await cast.of(app)
    if (
      departing === undefined ||
      host === undefined ||
      cohost === undefined ||
      soleHost === undefined
    ) {
      throw new Error('cast must produce four actors')
    }

    await connect(app.db, host.id, departing.id)
    await connect(app.db, host.id, cohost.id)
    const threeFolderId = await createFolder(host, 'p5 ac136 three strong')
    await addMemberOk(host, threeFolderId, departing.id)
    await addMemberOk(host, threeFolderId, cohost.id)

    const assigned = await createTaskOk(
      host,
      {
        title: 'p5 ac136 on the leaver',
        folder_id: threeFolderId,
        assignee_id: departing.id,
      },
      'the host assigns a task to the departing member (spec 7.6)',
    )
    const pulled = await createTaskOk(
      host,
      {
        title: 'p5 ac136 pulled by two',
        folder_id: threeFolderId,
        assignee_id: cohost.id,
      },
      'the task both the leaver and a survivor pull (spec 7.6)',
    )
    await pullIntoMyDayOk(
      departing,
      pulled.id,
      'UTC',
      'the departing member\'s pull',
    )
    await pullIntoMyDayOk(cohost, pulled.id, 'UTC', 'the survivor\'s pull')

    await connect(app.db, soleHost.id, departing.id)
    const twoFolderId = await createFolder(soleHost, 'p5 ac136 down to one')
    await addMemberOk(soleHost, twoFolderId, departing.id)
    const wasUnassigned = await createTaskOk(
      soleHost,
      {
        title: 'p5 ac136 nobody\'s yet',
        folder_id: twoFolderId,
        assignee_id: null,
      },
      'a two-member folder admits an unassigned task (spec 7.6, INV-5)',
    )
    const wasDepartings = await createTaskOk(
      soleHost,
      {
        title: 'p5 ac136 the leaver\'s',
        folder_id: twoFolderId,
        assignee_id: departing.id,
      },
      'and one assigned to the member about to go (spec 7.6)',
    )

    staged = {
      departing,
      host,
      cohost,
      soleHost,
      threeFolderId,
      twoFolderId,
      assignedId: assigned.id,
      pulledId: pulled.id,
      wasUnassignedId: wasUnassigned.id,
      wasDepartingsId: wasDepartings.id,
    }
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

describe('AC-136: deletion leaves every guest folder as a clean leave would', () => {
  test('AC-136: memberships gone, assignments unassigned, pulls deleted', async () => {
    const { departing, host, cohost, threeFolderId, assignedId, pulledId } =
      await stage()
    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )

    expect(
      [...(await membershipUserIds(app.db, threeFolderId))].sort(),
      '8.10 step 4: the departed member\'s membership is removed, the survivors\' stand (INV-10)',
    ).toEqual([host.id, cohost.id].sort())

    const task = await requireTaskRow(app.db, assignedId)
    expect(
      task.assignee_id,
      'R-CLEAN unassigns the leaver\'s tasks; with two members left, no INV-5 sweep reassigns them (spec 5.3)',
    ).toBeNull()

    const pulls = await myDayRows(app.db, pulledId)
    expect(
      pulls.map((entry) => String(entry.user_id)),
      'the leaver\'s My Day entry is gone and the survivor\'s pull is untouched: R-CLEAN scopes by user and folder, never by task alone (spec 5.3, 4.7)',
    ).toEqual([cohost.id])
  })

  test('AC-136: the folder dropped to one member is fully swept to them', async () => {
    const { departing, soleHost, twoFolderId, wasUnassignedId, wasDepartingsId } =
      await stage()
    expect(
      await membershipUserIds(app.db, twoFolderId),
      'the two-member folder is down to its host',
    ).toEqual([soleHost.id])
    expect(
      (await requireTaskRow(app.db, wasUnassignedId)).assignee_id,
      'INV-5\'s sweep: the always-unassigned task belongs to the remaining member now (spec 5.3, R-CLEAN\'s third clause)',
    ).toBe(soleHost.id)
    expect(
      (await requireTaskRow(app.db, wasDepartingsId)).assignee_id,
      'and so does the one the leaver held: unassigned by the first clause, swept by the third, one transaction',
    ).toBe(soleHost.id)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folder_members WHERE user_id = ${departing.id}`,
      ),
      'no membership of the departed account remains anywhere (spec 8.10 step 4)',
    ).toBe(0)
    expect(
      await myDayCountForUser(app.db, departing.id),
      'and no My Day entry either, R-CLEAN per folder plus step 6\'s remainder sweep',
    ).toBe(0)
  })

  test('AC-136 adversarial: removal never deletes a task', async () => {
    const { assignedId, pulledId, wasUnassignedId, wasDepartingsId } =
      await stage()
    for (const taskId of [assignedId, pulledId, wasUnassignedId, wasDepartingsId]) {
      await requireTaskRow(app.db, taskId)
    }
  })

  test('AC-136: invariants hold afterwards', async () => {
    const { host, cohost, soleHost, threeFolderId, twoFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [threeFolderId, twoFolderId],
      [host.id, cohost.id, soleHost.id],
    )
  })
})

/*
AC-018: given a non-owner member leaves, then the same cleanup as removal
runs.

Same cleanup means R-CLEAN (5.3), entered through the other legal shape of
the endpoint: the member deletes their own membership. The assertions
mirror AC-016 deliberately, because "the same" is the criterion: assigned
tasks unassign across statuses, the leaver's My Day entries for the folder
go while everyone else's stay, the leaver's pending invites stand, access
ends with a 404. On top of that, the leave that drops a second folder to
one member must run the INV-5 sweep, proving the sweep rides R-CLEAN and
not just the owner-removal path.

Spec: 3 (INV-5), 5.3, 7.0, 7.4.
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
  folderInList,
  membershipUserIds,
  removeMember,
  seedInvite,
  seedMyDayEntry,
  seedTask,
  taskAssignee,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'leaver', 'bystander'])

interface Stage {
  owner: Actor
  leaver: Actor
  bystander: Actor
  folderId: string
  duoFolderId: string
  pendingAssigned: string
  completedAssigned: string
  duoUnassigned: string
  leaverInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, leaver, bystander] = await cast.of(app)
    if (owner === undefined || leaver === undefined || bystander === undefined) {
      throw new Error('cast must produce three actors')
    }
    const db = app.db
    await connect(db, owner.id, leaver.id)
    await connect(db, owner.id, bystander.id)
    const folderId = await createFolder(owner, 'p2 ac018 trio')
    await addMemberOk(owner, folderId, leaver.id)
    await addMemberOk(owner, folderId, bystander.id)
    // The two-member folder whose leave must trigger the INV-5 sweep.
    const duoFolderId = await createFolder(owner, 'p2 ac018 duo')
    await addMemberOk(owner, duoFolderId, leaver.id)

    const pendingAssigned = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      assigneeId: leaver.id,
    })
    const completedAssigned = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      status: 'completed',
      assigneeId: leaver.id,
    })
    const duoUnassigned = await seedTask(db, {
      folderId: duoFolderId,
      createdBy: owner.id,
    })
    await seedMyDayEntry(db, pendingAssigned, leaver.id)
    await seedMyDayEntry(db, pendingAssigned, bystander.id)
    const leaverInviteId = await seedInvite(db, {
      inviterId: leaver.id,
      folderId,
    })

    staged = {
      owner,
      leaver,
      bystander,
      folderId,
      duoFolderId,
      pendingAssigned,
      completedAssigned,
      duoUnassigned,
      leaverInviteId,
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

describe('AC-018: leaving runs the removal cleanup', () => {
  test('AC-018: the member leaves through their own membership, 204', async () => {
    const { leaver, folderId } = await stage()
    const response = await removeMember(leaver, folderId, leaver.id)
    expectStatus(
      response,
      204,
      'DELETE /folders/:id/members/:self is the leave shape and must answer 204 (spec 7.4, 5.3)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the leaver membership must be gone (spec 5.3)',
    ).not.toContain(leaver.id)
  })

  test('AC-018: the leaver assignments are unassigned across statuses', async () => {
    const { pendingAssigned, completedAssigned } = await stage()
    expect(
      await taskAssignee(app.db, pendingAssigned),
      'the pending assignment must be unassigned, same as removal (5.3 R-CLEAN)',
    ).toBeNull()
    expect(
      await taskAssignee(app.db, completedAssigned),
      'the completed assignment must be unassigned, same as removal (5.3 R-CLEAN)',
    ).toBeNull()
  })

  test('AC-018: the leaver My Day entries go, the bystander ones stay', async () => {
    const { leaver, bystander, pendingAssigned } = await stage()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${pendingAssigned} AND user_id = ${leaver.id}`,
      ),
      'the leaver entry must be deleted, same as removal (5.3 R-CLEAN)',
    ).toBe(0)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${pendingAssigned} AND user_id = ${bystander.id}`,
      ),
      'the bystander entry must survive (5.3 R-CLEAN)',
    ).toBe(1)
  })

  test('AC-018: access ends and the pending invite stands', async () => {
    const { leaver, folderId, leaverInviteId } = await stage()
    const probe = await leaver.browser.api(`/folders/${folderId}`)
    expectStatus(
      probe,
      404,
      'the departed member must read the folder as nonexistent (spec 7.0)',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
            WHERE id = ${leaverInviteId} AND status = 'pending'`,
      ),
      'R-CLEAN leaves the leaver pending invites standing (5.3)',
    ).toBe(1)
  })

  test('AC-018 adversarial: leaving again reads 404, membership is gone', async () => {
    const { leaver, folderId } = await stage()
    const response = await removeMember(leaver, folderId, leaver.id)
    expectStatus(
      response,
      404,
      'a non-member acting on the folder reads it as nonexistent (spec 7.0, 10.2)',
    )
  })

  test('AC-018 adversarial: a leave that drops a folder to one member runs the sweep', async () => {
    const { owner, leaver, duoFolderId, duoUnassigned } = await stage()
    const response = await removeMember(leaver, duoFolderId, leaver.id)
    expectStatus(
      response,
      204,
      'the leave from the two-member folder must answer 204 (spec 7.4)',
    )
    expect(
      await taskAssignee(app.db, duoUnassigned),
      'the INV-5 sweep rides R-CLEAN on the leave path too (spec 3, 5.3)',
    ).toBe(owner.id)
  })

  test('AC-018: invariants hold afterwards', async () => {
    const { owner, leaver, bystander, folderId, duoFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId, duoFolderId],
      [owner.id, leaver.id, bystander.id],
    )
  })
})

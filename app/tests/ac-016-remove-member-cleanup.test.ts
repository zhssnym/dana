/*
AC-016: given the owner removes a member holding assigned tasks, then those
tasks are unassigned, the member's My Day entries for the folder's tasks are
deleted, and their access ends.

R-CLEAN (5.3) is the block under test, and its edges are where an
implementation cuts corners: the unassignment covers the leaver's assigned
tasks with no status carve-out (a completed task assigned to the leaver
unassigns too); only the leaver's My Day entries go, and only for this
folder's tasks; the leaver's pending invites for the folder explicitly
remain; and nothing in another folder moves. The folder here holds three
members so the removal does not drop it to one, which would trigger the
INV-5 sweep and make unassignment unobservable; that sweep is AC-017's.

Spec: 5.3, 5.4, 7.4, 8.8.
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
  otherFolderId: string
  pendingAssigned: string
  completedAssigned: string
  bystanderTask: string
  otherFolderTask: string
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
    const folderId = await createFolder(owner, 'p2 ac016 shared')
    await addMemberOk(owner, folderId, leaver.id)
    await addMemberOk(owner, folderId, bystander.id)
    // A second shared folder proving the cleanup is scoped to one folder.
    const otherFolderId = await createFolder(owner, 'p2 ac016 other')
    await addMemberOk(owner, otherFolderId, leaver.id)

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
    const bystanderTask = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      assigneeId: bystander.id,
    })
    const otherFolderTask = await seedTask(db, {
      folderId: otherFolderId,
      createdBy: owner.id,
      assigneeId: leaver.id,
    })
    await seedMyDayEntry(db, pendingAssigned, leaver.id)
    await seedMyDayEntry(db, pendingAssigned, bystander.id)
    await seedMyDayEntry(db, otherFolderTask, leaver.id)
    const leaverInviteId = await seedInvite(db, {
      inviterId: leaver.id,
      folderId,
    })

    staged = {
      owner,
      leaver,
      bystander,
      folderId,
      otherFolderId,
      pendingAssigned,
      completedAssigned,
      bystanderTask,
      otherFolderTask,
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

describe('AC-016: removing a member runs R-CLEAN for exactly that member', () => {
  test('AC-016 adversarial: a non-owner member cannot remove another member', async () => {
    const { bystander, leaver, folderId } = await stage()
    const response = await removeMember(bystander, folderId, leaver.id)
    expectStatus(
      response,
      403,
      'removing another member is owner-only (spec 5.4: no (403))',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the refused removal must leave the membership standing (spec 5.4)',
    ).toContain(leaver.id)
  })

  test('AC-016: the owner removes the member, 204', async () => {
    const { owner, leaver, folderId } = await stage()
    const response = await removeMember(owner, folderId, leaver.id)
    expectStatus(
      response,
      204,
      'DELETE /folders/:id/members/:userId by the owner must answer 204 (spec 7.4)',
    )
  })

  test('AC-016: the tasks assigned to the removed member are unassigned, all statuses', async () => {
    const { pendingAssigned, completedAssigned, bystanderTask } = await stage()
    expect(
      await taskAssignee(app.db, pendingAssigned),
      'the pending task assigned to the leaver must be unassigned (5.3 R-CLEAN)',
    ).toBeNull()
    expect(
      await taskAssignee(app.db, completedAssigned),
      'R-CLEAN names the leaver assigned tasks with no status carve-out, so the completed one unassigns too (5.3)',
    ).toBeNull()
    expect(
      await taskAssignee(app.db, bystanderTask),
      'another member assignments must not move (5.3 R-CLEAN)',
    ).toBe((await stage()).bystander.id)
  })

  test('AC-016: only the removed member My Day entries for this folder are gone', async () => {
    const { leaver, bystander, pendingAssigned, otherFolderTask } = await stage()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${pendingAssigned} AND user_id = ${leaver.id}`,
      ),
      'the leaver entry for the folder task must be deleted (5.3 R-CLEAN)',
    ).toBe(0)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${pendingAssigned} AND user_id = ${bystander.id}`,
      ),
      'the bystander entry for the same task must survive (5.3 R-CLEAN)',
    ).toBe(1)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries
            WHERE task_id = ${otherFolderTask} AND user_id = ${leaver.id}`,
      ),
      'the leaver entry in the other folder must survive (5.3 R-CLEAN)',
    ).toBe(1)
  })

  test('AC-016: access ends for the removed member and only for them', async () => {
    const { owner, leaver, bystander, folderId, otherFolderId } = await stage()
    const probe = await leaver.browser.api(`/folders/${folderId}`)
    expectStatus(
      probe,
      404,
      'the removed member must read the folder as nonexistent (spec 7.0, 10.2)',
    )
    expect(
      await folderInList(leaver, folderId),
      'the folder must leave the removed member list (spec 7.4)',
    ).toBeUndefined()
    expect(
      await folderInList(leaver, otherFolderId),
      'the other shared folder must remain accessible (5.3 R-CLEAN is per folder)',
    ).toBeDefined()
    for (const viewer of [owner, bystander]) {
      expect(
        await folderInList(viewer, folderId),
        'remaining members must keep their access (spec 5.3)',
      ).toBeDefined()
    }
    expect(
      await taskAssignee(app.db, (await stage()).otherFolderTask),
      'the leaver assignment in the other folder must stand (5.3 R-CLEAN)',
    ).toBe(leaver.id)
  })

  test('AC-016 adversarial: the removed member pending invite for the folder remains valid', async () => {
    const { leaverInviteId } = await stage()
    const found = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM invites
          WHERE id = ${leaverInviteId} AND status = 'pending'`,
    )
    expect(
      found,
      'R-CLEAN leaves the leaver pending invites for the folder standing (5.3)',
    ).toBe(1)
  })

  test('AC-016: the membership rows that remain are the owner and the bystander', async () => {
    const { owner, bystander, folderId } = await stage()
    expect(
      (await membershipUserIds(app.db, folderId)).sort(),
      'exactly the two remaining memberships must exist (INV-10)',
    ).toEqual([owner.id, bystander.id].sort())
  })

  test('AC-016: invariants hold afterwards', async () => {
    const { owner, leaver, bystander, folderId, otherFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId, otherFolderId],
      [owner.id, leaver.id, bystander.id],
    )
  })
})

/*
AC-014: given the owner deletes a custom folder, when the transaction ends,
then the folder, its tasks of all statuses, steps, My Day entries,
reminders, and pending folder invites are gone, and the response counts
match what was deleted.

Section 8.8 makes the deletion one transaction and 7.4 fixes the response as
200 { deleted: {tasks_open, tasks_completed, tasks_abandoned} }. The counts
are the dialog's promise, so they are asserted exactly, and 8.11's rule that
abandoned rows count on neither side of the folder ratio is asserted on the
way in, against the same rows the deletion will count.

Everything here rides a control folder alongside: a deletion that sweeps too
widely is the failure a cascade test exists to catch, so every gone
assertion has a still-there twin.

Spec: 7.0, 7.4, 8.8, 8.11.
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
  seedInvite,
  seedMyDayEntry,
  seedReminder,
  seedStep,
  seedTask,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member'])

interface Stage {
  owner: Actor
  member: Actor
  folderId: string
  controlFolderId: string
  doomedTaskIds: string[]
  controlTaskId: string
  doomedInviteIds: string[]
  bareInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member] = await cast.of(app)
    if (owner === undefined || member === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'p2 ac014 doomed')
    const controlFolderId = await createFolder(owner, 'p2 ac014 control')
    await addMemberOk(owner, folderId, member.id)

    const db = app.db
    // Two open, one completed, one abandoned: the exact counts the response
    // must echo, with 8.11's abandoned exclusion observable before.
    const pendingAssigned = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      assigneeId: member.id,
      dueDate: '2026-08-10',
      dueTime: '09:30',
    })
    const pendingUnassigned = await seedTask(db, {
      folderId,
      createdBy: owner.id,
    })
    const completed = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      status: 'completed',
    })
    const abandoned = await seedTask(db, {
      folderId,
      createdBy: owner.id,
      status: 'abandoned',
    })
    await seedStep(db, pendingAssigned, 1)
    await seedStep(db, pendingAssigned, 2)
    await seedStep(db, completed, 1)
    await seedMyDayEntry(db, pendingAssigned, member.id)
    await seedMyDayEntry(db, pendingUnassigned, owner.id)
    await seedReminder(db, pendingAssigned, owner.id)

    // Pending folder invites, one carrying a task, and one already terminal:
    // the invites.folder_id cascade removes them all with the folder (4.9).
    const doomedInviteIds = [
      await seedInvite(db, { inviterId: owner.id, folderId }),
      await seedInvite(db, {
        inviterId: member.id,
        folderId,
        taskId: pendingUnassigned,
      }),
      await seedInvite(db, {
        inviterId: owner.id,
        folderId,
        status: 'declined',
      }),
    ]
    // Controls: a bare invite from the same inviter, and a full second
    // folder, both of which the transaction must not touch.
    const bareInviteId = await seedInvite(db, { inviterId: owner.id })
    const controlTaskId = await seedTask(db, {
      folderId: controlFolderId,
      createdBy: owner.id,
      assigneeId: owner.id,
    })
    await seedStep(db, controlTaskId, 1)
    await seedMyDayEntry(db, controlTaskId, owner.id)
    await seedReminder(db, controlTaskId, owner.id)

    staged = {
      owner,
      member,
      folderId,
      controlFolderId,
      doomedTaskIds: [pendingAssigned, pendingUnassigned, completed, abandoned],
      controlTaskId,
      doomedInviteIds,
      bareInviteId,
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

describe('AC-014: deleting a custom folder removes everything it holds', () => {
  test('AC-014 adversarial: the folder counts exclude abandoned rows before the delete', async () => {
    // 8.11: abandoned counts on neither side. Asserted against the same
    // rows the deletion response will classify, so the two readings of the
    // folder cannot disagree.
    const { owner, folderId } = await stage()
    const entry = await folderInList(owner, folderId)
    expect(
      entry?.counts,
      'the Folder object carries counts {pending, completed} (spec 7.0, 8.11)',
    ).toEqual({ pending: 2, completed: 1 })
  })

  test('AC-014: the delete answers 200 with the exact deleted counts', async () => {
    const { owner, folderId } = await stage()
    const response = await owner.browser.api(`/folders/${folderId}`, {
      method: 'DELETE',
    })
    expectStatus(
      response,
      200,
      'DELETE /folders/:id by the owner must answer 200 (spec 7.4)',
    )
    const body = response.json() as { deleted?: unknown }
    expect(
      body.deleted,
      'the response counts must match what was deleted (spec 7.4: tasks_open, tasks_completed, tasks_abandoned)',
    ).toEqual({ tasks_open: 2, tasks_completed: 1, tasks_abandoned: 1 })
  })

  test('AC-014: the folder and every dependent row are gone', async () => {
    const { folderId, doomedTaskIds } = await stage()
    const db = app.db

    expect(
      await countRows(
        db,
        sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}`,
      ),
      'the folder row must be gone (spec 8.8)',
    ).toBe(0)
    expect(
      await countRows(
        db,
        sql`SELECT count(*)::int AS n FROM folder_members WHERE folder_id = ${folderId}`,
      ),
      'its memberships must be gone (spec 8.8)',
    ).toBe(0)

    for (const taskId of doomedTaskIds) {
      expect(
        await countRows(
          db,
          sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${taskId}`,
        ),
        'tasks of every status must be gone (spec 8.8)',
      ).toBe(0)
      expect(
        await countRows(
          db,
          sql`SELECT count(*)::int AS n FROM steps WHERE task_id = ${taskId}`,
        ),
        'steps must be gone with their tasks (spec 8.8)',
      ).toBe(0)
      expect(
        await countRows(
          db,
          sql`SELECT count(*)::int AS n FROM my_day_entries WHERE task_id = ${taskId}`,
        ),
        'My Day entries must be gone with their tasks (spec 8.8)',
      ).toBe(0)
      expect(
        await countRows(
          db,
          sql`SELECT count(*)::int AS n FROM reminders WHERE task_id = ${taskId}`,
        ),
        'reminders must be gone with their tasks (spec 8.8)',
      ).toBe(0)
    }
  })

  test('AC-014: the folder invites are gone and the bare invite survives', async () => {
    const { doomedInviteIds, bareInviteId } = await stage()
    for (const inviteId of doomedInviteIds) {
      expect(
        await countRows(
          app.db,
          sql`SELECT count(*)::int AS n FROM invites WHERE id = ${inviteId}`,
        ),
        'invites carrying the folder must cascade away (spec 4.9, 8.8)',
      ).toBe(0)
    }
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites WHERE id = ${bareInviteId}`,
      ),
      'a bare invite from the same inviter must survive (spec 8.8)',
    ).toBe(1)
  })

  test('AC-014: the deleted folder reads as nonexistent for everyone', async () => {
    const { owner, member, folderId } = await stage()
    for (const viewer of [owner, member]) {
      const probe = await viewer.browser.api(`/folders/${folderId}`)
      expectStatus(
        probe,
        404,
        'a deleted folder reads 404 for owner and ex-member alike (spec 7.0)',
      )
    }
  })

  test('AC-014 adversarial: the control folder kept every row', async () => {
    const { owner, controlFolderId, controlTaskId } = await stage()
    const db = app.db
    expect(
      await folderInList(owner, controlFolderId),
      'the other folder must be untouched (spec 8.8)',
    ).toBeDefined()
    for (const [table, column] of [
      ['tasks', 'id'],
      ['steps', 'task_id'],
      ['my_day_entries', 'task_id'],
      ['reminders', 'task_id'],
    ] as const) {
      expect(
        await countRows(
          db,
          sql`
            SELECT count(*)::int AS n FROM ${sql.raw(table)}
            WHERE ${sql.raw(column)} = ${controlTaskId}
          `,
        ),
        `the control folder's ${table} rows must survive (spec 8.8)`,
      ).toBeGreaterThan(0)
    }
  })

  test('AC-014: invariants hold afterwards', async () => {
    const { owner, member, controlFolderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [controlFolderId],
      [owner.id, member.id],
    )
  })
})

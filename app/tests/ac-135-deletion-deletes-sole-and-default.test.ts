/*
AC-135: Given DELETE /me, then the default folder and every owned folder
without other members are deleted with the full 8.8 cascade: their tasks of
all statuses, steps, My Day entries, reminders, and pending invites carrying
them are gone.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text. This file proposed it, the AC-125 to AC-130 precedent for a batch
authored with its tests and numbered additively at a mid-package change
control. Routed by the RFC 0001 P5 row's kickoff decision: 8.10's steps
1 to 6, outcome by outcome, and this is step 3's.

Step 3's scope is what the fixture spells out: the default folder always
dies (INV-2 forbids it transferring, which is why 8.10 orders transfer
before deletion and the RESTRICT tripwire of 4.3 watches the order), and a
custom folder dies exactly when no other member remains. So a sole-member
custom folder loaded with every cascade target goes, while a shared folder
survives by transfer and is this file's control. The invite distinction
matters here: a pending invite carrying the dying folder is removed by FK
cascade, 5.2's folder-deleted row, not invalidated, which is step 1's
outcome on invites that survive (AC-133's half of the pair).

The load is built through the merged P2 and P3 surfaces while the departing
session is alive, tasks in all three statuses, steps, a My Day pull; the
reminder and the invite rows are seeded, P7's and this package's surfaces
respectively, the standing precedent for surfaces the acting package does
not deliver.

DELETE /me is the P1 stub today, steps 7 and 8, so this file fails on the
default folder and its load surviving: wrong behavior, not absence.

Spec: 8.10 step 3, 8.8 (the cascade, counted there for 7.4's response,
uncounted here), INV-2, 4.3, 5.2 (folder-deleted row), 4.5 to 4.9.
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
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  seedInvite,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { deleteAccount, freshEmail, requireInviteRow } from './sharing-harness.js'
import {
  addStepOk,
  createTaskOk,
  pullIntoMyDayOk,
  seedOffsetReminder,
  stepRows,
  taskRow,
  transitionOk,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'survivor'], 'p5')

interface Stage {
  departing: Actor
  survivor: Actor
  defaultFolderId: string
  soloFolderId: string
  sharedFolderId: string
  /** The solo folder's load: pending, completed, abandoned. */
  pendingId: string
  completedId: string
  abandonedId: string
  inboxTaskId: string
  sharedTaskId: string
  dyingInviteId: string
  survivingInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing, survivor] = await cast.of(app)
    if (departing === undefined || survivor === undefined) {
      throw new Error('cast must produce two actors')
    }
    const defaultFolderId = await defaultFolderOf(app.db, departing.id)
    const soloFolderId = await createFolder(departing, 'p5 ac135 dying')
    await connect(app.db, departing.id, survivor.id)
    const sharedFolderId = await createFolder(departing, 'p5 ac135 surviving')
    await addMemberOk(departing, sharedFolderId, survivor.id)

    const pending = await createTaskOk(
      departing,
      {
        title: 'p5 ac135 pending load',
        folder_id: soloFolderId,
        due_date: '2026-11-05',
        due_time: '10:00',
      },
      'the dated pending task must be creatable (spec 7.6)',
    )
    await addStepOk(departing, pending.id, 'a step to cascade')
    await pullIntoMyDayOk(
      departing,
      pending.id,
      'UTC',
      'the owner\'s own pull loads my_day_entries',
    )
    await seedOffsetReminder(app.db, pending.id, departing.id, 45)

    const completed = await createTaskOk(
      departing,
      { title: 'p5 ac135 completed load', folder_id: soloFolderId },
      'the second task must be creatable (spec 7.6)',
    )
    await transitionOk(
      departing,
      completed.id,
      'complete',
      'completing it loads the completed status (spec 5.1)',
    )
    const abandoned = await createTaskOk(
      departing,
      { title: 'p5 ac135 abandoned load', folder_id: soloFolderId },
      'the third task must be creatable (spec 7.6)',
    )
    await transitionOk(
      departing,
      abandoned.id,
      'abandon',
      'abandoning it loads the third status (spec 5.1)',
    )

    const inboxTask = await createTaskOk(
      departing,
      { title: 'p5 ac135 inbox load' },
      'a task in the default folder, which dies with it (spec 7.6, 8.10 step 3)',
    )
    const sharedTask = await createTaskOk(
      departing,
      { title: 'p5 ac135 shared load', folder_id: sharedFolderId },
      'the control: a task in the folder that survives by transfer (spec 7.6)',
    )

    const dyingInviteId = await seedInvite(app.db, {
      inviterId: departing.id,
      email: freshEmail('ac135-dying'),
      folderId: soloFolderId,
    })
    const survivingInviteId = await seedInvite(app.db, {
      inviterId: departing.id,
      email: freshEmail('ac135-surviving'),
      folderId: sharedFolderId,
    })

    staged = {
      departing,
      survivor,
      defaultFolderId,
      soloFolderId,
      sharedFolderId,
      pendingId: pending.id,
      completedId: completed.id,
      abandonedId: abandoned.id,
      inboxTaskId: inboxTask.id,
      sharedTaskId: sharedTask.id,
      dyingInviteId,
      survivingInviteId,
    }
  }
  return staged
}

async function folderExists(folderId: string): Promise<boolean> {
  return (
    (await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}`,
    )) === 1
  )
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-135: deletion takes the folders only this account could see', () => {
  test('AC-135: the default and sole-member folders are gone, the shared one is not', async () => {
    const { departing, defaultFolderId, soloFolderId, sharedFolderId } =
      await stage()
    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )
    expect(
      await folderExists(defaultFolderId),
      '8.10 step 3: the default folder is deleted, never transferred (INV-2)',
    ).toBe(false)
    expect(
      await folderExists(soloFolderId),
      'and so is every owned folder without other members',
    ).toBe(false)
    expect(
      await folderExists(sharedFolderId),
      'while the shared folder survived by step 2\'s transfer: step 3 reads "now without other members" after the transfers ran',
    ).toBe(true)
  })

  test('AC-135: the cascade took the load with the folders', async () => {
    const { pendingId, completedId, abandonedId, inboxTaskId, sharedTaskId } =
      await stage()
    for (const [label, taskId] of [
      ['the pending task', pendingId],
      ['the completed task', completedId],
      ['the abandoned task', abandonedId],
      ['the default folder\'s task', inboxTaskId],
    ] as const) {
      expect(
        await taskRow(app.db, taskId),
        `${label} is gone with its folder: 8.8 cascades tasks of all statuses`,
      ).toBeUndefined()
    }
    expect(
      await stepRows(app.db, pendingId),
      'steps cascade through their task (4.6)',
    ).toEqual([])
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM my_day_entries WHERE task_id = ${pendingId}`,
      ),
      'My Day entries cascade through their task (4.7)',
    ).toBe(0)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM reminders WHERE task_id = ${pendingId}`,
      ),
      'the reminder cascades through its task (4.8)',
    ).toBe(0)
    expect(
      await taskRow(app.db, sharedTaskId),
      'and the surviving folder keeps its work: the cascade is scoped to the folders step 3 deletes',
    ).toBeDefined()
  })

  test('AC-135: the dying folder\'s invite is removed, the surviving one\'s is not', async () => {
    const { dyingInviteId, survivingInviteId, sharedFolderId } = await stage()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites WHERE id = ${dyingInviteId}`,
      ),
      'a pending invite carrying a deleted folder is removed by FK cascade, 5.2\'s folder-deleted row: invalidation is for rows that survive',
    ).toBe(0)
    const surviving = await requireInviteRow(app.db, survivingInviteId)
    expect(
      surviving.status,
      'the transferred folder\'s invite survives as step 1 left it: invalidated (AC-133\'s outcome, the pair this distinction completes)',
    ).toBe('invalidated')
    expect(surviving.folder_id, 'still carrying its folder').toBe(sharedFolderId)
  })

  test('AC-135: invariants hold afterwards', async () => {
    const { survivor, sharedFolderId } = await stage()
    await expectFolderInvariants(app.db, [sharedFolderId], [survivor.id])
  })
})

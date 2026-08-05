/*
AC-042: given a task deletion, then its steps, My Day entries, and reminder
are gone and any invite task_id pointing at it is null.

Four dependents, three of which cascade away and one of which must survive
with a hole in it. That asymmetry is the criterion: 4.9 gives invites.task_id
ON DELETE SET NULL rather than CASCADE, because the invite is a message to a
person and outlives the task it happened to carry, while 4.6, 4.7 and 4.8
all cascade because they are parts of the task itself. An implementation
that deletes children by hand and forgets one, or that leans on a cascade
the migration did not declare, fails on whichever it got wrong, so all four
are asserted separately.

The invite row is seeded directly, P5's surface: the P3 kickoff recorded
that this cascade is the whole of this package's reach into invites, and it
is a database behavior named in 5.1's delete row and present in migration
0000 since P0.

Attacked beside the criterion: deleting the same task twice, where 8.3 says
operations on deleted rows answer 404; the read after the delete, likewise;
a delete by somebody who cannot see the task, which must be 404 under the
leak rule and must leave the task alone; and the folder and its other
tasks, which a delete has no business touching.

Spec: 5.1 (the delete row and its cascades), 7.6 (DELETE /tasks/:id, 204),
8.3 (deleted rows answer 404), 10.2, 4.6, 4.7, 4.8, 4.9.
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
  expectStatus,
  seedInvite,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  addStepOk,
  createTaskOk,
  deleteTask,
  expectTaskInvariants,
  getTask,
  myDayRows,
  pullIntoMyDay,
  reminderRow,
  seedOffsetReminder,
  stepRows,
  taskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'second', 'stranger'], 'p3')

interface Stage {
  owner: Actor
  second: Actor
  stranger: Actor
  folderId: string
  strangerFolderId: string
  survivorId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second, stranger] = await cast.of(app)
    if (owner === undefined || second === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, second.id)
    const folderId = await createFolder(owner, 'p3 ac042 shared')
    await addMemberOk(owner, folderId, second.id)
    const strangerFolderId = await createFolder(stranger, 'p3 ac042 elsewhere')
    const survivor = await createTaskOk(
      owner,
      { title: 'p3 ac042 untouched neighbour', folder_id: folderId },
      'the neighbouring task must be creatable (spec 7.6)',
    )
    staged = {
      owner,
      second,
      stranger,
      folderId,
      strangerFolderId,
      survivorId: survivor.id,
    }
  }
  return staged
}

interface Fixture {
  taskId: string
  inviteId: string
}

/** A task carrying all four dependents: two steps, two members' My Day
 * entries, a reminder, and a pending invite pointing at it. */
async function loadedTask(label: string): Promise<Fixture> {
  const { owner, second, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p3 ac042 ${label}`,
      folder_id: folderId,
      due_date: '2026-10-12',
      due_time: '09:00',
    },
    'the task to delete must be creatable (spec 7.6)',
  )
  await addStepOk(owner, created.id, 'first step')
  await addStepOk(owner, created.id, 'second step')
  expectStatus(
    await pullIntoMyDay(owner, created.id),
    200,
    'the owner\'s pull must succeed (spec 7.8)',
  )
  expectStatus(
    await pullIntoMyDay(second, created.id),
    200,
    'the second member\'s pull must succeed (spec 7.8)',
  )
  await seedOffsetReminder(app.db, created.id, owner.id, 60)
  const inviteId = await seedInvite(app.db, {
    inviterId: owner.id,
    folderId,
    taskId: created.id,
  })
  return { taskId: created.id, inviteId }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-042: deleting a task takes its parts and spares the invite', () => {
  test('AC-042: the fixture really carries all four dependents', async () => {
    const { taskId, inviteId } = await loadedTask('premise')
    expect((await stepRows(app.db, taskId)).length, 'two steps').toBe(2)
    expect((await myDayRows(app.db, taskId)).length, 'two pulls').toBe(2)
    expect(await reminderRow(app.db, taskId), 'one reminder').toBeDefined()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE id = ${inviteId} AND task_id = ${taskId}`,
      ),
      'one invite pointing at the task',
    ).toBe(1)
  })

  test('AC-042: the delete answers 204 and the task is gone', async () => {
    const { owner } = await stage()
    const { taskId } = await loadedTask('gone')
    const response = await deleteTask(owner, taskId)
    expectStatus(
      response,
      204,
      'any member may delete a task, and 7.6 answers 204',
    )
    expect(
      await taskRow(app.db, taskId),
      'the row is gone, not marked',
    ).toBeUndefined()
  })

  test('AC-042: steps, My Day entries, and the reminder are gone', async () => {
    const { owner } = await stage()
    const { taskId } = await loadedTask('cascade')
    await deleteTask(owner, taskId)
    expect(
      await stepRows(app.db, taskId),
      '5.1: the delete cascades steps (4.6 ON DELETE CASCADE)',
    ).toEqual([])
    expect(
      await myDayRows(app.db, taskId),
      '5.1: the delete cascades my_day_entries (4.7 ON DELETE CASCADE), both members\'',
    ).toEqual([])
    expect(
      await reminderRow(app.db, taskId),
      '5.1: the delete cascades the reminder (4.8 ON DELETE CASCADE)',
    ).toBeUndefined()
  })

  test('AC-042: the invite survives with task_id null', async () => {
    const { owner, folderId } = await stage()
    const { taskId, inviteId } = await loadedTask('invite')
    await deleteTask(owner, taskId)
    const found = await countRows(
      app.db,
      sql`SELECT count(*)::int AS n FROM invites WHERE id = ${inviteId}`,
    )
    expect(
      found,
      '4.9 gives task_id ON DELETE SET NULL, not CASCADE: the invite is a message to a person and outlives the task',
    ).toBe(1)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE id = ${inviteId} AND task_id IS NULL AND folder_id = ${folderId}
               AND status = 'pending'`,
      ),
      'and it keeps its folder and its pending status, losing only the task it carried',
    ).toBe(1)
  })

  test('AC-042 adversarial: deleting or reading it again answers 404', async () => {
    const { owner } = await stage()
    const { taskId } = await loadedTask('twice')
    await deleteTask(owner, taskId)
    expectStatus(
      await deleteTask(owner, taskId),
      404,
      'operations on deleted rows return 404 and the client drops the row (spec 8.3)',
    )
    expectStatus(
      await getTask(owner, taskId),
      404,
      'a deleted task is a nonexistent task (spec 7.6, 8.3)',
    )
  })

  test('AC-042 adversarial: a non-member cannot delete, and the task survives', async () => {
    const { stranger } = await stage()
    const { taskId } = await loadedTask('guarded')
    const response = await deleteTask(stranger, taskId)
    expectStatus(
      response,
      404,
      'an inaccessible task is indistinguishable from a nonexistent one, never 403 (spec 10.2)',
    )
    expect(
      await taskRow(app.db, taskId),
      'and the refused delete deleted nothing',
    ).toBeDefined()
    expect(
      (await stepRows(app.db, taskId)).length,
      'nor any of its parts',
    ).toBe(2)
  })

  test('AC-042 adversarial: the folder and its other tasks are untouched', async () => {
    const { owner, folderId, survivorId } = await stage()
    const { taskId } = await loadedTask('neighbour')
    await deleteTask(owner, taskId)
    expect(
      await taskRow(app.db, survivorId),
      'a task delete is one row deep: the neighbour stands',
    ).toBeDefined()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}`,
      ),
      'and the folder it lived in stands',
    ).toBe(1)
  })

  test('AC-042: invariants hold afterwards', async () => {
    const { owner, second, stranger, folderId, strangerFolderId, survivorId } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [survivorId],
      [folderId, strangerFolderId],
      [owner.id, second.id, stranger.id],
    )
  })
})

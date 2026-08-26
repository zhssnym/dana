/*
AC-042 (as replaced by RFC 0005): given a task deletion, then the task
leaves the readable world and waits in Trash with its steps, My Day entries,
and reminder held for restore, the invite keeping its task_id; when the 30
day window lapses and the pass runs, then the row and those dependents are
gone and the invite survives with task_id null.

The v1 criterion asserted the dependents gone at delete time, because v1's
delete was the purge. RFC 0005 splits the act in two: DELETE marks
(deleted_at, spec 7.13) so any member can restore inside 30 days with the
task's parts intact, and the 11.7 pass is the only thing that ever removes
the rows. The four dependents still carry the asymmetry the v1 text was
built on, it just fires at purge: 4.6, 4.7 and 4.8 cascade away with the
row while 4.9's invite outlives it with a hole, because the invite is a
message to a person.

Attacked beside the criterion: deleting the same task twice, where 8.3 says
operations on deleted rows answer 404; the read after the delete, likewise;
a delete by somebody who cannot see the task, which must be 404 under the
leak rule and must change nothing; and the folder and its other tasks,
which neither the delete nor the purge has any business touching.

Spec: 5.1, 7.6 (DELETE /tasks/:id, 204), 7.13, 8.3, 10.2, 11.7 (RFC 0005),
4.6, 4.7, 4.8, 4.9.
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
import { runPass } from './reminders-harness.js'
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
    await pullIntoMyDay(owner, created.id, 'UTC'),
    200,
    'the owner\'s pull must succeed (spec 7.8)',
  )
  expectStatus(
    await pullIntoMyDay(second, created.id, 'UTC'),
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

/** Backdates the trashed row past the 30 day window so the next pass owes
 * it a purge (spec 11.7). */
async function lapseWindow(taskId: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE tasks SET deleted_at = now() - interval '31 days'
        WHERE id = ${taskId}`,
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

describe('AC-042: a delete marks, and only the pass removes', () => {
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

  test('AC-042: the delete answers 204 and the row is marked, not gone', async () => {
    const { owner } = await stage()
    const { taskId } = await loadedTask('marked')
    const response = await deleteTask(owner, taskId)
    expectStatus(
      response,
      204,
      'any member may delete a task, and 7.6 answers 204',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE id = ${taskId} AND deleted_at IS NOT NULL`,
      ),
      'the row waits in Trash with deleted_at set (spec 7.13), because a restore needs it',
    ).toBe(1)
  })

  test('AC-042: steps, My Day entries, and the reminder are held for restore', async () => {
    const { owner } = await stage()
    const { taskId, inviteId } = await loadedTask('held')
    await deleteTask(owner, taskId)
    expect(
      (await stepRows(app.db, taskId)).length,
      'the steps wait with the row: a restore that came back bare would not be a restore',
    ).toBe(2)
    expect(
      (await myDayRows(app.db, taskId)).length,
      'both members\' pulls wait with the row',
    ).toBe(2)
    expect(
      await reminderRow(app.db, taskId),
      'the reminder waits with the row',
    ).toBeDefined()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE id = ${inviteId} AND task_id = ${taskId}`,
      ),
      'the invite keeps its task_id while the task can still return',
    ).toBe(1)
  })

  test('AC-042: the lapsed window purges the parts and hollows the invite', async () => {
    const { owner, folderId } = await stage()
    const { taskId, inviteId } = await loadedTask('purged')
    await deleteTask(owner, taskId)
    await lapseWindow(taskId)
    await runPass(app)
    expect(
      await taskRow(app.db, taskId),
      'the pass removes the row at 30 days (spec 11.7)',
    ).toBeUndefined()
    expect(
      await stepRows(app.db, taskId),
      'the purge cascades steps (4.6 ON DELETE CASCADE)',
    ).toEqual([])
    expect(
      await myDayRows(app.db, taskId),
      'the purge cascades my_day_entries (4.7 ON DELETE CASCADE)',
    ).toEqual([])
    expect(
      await reminderRow(app.db, taskId),
      'the purge cascades the reminder (4.8 ON DELETE CASCADE)',
    ).toBeUndefined()
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE id = ${inviteId} AND task_id IS NULL AND folder_id = ${folderId}
               AND status = 'pending'`,
      ),
      '4.9 gives task_id ON DELETE SET NULL, not CASCADE: the invite is a message to a person and outlives the task, keeping its folder and its pending status',
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
      'a trashed task is out of the readable world; only 7.13\'s surface sees it',
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
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE id = ${taskId} AND deleted_at IS NULL`,
      ),
      'and the refused delete marked nothing',
    ).toBe(1)
    expect(
      (await stepRows(app.db, taskId)).length,
      'nor touched any of its parts',
    ).toBe(2)
  })

  test('AC-042 adversarial: the folder and its other tasks are untouched', async () => {
    const { owner, folderId, survivorId } = await stage()
    const { taskId } = await loadedTask('neighbour')
    await deleteTask(owner, taskId)
    await lapseWindow(taskId)
    await runPass(app)
    expect(
      await taskRow(app.db, survivorId),
      'a task delete is one row deep, at the mark and at the purge alike: the neighbour stands',
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

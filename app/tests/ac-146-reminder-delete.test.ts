/*
AC-146: given DELETE /tasks/:id/reminder, then 204 with no body, the row is
gone, the task is otherwise unchanged, and a repeat call answers 204 again.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now, transcribed unchanged. It is the first of the six surfaces
the RFC 0001 P7 row listed as unasserted and called that session's floor
rather than its ceiling.

**Half of frozen 7.9 had no criterion at all.** The section is two bullets and
section 12 covered one of them: AC-090 tests a PUT refusal and a delivery
recipient, and nothing anywhere names the DELETE. A route that answered 200,
or that answered 204 without deleting anything, or that failed on the second
call, would pass the entire acceptance suite. The bullet is one line and every
word in it is a rule: 204, and idempotent.

**Idempotent has two shapes and both are tested.** A repeat DELETE on a task
whose reminder is already gone, and a first DELETE on a task that never had
one. The second is the one an implementation written as "load the row, delete
it" gets wrong, by answering 404 for a task that plainly exists; 7.0 reserves
404 for a resource that does not exist or is not accessible, and the resource
this URL addresses is the task.

**Deleting the reminder is not the clear-date cascade.** 8.4 deletes the
reminder because the date went; this endpoint deletes the reminder and the
date stays. The two are one line apart in 8.6's list of what removes a row,
and an implementation reaching for the cascade here would take due_time and
any recurrence rule with it. So the task's own columns are compared before and
after, and only updated_at is allowed to move.

**The chokepoint is asserted on both new endpoints.** 10.2 routes every read
and write through one authorization check and 7.0 makes an inaccessible
resource answer 404 rather than 403, so a member of no folder calling this URL
must not be able to tell the task apart from one that does not exist. AC-102
generalizes this at P9; here it is asserted where a route is new.

Spec: 7.9 (the DELETE bullet, unchanged by the 2026-08-10 ruling, which the
ruling's own last sentence says), 8.6 (what deletes a reminder row), 8.4 (the
cascade this is not), 10.2, 7.0, 4.8, INV-6.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  readTask,
  requireTaskRow,
} from './tasks-harness.js'
import {
  KARACHI,
  LONDON,
  ZoneCast,
  deleteReminder,
  deleteReminderOk,
  expectNoReminderRow,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

interface Stage {
  owner: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'reminder-owner', KARACHI)
    const stranger = await cast.signIn(app, 'stranger', LONDON)
    const folderId = await createFolder(owner, 'p7 ac146')
    folderIds.push(folderId)
    staged = { owner, stranger, folderId }
  }
  return staged
}

async function timedTask(label: string): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p7 ac146 ${label}`,
      folder_id: folderId,
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '15:00',
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return created.id
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-146: the reminder DELETE, which no criterion covered', () => {
  test('AC-146: the DELETE answers 204, removes the row, and the task reads reminder null', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('deleted')
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'a reminder exists first, so the DELETE has something to remove (spec 7.9)',
    )
    await requireReminderRow(app.db, taskId, 'the positive control for this case')

    await deleteReminderOk(
      owner,
      taskId,
      'DELETE /tasks/:id/reminder must answer 204 (spec 7.9)',
    )
    await expectNoReminderRow(
      app.db,
      taskId,
      '7.9: the DELETE removes the single 4.8 row, and a 204 over a surviving row is the worst of both answers',
    )
    expect(
      (await readTask(owner, taskId)).reminder,
      '7.0 gives TaskDetail a reminder field, and with the row gone it is null',
    ).toBeNull()
  })

  test('AC-146: it is idempotent, on a second call and on a task that never had one', async () => {
    const { owner } = await stage()
    const twice = await timedTask('deleted twice')
    await putReminderOk(
      owner,
      twice,
      { offset_minutes: 30 },
      'a reminder to delete (spec 7.9)',
    )
    await deleteReminderOk(owner, twice, 'the first DELETE (spec 7.9)')
    await deleteReminderOk(
      owner,
      twice,
      '7.9 says idempotent, and 7.0 makes DELETE idempotent for the whole contract, so the second call answers 204 with nothing left to do',
    )

    const never = await timedTask('never had one')
    await expectNoReminderRow(
      app.db,
      never,
      'this task carries no reminder at all',
    )
    await deleteReminderOk(
      owner,
      never,
      'an implementation written as load-then-delete answers 404 here for a task that plainly exists; 7.0 reserves 404 for a resource that is absent or inaccessible, and the resource this URL addresses is the task',
    )
  })

  test('AC-146: the date survives, because this is not the clear-date cascade', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('date survives')
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'a reminder to delete (spec 7.9)',
    )
    const before = await requireTaskRow(app.db, taskId)

    await deleteReminderOk(owner, taskId, 'the DELETE (spec 7.9)')
    const after = await requireTaskRow(app.db, taskId)
    expect(
      {
        due_date: after.due_date,
        due_time: after.due_time,
        recurrence_rule: after.recurrence_rule,
        status: after.status,
        title: after.title,
      },
      '8.4 deletes a reminder because the date went; this endpoint deletes a reminder and the date stays. They sit one line apart in 8.6\'s list of what removes a row, and an implementation reaching for the cascade here empties due_time and any rule with it',
    ).toEqual({
      due_date: before.due_date,
      due_time: before.due_time,
      recurrence_rule: before.recurrence_rule,
      status: before.status,
      title: before.title,
    })
  })

  test('AC-146: a caller outside the folder cannot tell the task exists', async () => {
    const { owner, stranger } = await stage()
    const taskId = await timedTask('inaccessible')
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 30 },
      'a reminder the stranger must not be able to remove (spec 7.9)',
    )

    expectStatus(
      await deleteReminder(stranger, taskId),
      404,
      '10.2 routes every write through one authorization check and 7.0 makes an inaccessible resource answer 404 rather than 403, so the refusal must not confirm that the task exists',
    )
    await requireReminderRow(
      app.db,
      taskId,
      'and the refusal removed nothing',
    )
    await deleteReminderOk(
      owner,
      taskId,
      'the control on the same URL: a member deletes it (spec 7.9)',
    )
  })

  test('AC-146: invariants hold afterwards', async () => {
    const { owner, stranger } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      owner.id,
      stranger.id,
    ])
  })
})

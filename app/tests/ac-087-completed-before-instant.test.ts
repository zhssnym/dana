/*
AC-087: given the task is completed before the instant, then the scheduler
records skipped and sends nothing.

**The reminder rows here are seeded, and the transitions are requested.** This
is P6's split applied to the other half of the same problem: these criteria
are about 11.7's loop, not about 8.6's arithmetic, so a fixture written
through PUT would fail on the write path and say nothing about the pass. The
instants are moved with SQL for the same reason AC-113 moves a session expiry
and P5 moves last_sent_at, which is that a timed boundary is reached by moving
the boundary rather than by waiting at it. What the loop must do with a row is
this file's subject; what the row's instant should have been is AC-083's.

**"Sends nothing" needs a control or it is free.** A loop that sends nothing
ever satisfies the criterion perfectly, and so does a branch with no loop at
all. So the completed task's reminder and a pending task's reminder are due in
the same pass, and the pass must skip one and send the other. That single case
is the difference between asserting the rule and asserting the absence of an
implementation.

**Two clauses of 8.6 sit either side of the criterion and are asserted with
it.** The delivery predicate is `t.status != 'pending'`, so abandonment skips
exactly as completion does, and an implementation testing only for
'completed' passes the criterion and silently delivers reminders for
abandoned work. And 8.6 says the row survives completion and abandonment
untouched, so it is the status that stops delivery rather than the transition
deleting the reminder: un-completing before the instant lets it fire normally,
which is the sentence immediately after this criterion's own and which no
number asserts.

`fired_at` is asserted beside every state change, because 4.8 makes it the
column set when state leaves scheduled, and a skip recorded without it is a
row that cannot be told from one the loop never reached.

**Every count here is scoped to this file's own actors.** A pass polls every
due row in the database, which is 8.6's poll rather than anything an
implementation may narrow, and under TEST_DATABASE_URL every test file shares
one database with no fileParallelism set, so this file's pass would otherwise
claim AC-088's due rows, deliver them through this same sink and mark them
sent, reddening both files and neither for its own reason.
`reminderEmailsOf` filters the sink to the addresses this file signed in; the
reasoning and the two rejected alternatives are in reminders-harness.ts. It
weakens nothing this file asserts, since every address it cares about is one
of its own.

Spec: 8.6 (the delivery loop and its three skips; the survival and
un-complete sentences), 11.7 (the pass), 4.8 (state, fired_at), 5.1 (the
transitions), 11.10 (the sink that makes a send observable).
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
  requireTaskRow,
  transition,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  minutesAgo,
  minutesAhead,
  reminderEmailsOf,
  requireReminderRow,
  runPass,
  seedReminderRow,
  setFireAt,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'completer', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac087')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

/**
 * A pending task carrying a scheduled reminder whose instant is still ahead,
 * so "completed before the instant" is a sequence the case can then walk.
 */
async function remindedTask(label: string): Promise<string> {
  const { owner, folderId } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac087 ${label}`,
      folder_id: folderId,
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '12:00',
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
  await seedReminderRow(app.db, {
    taskId: task.id,
    createdBy: owner.id,
    offsetMinutes: 30,
    fireAt: minutesAhead(60),
  })
  return task.id
}

/** The instant arrives: the row is now due by 8.6's poll, and well inside
 * 11.7's six hour stale window, which AC-089 is about and this file is not. */
async function instantArrives(taskId: string): Promise<void> {
  await setFireAt(app.db, taskId, minutesAgo(1))
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-087: a task completed before its instant is skipped, not sent', () => {
  test('AC-087: the completed task is skipped while a pending one in the same pass is sent', async () => {
    const { owner } = await stage()
    const completed = await remindedTask('completed before the instant')
    const pending = await remindedTask('still pending')

    expectStatus(
      await transition(owner, completed, 'complete'),
      200,
      'completing a task with no recurrence rule needs no tz and answers 200 (spec 5.1, 7.6)',
    )
    await instantArrives(completed)
    await instantArrives(pending)

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)

    const skipped = await requireReminderRow(
      app.db,
      completed,
      'the reminder survives its task being completed',
    )
    expect(
      skipped.state,
      '8.6: the loop reclassifies a due reminder whose task is not pending as skipped',
    ).toBe('skipped')
    expect(
      skipped.fired_at,
      '4.8: fired_at is set when state leaves scheduled, which is what tells a skip apart from a row the pass never reached',
    ).not.toBeNull()

    const sent = await requireReminderRow(
      app.db,
      pending,
      'the pending task\'s reminder',
    )
    expect(
      sent.state,
      'the control that makes the skip mean something: a due reminder on a pending task is sent in the same pass, so "sends nothing" above is about the status and not about a loop that does nothing',
    ).toBe('sent')

    const arrived = reminderEmailsOf(app, cast).slice(before)
    expect(
      arrived.length,
      '8.6 sends the pending one and only the pending one',
    ).toBe(1)
    expect(
      arrived[0]?.to,
      'and it goes to the assignee, whom INV-5 makes the single member of this folder',
    ).toBe(owner.email)
  })

  test('AC-087: abandonment skips exactly as completion does', async () => {
    const { owner } = await stage()
    const abandoned = await remindedTask('abandoned before the instant')
    expectStatus(
      await transition(owner, abandoned, 'abandon'),
      200,
      'abandoning a task with no recurrence rule needs no tz and answers 200 (spec 5.1, 7.6)',
    )
    await instantArrives(abandoned)

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      (await requireReminderRow(app.db, abandoned, 'the reminder survives'))
        .state,
      '8.6 skips on `t.status != pending`, which is abandoned as much as completed. An implementation comparing against the string completed passes this criterion as written and delivers reminders for abandoned work',
    ).toBe('skipped')
    expect(
      reminderEmailsOf(app, cast).length - before,
      'and sends nothing for it',
    ).toBe(0)
  })

  test('AC-087: the transition leaves the reminder row untouched', async () => {
    const { owner } = await stage()
    const taskId = await remindedTask('untouched by the transition')
    const before = await requireReminderRow(app.db, taskId, 'the reminder exists')

    expectStatus(
      await transition(owner, taskId, 'complete'),
      200,
      'the completion itself (spec 5.1)',
    )
    const after = await requireReminderRow(
      app.db,
      taskId,
      '8.6: the reminder survives completion and abandonment untouched, so completing must not delete it',
    )
    expect(
      {
        offset_minutes: after.offset_minutes,
        time_of_day: after.time_of_day,
        fire_at: after.fire_at,
        state: after.state,
        fired_at: after.fired_at,
      },
      '8.6 lists what deletes a reminder row, reminder removal, the clear-date cascade and task deletion, and a transition is none of the three. Nothing about the row moves at the transition; what changes is what the loop later does with it',
    ).toEqual({
      offset_minutes: before.offset_minutes,
      time_of_day: before.time_of_day,
      fire_at: before.fire_at,
      state: 'scheduled',
      fired_at: null,
    })
  })

  test('AC-087: un-completing before the instant lets it fire normally', async () => {
    const { owner } = await stage()
    const taskId = await remindedTask('completed then reopened')
    expectStatus(
      await transition(owner, taskId, 'complete'),
      200,
      'completed first (spec 5.1)',
    )
    expectStatus(
      await transition(owner, taskId, 'uncomplete'),
      200,
      'and reopened before the instant (spec 5.1; the row carries no rule, so G-SERIES has nothing to guard)',
    )
    expect(
      String((await requireTaskRow(app.db, taskId)).status),
      'the fixture must genuinely be pending again, or this case is the first one over',
    ).toBe('pending')

    await instantArrives(taskId)
    const before = reminderEmailsOf(app, cast).length
    await runPass(app)

    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).state,
      '8.6, in the sentence after this criterion\'s own: un-completing before the instant lets it fire normally. An implementation that marked the reminder at the transition rather than at fire time has already spent it by now',
    ).toBe('sent')
    expect(
      reminderEmailsOf(app, cast).length - before,
      'and exactly one email went out for it',
    ).toBe(1)
  })

  test('AC-087: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})

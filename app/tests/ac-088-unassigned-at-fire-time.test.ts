/*
AC-088: given the task is unassigned at fire time, then skipped and logged, no
broadcast.

**"No broadcast" is the whole criterion, and a single-member folder cannot
show it.** 8.6 states the reason for the skip rather than leaving it to be
inferred: "reminders are never broadcast to a whole folder". The obvious wrong
implementation, on finding no assignee, mails everyone who can see the task,
and in a folder with one member that is indistinguishable from the right
behavior. So the fixture is a three-member folder, and the assertion is that
the pass produced no email addressed to any of the three.

**And a control in the same pass**, for the same reason AC-087 carries one: a
loop that sends nothing satisfies this criterion trivially, and so does a
branch with no loop. An assigned task in the same folder, due in the same
pass, must produce exactly one email to its assignee, so the absence above is
about assignee_id being null rather than about nothing working.

**What "logged" can and cannot be asserted here, stated rather than skipped
silently.** The 11.10 seam makes outbound messages observable and makes
nothing else observable: 10.5 keeps recipient addresses out of the logs
deliberately, and 11.12 sends logs to stdout, so an acceptance test running
the application in-process has no contracted channel for a log line. The
durable record of the skip is the row, and 4.8 says what it looks like: state
leaves scheduled and fired_at is set. That is what this file asserts for the
clause, and it is the same division AC-039 and AC-053 record where a criterion
straddles what a package can show.

**The unassigned row exists at all because 8.6's second arm allows it.** A
reminder on an unassigned task is computed from its creator's zone only so
that 4.8's NOT NULL fire_at has a value, which the P7 kickoff recorded in 8.6
itself; the loop is where that row's fate is decided, and this criterion is
that decision. A creator who travels moves nothing observable, which is why
their zone is not a sixth trigger, and this file is the reason: the row either
never fires or is recomputed in a new assignee's zone before it does.

Spec: 8.6 (the loop's second skip and the sentence explaining it; the creator
fallback as recorded at the P7 kickoff), 11.7, 4.8, 11.10, 10.5, INV-5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { addMemberOk, connect, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'
import {
  KARACHI,
  LONDON,
  NEW_YORK,
  ZoneCast,
  minutesAgo,
  minutesAhead,
  reminderEmails,
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
  second: Actor
  third: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'folder-owner', KARACHI)
    const second = await cast.signIn(app, 'second-member', LONDON)
    const third = await cast.signIn(app, 'third-member', NEW_YORK)
    await connect(app.db, owner.id, second.id)
    await connect(app.db, owner.id, third.id)
    const folderId = await createFolder(owner, 'p7 ac088 three members')
    await addMemberOk(owner, folderId, second.id)
    await addMemberOk(owner, folderId, third.id)
    folderIds.push(folderId)
    staged = { owner, second, third, folderId }
  }
  return staged
}

async function taskDue(
  label: string,
  assigneeId: string | null,
  fireAt: Date = minutesAgo(1),
): Promise<string> {
  const { owner, folderId } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac088 ${label}`,
      folder_id: folderId,
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '12:00',
      assignee_id: assigneeId ?? owner.id,
    },
    'a dated, timed task is creatable in a three-member folder (spec 7.6)',
  )
  taskIds.push(task.id)
  if (assigneeId === null) {
    // 7.6 admits a null assignee wherever INV-5 does not forbid it, which is
    // any folder with more than one member.
    await patchTaskOk(
      owner,
      task.id,
      { assignee_id: null },
      'the task is unassigned (spec 7.6)',
    )
    expect(
      (await requireTaskRow(app.db, task.id)).assignee_id,
      'the fixture must genuinely be unassigned, or this file asserts nothing',
    ).toBeNull()
  }
  await seedReminderRow(app.db, {
    taskId: task.id,
    createdBy: owner.id,
    offsetMinutes: 30,
    // Due by default, and well inside 11.7's six hour window, which is
    // AC-089's subject and not this file's. A case that still has a trigger
    // to fire passes a future instant instead and moves it afterwards,
    // because assignee_id is a recompute trigger and would otherwise push a
    // deliberately due row back out of reach.
    fireAt,
  })
  return task.id
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-088: an unassigned task at fire time is skipped, and nobody is mailed', () => {
  test('AC-088: the unassigned reminder is skipped while an assigned one in the same pass is sent', async () => {
    const { owner, second, third } = await stage()
    const unassigned = await taskDue('unassigned', null)
    const assigned = await taskDue('assigned to the second member', second.id)

    const before = reminderEmails(app).length
    await runPass(app)
    const arrived = reminderEmails(app).slice(before)

    const skipped = await requireReminderRow(
      app.db,
      unassigned,
      'the unassigned task\'s reminder survives the pass',
    )
    expect(
      skipped.state,
      '8.6: the loop skips a due reminder whose task has a null assignee_id',
    ).toBe('skipped')
    expect(
      skipped.fired_at,
      '4.8 sets fired_at when state leaves scheduled, and that column is the durable record this criterion\'s "logged" is observable as: 10.5 keeps addresses out of the logs and 11.10 makes only sends observable',
    ).not.toBeNull()

    expect(
      (await requireReminderRow(app.db, assigned, 'the assigned task\'s reminder'))
        .state,
      'the control: an assigned task due in the same pass is sent, so the skip above is about the null assignee rather than about a loop that delivers nothing',
    ).toBe('sent')

    expect(
      arrived.map((email) => email.to).sort(),
      '8.6: reminders are never broadcast to a whole folder. Exactly one email left this pass and it went to the assignee of the assigned task; the three members of this folder are the addresses a broadcast would have reached',
    ).toEqual([second.email])
    expect(
      arrived.map((email) => email.to),
      `neither the folder owner (${owner.email}) nor the third member (${third.email}) is a recipient of anything here`,
    ).not.toContain(owner.email)
  })

  test('AC-088: assigning the task before the instant makes it deliverable again', async () => {
    const { owner, third } = await stage()
    const taskId = await taskDue(
      'unassigned then assigned',
      null,
      minutesAhead(60),
    )
    await patchTaskOk(
      owner,
      taskId,
      { assignee_id: third.id },
      'the task gains an assignee (spec 7.6)',
    )
    // Only now does the instant arrive: assignee_id is a recompute trigger,
    // so a row made due before the PATCH would be pushed back to the instant
    // its due_date implies and would not be polled at all.
    await setFireAt(app.db, taskId, minutesAgo(1))

    const before = reminderEmails(app).length
    await runPass(app)
    const arrived = reminderEmails(app).slice(before)

    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder survives')).state,
      '8.6 evaluates the assignee at fire time, so a task assigned before the pass runs is deliverable. This is the other half of the kickoff\'s reading: such a row either never fires or is recomputed in the new assignee\'s zone before it does',
    ).toBe('sent')
    expect(
      arrived.map((email) => email.to),
      'and it reaches the new assignee, nobody else',
    ).toEqual([third.email])
  })

  test('AC-088: invariants hold afterwards', async () => {
    const { owner, second, third } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      owner.id,
      second.id,
      third.id,
    ])
  })
})

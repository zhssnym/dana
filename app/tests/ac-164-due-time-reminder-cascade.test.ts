/*
AC-164: given a PATCH clearing due_time on a task carrying an offset reminder,
then the time is cleared and the reminder row is deleted in the same
transaction, and the response reports a task whose reminder is null; given a
PATCH setting due_time on a date-only task carrying a time_of_day reminder,
then that reminder is deleted the same way; given a due_time that moves
between two non-null values, then no reminder is deleted and fire_at is
recomputed from the new time.

**This is the one file in P7 written after the implementation it tests, and
saying so is the point of this paragraph.** Every other criterion here was
written first and failed for a package that did not exist yet, which is what
makes a green test evidence. This one could not be: package P8 was live in a
second working tree while this package ran, its own tester proposing criteria
concurrently, and neither branch could see the other, so a number chosen on
either would have been a guess against the other's range. Section 12 carried
the criterion under a pending heading for exactly that interval and the
coordinating session, which holds the ledger across both trees, assigned
AC-164 on 2026-08-10. The change control recorded that cost plainly rather
than hiding it and this file does the same. AC-131 is the precedent, and what
limits the cost here is that both arms were fully specified in 8.4 and in
frozen 7.6's appended paragraph before the implementing session read either,
so this tests a written rule rather than a silence, and the rule is quoted
below at each assertion rather than inferred from what the code does.

**The three arms discriminate against each other, which is what a file
arriving green has instead of a red.** An implementation that deletes on no
due_time edit fails the first two. One that deletes on every due_time edit
fails the third, and that is the likelier mistake: the cascade is easiest to
write as "due_time changed, so drop the reminder", which is right twice and
wrong once. One that deletes the wrong mode, dropping a time_of_day row when
the time is cleared or an offset row when it is set, passes neither of the
first two, because each fixture carries only the mode its own arm is about.
So no single wrong rule satisfies all three.

**And both wrong rules were red-proven out of band, because arriving green
costs this file the thing the order buys.** AC-124's header records the same
debt and the same repayment: a test that has never failed has not been shown
to discriminate. The implementation is not this role's to edit even
temporarily, so the two rules were reproduced against the same tables in a
throwaway file, deleted before this commit. Re-inserting the reminder after
the first arm's PATCH, which is what "delete nothing" leaves behind, fails
that arm's `expectNoReminderRow`; deleting it after the third arm's PATCH,
which is what "delete on any due_time change" leaves behind, fails that arm's
`requireReminderRow`. Both were observed failing before this file was
believed.

**Same transaction is asserted through a refusal, because a success cannot
show it.** A PATCH that succeeds leaves one final state and no window a test
can look into, so the observable claim is the other one: when the same PATCH
is refused, neither half happens. The refusal is frozen 7.6's own, status
being a field that section says this endpoint does not accept, and the body
carries it beside the due_time edit. A route that cleared the time and deleted
the reminder before validating the rest would answer 409 over a task already
changed, and 8.4's "one transaction with the PATCH itself" is exactly what
forbids that.

**The cascade is not the clear-date cascade, and the fixtures keep them
apart.** 8.4 states this rule one size down from the one AC-028 proves:
clearing the date deletes the reminder and the time and any rule, while
clearing the time deletes only a reminder the edit made illegal. So every case
here asserts due_date survives. An implementation reaching for the bigger
cascade passes the reminder assertions and empties the date with them.

Zones are Asia/Karachi, which has observed no DST since 2009, and every due
date is ahead of today, so each instant is in the future, each row stays
scheduled, and nothing in this file depends on a transition or on 7.9's
past-instant qualifier.

Spec: 8.4 (the clear-date cascade and its smaller sibling, clear_due_time and
set_due_time, both in the same transaction as the edit), 7.6 (the appended
due_time paragraph of 2026-08-10, and status not accepted on PATCH), 4.8
(which mode is legal depends on the task's due_time, cross-table and enforced
by the API), 8.6 (the ordinary recompute a move between two times is), 9.3
(the reminder control's mode switches with due_time), INV-6.
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
  patchTask,
  patchTaskOk,
  readTask,
  requireTaskRow,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  expectFireAt,
  expectNoReminderRow,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const DUE_TIME = '15:00'
const MOVED_TIME = '09:00'
const OFFSET = 30
const TIME_OF_DAY = '08:00'

interface Stage {
  owner: Actor
  folderId: string
  due: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'cascade-owner', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac164')
    folderIds.push(folderId)
    // Ahead of today, so every instant here is future and no row is written
    // skipped by 7.9's past-instant qualifier.
    staged = { owner, folderId, due: shiftDate(todayIn(KARACHI), 30) }
  }
  return staged
}

/** A timed task carrying the offset reminder 4.8 admits beside a due_time. */
async function timedWithOffset(label: string): Promise<string> {
  const { owner, folderId, due } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac164 ${label}`,
      folder_id: folderId,
      due_date: due,
      due_time: DUE_TIME,
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
  await putReminderOk(
    owner,
    task.id,
    { offset_minutes: OFFSET },
    `an offset reminder on ${label}, the mode 4.8 admits beside a due_time (spec 7.9)`,
  )
  return task.id
}

/** A date-only task carrying the time_of_day reminder 4.8 admits without one. */
async function dateOnlyWithTimeOfDay(label: string): Promise<string> {
  const { owner, folderId, due } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac164 ${label}`,
      folder_id: folderId,
      due_date: due,
    },
    'a dated task with no due_time is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
  expect(
    task.due_time,
    '4.8 admits the time_of_day mode only where the task has no due_time',
  ).toBeNull()
  await putReminderOk(
    owner,
    task.id,
    { time_of_day: TIME_OF_DAY },
    `a date-only reminder on ${label} (spec 7.9)`,
  )
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

describe('AC-164: a due_time edit that invalidates the reminder deletes it', () => {
  test('AC-164: clearing due_time clears the time and deletes the offset reminder', async () => {
    const { owner, due } = await stage()
    const taskId = await timedWithOffset('cleared time')
    await requireReminderRow(
      app.db,
      taskId,
      'the positive control for this case: a reminder exists before the edit',
    )

    const body = await patchTaskOk(
      owner,
      taskId,
      { due_time: null },
      'PATCH /tasks/:id clearing due_time (spec 7.6 as appended on 2026-08-10)',
    )
    expect(
      body.reminder,
      '7.6 answers the affected TaskDetail, and the criterion says the response reports a task whose reminder is null. A route that deleted the row and answered the body it had loaded first reports a reminder the database no longer holds',
    ).toBeNull()
    expect(
      body.due_time,
      'and the time itself is cleared, which is the edit that was asked for',
    ).toBeNull()

    const row = await requireTaskRow(app.db, taskId)
    expect(row.due_time, '4.5 stores what the response reported').toBeNull()
    expect(
      row.due_date,
      '8.4 states this rule one size down from the clear-date cascade AC-028 proves: clearing the TIME deletes the reminder and leaves the date. An implementation reaching for the bigger cascade passes every reminder assertion here and empties the date with it',
    ).toBe(due)
    await expectNoReminderRow(
      app.db,
      taskId,
      '8.4 clear_due_time: delete reminder where task_id = task.id and offset_minutes is not null. 8.6\'s offset arm reads datetime(task.due_date, task.due_time) and there is no due_time left to read, which is the shape the P7 engine session escalated as one 8.6 cannot compute at all',
    )
    expect(
      (await readTask(owner, taskId)).reminder,
      'and a fresh GET agrees with the PATCH body',
    ).toBeNull()
  })

  test('AC-164: setting due_time on a date-only task deletes the time_of_day reminder', async () => {
    const { owner, due } = await stage()
    const taskId = await dateOnlyWithTimeOfDay('time set')
    await requireReminderRow(
      app.db,
      taskId,
      'the positive control: a date-only reminder exists before the edit',
    )

    const body = await patchTaskOk(
      owner,
      taskId,
      { due_time: MOVED_TIME },
      'PATCH /tasks/:id setting due_time on a date-only task (spec 7.6, 8.4 set_due_time)',
    )
    expect(
      body.due_time,
      'the time is set, which is the edit that was asked for',
    ).toBe(MOVED_TIME)
    expect(
      body.reminder,
      '8.4 set_due_time deletes the time_of_day row in the same transaction, so the response reports a task with no reminder',
    ).toBeNull()

    expect(
      (await requireTaskRow(app.db, taskId)).due_date,
      'the date survives here too',
    ).toBe(due)
    await expectNoReminderRow(
      app.db,
      taskId,
      '8.4 rules the mirror arm on the same grounds turned around. This shape computes, 8.6\'s date-only arm reading the reminder\'s own time_of_day and never the task\'s, so the row would go on firing correctly; it cascades because 4.8 calls the pair illegal and because 9.3 switches the reminder control\'s mode with due_time, leaving an offset picker over a wall time the interface can neither show nor edit',
    )
  })

  test('AC-164: a due_time moving between two times deletes nothing and recomputes', async () => {
    const { owner, due } = await stage()
    const taskId = await timedWithOffset('time moved')

    const body = await patchTaskOk(
      owner,
      taskId,
      { due_time: MOVED_TIME },
      'PATCH /tasks/:id moving due_time from one time to another (spec 7.6)',
    )
    expect(
      body.reminder,
      '7.6: a due_time that moves from one time to another invalidates nothing and is the ordinary recompute of 8.6. The cascade is easiest to write as "due_time changed, so drop the reminder", which is right in the two cases above and wrong here, and this is the only case that says so',
    ).toEqual({ offset_minutes: OFFSET, time_of_day: null })

    const row = await requireReminderRow(
      app.db,
      taskId,
      'the reminder survives a move between two non-null times',
    )
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, due, MOVED_TIME, OFFSET),
      '8.6 names due_time in its trigger list, so the surviving row is recomputed from the new time rather than left at the old instant',
    )
    expect(
      row.state,
      'and the new instant is in the future, so 7.9 and 8.6 agree the row is scheduled',
    ).toBe('scheduled')
  })

  test('AC-164: a refused PATCH deletes nothing, which is the transaction the rule names', async () => {
    const { owner, due } = await stage()
    const taskId = await timedWithOffset('refused edit')
    const before = await requireReminderRow(
      app.db,
      taskId,
      'the reminder exists before the refusal',
    )

    // A success leaves one final state and no window to look into, so the
    // transactional claim is asserted from the other side: the same due_time
    // edit, refused, must leave both halves untouched. status is frozen 7.6's
    // own refusal on this endpoint, so the body is invalid for a reason the
    // contract states rather than one this file invents.
    const refused = await patchTask(owner, taskId, {
      due_time: null,
      status: 'completed',
    })
    expectStatus(
      refused,
      409,
      '7.6: status is not accepted on PATCH, 409 if present. Transitions have their own endpoints',
    )

    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.due_time,
      '8.4: one transaction with the PATCH itself. A route that applied the due_time edit before validating the rest answers 409 over a task it already changed',
    ).toBe(`${DUE_TIME}:00`)
    expect(row.due_date, 'and the date is untouched').toBe(due)
    expect(
      await requireReminderRow(
        app.db,
        taskId,
        'the reminder survives a refused edit',
      ),
      'the cascade rides the same transaction as the edit that triggers it, so a refused edit cascades nothing: the row is exactly what it was',
    ).toEqual(before)
  })

  test('AC-164: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})

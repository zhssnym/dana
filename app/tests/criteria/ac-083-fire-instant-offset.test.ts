/*
AC-083: given due 2026-07-28 15:00, offset 30, assignee timezone Asia/Karachi,
then fire_at is the UTC instant of 2026-07-28 14:30 Karachi time.

This criterion runs literally at the dates it names, and it is worth saying
why, because the neighbouring package's four do not. The P6 ruling that put
AC-072 to AC-075 on their content rather than their dates turned on the
completing side of each worked example being *today*, which no API call can
place in July 2026. Nothing here is today: a due date and a due time are
floating values a client sends, an offset is a stored integer, and the
assignee's zone is a column. Every input of 8.6's offset arm is addressable,
so the criterion is asserted exactly as written and its expected instant is a
constant.

**Asia/Karachi is UTC+5 and has observed no DST since 2009**, which is what
makes the arithmetic a single subtraction and this criterion the one place in
the range where nothing about a transition is in play. That is also its
limitation, recorded at the P7 kickoff as section 13 item 25 and closed
elsewhere rather than here: 11.9 used to say AC-083 to AC-086 pin both DST
rules of 8.6, and this one instantiates neither. The gap and the fold are
AC-144 and AC-145, numbered at this package's change control on 2026-08-10,
and 11.9 now names them for the two rules and this range for the zone
arithmetic they sit on; AC-084 to AC-086 carry that arithmetic. The offset is
asserted here rather than assumed, so a tzdb that moved Karachi fails as a
fixture.

**Four cases beyond the criterion's own, each an arithmetic an implementation
can get wrong while passing the first.**

- Offset 0, the low end of 4.8's CHECK: the reminder fires at the due instant
  itself. A subtraction written as a truthiness test skips it.
- Offset 10080, the high end, seven days: the local date moves a week back and
  the wall time does not.
- An offset that crosses local midnight backwards, due_time 00:15 minus 30.
  8.6 computes datetime(due_date, due_time) minus offset_minutes and only then
  applies the zone, so the local value is 23:45 on the *previous* date. An
  implementation subtracting inside one day answers 23:45 on the due date, one
  day late, and every other case in this file passes for it.
- The zone is the *assignee's*, not the caller's. A second member in
  Europe/London issues the PUT against a task assigned to the Karachi member,
  so reminder.created_by and the assignee are different people in different
  zones. 8.6 reaches for the creator only when the task is unassigned, which
  is the fallback the P7 kickoff recorded in 8.6 itself, and an implementation
  reading created_by first passes every single-member fixture in this suite.

The fire instant is asserted against the 4.8 column rather than against
anything on the wire, because no response in section 7 carries fire_at at all:
7.0's reminder object is the two mode columns. State is deliberately not
asserted here, and the reason is an escalation rather than an omission: this
fixture's instant is in the past, where frozen 7.9's "state resets to
scheduled" and 8.6's "when the recomputed instant is already past, the row is
set state = skipped" answer differently. The criterion is about fire_at, so
this file asserts fire_at.

Spec: 8.6 (the computation, its two arms, and the creator fallback as recorded
at the P7 kickoff), 7.9 as ruled on 2026-08-10 (PUT answers the affected
TaskDetail), 4.8 (the row, its CHECK on offset_minutes, its NOT NULL fire_at),
4.11 (floating due_date and due_time), 8.1 (users.timezone exists for this one
consumer), 11.9, section 13 item 25.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { addMemberOk, connect, createFolder } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTaskOk,
} from '../support/tasks-harness.js'
import {
  KARACHI,
  LONDON,
  ZoneCast,
  expectFireAt,
  offsetAt,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
} from '../support/reminders-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

// The criterion's own inputs, spelled once.
const DUE_DATE = '2026-07-28'
const DUE_TIME = '15:00'
const OFFSET = 30
const EXPECTED = new Date('2026-07-28T09:30:00Z') // 14:30 Karachi, UTC+5

interface Stage {
  owner: Actor
  visitor: Actor
  soloFolderId: string
  sharedFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'karachi-owner', KARACHI)
    const visitor = await cast.signIn(app, 'london-visitor', LONDON)
    await connect(app.db, owner.id, visitor.id)
    const soloFolderId = await createFolder(owner, 'p7 ac083 solo')
    const sharedFolderId = await createFolder(owner, 'p7 ac083 shared')
    await addMemberOk(owner, sharedFolderId, visitor.id)
    folderIds.push(soloFolderId, sharedFolderId)
    staged = { owner, visitor, soloFolderId, sharedFolderId }
  }
  return staged
}

/** A dated, timed task in the owner's own folder, which INV-5 assigns to the
 * owner, whose zone is Karachi. */
async function timedTask(
  label: string,
  dueDate: string,
  dueTime: string,
): Promise<string> {
  const { owner, soloFolderId } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac083 ${label}`,
      folder_id: soloFolderId,
      due_date: dueDate,
      due_time: dueTime,
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
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

describe('AC-083: the offset arm of 8.6, in the assignee\'s zone', () => {
  test('AC-083: the fixture zone is still UTC+5 with no transition in July', async () => {
    // Asserted before the arithmetic depends on it (section 13 item 25).
    expect(
      offsetAt(KARACHI, EXPECTED),
      `${KARACHI} must still be UTC+5 at the criterion's own instant`,
    ).toBe(300)
    expect(
      offsetAt(KARACHI, new Date('2026-01-15T00:00:00Z')),
      'and in January too, which is what "no DST since 2009" means for this fixture',
    ).toBe(300)
  })

  test('AC-083: due 2026-07-28 15:00 with offset 30 fires at 14:30 Karachi', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('the criterion', DUE_DATE, DUE_TIME)

    const detail = await putReminderOk(
      owner,
      taskId,
      { offset_minutes: OFFSET },
      'PUT /tasks/:id/reminder with an offset on a task carrying due_time (spec 7.9)',
    )
    expect(
      detail.reminder,
      '7.0 carries both 4.8 mode columns with exactly one non-null, and this is the offset mode',
    ).toEqual({ offset_minutes: OFFSET, time_of_day: null })

    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      EXPECTED,
      `8.6: local = datetime(${DUE_DATE}, ${DUE_TIME}) minus ${String(OFFSET)} minutes, which is 14:30, then that local time in ${KARACHI}`,
    )
    // The same instant derived the way 8.6 writes the computation, in two
    // steps, so a failure says whether the subtraction or the zone is wrong.
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, DUE_DATE, DUE_TIME, OFFSET),
      '8.6 computed step by step: subtract, then apply the zone',
    )
  })

  test('AC-083: offset 0 fires at the due instant itself', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('offset zero', DUE_DATE, DUE_TIME)
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 0 },
      '4.8 admits offset_minutes BETWEEN 0 AND 10080, so zero is a value and not an absence',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expect(
      row.offset_minutes,
      'zero is stored as zero, not as null: 4.8\'s exclusive-or reads the column, and a null here would flip the row into date-only mode',
    ).toBe(0)
    expectFireAt(
      row,
      new Date('2026-07-28T10:00:00Z'),
      '8.6 with a zero offset is the due instant itself, 15:00 Karachi',
    )
  })

  test('AC-083: offset 10080 moves the local date a week back and the wall time not at all', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('offset seven days', DUE_DATE, DUE_TIME)
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: 10_080 },
      '4.8\'s upper bound, seven days, which 4.11 records as the deliberate cap',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      new Date('2026-07-21T10:00:00Z'),
      '8.6: 15:00 on 2026-07-21 Karachi, a week before the due instant to the minute',
    )
  })

  test('AC-083: an offset crossing local midnight lands on the previous date', async () => {
    const { owner } = await stage()
    const taskId = await timedTask('across midnight', DUE_DATE, '00:15')
    await putReminderOk(
      owner,
      taskId,
      { offset_minutes: OFFSET },
      'a task due at 00:15 with a 30 minute reminder (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      new Date('2026-07-27T18:45:00Z'),
      '8.6 subtracts from datetime(due_date, due_time) before the zone is applied, so 00:15 minus 30 is 23:45 on 2026-07-27 Karachi. An implementation subtracting inside one day answers 23:45 on 2026-07-28, a day late, and passes every other case here',
    )
  })

  test('AC-083: the zone is the assignee\'s, not the caller\'s and not the creator\'s', async () => {
    const { owner, visitor, sharedFolderId } = await stage()
    const task = await createTaskOk(
      owner,
      {
        title: 'p7 ac083 assigned to the Karachi member',
        folder_id: sharedFolderId,
        due_date: DUE_DATE,
        due_time: DUE_TIME,
        assignee_id: owner.id,
      },
      'a task in a two-member folder, assigned to the member in Karachi (spec 7.6)',
    )
    taskIds.push(task.id)

    // The London member writes the reminder, so created_by is London and the
    // assignee is Karachi. 8.6 reads the creator only when unassigned.
    await putReminderOk(
      visitor,
      task.id,
      { offset_minutes: OFFSET },
      'any member may set the reminder on a task in a folder they belong to (spec 7.9, 5.4)',
    )
    const row = await requireReminderRow(app.db, task.id, 'the PUT upserted a row')
    expect(
      row.created_by,
      'the row records who wrote it, which is the London member',
    ).toBe(visitor.id)
    expectFireAt(
      row,
      EXPECTED,
      `8.6 takes the zone of task.assignee_id, which is ${KARACHI}. Computed from the creator instead this would be ${LONDON}, four hours out in July, and every single-member fixture in this suite would still pass`,
    )

    // And the same row recomputed after a PATCH that changes nothing about
    // the zone still answers Karachi: the discriminator is the column, not
    // the moment.
    await patchTaskOk(
      visitor,
      task.id,
      { important: true },
      'an unrelated field may be patched by any member (spec 7.6)',
    )
    expectFireAt(
      await requireReminderRow(app.db, task.id, 'the row survives an unrelated PATCH'),
      EXPECTED,
      '8.6 lists the triggers that recompute, and important is not one of them',
    )
  })

  test('AC-083: invariants hold afterwards', async () => {
    const { owner, visitor } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id, visitor.id])
  })
})

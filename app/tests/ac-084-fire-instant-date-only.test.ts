/*
AC-084: given a date-only task with time_of_day 09:00, then it fires at 09:00
in the assignee's zone on the due date.

**This is one of the two criteria the P7 kickoff expected to carry a DST
fixture without straining its text, and it does.** The criterion fixes the
wall time and not the zone, so the zone is this file's to choose, and 09:00 in
America/New_York is 14:00Z on a January due date and 13:00Z on a July one. The
offset that matters is the one in force *on the due date*, not the one in
force when the reminder is written or when the pass runs, and an
implementation that reads the current offset is wrong by an hour for roughly
half of every year while passing any fixture confined to one season. Section
13 item 25's constraint is honored by both dates being historical, in a zone
whose rule has not changed since 2007; the transition itself is asserted
before the arithmetic leans on it.

This is 11.9's Luxon half rather than its policy half. Nothing here is a gap
or a fold: 09:00 exists exactly once on both dates. The two rules that have no
correct answer are AC-144 and AC-145, numbered at this package's change
control on 2026-08-10, which is what closed 11.9's claim that AC-083 to
AC-086 pin them: that sentence now names those two for the rules and this
range for the arithmetic.

**Three further cases, each one an implementation that passes the first.**

- The zone is the assignee's. A task in a shared folder assigned to the London
  member, created and written by the New York member, fires at 09:00 London.
  Read from the creator it would be 13:00Z rather than 08:00Z.
- The creator is the fallback and only the fallback. An unassigned task's
  reminder is computed from reminder.created_by, which the P7 kickoff recorded
  in 8.6 as a fallback for the computation and not a sixth recompute trigger.
  The discriminator is deliberate: the task was created by the New York member
  and the reminder written by the London member, so task.created_by and
  reminder.created_by are different people, and 8.6 names the second.
- The date-only arm requires the absence of due_time (4.8), so every task here
  carries a due_date and no due_time, which is also what makes the mode legal
  at all. The wrong-mode refusals are AC-090's and AC-147's; this file only
  ever sends the mode the task admits.

Spec: 8.6 (the date-only arm, and the creator fallback as recorded at the P7
kickoff), 7.9 as ruled on 2026-08-10, 4.8 (the mode columns and their
exclusive-or), 4.11 (a floating due_date), 8.1, 11.9, section 13 item 25.
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
  LONDON,
  NEW_YORK,
  ZoneCast,
  dateOnlyFireInstant,
  expectFireAt,
  offsetAt,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const TIME_OF_DAY = '09:00'
const WINTER_DUE = '2010-01-15'
const SUMMER_DUE = '2010-07-15'

interface Stage {
  newYorker: Actor
  londoner: Actor
  soloFolderId: string
  sharedFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const newYorker = await cast.signIn(app, 'new-yorker', NEW_YORK)
    const londoner = await cast.signIn(app, 'londoner', LONDON)
    await connect(app.db, newYorker.id, londoner.id)
    const soloFolderId = await createFolder(newYorker, 'p7 ac084 solo')
    const sharedFolderId = await createFolder(newYorker, 'p7 ac084 shared')
    await addMemberOk(newYorker, sharedFolderId, londoner.id)
    folderIds.push(soloFolderId, sharedFolderId)
    staged = { newYorker, londoner, soloFolderId, sharedFolderId }
  }
  return staged
}

/** A dated task with no due_time, which is what 4.8 requires beside the
 * time_of_day mode. */
async function dateOnlyTask(
  actor: Actor,
  folderId: string,
  label: string,
  dueDate: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const task = await createTaskOk(
    actor,
    {
      title: `p7 ac084 ${label}`,
      folder_id: folderId,
      due_date: dueDate,
      ...extra,
    },
    'a dated task with no due_time is creatable (spec 7.6)',
  )
  expect(
    task.due_time,
    '4.8 admits the time_of_day mode only where the task has no due_time, so the fixture must genuinely have none',
  ).toBeNull()
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

describe('AC-084: the date-only arm of 8.6, at the offset of the due date', () => {
  test('AC-084: the DST fixture still has its transition between the two due dates', () => {
    expect(
      offsetAt(NEW_YORK, new Date(`${WINTER_DUE}T12:00:00Z`)),
      `${NEW_YORK} must still be UTC-5 on ${WINTER_DUE} (section 13 item 25: a historical date under a rule unchanged since 2007)`,
    ).toBe(-300)
    expect(
      offsetAt(NEW_YORK, new Date(`${SUMMER_DUE}T12:00:00Z`)),
      `and UTC-4 on ${SUMMER_DUE}, which is the hour this criterion's DST case turns on`,
    ).toBe(-240)
    expect(
      offsetAt(LONDON, new Date(`${SUMMER_DUE}T12:00:00Z`)),
      `${LONDON} must still be UTC+1 on ${SUMMER_DUE} (EU rule, unchanged since 1996)`,
    ).toBe(60)
  })

  test('AC-084: a date-only task fires at time_of_day in the assignee\'s zone on the due date', async () => {
    const { newYorker, soloFolderId } = await stage()
    const taskId = await dateOnlyTask(
      newYorker,
      soloFolderId,
      'the criterion',
      SUMMER_DUE,
    )

    const detail = await putReminderOk(
      newYorker,
      taskId,
      { time_of_day: TIME_OF_DAY },
      'PUT /tasks/:id/reminder with time_of_day on a task with no due_time (spec 7.9)',
    )
    expect(
      detail.reminder,
      '7.0 carries both 4.8 mode columns with exactly one non-null, and this is the date-only mode',
    ).toEqual({ offset_minutes: null, time_of_day: TIME_OF_DAY })

    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expectFireAt(
      row,
      new Date('2010-07-15T13:00:00Z'),
      `8.6: local = datetime(${SUMMER_DUE}, ${TIME_OF_DAY}), then that local time in ${NEW_YORK}, which is UTC-4 in July`,
    )
    expectFireAt(
      row,
      dateOnlyFireInstant(NEW_YORK, SUMMER_DUE, TIME_OF_DAY),
      '8.6 computed the way the specification writes it',
    )
  })

  test('AC-084: the offset is the one in force on the due date, not the one in force now', async () => {
    const { newYorker, soloFolderId } = await stage()
    const winter = await dateOnlyTask(
      newYorker,
      soloFolderId,
      'winter due date',
      WINTER_DUE,
    )
    const summer = await dateOnlyTask(
      newYorker,
      soloFolderId,
      'summer due date',
      SUMMER_DUE,
    )

    for (const [taskId, why] of [
      [winter, 'the winter task'],
      [summer, 'the summer task'],
    ] as const) {
      await putReminderOk(
        newYorker,
        taskId,
        { time_of_day: TIME_OF_DAY },
        `${why} takes the same 09:00 reminder (spec 7.9)`,
      )
    }

    const winterRow = await requireReminderRow(app.db, winter, 'the winter row')
    const summerRow = await requireReminderRow(app.db, summer, 'the summer row')
    expectFireAt(
      winterRow,
      new Date('2010-01-15T14:00:00Z'),
      `09:00 on ${WINTER_DUE} in ${NEW_YORK} is 14:00Z, the zone being UTC-5 that day`,
    )
    expectFireAt(
      summerRow,
      new Date('2010-07-15T13:00:00Z'),
      `09:00 on ${SUMMER_DUE} in the same zone is 13:00Z, the zone being UTC-4 that day`,
    )

    // The whole point, said once as a relationship rather than as two
    // constants: two identical reminders on two due dates six months apart
    // are not a whole number of days apart in UTC, and no single offset,
    // whether taken from the current instant or hardcoded, can produce both.
    const days =
      (Date.parse(String(summerRow.fire_at)) -
        Date.parse(String(winterRow.fire_at))) /
      86_400_000
    expect(
      Math.round((days % 1) * 24),
      '8.6 resolves each local time in the zone as it stood on its own due date, so the two instants differ by whole days minus the DST hour. An implementation reading one offset for both answers a whole number of days here, and passes both constants above only if it happens to read the right season',
    ).toBe(-1)
  })

  test('AC-084: the zone is the assignee\'s, not the writer\'s', async () => {
    const { newYorker, londoner, sharedFolderId } = await stage()
    const taskId = await dateOnlyTask(
      newYorker,
      sharedFolderId,
      'assigned to London',
      SUMMER_DUE,
      { assignee_id: londoner.id },
    )
    await putReminderOk(
      newYorker,
      taskId,
      { time_of_day: TIME_OF_DAY },
      'the New York member writes a reminder on a task assigned to the London member (spec 7.9, 5.4)',
    )
    expectFireAt(
      await requireReminderRow(app.db, taskId, 'the PUT upserted a row'),
      new Date('2010-07-15T08:00:00Z'),
      `8.6 takes users.timezone of task.assignee_id, so 09:00 in ${LONDON}, which is 08:00Z in July. Read from the writer it would be 13:00Z`,
    )
  })

  test('AC-084: an unassigned task falls back to the reminder\'s creator, and to nobody else', async () => {
    const { newYorker, londoner, sharedFolderId } = await stage()
    const taskId = await dateOnlyTask(
      newYorker,
      sharedFolderId,
      'unassigned',
      SUMMER_DUE,
      { assignee_id: londoner.id },
    )
    // 7.6 admits a null assignee in a folder with more than one member; INV-5
    // is what forbids it in a single-member one.
    await patchTaskOk(
      newYorker,
      taskId,
      { assignee_id: null },
      'a task in a two-member folder may be unassigned (spec 7.6)',
    )
    expect(
      (await requireTaskRow(app.db, taskId)).assignee_id,
      'the fixture must genuinely be unassigned, or the fallback is never reached',
    ).toBeNull()

    // Written by the London member, on a task created by the New York member:
    // 8.6 names reminder.created_by, and the two differ here on purpose.
    await putReminderOk(
      londoner,
      taskId,
      { time_of_day: TIME_OF_DAY },
      'the London member writes the reminder on the unassigned task (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the PUT upserted a row')
    expect(row.created_by, 'the London member wrote it').toBe(londoner.id)
    expect(
      String((await requireTaskRow(app.db, taskId)).created_by),
      'and the New York member created the task, which is the value 8.6 does not name',
    ).toBe(newYorker.id)
    expectFireAt(
      row,
      new Date('2010-07-15T08:00:00Z'),
      `8.6's second arm reads users.timezone of reminder.created_by when the task is unassigned, so 09:00 in ${LONDON}. From task.created_by it would be 13:00Z, and from a folder owner it would be 13:00Z too`,
    )
  })

  test('AC-084: invariants hold afterwards', async () => {
    const { newYorker, londoner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      newYorker.id,
      londoner.id,
    ])
  })
})

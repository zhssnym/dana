/*
AC-151: given the due_time moves on a task carrying an offset reminder, then
fire_at is recomputed from the new time.

Proposed here with its test and numbered by the Integration Steward at P7's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now, transcribed unchanged. It is not one of the six surfaces
the RFC 0001 P7 row listed, and it is here because that list is a floor: 8.6
names five recompute triggers and section 12 asserted three of them. AC-085
has due_date, AC-086 has the assignee's timezone, and the reminder's own value
rides the PUT that AC-148 pins. due_time and assignee_id had no number at all,
and assignee_id is AC-152's.

**Missing this trigger is invisible in every other assertion.** The reminder
keeps its offset, so the response reports exactly what the user asked for, the
row stays scheduled, and the only thing wrong is the instant, which no
response in section 7 carries. A meeting moved from the afternoon to the
morning takes its reminder with it or it does not, and the difference shows up
once, in an email that arrives after the thing it was about.

**The trigger is the task's column, not the reminder's.** 7.6's PATCH bullets
name the recompute for due_date and not for due_time, while 8.6's trigger list
names both; an implementation built from 7.6's bullets alone wires one and not
the other, which is exactly the shape this criterion is looking for. The
positive control against that reading is in the same file: the due_date arm
works, and it is the arm AC-085 already asserts.

**And the recompute path meets the policy rules too.** The last case moves a
due_time so that the recomputed local time lands inside a spring-forward gap.
8.6 resolves that to the first valid instant after the gap wherever the
computation runs, and a module whose clamp lives only on the create path
answers Luxon's raw shift here. The fixture is the historical 2010 transition
AC-144 uses, asserted before it is leaned on.

Spec: 8.6 (the trigger list, and the gap rule), 7.6 (PATCH and its field-level
last write wins), 4.8, 11.9, section 13 item 25.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTaskOk,
} from './tasks-harness.js'
import {
  GAP,
  KARACHI,
  ZoneCast,
  expectFireAt,
  expectGapFixture,
  expectNotFireAt,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const OFFSET = 30

interface Stage {
  karachi: Actor
  newYorker: Actor
  karachiFolderId: string
  nyFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const karachi = await cast.signIn(app, 'time-mover', KARACHI)
    const newYorker = await cast.signIn(app, 'gap-time-mover', GAP.zone)
    const karachiFolderId = await createFolder(karachi, 'p7 ac151 karachi')
    const nyFolderId = await createFolder(newYorker, 'p7 ac151 new york')
    folderIds.push(karachiFolderId, nyFolderId)
    staged = { karachi, newYorker, karachiFolderId, nyFolderId }
  }
  return staged
}

async function remindedTask(
  actor: Actor,
  folderId: string,
  label: string,
  dueDate: string,
  dueTime: string,
): Promise<string> {
  const created = await createTaskOk(
    actor,
    {
      title: `p7 ac151 ${label}`,
      folder_id: folderId,
      due_date: dueDate,
      due_time: dueTime,
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  await putReminderOk(
    actor,
    created.id,
    { offset_minutes: OFFSET },
    `an offset reminder on ${label} (spec 7.9)`,
  )
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

describe('AC-151: due_time is a recompute trigger and nothing asserted it', () => {
  test('AC-151: moving due_time moves the fire instant with it', async () => {
    const { karachi, karachiFolderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'afternoon to morning',
      due,
      '15:00',
    )
    expectFireAt(
      await requireReminderRow(app.db, taskId, 'the reminder exists'),
      offsetFireInstant(KARACHI, due, '15:00', OFFSET),
      'the starting instant, 14:30 Karachi',
    )

    await patchTaskOk(
      karachi,
      taskId,
      { due_time: '09:00' },
      'PATCH /tasks/:id moving due_time (spec 7.6)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the reminder survives')
    expect(
      row.offset_minutes,
      'the reminder keeps its own value, which is why a missed recompute is invisible: the response reports exactly what the user asked for and only the instant is wrong',
    ).toBe(OFFSET)
    expectFireAt(
      row,
      offsetFireInstant(KARACHI, due, '09:00', OFFSET),
      '8.6 names due_time in its trigger list. 7.6\'s PATCH bullets name the recompute for due_date and not for due_time, so an implementation built from those bullets alone wires one and not the other',
    )
  })

  test('AC-151: the due_date arm still works, which is what makes the case above about due_time', async () => {
    const { karachi, karachiFolderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'the control',
      due,
      '15:00',
    )
    const moved = shiftDate(due, 1)
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: moved },
      'the trigger AC-085 already asserts (spec 7.6)',
    )
    expectFireAt(
      await requireReminderRow(app.db, taskId, 'the reminder survives'),
      offsetFireInstant(KARACHI, moved, '15:00', OFFSET),
      'the control: a recompute that fires for due_date and not for due_time is the defect this file is about, and this is the half that works',
    )
  })

  test('AC-151: both columns moving in one PATCH recompute once and correctly', async () => {
    const { karachi, karachiFolderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'both at once',
      due,
      '15:00',
    )
    const movedDate = shiftDate(due, 3)
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: movedDate, due_time: '07:15' },
      'one PATCH moving both columns (spec 7.6, which sends only changed fields)',
    )
    expectFireAt(
      await requireReminderRow(app.db, taskId, 'the reminder survives'),
      offsetFireInstant(KARACHI, movedDate, '07:15', OFFSET),
      '8.6 computes from the row as it stands after the write, so two triggers in one transaction are one recompute over the new values. An implementation recomputing per trigger, in order, lands on the same answer only if the last one it handles reads the whole row',
    )
  })

  test('AC-151: a recompute landing in a spring-forward gap resolves forward too', async () => {
    expectGapFixture()
    const { newYorker, nyFolderId } = await stage()
    const taskId = await remindedTask(
      newYorker,
      nyFolderId,
      'moved into the gap',
      GAP.date,
      '12:00',
    )
    expectFireAt(
      await requireReminderRow(app.db, taskId, 'the reminder exists'),
      offsetFireInstant(GAP.zone, GAP.date, '12:00', OFFSET),
      'an ordinary local time on the transition date to start with',
    )

    // 03:00 minus the 30 minute offset is 02:30, which exists on no instant.
    await patchTaskOk(
      newYorker,
      taskId,
      { due_time: '03:00' },
      'moving due_time so the reminder lands inside the gap (spec 7.6)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the reminder survives')
    expectFireAt(
      row,
      GAP.resolved,
      '8.6\'s gap rule holds wherever the computation runs. A module whose clamp lives on the create path and not on the recompute path answers correctly at AC-144 and wrongly here',
    )
    expectNotFireAt(
      row,
      GAP.luxonRaw,
      '11.9: and not by advancing the gap length, which is what raw Luxon does',
    )
  })

  test('AC-151: invariants hold afterwards', async () => {
    const { karachi, newYorker } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      karachi.id,
      newYorker.id,
    ])
  })
})

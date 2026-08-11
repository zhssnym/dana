/*
AC-085: given the due date moves, then fire_at is recomputed; given it
recomputes into the past, then the reminder is skipped, never sent.

Two clauses, two different failure modes, and the file keeps them apart.

**The recompute is not a shift.** 8.6 recomputes from the new due_date through
the zone, so an implementation that adds the difference in days to the stored
instant is right whenever no transition lies between the two dates and wrong
by an hour whenever one does. This is the second of the two criteria the P7
kickoff expected to carry a DST fixture without straining its text: the due
date moves from January to July in America/New_York, both historical dates
under a rule unchanged since 2007 (section 13 item 25), and the instant must
move by whole days minus the DST hour. A stored-instant shift answers a whole
number of days, which is the one wrong answer this case exists to catch.

**Skipped is a state, and never sent is a second assertion.** 8.6 says a
recompute landing in the past sets state = skipped and never fires
retroactively. A row left scheduled with a past instant is not merely mislabelled:
the very next pass finds it inside the 6-hour window of 11.7 and delivers a
reminder for a deadline that has already gone by, which is exactly what the
rule exists to prevent. So the state is asserted, and then a pass is run and
asserted to have sent nothing. Those are separate cases so a failure says
which half is wrong.

**And the clause that reads backwards.** 8.6 also says state is reset to
scheduled when the new instant is in the future, which is the same sentence
read the other way: a reminder skipped by a due date moving into the past
comes back when the date moves forward again. Nothing in the range asserts it,
and a one-way implementation, skip on the way down and stay skipped on the way
up, satisfies the criterion's own words and silently retires every reminder on
a task whose date was ever moved backwards.

The date-relative fixtures are anchored in Asia/Karachi, which has observed no
DST since 2009, so item 25's rule against future transitions is satisfied by
there being no transition to predict. They need no midday guard: a due date
thirty days out stays future and a due date a day back stays past even if the
zone rolls over mid-run.

**The one case here that runs a pass counts only this file's own emails.** A
pass polls every due row in the database, which is 8.6's poll rather than
anything an implementation may narrow, and under TEST_DATABASE_URL every test
file shares one database with no fileParallelism set. `reminderEmailsOf`
filters the sink to the addresses this file signed in, so a neighbouring
file's pass cannot redden this one and this one cannot redden it; the whole
reasoning is in reminders-harness.ts.

Spec: 8.6 (the trigger list, the past-instant rule, and the reset clause), 7.6
(due_date changed non-null recomputes fire_at), 11.7 (the pass and its stale
window), 4.8, section 13 item 25.
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
  KARACHI,
  NEW_YORK,
  ZoneCast,
  expectFireAt,
  putReminderOk,
  reminderEmailsOf,
  requireReminderRow,
  runPass,
  shiftDay,
} from './reminders-harness.js'
import { todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const WINTER_DUE = '2010-01-15'
const SUMMER_DUE = '2010-07-15'
const DUE_TIME = '09:00'

interface Stage {
  newYorker: Actor
  karachi: Actor
  nyFolderId: string
  karachiFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const newYorker = await cast.signIn(app, 'ny-mover', NEW_YORK)
    const karachi = await cast.signIn(app, 'karachi-mover', KARACHI)
    const nyFolderId = await createFolder(newYorker, 'p7 ac085 new york')
    const karachiFolderId = await createFolder(karachi, 'p7 ac085 karachi')
    folderIds.push(nyFolderId, karachiFolderId)
    staged = { newYorker, karachi, nyFolderId, karachiFolderId }
  }
  return staged
}

/** A timed task carrying a zero-offset reminder, so the fire instant is the
 * due instant itself and the arithmetic under test is the zone alone. */
async function remindedTask(
  actor: Actor,
  folderId: string,
  label: string,
  dueDate: string,
  dueTime = DUE_TIME,
): Promise<string> {
  const task = await createTaskOk(
    actor,
    {
      title: `p7 ac085 ${label}`,
      folder_id: folderId,
      due_date: dueDate,
      due_time: dueTime,
    },
    'a dated, timed task is creatable (spec 7.6)',
  )
  taskIds.push(task.id)
  await putReminderOk(
    actor,
    task.id,
    { offset_minutes: 0 },
    `a reminder at the due instant on ${label} (spec 7.9)`,
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

describe('AC-085: a due date that moves takes the fire instant with it', () => {
  test('AC-085: moving the due date recomputes fire_at through the zone, not by a shift', async () => {
    const { newYorker, nyFolderId } = await stage()
    const taskId = await remindedTask(
      newYorker,
      nyFolderId,
      'the criterion',
      WINTER_DUE,
    )
    const before = await requireReminderRow(app.db, taskId, 'the reminder exists')
    expectFireAt(
      before,
      new Date('2010-01-15T14:00:00Z'),
      `09:00 on ${WINTER_DUE} in ${NEW_YORK}, which is UTC-5 that day`,
    )

    await patchTaskOk(
      newYorker,
      taskId,
      { due_date: SUMMER_DUE },
      'PATCH /tasks/:id moving a non-null due_date (spec 7.6, which names the recompute in its own bullet)',
    )
    const after = await requireReminderRow(
      app.db,
      taskId,
      'the reminder survives the move',
    )
    expectFireAt(
      after,
      new Date('2010-07-15T13:00:00Z'),
      `8.6 recomputes from the new due_date, so 09:00 on ${SUMMER_DUE} in ${NEW_YORK}, which is UTC-4 that day`,
    )

    // Hours away from a whole number of days, signed, and measured from the
    // NEAREST whole day rather than from the floor. AC-084 carries the same
    // pair and the same repair: this gap is 180 days and 23 hours, so a
    // remainder taken with % answers +23 for every implementation that
    // satisfied the two constants above, which made the expectation
    // unreachable rather than strict.
    const days =
      (Date.parse(String(after.fire_at)) - Date.parse(String(before.fire_at))) /
      86_400_000
    expect(
      Math.round((days - Math.round(days)) * 24),
      'the due date moved a whole number of days and the instant did not, because a transition lies between them. An implementation adding the day difference to the stored instant answers a whole number of days here and is right in every season without one',
    ).toBe(-1)
  })

  test('AC-085: a due date recomputing into the past leaves the reminder skipped', async () => {
    const { karachi, karachiFolderId } = await stage()
    const future = shiftDay(todayIn(KARACHI), 30)
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'future then past',
      future,
      '12:00',
    )
    const scheduled = await requireReminderRow(
      app.db,
      taskId,
      'the reminder exists',
    )
    expect(
      scheduled.state,
      '7.9: a PUT computing an instant thirty days out leaves the row scheduled',
    ).toBe('scheduled')

    const past = shiftDay(todayIn(KARACHI), -1)
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: past },
      'PATCH /tasks/:id moving the due date into the past (spec 7.6)',
    )
    const row = await requireReminderRow(
      app.db,
      taskId,
      'the reminder survives the move',
    )
    expect(
      row.state,
      '8.6: when the recomputed instant is already past, the row is set state = skipped, never fired retroactively. Left scheduled, the next pass would deliver it, the instant being inside 11.7\'s six hour window for most of a day',
    ).toBe('skipped')
    expect(
      row.fire_at,
      'and the instant itself moved with the date, or the state would be describing the wrong value',
    ).toBe(
      // 12:00 on the previous local date in Karachi, UTC+5 all year.
      `${past}T07:00:00.000000Z`,
    )
  })

  test('AC-085: and the skipped reminder is never sent', async () => {
    const { karachi, karachiFolderId } = await stage()
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'never sent',
      shiftDay(todayIn(KARACHI), 30),
      '12:00',
    )
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: shiftDay(todayIn(KARACHI), -1) },
      'the same move into the past (spec 7.6)',
    )

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      reminderEmailsOf(app, cast).length - before,
      '8.6 polls state = scheduled, so a skipped row is not due however far past its instant is, and 11.7 must send nothing for it',
    ).toBe(0)
    expect(
      (await requireReminderRow(app.db, taskId, 'the row survives the pass'))
        .state,
      'and the pass leaves it skipped rather than reclassifying it',
    ).toBe('skipped')
  })

  test('AC-085: a due date moving back into the future returns the row to scheduled', async () => {
    const { karachi, karachiFolderId } = await stage()
    const taskId = await remindedTask(
      karachi,
      karachiFolderId,
      'back to the future',
      shiftDay(todayIn(KARACHI), 30),
      '12:00',
    )
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: shiftDay(todayIn(KARACHI), -1) },
      'first into the past (spec 7.6)',
    )
    expect(
      (await requireReminderRow(app.db, taskId, 'the row exists')).state,
      'the positive control for this case: the row really is skipped before the second move',
    ).toBe('skipped')

    const forward = shiftDay(todayIn(KARACHI), 45)
    await patchTaskOk(
      karachi,
      taskId,
      { due_date: forward },
      'and then forward again (spec 7.6)',
    )
    const row = await requireReminderRow(app.db, taskId, 'the row survives')
    expect(
      row.state,
      '8.6: fire_at is recomputed and state reset to scheduled when the new instant is in the future. A one-way implementation, skipping on the way down and staying skipped on the way up, satisfies this criterion\'s own sentence and quietly retires every reminder whose date was ever moved backwards',
    ).toBe('scheduled')
    expect(
      row.fire_at,
      'and it carries the instant of the new date',
    ).toBe(`${forward}T07:00:00.000000Z`)
  })

  test('AC-085: moving one task\'s date leaves another task\'s reminder alone', async () => {
    const { newYorker, nyFolderId } = await stage()
    const moved = await remindedTask(
      newYorker,
      nyFolderId,
      'the moved one',
      WINTER_DUE,
    )
    const bystander = await remindedTask(
      newYorker,
      nyFolderId,
      'the bystander',
      WINTER_DUE,
    )

    await patchTaskOk(
      newYorker,
      moved,
      { due_date: SUMMER_DUE },
      'one task\'s due date moves (spec 7.6)',
    )
    expectFireAt(
      await requireReminderRow(app.db, moved, 'the moved row'),
      new Date('2010-07-15T13:00:00Z'),
      'the positive control: this row did recompute',
    )
    expectFireAt(
      await requireReminderRow(app.db, bystander, 'the bystander row'),
      new Date('2010-01-15T14:00:00Z'),
      '8.6 recomputes the reminder of the task whose due_date changed, and a sweep scoped by assignee or by folder instead would move this one too',
    )
  })

  test('AC-085: invariants hold afterwards', async () => {
    const { newYorker, karachi } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      newYorker.id,
      karachi.id,
    ])
  })
})

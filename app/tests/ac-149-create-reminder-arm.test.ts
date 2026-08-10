/*
AC-149 (proposed): given POST /tasks carrying a reminder, then the row is
created with the 8.6 instant and the same guards the PUT enforces, a refused
body creates no task at all, and the two write paths agree on the instant.

Proposed here with its test; the number is the Integration Steward's to assign
at this package's change control. It is the fourth of the six surfaces the RFC
0001 P7 row names, described there as "a second write path to the same row
with the same guards".

**This arm has been deferred since P3 and arrives with no criterion.** Frozen
7.6's create body takes a reminder, the P3 kickoff deferred it to P7 with the
8.6 instant that 4.8's NOT NULL fire_at demands, and the field fell to 7.0's
tolerated-unknown rule meanwhile. So until this package lands, a client that
sends a reminder to POST /tasks gets a 201 and a task with no reminder on it,
and nothing in the suite notices. That is the failure this criterion exists
for, and it is invisible rather than loud.

**Two write paths computing one instant is a drift the schema cannot prevent.**
The guards are stated once in 4.8, "cross-table and enforced by the API,
restated at every write", and restated is exactly where implementations
diverge. So the last case here sends identical inputs through POST and through
PUT and requires identical instants, which is the assertion a shared
computation passes for free and two hand-written call sites do not.

**A refused create leaves nothing behind.** 7.6 lists the dependency checks in
one breath, "due_time, recurrence_rule, reminder require due_date; 422", so a
body with a reminder and no date is refused for the reminder and the whole
create rolls back. Counting rows is how that is asserted rather than trusting
the status, and the count is read through the harness's countRows, which
carries the one-column contract after a P6 site read no count at all and
compared NaN against NaN.

Spec: 7.6 (the create body, its dependency checks, its 201 TaskDetail), 7.9
(the mode rules the same guards restate), 4.8, 8.6, INV-6, 10.3.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { sql } from 'drizzle-orm'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { countRows, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTask,
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  dateOnlyFireInstant,
  expectFireAt,
  offsetFireInstant,
  putReminderOk,
  requireReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const DUE_TIME = '15:00'

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'creator', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac149')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

async function tasksTitled(title: string): Promise<number> {
  return countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM tasks WHERE title = ${title}`,
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

describe('AC-149 (proposed): the reminder arm of the 7.6 create body', () => {
  test('AC-149: a create carrying an offset reminder writes the row with its 8.6 instant', async () => {
    const { owner, folderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const created = await createTaskOk(
      owner,
      {
        title: 'p7 ac149 offset at create',
        folder_id: folderId,
        due_date: due,
        due_time: DUE_TIME,
        reminder: { offset_minutes: 45 },
      },
      '7.6\'s body takes a reminder, deferred at the P3 kickoff with the 8.6 instant 4.8 demands and delivered here',
    )
    taskIds.push(created.id)

    expect(
      created.reminder,
      '7.0 gives TaskDetail a reminder field and 7.6 answers 201 with the TaskDetail, so the created reminder rides back in it. Until this arm lands the field is tolerated and dropped, and the 201 looks identical',
    ).toEqual({ offset_minutes: 45, time_of_day: null })
    expectFireAt(
      await requireReminderRow(app.db, created.id, 'the create wrote a row'),
      offsetFireInstant(KARACHI, due, DUE_TIME, 45),
      '8.6 computes the instant at the create, since 4.8 admits no row without one',
    )
  })

  test('AC-149: a create carrying a date-only reminder does the same through the other arm', async () => {
    const { owner, folderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)
    const created = await createTaskOk(
      owner,
      {
        title: 'p7 ac149 date only at create',
        folder_id: folderId,
        due_date: due,
        reminder: { time_of_day: '09:00' },
      },
      'the date-only mode through the create body (spec 7.6, 4.8)',
    )
    taskIds.push(created.id)
    expect(created.reminder, 'the mode rides back in the 201').toEqual({
      offset_minutes: null,
      time_of_day: '09:00',
    })
    expectFireAt(
      await requireReminderRow(app.db, created.id, 'the create wrote a row'),
      dateOnlyFireInstant(KARACHI, due, '09:00'),
      '8.6\'s date-only arm, reached through the create path',
    )
  })

  test('AC-149: a reminder without a due_date is refused and no task is created', async () => {
    const { owner, folderId } = await stage()
    const title = 'p7 ac149 reminder without a date'
    expect(await tasksTitled(title), 'nothing by this title yet').toBe(0)

    expectStatus(
      await createTask(owner, {
        title,
        folder_id: folderId,
        reminder: { time_of_day: '09:00' },
      }),
      422,
      '7.6 names the dependency checks in one breath: due_time, recurrence_rule and reminder require due_date, 422. INV-6 is the invariant behind it',
    )
    expect(
      await tasksTitled(title),
      'and the whole create rolls back, so a refused body leaves no task at all rather than a dateless task the reminder never reached',
    ).toBe(0)
  })

  test('AC-149: the create restates the mode guard the PUT enforces', async () => {
    const { owner, folderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)

    const wrongMode = 'p7 ac149 offset without due_time'
    expectStatus(
      await createTask(owner, {
        title: wrongMode,
        folder_id: folderId,
        due_date: due,
        reminder: { offset_minutes: 30 },
      }),
      422,
      '4.8: which mode is legal depends on the task\'s due_time, cross-table and enforced by the API, restated at every write. This is the write AC-090 makes through the other door',
    )
    expect(
      await tasksTitled(wrongMode),
      'and nothing was created',
    ).toBe(0)

    const bothModes = 'p7 ac149 both modes at create'
    expectStatus(
      await createTask(owner, {
        title: bothModes,
        folder_id: folderId,
        due_date: due,
        due_time: DUE_TIME,
        reminder: { offset_minutes: 30, time_of_day: '09:00' },
      }),
      422,
      '4.8 admits exactly one mode per row on this path as much as on the other',
    )
    expect(await tasksTitled(bothModes), 'and nothing was created').toBe(0)
  })

  test('AC-149: the two write paths compute the same instant from the same inputs', async () => {
    const { owner, folderId } = await stage()
    const due = shiftDate(todayIn(KARACHI), 30)

    const throughCreate = await createTaskOk(
      owner,
      {
        title: 'p7 ac149 through the create body',
        folder_id: folderId,
        due_date: due,
        due_time: DUE_TIME,
        reminder: { offset_minutes: 45 },
      },
      'one path (spec 7.6)',
    )
    taskIds.push(throughCreate.id)

    const throughPut = await createTaskOk(
      owner,
      {
        title: 'p7 ac149 through the PUT',
        folder_id: folderId,
        due_date: due,
        due_time: DUE_TIME,
      },
      'and the same task without a reminder (spec 7.6)',
    )
    taskIds.push(throughPut.id)
    await putReminderOk(
      owner,
      throughPut.id,
      { offset_minutes: 45 },
      'the other path (spec 7.9)',
    )

    expect(
      String(
        (await requireReminderRow(app.db, throughPut.id, 'the PUT row')).fire_at,
      ),
      '4.8 states the mode rules once and calls them enforced by the API and restated at every write, and restated is where two call sites drift. One shared computation passes this for free; two hand-written ones agree only by luck',
    ).toBe(
      String(
        (await requireReminderRow(app.db, throughCreate.id, 'the create row'))
          .fire_at,
      ),
    )
  })

  test('AC-149: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})

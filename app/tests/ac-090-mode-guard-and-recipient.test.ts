/*
AC-090: given PUT reminder with offset_minutes on a task without due_time,
then 422; given a valid reminder in a single-member folder, then the recipient
is that member.

**One criterion, two owners, and the RFC 0001 P7 row says so.** The first
clause is a 7.9 validation the Collaboration engineer raises where every other
10.3 field error in this codebase arises; the second is a delivery recipient
observed through the 11.10 sink, which the Platform engineer's pass makes
answer. Neither session is done alone and neither is at fault for the other's
red, so the two clauses are separate cases and each names what it is about.

**The second clause cannot be tested in the fixture it names, and this file
says so instead of pretending otherwise.** In a single-member folder INV-5
forces every task's assignee to that member, so "the recipient is that member"
is satisfied exactly as well by an implementation that mails the assignee and
by one that mails every member of the folder. The criterion's own fixture is
asserted, because it is the criterion; the discriminator is a second folder
with three members where only the assignee may receive anything. Without it
this clause is a sentence that no wrong implementation can fail, which is the
same reasoning AC-088 carries about broadcast.

**The refusal is asserted beside a success on the same URL**, the standing
rule these files have followed since P4: while the route is unmounted every
path answers 404, so a case asserting only a 422 discriminates nothing and
would go on passing against an endpoint nobody mounted. The same task that
refuses `offset_minutes` accepts `time_of_day`, one call apart.

**And a refusal writes nothing.** 4.8's NOT NULL fire_at means a rejected PUT
has no row to leave behind, so the assertion is that none exists; on a repeat
against a task that already carries a reminder, the assertion is that the
stored row is byte for byte what it was.

The other 7.9 guards, the task with no due_date at all and the converse wrong
mode, are not this criterion's. They are AC-147, numbered at this package's
change control on 2026-08-10, because 7.9 names the no-due_date refusal
separately from the wrong-mode one and no number covered it.

**The recipient assertions count this file's own actors only.** A pass polls
every due row in the database, 8.6's poll being scoped by state and instant
and by nothing else, and under TEST_DATABASE_URL every test file shares one
database with no fileParallelism set. `reminderEmailsOf` filters the sink to
the addresses this file signed in, so a neighbouring file's delivery cannot
appear in an equality about who this folder's reminder reached. The
discriminating half is untouched: this file's own three members are all
inside the filter, which is exactly where a broadcast would show.

Spec: 7.9 (the mode rules, and the ruling of 2026-08-10 that PUT answers the
affected TaskDetail), 4.8 (which mode is legal depends on the task's due_time,
cross-table and enforced by the API), 8.6 (delivery to the assignee), INV-5,
INV-6, 11.10, 7.0 (the 422 envelope naming the field).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
} from './tasks-harness.js'
import {
  KARACHI,
  LONDON,
  NEW_YORK,
  ZoneCast,
  expectNoReminderRow,
  minutesAgo,
  putReminder,
  putReminderOk,
  reminderEmailsOf,
  requireReminderRow,
  runPass,
  seedReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

interface Stage {
  solo: Actor
  second: Actor
  third: Actor
  soloFolderId: string
  sharedFolderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const solo = await cast.signIn(app, 'sole-member', KARACHI)
    const second = await cast.signIn(app, 'second-member', LONDON)
    const third = await cast.signIn(app, 'third-member', NEW_YORK)
    await connect(app.db, solo.id, second.id)
    await connect(app.db, solo.id, third.id)
    const soloFolderId = await createFolder(solo, 'p7 ac090 sole member')
    const sharedFolderId = await createFolder(solo, 'p7 ac090 three members')
    await addMemberOk(solo, sharedFolderId, second.id)
    await addMemberOk(solo, sharedFolderId, third.id)
    folderIds.push(soloFolderId, sharedFolderId)
    staged = { solo, second, third, soloFolderId, sharedFolderId }
  }
  return staged
}

async function task(
  actor: Actor,
  folderId: string,
  label: string,
  body: Record<string, unknown>,
): Promise<string> {
  const created = await createTaskOk(
    actor,
    { title: `p7 ac090 ${label}`, folder_id: folderId, ...body },
    'the fixture task is creatable (spec 7.6)',
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

describe('AC-090: the wrong mode is refused, and the right one reaches one person', () => {
  test('AC-090: offset_minutes on a task without due_time answers 422 and writes nothing', async () => {
    const { solo, soloFolderId } = await stage()
    const taskId = await task(solo, soloFolderId, 'date only', {
      due_date: shiftDate(todayIn(KARACHI), 3),
    })

    const refused = await putReminder(solo, taskId, { offset_minutes: 30 })
    expectStatus(
      refused,
      422,
      '7.9: { offset_minutes } is the mode for a task that has due_time, and 4.8 makes which mode is legal depend on that column, cross-table and enforced by the API at every write',
    )
    expect(
      JSON.stringify(refused.json()).toLowerCase(),
      '7.0 gives a validation failure the envelope { error: { code, message } } with the field named, and the field here is the offset',
    ).toMatch(/offset/)
    await expectNoReminderRow(
      app.db,
      taskId,
      '4.8 makes fire_at NOT NULL, so a refused write has nothing to leave behind and must leave nothing',
    )

    // The success beside the refusal, on the same URL one call later: while
    // this route is unmounted every path answers 404, and a case asserting a
    // 422 alone would pass against an endpoint nobody mounted.
    await putReminderOk(
      solo,
      taskId,
      { time_of_day: '09:00' },
      'the same task accepts the mode 4.8 does admit for it',
    )
    expect(
      (await requireReminderRow(app.db, taskId, 'the accepted write')).time_of_day,
      'and stores it in the date-only column',
    ).toBe('09:00:00')
  })

  test('AC-090: the refusal leaves an existing reminder exactly as it was', async () => {
    const { solo, soloFolderId } = await stage()
    const taskId = await task(solo, soloFolderId, 'refusal over a row', {
      due_date: shiftDate(todayIn(KARACHI), 3),
    })
    await putReminderOk(
      solo,
      taskId,
      { time_of_day: '09:00' },
      'a legal date-only reminder first (spec 7.9)',
    )
    const before = await requireReminderRow(app.db, taskId, 'the row exists')

    expectStatus(
      await putReminder(solo, taskId, { offset_minutes: 30 }),
      422,
      'the wrong mode is refused whether or not a row already exists (spec 7.9, 4.8)',
    )
    expect(
      await requireReminderRow(app.db, taskId, 'the row survives the refusal'),
      '7.9 upserts on success; a refusal is not a partial upsert, and a route that wrote the mode before validating it would have flipped this row into a state 4.8\'s exclusive-or admits and 4.8\'s cross-table rule forbids',
    ).toEqual(before)
  })

  test('AC-090: in a single-member folder the recipient is that member', async () => {
    const { solo, soloFolderId } = await stage()
    const taskId = await task(solo, soloFolderId, 'the criterion', {
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '12:00',
    })
    await seedReminderRow(app.db, {
      taskId,
      createdBy: solo.id,
      offsetMinutes: 30,
      fireAt: minutesAgo(1),
    })

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      reminderEmailsOf(app, cast).slice(before).map((email) => email.to),
      '8.6 sends to the assignee, whom INV-5 makes the sole member of this folder',
    ).toEqual([solo.email])
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder exists')).state,
      'and the row records the send (spec 4.8)',
    ).toBe('sent')
  })

  test('AC-090: and in a folder with three members it is still one person', async () => {
    const { solo, second, third, sharedFolderId } = await stage()
    const taskId = await task(solo, sharedFolderId, 'the discriminator', {
      due_date: shiftDate(todayIn(KARACHI), 3),
      due_time: '12:00',
      assignee_id: second.id,
    })
    await seedReminderRow(app.db, {
      taskId,
      createdBy: solo.id,
      offsetMinutes: 30,
      fireAt: minutesAgo(1),
    })

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      reminderEmailsOf(app, cast).slice(before).map((email) => email.to).sort(),
      `the criterion's own fixture cannot tell "the assignee" from "every member", INV-5 making them the same person in a single-member folder. Here they are not: the task is assigned to one of three, and 8.6 never broadcasts to a folder, so neither ${solo.email} nor ${third.email} may receive anything`,
    ).toEqual([second.email])
  })

  test('AC-090: invariants hold afterwards', async () => {
    const { solo, second, third } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [
      solo.id,
      second.id,
      third.id,
    ])
  })
})

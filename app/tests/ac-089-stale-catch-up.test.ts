/*
AC-089: given the scheduler was down across fire_at and restarts within 6
hours, then it sends; beyond 6 hours, it skips.

**Both sides, in one pass.** The RFC 0001 P7 row names this criterion's
boundary as tested from one side today and asks for both, and the reason is
the shape of the mistake: `now() minus fire_at > 6 hours` written with the
comparison the other way round, or with the units confused, still sends the
recent one and still skips nothing, and a fixture that only ever tests one
side of a boundary tests the poll rather than the rule. So two reminders are
due in the same pass, one just inside the window and one just outside, and the
pass must treat them differently.

**Inside and outside, deliberately, rather than exactly at.** 8.6 skips when
the age is strictly greater than six hours, so the boundary itself is a knife
edge in wall-clock terms: a row seeded at exactly six hours is already older
than six hours by the microseconds the pass takes to reach it, and a test
asserting either answer there would be a coin flip.

**The inside row's headroom was raised from one minute to one hour on
2026-08-24, and the reason is that a minute is a slower coin rather than no
coin.** The pair began at five hours fifty-nine and six hours one, a minute
either side, and the inside row is the one that decays: it ages toward the
boundary while the fixture is still building the outside row's folder, task
and reminder on a single-connection backend, and if that takes sixty seconds
the pass then reads a row that has genuinely gone stale and correctly skips
it. The test fails, the code is right, and the report names the emptiest
possible assertion. Measured rather than reasoned about: byte-identical trees
passed this file three times and failed it once, on a CI job that started
behind a ten minute browser leg on the same machine.

Five hours is the same rule at the same boundary with an hour of slack, so
nothing about what this file asserts moves. The outside row keeps its minute
and needs no more, because it ages away from the boundary: a row already past
six hours only gets staler, and every extra second makes its assertion more
true rather than less. Asymmetry here is the point rather than an oversight.

**"The scheduler was down across fire_at" is the suite's ordinary state.** The
acceptance suite never starts 11.7's interval; it runs single passes on
demand, so an instant that passes with no pass running is exactly the outage
the criterion describes, and the restart is the next call. 11.7's first
consequence rides along: the poll is over `fire_at <= now()`, so a missed tick
self-heals and a later pass picks up what an earlier one would have sent.

**What each backend leg proves, and what this file will not assert.** 11.7
claims due rows with SELECT ... FOR UPDATE SKIP LOCKED, which is contention
between concurrent transactions. 11.15, as corrected at the P3 merge review,
records that PGlite is single-connection and that what genuinely needs a
second connection is a second concurrent transaction: one connection
serializes statements, not handler logic. A pass is one transaction, so on the
default backend two passes issued together queue, and the second finds the
first pass's work already committed; on CI's postgres:18 leg, which 11.10
makes the production-fidelity authority, they genuinely overlap and the lock
is what decides them. The assertions below are the outcome both legs must
produce, one email and one fired_at, and they are satisfied identically by
queueing and by locking. Asserting that an overlap was observed would be a
false red on the leg where queueing is what prevents it, which is the same
honesty AC-021, AC-077 and AC-124 carry in their own headers. The plain
summary: locally this file proves the outcome, and on postgres:18 it proves
the lock.

**And a second thing the postgres leg changes, on the same reasoning.** A pass
polls every due row in the database, so under TEST_DATABASE_URL, where every
test file shares one and no fileParallelism is set, a neighbouring file's due
rows would arrive in this file's slice and break the exact counts below.
`reminderEmailsOf` filters the sink to the addresses this file signed in. It
does not touch the concurrency question above: the two passes issued together
still race or queue as the backend decides, and what is scoped is only which
deliveries this file counts as its own.

Spec: 8.6 (the stale catch-up skip and the poll predicate), 11.7 (the pass,
its self-healing tick, and SKIP LOCKED), 11.15 and 11.10 (what each leg can
show), 4.8.
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
} from './tasks-harness.js'
import {
  KARACHI,
  ZoneCast,
  minutesAgo,
  minutesAhead,
  reminderEmailsOf,
  requireReminderRow,
  runPass,
  runTwoPassesTogether,
  seedReminderRow,
  setFireAt,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

// 8.6's window is six hours. The inside row carries an hour of slack because
// it ages toward the boundary while the fixture builds the outside row; the
// outside row keeps a minute because it ages away from it. See the header.
const INSIDE = 5 * 60
const JUST_OUTSIDE = 6 * 60 + 1

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await cast.signIn(app, 'outage', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac089')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

/** A pending task whose reminder came due `agoMinutes` ago with no pass
 * having run since, which is the outage this criterion describes. */
async function missedReminder(
  label: string,
  agoMinutes: number,
): Promise<string> {
  const { owner, folderId } = await stage()
  const task = await createTaskOk(
    owner,
    {
      title: `p7 ac089 ${label}`,
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
    fireAt: minutesAgo(agoMinutes),
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

describe('AC-089: a restart inside the stale window sends, and beyond it skips', () => {
  test('AC-089: one pass sends the reminder just inside six hours and skips the one just outside', async () => {
    const { owner } = await stage()
    const inside = await missedReminder('five hours', INSIDE)
    const outside = await missedReminder('six hours one', JUST_OUTSIDE)

    const before = reminderEmailsOf(app, cast).length
    await runPass(app)
    const arrived = reminderEmailsOf(app, cast).slice(before)

    const insideRow = await requireReminderRow(
      app.db,
      inside,
      'the reminder just inside the window',
    )
    expect(
      insideRow.state,
      '8.6 skips only when now() minus fire_at exceeds six hours, and this row is five hours old, so the restart delivers it',
    ).toBe('sent')
    expect(
      insideRow.fired_at,
      '4.8 sets fired_at when state leaves scheduled',
    ).not.toBeNull()

    const outsideRow = await requireReminderRow(
      app.db,
      outside,
      'the reminder just outside the window',
    )
    expect(
      outsideRow.state,
      '8.6: beyond six hours the row is stale and the pass records skipped rather than delivering a reminder for a deadline that went by this morning. Both rows were due in the same pass, so a comparison written the wrong way round, or in the wrong units, cannot satisfy this and the case above at once',
    ).toBe('skipped')
    expect(
      outsideRow.fired_at,
      'and a stale skip is recorded like any other',
    ).not.toBeNull()

    expect(
      arrived.map((email) => email.to),
      'exactly one email left this pass, for the row inside the window',
    ).toEqual([owner.email])
  })

  test('AC-089: a missed tick self-heals on the next pass', async () => {
    const { owner } = await stage()
    const taskId = await missedReminder('not yet due', 0)
    // Ahead of now, so this pass is the tick that finds nothing.
    await setFireAt(app.db, taskId, minutesAhead(30))

    let before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder exists')).state,
      '8.6 polls fire_at <= now(), so a row whose instant is still ahead is not due and this pass must leave it alone',
    ).toBe('scheduled')
    expect(reminderEmailsOf(app, cast).length - before, 'and send nothing').toBe(0)

    // The instant passes with no pass running, which is 11.7's missed tick.
    await setFireAt(app.db, taskId, minutesAgo(10))
    before = reminderEmailsOf(app, cast).length
    await runPass(app)
    expect(
      (await requireReminderRow(app.db, taskId, 'the reminder exists')).state,
      '11.7: the poll is over fire_at <= now(), so the next pass picks up anything a missed one would have sent, inside the six hour window',
    ).toBe('sent')
    expect(
      reminderEmailsOf(app, cast).slice(before).map((email) => email.to),
      'and it reaches the assignee',
    ).toEqual([owner.email])
  })

  test('AC-089: two passes arriving together produce one email, not two', async () => {
    const { owner } = await stage()
    const taskId = await missedReminder('two passes at once', 10)

    const before = reminderEmailsOf(app, cast).length
    // 11.7: the deploy overlap window can run two instances for about ninety
    // seconds, and SKIP LOCKED is what makes concurrent ticks contend safely
    // rather than double-send. What each leg of this suite can show is in the
    // file header; the assertions are the outcome both must produce.
    await runTwoPassesTogether(app)

    expect(
      reminderEmailsOf(app, cast).slice(before).map((email) => email.to),
      '11.7 claims due rows with SELECT ... FOR UPDATE SKIP LOCKED so two ticks cannot both send the same reminder. On this suite\'s default backend the pair queues, single-connection per 11.15, and the second pass must find the row no longer scheduled; on CI\'s postgres:18 leg they overlap and the lock decides it. Either way one email is the answer, and a pass that reads its due rows outside a transaction, or claims them without locking, sends two',
    ).toEqual([owner.email])

    const row = await requireReminderRow(app.db, taskId, 'the reminder exists')
    expect(row.state, 'and the row settles once').toBe('sent')
    expect(row.fired_at, 'with one fired_at on it').not.toBeNull()
  })

  test('AC-089: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})

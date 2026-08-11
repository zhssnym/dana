/*
AC-168: given a write that computes a fire instant already past, whether 8.5's
copy onto a generated successor or 7.9's PUT, then the row is written skipped
with fired_at set rather than scheduled, and the next scheduler pass sends
nothing for it; given the same writes computing an instant in the future, then
the row is written scheduled with fired_at null and the pass sends when the
instant arrives.

Numbered by the third change control on 2026-08-10, from the defect the
endpoint shape review found while putting frozen 7.9 on the wire. Only the
test is this role's; the criterion is settled text, the AC-124, AC-141 and
AC-154 shape.

**8.6 defines the rule once now, and this file tests the rule rather than the
sentence.** The state a reminders row is written with is a function of its
instant on every path that writes one: scheduled when the instant is in the
future, skipped with fired_at set when it is past, never fired retroactively.
That was written as a property of the recompute alone and the narrowness
produced the same defect twice on one row, frozen 7.9's PUT bullet saying
state resets to scheduled without condition until the owner qualified it, and
8.5's copy arm saying state='scheduled' flat until this change control. So the
criterion covers the creating paths together, and the two arms below are the
two that create a row from a computed instant.

**Why the scheduler clause is not decoration.** The stored value is not the
harm; the poll matching on it is. The loop selects state = 'scheduled' with
fire_at <= now() and skips only what is more than six hours stale, so a row
written scheduled with a past instant *inside* that window is mailed on the
very next tick, for a deadline that has not arrived and that nobody scheduled
it for. The defence recorded in the implementation, that the loop reaches the
same answer one tick later, is true beyond six hours and exactly inverted
inside them. Both past-instant fixtures here therefore land about an hour
back, not a day: a fixture six days stale would be skipped by the staleness
rule whatever state it carried, and would assert nothing about this rule at
all.

**The future arms are not optional either.** An implementation writing skipped
unconditionally satisfies every past-instant clause in this file and silences
every reminder in the product, so each arm carries its own future case, and
each of those goes on to prove the row is deliverable by moving its instant
into reach and running a pass.

Which of the four arms this file arrives red on is worth stating, because
three of them arrive green and only one of those three is a regression guard.
The copy's past-instant case is the defect and is the red. The copy's
future-instant case passes against the very implementation the criterion
condemns, because a flat 'scheduled' is the right answer whenever the instant
happens to be ahead; it discriminates against the opposite mistake rather than
against this one, and it is worth having for that and not as evidence the copy
is half right. Both PUT cases pass because the three API paths share one
writer that stores the planner's answer, and the past one is a first assertion
rather than a regression guard, the owner's 7.9 qualifier of 2026-08-10 having
gone unpinned on every creating path since it was ruled.

**What this file does not reach, and why.** The change control recorded that
the copy falsifies its returned ReminderPlan as well as its INSERT, so a
caller trusting that value is misled even once the row is right. That return
is internal: no response in section 7 carries a reminder's state, TaskCard
having no reminder field at all and TaskDetail carrying only 4.8's two mode
columns, so an acceptance test measuring section 7 over HTTP cannot see it.
The criterion speaks about the row and so does this file. The plan's own
correctness belongs to that module's unit tests, where protocol section 8 puts
it.

**Both offsets are computed from the clock rather than chosen.** The instant a
write earns depends on when the write happens, so each case derives the offset
that lands its instant where the case needs it, and asserts the result is
inside 4.8's 0 to 10080 before using it. Asia/Karachi has observed no DST
since 2009, so the arithmetic is one subtraction and no fixture here depends
on a transition.

Spec: 8.6 (the state a write earns, defined once for all five writing paths;
the delivery loop and its six-hour staleness rule), 8.5 (the copy, whose line
now reads fire_at and state both per 8.6), 7.9 (the PUT, and the owner's
past-instant qualifier of 2026-08-10), 4.8 (state, fired_at, and the offset
bound), 11.7 (the pass).
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
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
} from './recurrence-harness.js'
import {
  KARACHI,
  ZoneCast,
  expectFireAt,
  instantAtWallTime,
  minutesAgo,
  putReminderOk,
  reminderEmailsFor,
  requireReminderRow,
  runPass,
  seedReminderRow,
  setFireAt,
  shiftDay,
} from './reminders-harness.js'
import { expectStillSameDay, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const DUE_TIME = '09:00'
/** Far enough back to be unambiguously past, far enough inside 8.6's six hour
 * staleness rule that the loop would deliver it if it were left scheduled. */
const PAST_BY_MINUTES = 60
const STALE_WINDOW_MS = 6 * 60 * 60 * 1000

interface Stage {
  owner: Actor
  folderId: string
}
const taskIds: string[] = []
const folderIds: string[] = []
const actorIds: string[] = []
const everyone: Actor[] = []

/*
Each case owns an actor and a folder of its own, and counts only the mail its
own actor received. That is heavier than the shared cast the other delivery
files use, and this file needs it because it is written red: the first case
below fails at its state assertion and abandons a row the implementation left
scheduled with a past instant, which a later case's pass would then deliver
and count. Per-case scoping makes each case independent of whether the ones
before it got as far as tidying up.
*/
async function stage(slug: string): Promise<Stage> {
  const owner = await cast.signIn(app, `instant-${slug}`, KARACHI)
  const folderId = await createFolder(owner, `p7 ac168 ${slug}`)
  folderIds.push(folderId)
  actorIds.push(owner.id)
  everyone.push(owner)
  return { owner, folderId }
}

/** Reminder mail this case's own actor received, and nobody else's. */
function mailFor(owner: Actor): readonly { to: string }[] {
  return reminderEmailsFor(app, [owner])
}

/**
 * The 4.8 offset that puts a reminder's instant at `target`, given the
 * instant its task is due at. Derived rather than chosen, because where a
 * computed instant lands depends on when the write happens, and asserted
 * inside 4.8's bound so a fixture that drifted out of range fails as a
 * fixture rather than as a 422 about something else.
 */
function offsetLanding(dueInstant: Date, target: Date): number {
  const offset = Math.round((dueInstant.getTime() - target.getTime()) / 60_000)
  expect(
    offset >= 0 && offset <= 10_080,
    `4.8 admits offset_minutes BETWEEN 0 AND 10080 and this fixture derived ${String(offset)}, so it cannot be written at all`,
  ).toBe(true)
  return offset
}

/** The instant a row with this offset earns, computed the way 8.6 computes
 * it: the due instant less the offset. */
function instantFor(dueInstant: Date, offsetMinutes: number): Date {
  return new Date(dueInstant.getTime() - offsetMinutes * 60_000)
}

/** A fixture whose instant must be past and inside the window the loop would
 * still deliver in, asserted before anything depends on it. */
function expectPastAndDeliverable(instant: Date, why: string): void {
  const age = Date.now() - instant.getTime()
  expect(
    age > 0,
    `${why}: the instant must be in the past, and it is ${String(Math.round(age / 60_000))} minutes old`,
  ).toBe(true)
  expect(
    age < STALE_WINDOW_MS,
    `${why}: and inside 8.6's six hour staleness rule, or the loop would skip it whatever state it carried and this case would assert nothing about the state a write earns`,
  ).toBe(true)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-168: a written row carries the state its instant earns', () => {
  test('AC-168: 8.5\'s copy writes a past instant skipped, and the pass sends nothing', async () => {
    const { owner, folderId } = await stage('copy-past')
    const due = todayIn(KARACHI)
    const fixture = await seedRecurringTask(app.db, owner, {
      folderId,
      title: 'p7 ac168 daily, copy lands in the past',
      dueDate: due,
      dueTime: DUE_TIME,
      rule: 'FREQ=DAILY',
    })
    taskIds.push(fixture.taskId)

    // 8.5's cutoff is max(due_date, today in the request's zone), so a daily
    // rule anchored on today generates tomorrow, and the reminder leads the
    // successor by enough to land an hour ago. These are ordinary values:
    // 4.8 admits a lead of up to seven days.
    const successorDue = shiftDay(due, 1)
    const successorDueInstant = instantAtWallTime(KARACHI, successorDue, DUE_TIME)
    const target = minutesAgo(PAST_BY_MINUTES)
    const offset = offsetLanding(successorDueInstant, target)
    const expected = instantFor(successorDueInstant, offset)
    expectPastAndDeliverable(expected, 'the successor\'s computed instant')

    // The source row is seeded terminal, which is the state its own long-past
    // instant earns, and keeps it out of the poll so every email this case
    // counts belongs to the successor.
    await seedReminderRow(app.db, {
      taskId: fixture.taskId,
      createdBy: owner.id,
      offsetMinutes: offset,
      fireAt: instantFor(instantAtWallTime(KARACHI, due, DUE_TIME), offset),
      state: 'skipped',
      firedAt: minutesAgo(1),
    })

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      KARACHI,
      'completing an occurrence that carries a rule generates its successor (spec 8.5, 5.1)',
    )
    expectStillSameDay(
      KARACHI,
      due,
      'this fixture is anchored on today in Karachi and the successor date is derived from it',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)
    expect(
      String(successor.due_date),
      '8.5: a daily rule anchored on today generates tomorrow',
    ).toBe(successorDue)

    const row = await requireReminderRow(
      app.db,
      successor.id,
      '8.5 copies the reminder onto the successor (AC-150)',
    )
    expectFireAt(
      row,
      expected,
      '8.5 recomputes the instant for the successor\'s own due date, which AC-150 pins; this case is about the state written beside it',
    )
    expect(
      row.state,
      '8.6 defines the state a write earns as a function of its instant, on every path that writes one: this instant is past, so the row is written skipped. 8.5\'s copy computed that answer through the same planner the API paths use and then discarded it for a flat scheduled, which is the defect this criterion was numbered for',
    ).toBe('skipped')
    expect(
      row.fired_at,
      '8.6: skipped with fired_at set, so 4.8\'s note that the column is set when state leaves scheduled stays true of a row that was never scheduled either',
    ).not.toBeNull()

    const before = mailFor(owner).length
    await runPass(app)
    expect(
      mailFor(owner).length - before,
      'and the harm the state prevents: the loop polls state = scheduled with fire_at <= now() and skips only what is more than six hours stale, so a row left scheduled an hour past is mailed on this very tick, for a deadline that has not arrived. That is the retroactive fire 8.6 forbids',
    ).toBe(0)
    expect(
      (await requireReminderRow(app.db, successor.id, 'the row survives the pass'))
        .state,
      'and the pass leaves it skipped rather than reclassifying it',
    ).toBe('skipped')
  })

  test('AC-168: 8.5\'s copy writes a future instant scheduled, and it stays deliverable', async () => {
    const { owner, folderId } = await stage('copy-future')
    const due = todayIn(KARACHI)
    const fixture = await seedRecurringTask(app.db, owner, {
      folderId,
      title: 'p7 ac168 daily, copy lands in the future',
      dueDate: due,
      dueTime: DUE_TIME,
      rule: 'FREQ=DAILY',
    })
    taskIds.push(fixture.taskId)

    const successorDue = shiftDay(due, 1)
    const successorDueInstant = instantAtWallTime(KARACHI, successorDue, DUE_TIME)
    // A half hour lead, so the successor's instant sits where its own due
    // instant does, comfortably ahead.
    const offset = 30
    const expected = instantFor(successorDueInstant, offset)
    expect(
      expected.getTime() > Date.now(),
      'this arm needs a future instant, and tomorrow at 09:00 Karachi less thirty minutes is one',
    ).toBe(true)

    await seedReminderRow(app.db, {
      taskId: fixture.taskId,
      createdBy: owner.id,
      offsetMinutes: offset,
      fireAt: instantFor(instantAtWallTime(KARACHI, due, DUE_TIME), offset),
      state: 'skipped',
      firedAt: minutesAgo(1),
    })

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      KARACHI,
      'the completion (spec 8.5, 5.1)',
    )
    expectStillSameDay(KARACHI, due, 'the successor date is derived from today')
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)

    const row = await requireReminderRow(
      app.db,
      successor.id,
      '8.5 copies the reminder onto the successor',
    )
    expectFireAt(row, expected, '8.5 recomputes for the successor\'s due date')
    expect(
      row.state,
      '8.6: a future instant earns scheduled. An implementation writing skipped unconditionally satisfies every past-instant clause in this file and silences every reminder in the product, which is what this arm exists to refuse',
    ).toBe('scheduled')
    expect(
      row.fired_at,
      'and a row that has not fired carries no fired_at (spec 4.8)',
    ).toBeNull()

    // Deliverable, not merely labelled: the instant arrives and the loop
    // mails it, which is what makes the state above mean something.
    await setFireAt(app.db, successor.id, minutesAgo(1))
    const before = mailFor(owner).length
    await runPass(app)
    expect(
      mailFor(owner).slice(before).map((email) => email.to),
      '11.7: the pass sends when the instant arrives, so the scheduled row is delivered to its assignee',
    ).toEqual([owner.email])
    expect(
      (await requireReminderRow(app.db, successor.id, 'the row settles')).state,
      'and the row records the send (spec 4.8)',
    ).toBe('sent')
  })

  test('AC-168: 7.9\'s PUT writes a past instant skipped, and the pass sends nothing', async () => {
    const { owner, folderId } = await stage('put-past')
    // Due tomorrow, so the derived offset stays inside 4.8's bound whatever
    // time of day this run starts at.
    const due = shiftDay(todayIn(KARACHI), 1)
    const dueInstant = instantAtWallTime(KARACHI, due, DUE_TIME)
    const target = minutesAgo(PAST_BY_MINUTES)
    const offset = offsetLanding(dueInstant, target)
    const expected = instantFor(dueInstant, offset)
    expectPastAndDeliverable(expected, 'the instant the PUT computes')

    const task = await createTaskOk(
      owner,
      {
        title: 'p7 ac168 PUT lands in the past',
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
      { offset_minutes: offset },
      'PUT /tasks/:id/reminder with a lead long enough to land the instant in the past (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, task.id, 'the PUT wrote a row')
    expectFireAt(row, expected, '8.6 computes the instant from the due instant and the lead')
    expect(
      row.state,
      'frozen 7.9 as qualified by owner ruling on 2026-08-10: state resets to scheduled unless that instant is already past, in which case skipped. Nothing had asserted that qualifier on any creating path, AC-148 having confined itself to future instants while the ruling was fresh, so this is its first assertion rather than a regression guard',
    ).toBe('skipped')
    expect(
      row.fired_at,
      '8.6: skipped with fired_at set, the same rule the copy arm above is about',
    ).not.toBeNull()

    const before = mailFor(owner).length
    await runPass(app)
    expect(
      mailFor(owner).length - before,
      'and the pass sends nothing for it, the instant being an hour past and the row not scheduled',
    ).toBe(0)
  })

  test('AC-168: 7.9\'s PUT writes a future instant scheduled, and it stays deliverable', async () => {
    const { owner, folderId } = await stage('put-future')
    const due = shiftDay(todayIn(KARACHI), 1)
    const task = await createTaskOk(
      owner,
      {
        title: 'p7 ac168 PUT lands in the future',
        folder_id: folderId,
        due_date: due,
        due_time: DUE_TIME,
      },
      'a dated, timed task is creatable (spec 7.6)',
    )
    taskIds.push(task.id)

    const expected = instantFor(instantAtWallTime(KARACHI, due, DUE_TIME), 30)
    expect(
      expected.getTime() > Date.now(),
      'this arm needs a future instant',
    ).toBe(true)

    await putReminderOk(
      owner,
      task.id,
      { offset_minutes: 30 },
      'PUT /tasks/:id/reminder with a short lead (spec 7.9)',
    )
    const row = await requireReminderRow(app.db, task.id, 'the PUT wrote a row')
    expectFireAt(row, expected, '8.6 computes the instant')
    expect(
      row.state,
      '8.6: a future instant earns scheduled, on this path as on the other',
    ).toBe('scheduled')
    expect(row.fired_at, 'and no fired_at (spec 4.8)').toBeNull()

    await setFireAt(app.db, task.id, minutesAgo(1))
    const before = mailFor(owner).length
    await runPass(app)
    expect(
      mailFor(owner).slice(before).map((email) => email.to),
      '11.7: the pass sends when the instant arrives',
    ).toEqual([owner.email])
  })

  test('AC-168: invariants hold afterwards', async () => {
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, actorIds)
  })
})

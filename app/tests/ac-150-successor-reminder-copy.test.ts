/*
AC-150 (proposed): given a recurring occurrence carrying a reminder, when it
generates a successor, then the successor carries a reminder of the same mode
and value with fire_at recomputed for its own due date and state scheduled,
and the closing row's reminder is untouched.

Proposed here with its test; the number is the Integration Steward's to assign
at this package's change control. It is the fifth of the six surfaces the RFC
0001 P7 row names, and the only one that was recorded as uncovered by the
package before this one: P6 left the reminder-copy arm of 8.5's generation as
a comment in its own generation module, deferred with the computation it
requires, and its row states that no criterion in AC-071 to AC-082 asserts the
copy and that none in this range did either.

**The whole feature fails silently without it.** A repeating task with a
reminder is the ordinary case for a repeating task, and a generation that
copies steps and forgets the reminder produces a successor that looks correct
in every view, in every response shape, and in the calendar. The user finds
out when the second occurrence goes by without a reminder, and there is
nothing to see in the row.

**fire_at is recomputed, not copied.** 8.5 says so in the same line that says
the mode and value are copied, and 4.8's NOT NULL fire_at is why the arm had
to wait for this package at all. A copy of the instant would put the
successor's reminder at the closing occurrence's moment, which is in the past
by the time the successor exists, so it would be skipped at the first pass and
never fire. That is the same silent failure by a different route, which is why
the instant is asserted as a computed value rather than as different from the
old one.

**The fixture is seeded and the transition is requested**, P6's split: the
source reminder is written directly with a known mode and value, so this file
fails on the copy rather than on the PUT, and the assertion is about what
generation does with a row that exists.

The rule is a weekly one anchored on today in the request's zone, so the
successor is exactly seven days out; the completing call carries tz, which
frozen 7.6 has required on the generating transitions since the owner's ruling
of 2026-08-10.

Spec: 8.5 (generate_successor and its reminder line), 8.6 (the computation,
and that a transition leaves the source reminder untouched), 7.6 as ruled on
2026-08-10 (tz on complete and abandon), 4.8, 5.1.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  reminderRow,
} from './tasks-harness.js'
import {
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
  weeklyRuleOn,
} from './recurrence-harness.js'
import {
  KARACHI,
  ZoneCast,
  expectFireAt,
  offsetFireInstant,
  requireReminderRow,
  seedReminderRow,
} from './reminders-harness.js'
import { shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new ZoneCast('p7')

const DUE_TIME = '15:00'
const OFFSET = 45

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []
const folderIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    // Karachi has no DST, so the successor's instant is the source's plus
    // exactly seven days and any difference is the copy's doing rather than
    // a transition's.
    const owner = await cast.signIn(app, 'repeater', KARACHI)
    const folderId = await createFolder(owner, 'p7 ac150')
    folderIds.push(folderId)
    staged = { owner, folderId }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-150 (proposed): generation copies the reminder and recomputes its instant', () => {
  test('AC-150: the successor carries the same mode and value at its own instant', async () => {
    const { owner, folderId } = await stage()
    const due = todayIn(KARACHI)
    const fixture = await seedRecurringTask(app.db, owner, {
      folderId,
      title: 'p7 ac150 weekly with a reminder',
      dueDate: due,
      dueTime: DUE_TIME,
      rule: weeklyRuleOn(due),
    })
    taskIds.push(fixture.taskId)
    await seedReminderRow(app.db, {
      taskId: fixture.taskId,
      createdBy: owner.id,
      offsetMinutes: OFFSET,
      fireAt: offsetFireInstant(KARACHI, due, DUE_TIME, OFFSET),
    })

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      KARACHI,
      'completing an occurrence that carries a rule generates its successor (spec 8.5, 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)

    const successorDue = shiftDate(due, 7)
    expect(
      String(successor.due_date),
      'the weekly rule anchored on today puts the successor exactly a week out',
    ).toBe(successorDue)

    const copied = await requireReminderRow(
      app.db,
      successor.id,
      '8.5: if reminder exists on t, insert reminder on s with the same mode and value. A generation that copies steps and forgets this produces a successor correct in every view and every response shape, and the user finds out when the second occurrence goes by in silence',
    )
    expect(
      { offset_minutes: copied.offset_minutes, time_of_day: copied.time_of_day },
      '8.5 copies the mode and the value, and 4.8 keeps exactly one of the two columns non-null',
    ).toEqual({ offset_minutes: OFFSET, time_of_day: null })
    expect(copied.state, '8.5 inserts it with state = scheduled').toBe(
      'scheduled',
    )
    expect(
      copied.fired_at,
      '4.8 sets fired_at only when state leaves scheduled, and a fresh row has never fired',
    ).toBeNull()
    expectFireAt(
      copied,
      offsetFireInstant(KARACHI, successorDue, DUE_TIME, OFFSET),
      '8.5 says fire_at recomputed per 8.6, which is over the successor\'s own due date. Copied instead, the successor\'s reminder sits at the closing occurrence\'s moment, is already past when the row is created, and is skipped at the first pass it meets: the same silence by another route',
    )
  })

  test('AC-150: the closing occurrence keeps its own reminder untouched', async () => {
    const { owner, folderId } = await stage()
    const due = todayIn(KARACHI)
    const fixture = await seedRecurringTask(app.db, owner, {
      folderId,
      title: 'p7 ac150 the closing row keeps its own',
      dueDate: due,
      dueTime: DUE_TIME,
      rule: weeklyRuleOn(due),
    })
    taskIds.push(fixture.taskId)
    const sourceInstant = offsetFireInstant(KARACHI, due, DUE_TIME, OFFSET)
    await seedReminderRow(app.db, {
      taskId: fixture.taskId,
      createdBy: owner.id,
      offsetMinutes: OFFSET,
      fireAt: sourceInstant,
    })

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      KARACHI,
      'the completion (spec 5.1, 8.5)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)

    const source = await requireReminderRow(
      app.db,
      fixture.taskId,
      '8.6: the reminder survives completion and abandonment untouched, so generation copies rather than moves',
    )
    expect(
      {
        offset_minutes: source.offset_minutes,
        state: source.state,
        fired_at: source.fired_at,
      },
      'a generation that moved the row instead of copying it leaves the history without its reminder and passes the case above',
    ).toEqual({ offset_minutes: OFFSET, state: 'scheduled', fired_at: null })
    expectFireAt(
      source,
      sourceInstant,
      'and the closing row keeps its own instant',
    )
  })

  test('AC-150: an occurrence with no reminder generates a successor with none', async () => {
    const { owner, folderId } = await stage()
    const due = todayIn(KARACHI)
    const fixture = await seedRecurringTask(app.db, owner, {
      folderId,
      title: 'p7 ac150 no reminder to copy',
      dueDate: due,
      dueTime: DUE_TIME,
      rule: weeklyRuleOn(due),
    })
    taskIds.push(fixture.taskId)

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      KARACHI,
      'the completion (spec 5.1, 8.5)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated',
    )
    taskIds.push(successor.id)
    expect(
      await reminderRow(app.db, successor.id),
      '8.5 copies a reminder only if one exists, so a series without reminders must not acquire one at generation. This is the control that keeps the case above from being satisfied by a hook that always inserts',
    ).toBeUndefined()
  })

  test('AC-150: invariants hold afterwards', async () => {
    const { owner } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, folderIds, [owner.id])
  })
})

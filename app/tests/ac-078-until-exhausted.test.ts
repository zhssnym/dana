/*
AC-078: given UNTIL equal to the current due date, when completed, then no
successor is created and the rule remains on the closing row.

The second clause is the one that surprises, and it is deliberate. Every
other generating transition in this package clears the rule behind it,
because 8.5 puts the rule on the current occurrence alone. An exhausted
series is the exception written into the same function: nextInstance answers
null, generate_successor returns before the insert, and the comment on that
line says the rule stays on t and the series may resume via restore. So the
one row where a rule survives its own completion is this one, and an
implementation that clears the rule first and generates second passes every
other criterion here and loses the series' definition of itself.

UNTIL's inclusivity is asserted from both sides, because a boundary asserted
from one side is a boundary half asserted. With UNTIL on the due date the
series ends. With UNTIL one interval later the successor is generated and
lands exactly on UNTIL, since 8.5 and RFC 5545 both make an instance equal to
UNTIL valid; an off-by-one that treats UNTIL as exclusive passes the first
case and silently drops the last occurrence of every bounded series. And with
UNTIL one day short of the next instance the series ends again, which
separates "the bound is inclusive" from "the bound is ignored".

The resume clause rides here too, because this file is where the exhausted
row exists. 5.1's second G-SERIES branch admits an un-complete when no
pending sibling exists and this row is the newest of its series, and 8.5 says
an exhausted series keeps its rule on the last row and simply resumes. No
criterion in the range names that branch: AC-079 is the first branch and
AC-080 is the third. It is asserted here as an adversarial arm rather than
proposed as a criterion, because it is the same sentence of 8.5 that this
criterion's second clause comes from.

**Every case here runs a positive control first, and the reason is the shape
of the criterion.** This is the one criterion in the range whose outcome is
that nothing happens, and nothing is also what a tree with no engine does, so
each of these cases would have passed against the merged P3 surface while
asserting nothing whatsoever about the engine that replaces it. The control
is an unbounded occurrence of the same shape, completed by the same call in
the same case: it must generate. What each case then asserts is the
difference the bound makes, which is the criterion, rather than the absence
of a feature, which is the state of the branch. Without it the file would go
green on arrival and stay green through an engine that ignored UNTIL
entirely.

Spec: 8.5 (nextInstance and UNTIL, the null return, "rule stays on t; series
may resume via restore"), 4.11 (UNTIL optional, a date, inclusive per RFC
5545), 5.1 (G-SERIES, second branch), 7.6.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  readTask,
  requireTaskRow,
} from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  seriesRows,
  successorsOf,
  transitionRecurringOk,
  transitionSeriesOk,
  weeklyRuleOn,
  weeklyRuleUntil,
} from './recurrence-harness.js'
import type { RecurringFixture } from './recurrence-harness.js'
import { middayZone, shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner'], 'p6')

const tz = middayZone()

interface Stage {
  owner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner] = await cast.of(app)
    if (owner === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(owner, 'p6 ac078 until')
    staged = { owner, folderId }
  }
  return staged
}

/** Due today, weekly on today's weekday, bounded at the given date. */
async function occurrence(
  label: string,
  untilOffsetDays: number,
): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac078 ${label}`,
    dueDate,
    rule: weeklyRuleUntil(dueDate, shiftDate(dueDate, untilOffsetDays)),
  })
  taskIds.push(fixture.taskId)
  return fixture
}

/**
 * The positive control: the same occurrence with no UNTIL at all, completed
 * by the same call. It must generate, or the absence the case then asserts
 * is the absence of an engine rather than the effect of a bound.
 */
async function expectUnboundedGenerates(label: string): Promise<void> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const control = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac078 control for ${label}`,
    dueDate,
    rule: weeklyRuleOn(dueDate),
  })
  taskIds.push(control.taskId)
  const body = await transitionRecurringOk(
    owner,
    control.taskId,
    'complete',
    tz,
    'the control occurrence is completed by the same call the case under test uses',
  )
  requireGenerated(
    body,
    `the control must generate, or this case asserts the absence of an engine rather than the effect of UNTIL (${label})`,
  )
  const successor = await requireOneSuccessor(
    app.db,
    control.seriesId,
    control.taskId,
    'the control generated its successor',
  )
  taskIds.push(successor.id)
  expect(
    successor.recurrence_rule,
    'and the control moved its rule forward, which is what the bounded case must not do',
  ).toBe(control.rule)
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-078: an exhausted series generates nothing and keeps its rule', () => {
  test('AC-078: UNTIL on the due date generates no successor', async () => {
    const { owner } = await stage()
    await expectUnboundedGenerates('no successor')
    const fixture = await occurrence('no successor', 0)
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'completing the last occurrence of a bounded series is an ordinary completion (spec 5.1)',
    )
    expect(
      body.generated,
      `8.5: nextInstance answers null when UNTIL bounds it out, and generate_successor returns before the insert. Rule ${fixture.rule}, due ${fixture.dueDate}`,
    ).toBeNull()
    expect(
      await successorsOf(app.db, fixture.seriesId, fixture.taskId),
      'and no row was written either: a null return is not a row with a null date',
    ).toEqual([])
  })

  test('AC-078: the rule remains on the closing row', async () => {
    const { owner } = await stage()
    // The control also closes the other half of this assertion: it moved its
    // rule to a successor, so "the rule is still here" below is the bound's
    // doing rather than an engine that never touches the column.
    await expectUnboundedGenerates('rule remains')
    const fixture = await occurrence('rule remains', 0)
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const closed = await requireTaskRow(app.db, fixture.taskId)
    expect(
      closed.recurrence_rule,
      '8.5: the rule stays on t when the series is exhausted, so this is the one completed row in the system that carries one. An implementation that clears the rule before generating passes every other criterion here and loses this',
    ).toBe(fixture.rule)
    expect(String(closed.status), 'and the row is completed').toBe('completed')
    expect(
      String(closed.series_id),
      'INV-13: a row carrying a rule carries a series_id',
    ).toBe(fixture.seriesId)
    expect(
      body.task.recurrence_rule,
      'the envelope reports the same row the database holds',
    ).toBe(fixture.rule)
    expect(
      (await readTask(owner, fixture.taskId)).is_recurring,
      '7.0: is_recurring reports the rule the row carries, which this row still does',
    ).toBe(true)
  })

  test('AC-078: UNTIL is inclusive, so one interval later still generates', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('inclusive bound', 7)
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const generated = requireGenerated(
      body,
      '4.11 and RFC 5545 make UNTIL inclusive: an instance equal to UNTIL is valid, so the last occurrence of a bounded series is generated rather than dropped',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the bounded series generated its final occurrence',
    )
    taskIds.push(successor.id)
    expect(
      String(successor.due_date),
      `the successor lands exactly on UNTIL. Rule ${fixture.rule}`,
    ).toBe(shiftDate(fixture.dueDate, 7))
    expect(generated.due_date, 'and the wire agrees with the row').toBe(
      successor.due_date,
    )
    expect(
      successor.recurrence_rule,
      'and it carries the bounded rule, so closing it ends the series',
    ).toBe(fixture.rule)

    // Closing that final occurrence is the first case again, reached the
    // way a user reaches it rather than by construction.
    const last = await transitionRecurringOk(
      owner,
      successor.id,
      'complete',
      tz,
      'completing the final occurrence is accepted (spec 5.1)',
    )
    expect(
      last.generated,
      'the series is exhausted now: cutoff is the successor\'s own date and no instance lies strictly after it inside UNTIL',
    ).toBeNull()
    expect(
      (await requireTaskRow(app.db, successor.id)).recurrence_rule,
      'and the rule stays on the last row (spec 8.5)',
    ).toBe(fixture.rule)
  })

  test('AC-078: a bound short of the next instance ends the series too', async () => {
    const { owner } = await stage()
    await expectUnboundedGenerates('short bound')
    // UNTIL six days out on a weekly rule: the next instance is the seventh
    // day, so the bound is real rather than merely inclusive.
    const fixture = await occurrence('short bound', 6)
    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    expect(
      body.generated,
      `8.5: the earliest instance strictly after the cutoff is seven days out and UNTIL stops six days out, so there is none. Rule ${fixture.rule}`,
    ).toBeNull()
    expect(
      await successorsOf(app.db, fixture.seriesId, fixture.taskId),
      'no row is written for a slot the bound excludes',
    ).toEqual([])
  })

  test('AC-078 adversarial: an exhausted series resumes on un-complete', async () => {
    const { owner } = await stage()
    // The control makes "exhausted" mean something: without it, a series
    // that generated nothing because nothing generates is indistinguishable
    // from one bounded out, and the resume below would prove neither.
    await expectUnboundedGenerates('resume')
    const fixture = await occurrence('resume', 0)
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )

    // 5.1's second G-SERIES branch: no pending sibling exists and this row
    // is the newest of its series, so the un-complete is allowed and the row
    // keeps whatever rule it holds. No criterion in this range names that
    // branch, and 8.5 states it in the same sentence as the clause above.
    const body = await transitionSeriesOk(
      owner,
      fixture.taskId,
      'uncomplete',
      '5.1: S is absent and this row has the greatest created_at of its series, so the un-complete is allowed. It carries no tz, the shape the owner\'s ruling of 2026-08-10 left uncomplete with, G-SERIES evaluating no calendar date',
    )
    expect(
      body.deletedSuccessorId,
      'there was no successor to delete (spec 7.6)',
    ).toBeNull()
    expect(
      body.generated,
      'and an un-complete generates nothing on any path',
    ).toBeNull()

    const resumed = await requireTaskRow(app.db, fixture.taskId)
    expect(String(resumed.status), 'the row is pending again').toBe('pending')
    expect(
      resumed.recurrence_rule,
      '8.5: an exhausted series keeps its rule on the last row and simply resumes',
    ).toBe(fixture.rule)
    expect(
      resumed.completed_at,
      '5.1: un-complete clears completed_at and completed_by',
    ).toBeNull()
    expect(resumed.completed_by, 'the other column').toBeNull()
    expect(
      await seriesRows(app.db, fixture.seriesId),
      'and nothing was created or destroyed by the resume',
    ).toHaveLength(1)
  })

  test('AC-078: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})

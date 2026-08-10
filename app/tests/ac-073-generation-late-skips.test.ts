/*
AC-073: given the same task completed 2026-07-28, then the successor is due
2026-08-03 and no occurrence exists for 2026-07-27.

Asserted by its content rather than at the dates it names, by the section 12
ruling of 2026-08-10. The content is 8.5's second worked consequence, late
with slots skipped: the occurrence was due a week and a day ago, one slot has
passed unclosed in between, and cutoff = max(due_date,
current_date(actor.tz)) is now today rather than the due date, so the
successor lands on the first slot after today and the passed one is never
created. The fixture therefore dates the occurrence eight days back from
today in one zone, which puts exactly one unclosed slot at yesterday, the
same shape 07-20, 07-27, 07-28 has.

Two assertions, and the second is the one the criterion exists for. The
successor is the next slot after today, six days on. And the skipped slot is
not created, anywhere: not as a completed row, not as an abandoned one, not
as a second pending row. 8.5 says the calendar shows an honest gap, so the
gap is also read back off the calendar, which is where a user would see it.

The discriminator this file carries against a plausible wrong engine: an
implementation that anchors on the due date and forgets the max, that is
nextInstance(rule, after=due_date), answers yesterday. It generates a
successor that is already overdue on arrival, which every My Day and Planned
query then surfaces as a task the user cannot get ahead of, and it is the
error 8.5's cutoff exists to prevent. That answer and the correct one differ
by two whole intervals here, so no rounding or off-by-one reading of the
iterator can produce the right date by accident.

Spec: 8.5 (the cutoff, and the second worked consequence), 5.1, 7.6 (the
transition and its tz parameter, ruled 2026-08-10), 6 Q3C (the calendar is a
record, which is what makes the gap visible), 7.10.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, countRows, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
} from './tasks-harness.js'
import {
  expectVirtualInstances,
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  seriesRows,
  transitionRecurringOk,
  weeklyRuleOn,
} from './recurrence-harness.js'
import type { RecurringFixture } from './recurrence-harness.js'
import {
  calendar,
  idsOf,
  middayZone,
  shiftDate,
  todayIn,
} from './views-harness.js'

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
    const folderId = await createFolder(owner, 'p6 ac073 late')
    staged = { owner, folderId }
  }
  return staged
}

/**
 * Due eight days ago on a weekly rule matching that day: the slot at
 * yesterday has passed unclosed, and the next one is six days out. 8.5's
 * "due 2026-07-20, completed 2026-07-28" with the clock left alone.
 */
async function occurrence(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = shiftDate(todayIn(tz), -8)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac073 ${label}`,
    dueDate,
    rule: weeklyRuleOn(dueDate),
  })
  taskIds.push(fixture.taskId)
  return fixture
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-073: completing late skips the slots that passed', () => {
  test('AC-073: the successor is the first slot after today, not the passed one', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('successor')
    const today = todayIn(tz)
    const skipped = shiftDate(fixture.dueDate, 7)

    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'completing an overdue occurrence is allowed (spec 5.1)',
    )
    const generated = requireGenerated(
      body,
      'a late completion still generates: 8.5 runs generation on the transition, never on the passage of time',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'one completion generates one successor however late it is',
    )
    taskIds.push(successor.id)

    expect(
      String(successor.due_date),
      `8.5: cutoff = max(due_date, current_date(actor.tz)) is today when the occurrence is overdue, so the successor is the first instance strictly after today. Due ${fixture.dueDate}, completed today (${today}) in ${tz}, rule ${fixture.rule}; the slot at ${skipped} has passed`,
    ).toBe(shiftDate(fixture.dueDate, 14))
    expect(
      String(successor.due_date) > today,
      'a generated successor is never already overdue: that is what anchoring on the due date alone produces, and it is the defect the cutoff exists to prevent',
    ).toBe(true)
    expect(generated.due_date, 'the wire agrees with the row').toBe(
      successor.due_date,
    )
  })

  test('AC-073: no occurrence is created for the slot that passed', async () => {
    const { owner, folderId } = await stage()
    const fixture = await occurrence('skipped slot')
    const skipped = shiftDate(fixture.dueDate, 7)

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    const series = await seriesRows(app.db, fixture.seriesId)
    expect(
      series.map((row) => String(row.due_date)),
      `the skipped slot ${skipped} must exist nowhere in the series, in any status: 8.5 generates one successor and never backfills the slots a late close passed over`,
    ).not.toContain(skipped)
    expect(
      series,
      'the series holds exactly the closed row and its one successor',
    ).toHaveLength(2)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE folder_id = ${folderId}::uuid AND due_date = ${skipped}::date`,
      ),
      'and no row outside the series was written on that date either',
    ).toBe(0)
  })

  test('AC-073: the calendar shows the gap, with rows on both sides of it', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('honest gap')
    const skipped = shiftDate(fixture.dueDate, 7)

    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    // A range wide enough to hold the closed row, the gap, and the
    // successor, and short enough for 10.3's 62-day cap.
    const start = shiftDate(fixture.dueDate, -1)
    const end = shiftDate(fixture.dueDate, 21)
    const view = await calendar(owner, tz, start, end)
    const mine = view.real.filter(
      (card) => card.id === fixture.taskId || card.id === successor.id,
    )
    expect(
      mine.map((card) => String(card.due_date)).sort(),
      'Q3C draws real rows in all three statuses, so the completed occurrence and its pending successor both appear on their own dates',
    ).toEqual([fixture.dueDate, String(successor.due_date)].sort())
    expect(
      idsOf(view.real.filter((card) => card.due_date === skipped)),
      `8.5: the ${skipped} slot is skipped and the calendar shows an honest gap`,
    ).toEqual([])
    expect(
      expectVirtualInstances(view.virtual, 'calendar virtual')
        .filter((instance) => instance.date === skipped)
        .map((instance) => instance.task_id),
      'and no ghost fills the gap either: 8.5 projects strictly after the current occurrence, which is now the successor',
    ).toEqual([])
  })

  test('AC-073: the closed row is history on its own date', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('closed row')
    await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          fixture.seriesId,
          fixture.taskId,
          'the completion generated a successor',
        )
      ).id,
    )
    const closed = await requireTaskRow(app.db, fixture.taskId)
    expect(
      String(closed.due_date),
      'completing late does not move the row to the day it was completed',
    ).toBe(fixture.dueDate)
    expect(closed.recurrence_rule, '8.5 clears the rule behind it').toBeNull()
  })

  test('AC-073: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})

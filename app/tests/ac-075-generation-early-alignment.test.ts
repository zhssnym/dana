/*
AC-075: given weekly Monday due 2026-07-27 completed 2026-07-25, then the
successor is due 2026-08-03.

Asserted by its content rather than at the dates it names, by the section 12
ruling of 2026-08-10. The content is 8.5's third worked consequence, early
with the alignment kept: the occurrence is not due yet, it is closed anyway,
and cutoff = max(due_date, current_date(actor.tz)) is now the due date rather
than today, so the successor is one interval after the date the occurrence
held and the series stays on its weekday.

This is the arm of the max the other three criteria cannot reach. AC-072 has
the two operands equal, AC-073 and AC-074 have today on top; only here does
the due date win, so only here does an implementation that wrote
current_date(actor.tz) alone, with no max at all, produce a different answer.
That answer is worth naming because it is not obviously wrong on its face:
the next instance strictly after today is the occurrence's own due date, so
the engine generates a successor due on exactly the day the row it just
closed was due, and the calendar shows the task apparently un-completing
itself two days from now. The two answers differ by one full interval, which
no off-by-one in the iterator can bridge.

The early close is two days before the due date, not one, so that a
successor generated from an accidental "yesterday" or "tomorrow" boundary
also fails rather than landing on the right date for the wrong reason.

Spec: 8.5 (the cutoff and the third worked consequence), 5.1, 7.6 (the
transition and its tz parameter, ruled 2026-08-10), 4.11.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
} from './tasks-harness.js'
import {
  bydayOf,
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
  weeklyRuleOn,
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
    const folderId = await createFolder(owner, 'p6 ac075 early')
    staged = { owner, folderId }
  }
  return staged
}

/** Due two days from now on a weekly rule matching that day: 8.5's "due
 * 2026-07-27, completed 2026-07-25" with the clock left alone. */
async function occurrence(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = shiftDate(todayIn(tz), 2)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac075 ${label}`,
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

describe('AC-075: completing early keeps the series aligned', () => {
  test('AC-075: the successor is one interval after the due date, not after today', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('successor')
    const today = todayIn(tz)

    const body = await transitionRecurringOk(
      owner,
      fixture.taskId,
      'complete',
      tz,
      'completing an occurrence before it is due is allowed: 5.1 puts no date guard on the transition',
    )
    const generated = requireGenerated(body, 'an early close still generates')
    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      'one completion generates one successor',
    )
    taskIds.push(successor.id)

    expect(
      String(successor.due_date),
      `8.5: cutoff = max(due_date, current_date(actor.tz)) is the due date when the occurrence is closed early, so the successor is one interval after it. Due ${fixture.dueDate}, completed today (${today}) in ${tz}, rule ${fixture.rule}`,
    ).toBe(shiftDate(fixture.dueDate, 7))
    expect(
      String(successor.due_date),
      'and it is emphatically not the date the closed row held, which is what dropping the max produces',
    ).not.toBe(fixture.dueDate)
    expect(generated.due_date, 'the wire agrees with the row').toBe(
      successor.due_date,
    )
  })

  test('AC-075: the weekday survives the early close', async () => {
    const { owner } = await stage()
    const fixture = await occurrence('alignment')
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

    expect(
      bydayOf(String(successor.due_date)),
      `the rule is ${fixture.rule} and a weekly series holds its weekday: an engine that re-anchored on the completion date would move a Monday series onto whatever day the user happened to tick it off`,
    ).toBe(bydayOf(fixture.dueDate))
    expect(
      successor.recurrence_rule,
      'and the rule itself is unchanged, not rewritten to the new weekday',
    ).toBe(fixture.rule)
  })

  test('AC-075: the closed row keeps the future date it was closed on', async () => {
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
      'a task completed early keeps the date it was due: 5.1 does not move dates and 8.5 does not either',
    ).toBe(fixture.dueDate)
    expect(
      String(closed.due_date) > todayIn(tz),
      'so the Done page carries a completed row whose due date is still in the future, which is correct and worth stating',
    ).toBe(true)
    expect(closed.recurrence_rule, '8.5 clears the rule behind it').toBeNull()
  })

  test('AC-075: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})

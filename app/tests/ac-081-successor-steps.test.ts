/*
AC-081: given steps on an occurrence, when completed, then the successor
carries the same steps unchecked and no My Day entries.

Two clauses that fail in opposite directions, which is why they share a
criterion. Steps must be copied, because a repeating task is its checklist
and a successor without one is useless. My Day entries must not be, because
8.5 says so in a comment of its own and 8.2 gives the reason: a pull is one
decision, not a daily ritual, so a series that re-pulled itself every time an
occurrence closed would put a card on somebody's My Day forever with no
action that ever removes it.

What makes the copy sharp rather than a count: the steps are copied with
done=false, in the same order, as new rows. The occurrence under test has
some of its steps ticked, so an implementation that copies the rows as they
stand hands the user a checklist that is already half done, and one that
moves them rather than copying leaves the completed occurrence with an empty
checklist in the Done page. Positions are asserted as an order rather than as
values, since 4.6 allows gaps and orders by (position, id).

The My Day clause is asserted with two members holding entries, the
occurrence's assignee and another member who pulled it, because "no My Day
entries" is a statement about the entry table rather than about one person's
page, and a copy loop that skipped the actor's entry and copied everyone
else's would satisfy a single-member fixture.

**Reminders are not asserted here, deliberately.** 8.5's generation copies a
reminder onto the successor with fire_at recomputed per 8.6, and the RFC 0001
P6 row defers that arm to P7 with the computation it requires: 4.8 admits no
reminder row without a computed instant, and AC-083 to AC-086 pin the
computation in P7's range. No surface in this package can attach a reminder,
so the fixture carries none and the file says nothing about them in either
direction. A file asserting their absence would have to be rewritten by the
package that adds them, which is the wrong shape of test.

Spec: 8.5 (copy steps of t onto s with done=false, same order; My Day entries
are never copied), 8.2 (why a pull is not re-decided), 4.6 (the steps table
and its ordering), 4.7, 7.0 (steps_done and steps_total on the card), 7.7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  myDayRows,
  patchStepOk,
  pullIntoMyDayOk,
  readTask,
  stepRows,
} from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  transitionRecurringOk,
  weeklyRuleOn,
} from './recurrence-harness.js'
import { middayZone, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'partner'], 'p6')

const tz = middayZone()

const STEP_TITLES = [
  'p6 ac081 first step',
  'p6 ac081 second step',
  'p6 ac081 third step',
] as const

interface Stage {
  owner: Actor
  partner: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, partner] = await cast.of(app)
    if (owner === undefined || partner === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, partner.id)
    const folderId = await createFolder(owner, 'p6 ac081 steps')
    await addMemberOk(owner, folderId, partner.id)
    staged = { owner, partner, folderId }
  }
  return staged
}

interface Prepared {
  taskId: string
  seriesId: string
  dueDate: string
  stepIds: string[]
}

/** An occurrence with three steps, the middle one ticked, pulled into two
 * people's My Day. Everything the criterion's two clauses turn on. */
async function occurrence(label: string): Promise<Prepared> {
  const { owner, partner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac081 ${label}`,
    dueDate,
    rule: weeklyRuleOn(dueDate),
    steps: STEP_TITLES,
  })
  taskIds.push(fixture.taskId)

  const detail = await readTask(owner, fixture.taskId)
  const steps = detail.steps as { id: string; title: string }[]
  expect(
    steps.map((step) => step.title),
    'the fixture must carry its three steps in order before the copy means anything (spec 7.6)',
  ).toEqual([...STEP_TITLES])

  const middle = steps[1] as { id: string }
  await patchStepOk(owner, fixture.taskId, middle.id, { done: true })
  await pullIntoMyDayOk(
    owner,
    fixture.taskId,
    tz,
    'the assignee pulls the occurrence into My Day (spec 7.8)',
  )
  await pullIntoMyDayOk(
    partner,
    fixture.taskId,
    tz,
    'a second member pulls it too (spec 7.8)',
  )

  return {
    taskId: fixture.taskId,
    seriesId: fixture.seriesId,
    dueDate: fixture.dueDate,
    stepIds: steps.map((step) => step.id),
  }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-081: the successor inherits the checklist and nothing else', () => {
  test('AC-081: the successor carries the same steps, in order, unchecked', async () => {
    const { owner } = await stage()
    const prepared = await occurrence('copied steps')
    const body = await transitionRecurringOk(
      owner,
      prepared.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const generated = requireGenerated(body, 'the completion generates')
    const successor = await requireOneSuccessor(
      app.db,
      prepared.seriesId,
      prepared.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    const copied = await stepRows(app.db, successor.id)
    expect(
      copied.map((step) => String(step.title)),
      '8.5: copy steps of t onto s, same order. 4.6 orders by (position, id), which is what this reader uses',
    ).toEqual([...STEP_TITLES])
    expect(
      copied.map((step) => step.done),
      '8.5: with done=false. The occurrence had its middle step ticked, and a copy that carried the flags hands the user a checklist that is already half done',
    ).toEqual([false, false, false])
    expect(
      copied.map((step) => String(step.id)).some((id) => prepared.stepIds.includes(id)),
      'the steps are new rows, not the occurrence\'s own moved forward: moving them would empty the completed row\'s checklist in the Done page',
    ).toBe(false)
    expect(
      [generated.steps_total, generated.steps_done],
      '7.0: the card counts what the successor now holds, three steps and none done',
    ).toEqual([STEP_TITLES.length, 0])
  })

  test('AC-081: the completed occurrence keeps its own checklist as it was', async () => {
    const { owner } = await stage()
    const prepared = await occurrence('history intact')
    await transitionRecurringOk(
      owner,
      prepared.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          prepared.seriesId,
          prepared.taskId,
          'the completion generated a successor',
        )
      ).id,
    )

    const original = await stepRows(app.db, prepared.taskId)
    expect(
      original.map((step) => String(step.id)),
      'the occurrence keeps its own step rows',
    ).toEqual(prepared.stepIds)
    expect(
      original.map((step) => step.done),
      'and their ticks: 8.5 copies the steps forward, it does not reset the history it just closed',
    ).toEqual([false, true, false])
  })

  test('AC-081: the successor has no My Day entries, for anybody', async () => {
    const { owner, partner } = await stage()
    const prepared = await occurrence('no my day')
    expect(
      (await myDayRows(app.db, prepared.taskId)).map((entry) =>
        String(entry.user_id),
      ).sort(),
      'the premise: two people had pulled the occurrence',
    ).toEqual([owner.id, partner.id].sort())

    await transitionRecurringOk(
      owner,
      prepared.taskId,
      'complete',
      tz,
      'the completion is accepted (spec 5.1)',
    )
    const successor = await requireOneSuccessor(
      app.db,
      prepared.seriesId,
      prepared.taskId,
      'the completion generated the successor under test',
    )
    taskIds.push(successor.id)

    expect(
      await myDayRows(app.db, successor.id),
      '8.5: My Day entries are never copied. 8.2 gives the reason, that a pull is one decision rather than a daily ritual, and a series that re-pulled itself would put a permanent card on two people\'s pages',
    ).toEqual([])
    expect(
      (await readTask(partner, successor.id)).pulled,
      '7.0: pulled is the viewer\'s own entry, and the second member never pulled this row',
    ).toBe(false)
    expect(
      (await myDayRows(app.db, prepared.taskId)).length,
      'and the occurrence keeps the entries it had, which is what puts it in the recap (spec 8.2, Q1R)',
    ).toBe(2)
  })

  test('AC-081: invariants hold afterwards', async () => {
    const { owner, partner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(
      app.db,
      taskIds,
      [folderId],
      [owner.id, partner.id],
    )
  })
})

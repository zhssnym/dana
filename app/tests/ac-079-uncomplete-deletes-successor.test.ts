/*
AC-079: given uncomplete while the successor is pending and edited, then the
successor is deleted, the rule returns, and the restored row is the current
occurrence.

"And edited" is in the criterion because the edits are what make the deletion
a decision rather than a tidy-up. The successor is a real row a user can have
retitled, moved, re-dated, and added steps to, and 5.1 destroys all of it: the
confirmation dialog it specifies warns that the next scheduled occurrence is
removed, including any edits made to it. An implementation that preserved the
edits by, say, folding the successor back into the original instead of
deleting it would satisfy a test that only counted pending rows.

Three outcomes, each a separate failure mode:

**The successor is deleted, with everything hanging off it.** Not
abandoned, not left pending with its rule stripped. 5.1 says its steps and
reminder cascade, so the steps go too, and the My Day entries of anyone who
had pulled it go with the row by 4.7's cascade.

**The rule returns, and it is the successor's rule.** 5.1 says to copy
S.recurrence_rule back onto this row, not to restore whatever the row used to
carry. Those differ the moment somebody edits the series mid-flight, and the
difference is asserted with a rule the original never held.

**The restored row is the current occurrence.** Pending, carrying the rule,
and the only pending row in its series, which is what every later
generation, guard and projection reads.

The un-complete carries no tz at all. That is the shape frozen 7.6 left it
with on 2026-08-10: complete and abandon took the parameter because 8.5
computes a cutoff from a calendar date, and uncomplete and restore gained
nothing because G-SERIES reads the shape of a series and evaluates no date.
A 422 here would be the ruling misread in the direction of "every transition
takes a zone", so the file sends none and requires the transition.

Spec: 5.1 (G-SERIES, first branch, and the un-complete row's side effects),
8.5 (un-complete and restore apply the guard), 7.6 (the envelope's
deleted_successor_id, and the parameter uncomplete does not take), 4.7,
INV-7, INV-8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  addStepOk,
  expectSweptTasks,
  expectTaskInvariants,
  getTask,
  myDayRows,
  patchTaskOk,
  pullIntoMyDayOk,
  requireTaskRow,
  seedRecurrence,
  stepRows,
  taskRow,
} from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  seriesRows,
  transitionRecurringOk,
  transitionSeriesOk,
  weeklyRuleOn,
} from './recurrence-harness.js'
import { middayZone, shiftDate, todayIn } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'partner'], 'p6')

const tz = middayZone()

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
    const folderId = await createFolder(owner, 'p6 ac079 uncomplete')
    await addMemberOk(owner, folderId, partner.id)
    staged = { owner, partner, folderId }
  }
  return staged
}

interface Closed {
  taskId: string
  seriesId: string
  dueDate: string
  rule: string
  successorId: string
}

/** An occurrence completed, so a pending successor exists to be edited. */
async function closedOccurrence(label: string): Promise<Closed> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac079 ${label}`,
    dueDate,
    rule: weeklyRuleOn(dueDate),
  })
  taskIds.push(fixture.taskId)
  const body = await transitionRecurringOk(
    owner,
    fixture.taskId,
    'complete',
    tz,
    'the completion that creates the successor is accepted (spec 5.1)',
  )
  requireGenerated(body, 'the fixture needs a successor to un-complete over')
  const successor = await requireOneSuccessor(
    app.db,
    fixture.seriesId,
    fixture.taskId,
    'the completion generated the successor this case edits',
  )
  taskIds.push(successor.id)
  return { ...fixture, successorId: successor.id }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-079: un-completing removes the pending successor', () => {
  test('AC-079: the edited successor and everything on it are deleted', async () => {
    const { owner, partner } = await stage()
    const closed = await closedOccurrence('edited successor')

    // The edits the criterion names, made the way a user makes them.
    await patchTaskOk(
      owner,
      closed.successorId,
      {
        title: 'p6 ac079 successor, retitled by a user',
        important: true,
        due_date: shiftDate(closed.dueDate, 9),
      },
      'a pending successor is an ordinary task and any member may edit it (spec 7.6)',
    )
    const withStep = await addStepOk(
      owner,
      closed.successorId,
      'p6 ac079 a step added to the successor',
    )
    await pullIntoMyDayOk(
      partner,
      closed.successorId,
      tz,
      'a second member pulls the successor into their My Day (spec 7.8)',
    )
    expect(
      (withStep.steps as unknown[]).length,
      'the fixture must really carry an edit before the deletion means anything',
    ).toBe(1)

    const body = await transitionSeriesOk(
      owner,
      closed.taskId,
      'uncomplete',
      '5.1: a completed row whose series has a pending sibling may be un-completed, and the sibling goes',
    )
    expect(
      body.deletedSuccessorId,
      '7.6: deleted_successor_id names the row G-SERIES removed',
    ).toBe(closed.successorId)
    expect(
      await taskRow(app.db, closed.successorId),
      '5.1: delete S. Not abandon it, not leave it pending without its rule; the confirmation dialog exists because the row and its edits are destroyed',
    ).toBeUndefined()
    expectStatus(
      await getTask(owner, closed.successorId),
      404,
      'and the deleted successor is gone from the API too (spec 7.6)',
    )
    expect(
      await stepRows(app.db, closed.successorId),
      '5.1: its steps cascade with it',
    ).toEqual([])
    expect(
      await myDayRows(app.db, closed.successorId),
      'and the My Day entries pointing at it go by 4.7\'s cascade, so nobody keeps a card for a row that no longer exists',
    ).toEqual([])
  })

  test('AC-079: the rule returns to the restored row', async () => {
    const { owner } = await stage()
    const closed = await closedOccurrence('rule returns')
    expect(
      (await requireTaskRow(app.db, closed.taskId)).recurrence_rule,
      'the premise: after the completion the rule sits on the successor, not here',
    ).toBeNull()

    await transitionSeriesOk(
      owner,
      closed.taskId,
      'uncomplete',
      'the un-complete is accepted (spec 5.1)',
    )
    const restored = await requireTaskRow(app.db, closed.taskId)
    expect(
      restored.recurrence_rule,
      '5.1: copy S.recurrence_rule back onto this row',
    ).toBe(closed.rule)
    expect(
      String(restored.series_id),
      'in the series it never left (INV-13)',
    ).toBe(closed.seriesId)
    expect(String(restored.status), '5.1: the row returns to pending').toBe(
      'pending',
    )
    expect(
      restored.completed_at,
      '5.1: un-complete clears completed_at and completed_by (INV-8)',
    ).toBeNull()
    expect(restored.completed_by, 'the other column').toBeNull()
    expect(
      String(restored.due_date),
      'and it comes back on its own date: the successor\'s date dies with the successor',
    ).toBe(closed.dueDate)
  })

  test('AC-079: the rule that returns is the successor\'s, not the one this row held', async () => {
    const { owner } = await stage()
    const closed = await closedOccurrence('mid-series edit')

    // 8.5 makes the current occurrence the place a series is edited, so the
    // successor's rule can differ from the one this row carried. 5.1 says to
    // copy S's rule back, which is the only reading under which a mid-series
    // change survives an un-complete. Seeded directly rather than PATCHed:
    // the write path for a rule is AC-071's, and this case is about G-SERIES.
    const edited = 'FREQ=DAILY;INTERVAL=3'
    expect(edited, 'the two rules must differ for this to assert anything').not.toBe(
      closed.rule,
    )
    await seedRecurrence(app.db, closed.successorId, {
      rule: edited,
      seriesId: closed.seriesId,
    })

    await transitionSeriesOk(
      owner,
      closed.taskId,
      'uncomplete',
      'the un-complete is accepted (spec 5.1)',
    )
    expect(
      (await requireTaskRow(app.db, closed.taskId)).recurrence_rule,
      '5.1 copies S.recurrence_rule back, so a series edited mid-flight keeps the edit when the previous occurrence is reopened. Restoring the rule this row used to carry would silently revert the user\'s change',
    ).toBe(edited)
  })

  test('AC-079: the restored row is the current occurrence', async () => {
    const { owner } = await stage()
    const closed = await closedOccurrence('current occurrence')
    await transitionSeriesOk(
      owner,
      closed.taskId,
      'uncomplete',
      'the un-complete is accepted (spec 5.1)',
    )

    const series = await seriesRows(app.db, closed.seriesId)
    expect(
      series.map((row) => row.id),
      'the successor is gone, so the series is this row alone',
    ).toEqual([closed.taskId])
    expect(
      series.filter((row) => row.status === 'pending' && row.recurrence_rule !== null),
      'INV-7 and 8.5: exactly one pending rule-carrying row, and it is this one, which is what "the current occurrence" means to every guard, generation and projection that follows',
    ).toHaveLength(1)

    // And it behaves like one: completing it again generates the next slot
    // from its own date, which is the observable form of the claim.
    const again = await transitionRecurringOk(
      owner,
      closed.taskId,
      'complete',
      tz,
      'the restored occurrence can be completed again (spec 5.1)',
    )
    const regenerated = requireGenerated(
      again,
      'a restored current occurrence generates when it is closed again',
    )
    taskIds.push(String(regenerated.id))
    expect(
      regenerated.due_date,
      '8.5 anchors on this row\'s own due_date, so the series resumes where it was rather than where the deleted successor had been moved to',
    ).toBe(shiftDate(closed.dueDate, 7))
  })

  test('AC-079 adversarial: the un-complete needs no zone', async () => {
    const { owner } = await stage()
    const closed = await closedOccurrence('no zone')
    // Sent with no tz by transitionSeriesOk, which is the point: the ruling
    // of 2026-08-10 gave the parameter to complete and abandon alone. This
    // case exists so that reading it as "every transition takes a zone"
    // fails here rather than passing quietly.
    const body = await transitionSeriesOk(
      owner,
      closed.taskId,
      'uncomplete',
      'frozen 7.6 as ruled on 2026-08-10: uncomplete and restore gain nothing, the shape 7.8\'s DELETE has, because G-SERIES evaluates no calendar date',
    )
    expect(
      body.deletedSuccessorId,
      'and it did the work: the successor is named as deleted',
    ).toBe(closed.successorId)
  })

  test('AC-079: invariants hold afterwards', async () => {
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

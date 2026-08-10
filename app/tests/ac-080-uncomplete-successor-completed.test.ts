/*
AC-080: given uncomplete while the successor is already completed, then 409.

This is G-SERIES' third branch, the refusal: no pending sibling exists to
reclaim a rule from, and this row is not the newest of its series, so there
is no coherent way to make it the current occurrence again. 5.1 gives it copy
of its own, that the repeating task has already moved on and restore is only
possible on its latest occurrence.

**Why the fixture is built with a bounded rule.** The state the criterion
names, an occurrence whose successor is completed, is reachable two ways and
only one of them is this branch. If the successor's own completion generated
a third row, that row is pending, G-SERIES finds it as S, and 5.1's first
branch admits the un-complete: it deletes the pending row and hands the rule
back, reaching across the completed middle row to do it. That is what the
guard says, it is not what this criterion is about, and building the fixture
without noticing would produce a file that fails against a correct engine.
So the series is bounded with UNTIL on the successor's date: completing the
successor generates nothing, the series holds two completed rows and no
pending one, and the third branch is the only one that can answer.

The refusal is asserted as a refusal and as a non-event. 409 is a state
conflict under 7.0, so nothing may move: both rows keep their status and
their completion columns, no row is deleted, and no rule is handed anywhere.
A 409 that half-ran is worse than a 200.

Two adversarial companions. The newest row of the same exhausted series may
be un-completed, which proves the refusal is about position in the series
rather than about un-complete being broken on bounded rules. And the same
guard on the other transition, an abandoned row restored while the row after
it is abandoned too, because 5.1 puts G-SERIES on restore in the same table
and 7.6's ruling of 2026-08-10 gives restore no zone either.

Spec: 5.1 (G-SERIES, third branch, and its copy; the restore row), 8.5
(un-complete and restore apply the guard, "otherwise 409"), 7.6, 7.0 (409 is
a state conflict), INV-7, INV-8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
} from './tasks-harness.js'
import {
  requireGenerated,
  requireOneSuccessor,
  seedRecurringTask,
  seriesRows,
  transitionRecurringOk,
  transitionSeriesOk,
  transitionWithoutTz,
  weeklyRuleUntil,
} from './recurrence-harness.js'
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
    const folderId = await createFolder(owner, 'p6 ac080 moved on')
    staged = { owner, folderId }
  }
  return staged
}

interface MovedOn {
  firstId: string
  secondId: string
  seriesId: string
  rule: string
}

/**
 * A series of exactly two rows, both closed, with nothing pending: due today
 * on a weekly rule bounded at the successor's own date, so closing the
 * successor exhausts the series instead of generating a third row. The
 * closing event is a parameter because 5.1 puts the same guard on
 * un-complete and on restore.
 */
async function movedOnSeries(
  label: string,
  event: 'complete' | 'abandon',
): Promise<MovedOn> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac080 ${label}`,
    dueDate,
    rule: weeklyRuleUntil(dueDate, shiftDate(dueDate, 7)),
  })
  taskIds.push(fixture.taskId)

  const first = await transitionRecurringOk(
    owner,
    fixture.taskId,
    event,
    tz,
    `the first ${event} generates the successor (spec 5.1, 8.5)`,
  )
  requireGenerated(first, 'the fixture needs a successor to close in turn')
  const successor = await requireOneSuccessor(
    app.db,
    fixture.seriesId,
    fixture.taskId,
    'the first close generated the row this fixture then closes',
  )
  taskIds.push(successor.id)

  const second = await transitionRecurringOk(
    owner,
    successor.id,
    event,
    tz,
    `the successor is closed in turn (spec 5.1)`,
  )
  expect(
    second.generated,
    'the premise of this criterion: the series is bounded at the successor\'s date, so closing it generates nothing and leaves no pending row for G-SERIES to find',
  ).toBeNull()

  return {
    firstId: fixture.taskId,
    secondId: successor.id,
    seriesId: fixture.seriesId,
    rule: fixture.rule,
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

describe('AC-080: un-completing behind a closed successor is refused', () => {
  test('AC-080: the un-complete answers 409', async () => {
    const { owner } = await stage()
    const series = await movedOnSeries('refused', 'complete')

    const response = await transitionWithoutTz(
      owner,
      series.firstId,
      'uncomplete',
    )
    expectStatus(
      response,
      409,
      '5.1 G-SERIES: S is absent and this row does not have the greatest created_at of its series, so the un-complete is rejected. 8.5 says the same in one word: otherwise 409',
    )
    const envelope = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } (AC-117)',
    ).toBe(true)
    expect(
      String(envelope.error?.message ?? '').toLowerCase(),
      '5.1 gives this refusal copy of its own: this repeating task has already moved on; restore is only possible on its latest occurrence',
    ).toMatch(/moved on|latest occurrence/)
  })

  test('AC-080: the refusal changes nothing', async () => {
    const { owner } = await stage()
    const series = await movedOnSeries('unchanged', 'complete')
    const before = await seriesRows(app.db, series.seriesId)

    expectStatus(
      await transitionWithoutTz(owner, series.firstId, 'uncomplete'),
      409,
      'the un-complete is refused (spec 5.1)',
    )

    const after = await seriesRows(app.db, series.seriesId)
    expect(
      after.map((row) => `${row.id} ${String(row.status)} rule=${String(row.recurrence_rule)}`),
      '7.0 makes 409 a state conflict, so the transaction changes nothing: both rows keep their status, neither is deleted, and no rule is handed anywhere',
    ).toEqual(
      before.map(
        (row) => `${row.id} ${String(row.status)} rule=${String(row.recurrence_rule)}`,
      ),
    )
    expect(
      (await requireTaskRow(app.db, series.firstId)).completed_at,
      'INV-8: the refused row is still completed, so it still carries its instant',
    ).not.toBeNull()
  })

  test('AC-080 adversarial: the newest row of the same series may be un-completed', async () => {
    const { owner } = await stage()
    const series = await movedOnSeries('newest row', 'complete')

    // Same series, same exhausted bound, same absent S: the only thing that
    // differs is which row is asked. If this were refused too, the 409 above
    // would be about bounded rules or about un-complete itself rather than
    // about position, and the criterion would be asserting the wrong thing.
    await transitionSeriesOk(
      owner,
      series.secondId,
      'uncomplete',
      '5.1 G-SERIES second branch: S is absent and this row has the greatest created_at, so it reopens as the current occurrence',
    )
    const reopened = await requireTaskRow(app.db, series.secondId)
    expect(String(reopened.status), 'the newest row is pending again').toBe(
      'pending',
    )
    expect(
      reopened.recurrence_rule,
      '8.5: an exhausted series keeps its rule on the last row and simply resumes',
    ).toBe(series.rule)

    // And now the first row is refused for a second reason as well as the
    // first, a pending sibling having appeared. Still 409, still positional.
    expectStatus(
      await transitionWithoutTz(owner, series.firstId, 'uncomplete'),
      409,
      'with the newest row pending again, the older completed row is still not the one restore may touch',
    )
  })

  test('AC-080 adversarial: restore is refused by the same guard', async () => {
    const { owner } = await stage()
    const series = await movedOnSeries('restore refused', 'abandon')

    const response = await transitionWithoutTz(owner, series.firstId, 'restore')
    expectStatus(
      response,
      409,
      '5.1 puts G-SERIES on the abandoned-to-pending row too, and 8.5 names un-complete and restore together',
    )
    expect(
      String(
        (response.json() as { error?: { message?: unknown } }).error?.message ??
          '',
      ).toLowerCase(),
      'and carries the same copy',
    ).toMatch(/moved on|latest occurrence/)
    expect(
      String((await requireTaskRow(app.db, series.firstId)).status),
      'the row is still abandoned',
    ).toBe('abandoned')
  })

  test('AC-080: invariants hold afterwards', async () => {
    const { owner, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [owner.id])
  })
})

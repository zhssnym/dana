/*
AC-077: given two concurrent completes on one occurrence, then exactly one
successor exists and one completed_by is recorded.

The race is run as a race. Two members of the folder, two sessions, both
requests in flight together under Promise.all; a sequential pair would pass
against any implementation whatsoever and would assert nothing at all. 8.3
makes this the whole reason status writes are guarded single-row updates:
"the guard makes recurrence generation exactly-once under any race: only the
single winning transition executes it, inside the same transaction". A
check-then-update, or a generation hook outside the guarded branch, produces
two successors here and leaves a series that quietly doubles every time two
people tick the same chore off at once.

**What this file can and cannot prove on the default backend, stated rather
than assumed.** 11.15, as corrected at the P3 merge review, records that
PGlite is single-connection and that one connection serializes statements
rather than handler logic: a read-then-write race is fully expressible, but
what genuinely needs a second connection is a second concurrent transaction.
Each transition of 5.1 runs in exactly one transaction, so on PGlite the two
transactions queue and the second one finds a completed row, while on CI's
postgres:18 leg, which 11.10 makes the production-fidelity authority, they
genuinely overlap and the guard is what decides them. The assertions below
are written to be satisfied identically by both legs, and they are the
criterion's own: one successor, one completed_by. Asserting that an overlap
was observed would fail on the leg where queueing is what prevents it, which
is a false red about the backend rather than a finding about the code. The
honest summary is that the local leg proves the outcome and the postgres leg
proves the guard, and neither is redundant. This is the shape AC-021 and
AC-124 already carry, and their headers say the same thing.

The two racers are different people, so completed_by discriminates: the
column must hold one of the two and the losing caller must not overwrite it.
The last case runs the race repeatedly on fresh fixtures, because a race
decided the same way every time on one backend is a race that has been
observed once.

Spec: 8.3 (the guarded update, and generation exactly-once under any race),
5.1 (the transition table and its no-op row), 8.5 (generation inside the same
transaction), 7.6 (the envelope and the tz parameter ruled 2026-08-10), INV-7
(one pending row per series), 11.15 and 11.10 (what each leg can show).
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
  requireTaskRow,
} from './tasks-harness.js'
import {
  requireOneSuccessor,
  seedRecurringTask,
  seriesRows,
  transitionWithTz,
  weeklyRuleOn,
} from './recurrence-harness.js'
import type { RecurringFixture } from './recurrence-harness.js'
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
    const folderId = await createFolder(owner, 'p6 ac077 raced')
    await addMemberOk(owner, folderId, partner.id)
    staged = { owner, partner, folderId }
  }
  return staged
}

async function occurrence(label: string): Promise<RecurringFixture> {
  const { owner, folderId } = await stage()
  const dueDate = todayIn(tz)
  const fixture = await seedRecurringTask(app.db, owner, {
    folderId,
    title: `p6 ac077 ${label}`,
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

describe('AC-077: two concurrent completes generate one successor', () => {
  test('AC-077: the raced pair leaves exactly one successor', async () => {
    const { owner, partner } = await stage()
    const fixture = await occurrence('one successor')

    const [byOwner, byPartner] = await Promise.all([
      transitionWithTz(owner, fixture.taskId, 'complete', tz),
      transitionWithTz(partner, fixture.taskId, 'complete', tz),
    ])

    expect(
      [byOwner.status, byPartner.status],
      `5.1 makes a repeat complete a no-op answering 200, so whichever caller loses the guard is answered 200 rather than refused; answered ${String(byOwner.status)} and ${String(byPartner.status)}`,
    ).toEqual([200, 200])

    const successor = await requireOneSuccessor(
      app.db,
      fixture.seriesId,
      fixture.taskId,
      '8.3: only the single winning transition executes generation, so two callers produce one row',
    )
    taskIds.push(successor.id)
    expect(
      String(successor.due_date),
      'and it is the successor 8.5 would have generated for one caller',
    ).toBe(shiftDate(fixture.dueDate, 7))
    expect(
      (await seriesRows(app.db, fixture.seriesId)).filter(
        (row) => row.status === 'pending',
      ),
      'INV-7: one pending row per series, which two successors break',
    ).toHaveLength(1)
  })

  test('AC-077: one completed_by is recorded, and it is one of the two racers', async () => {
    const { owner, partner } = await stage()
    const fixture = await occurrence('one actor')

    await Promise.all([
      transitionWithTz(owner, fixture.taskId, 'complete', tz),
      transitionWithTz(partner, fixture.taskId, 'complete', tz),
    ])
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          fixture.seriesId,
          fixture.taskId,
          'the race generated one successor',
        )
      ).id,
    )

    const closed = await requireTaskRow(app.db, fixture.taskId)
    expect(String(closed.status), 'the occurrence is completed').toBe(
      'completed',
    )
    expect(
      [owner.id, partner.id],
      `completed_by holds the winner and the loser does not overwrite it: 8.3's guard admits one update, and the no-op branch returns without writing. Got ${String(closed.completed_by)}`,
    ).toContain(String(closed.completed_by))
    expect(
      closed.completed_at,
      'INV-8 ties the instant to the status, and one winner writes one instant',
    ).not.toBeNull()
  })

  test('AC-077: exactly one of the two responses reports the generation', async () => {
    const { owner, partner } = await stage()
    const fixture = await occurrence('one report')

    const responses = await Promise.all([
      transitionWithTz(owner, fixture.taskId, 'complete', tz),
      transitionWithTz(partner, fixture.taskId, 'complete', tz),
    ])
    taskIds.push(
      (
        await requireOneSuccessor(
          app.db,
          fixture.seriesId,
          fixture.taskId,
          'the race generated one successor',
        )
      ).id,
    )

    const reported = responses
      .map((response) => (response.json() as { generated_task?: unknown }).generated_task)
      .filter((value) => value !== null && value !== undefined)
    expect(
      reported,
      '8.3 runs generation only in the branch where the guarded update changed a row, and 7.6 makes generated_task what that call created. The loser created nothing, so exactly one of the two bodies carries a successor',
    ).toHaveLength(1)
  })

  test('AC-077 adversarial: the race is decided the same way every time', async () => {
    const { owner, partner } = await stage()
    // A race observed once has been observed once. Five fresh fixtures,
    // each raced, so an implementation that survives by an interleaving
    // rather than by the guard has five chances to show it. Cheap here
    // because each fixture is one create and one seeded update.
    const seen: string[] = []
    for (let round = 0; round < 5; round += 1) {
      const fixture = await occurrence(`round ${String(round)}`)
      await Promise.all([
        transitionWithTz(owner, fixture.taskId, 'complete', tz),
        transitionWithTz(partner, fixture.taskId, 'complete', tz),
      ])
      const rowsInSeries = await seriesRows(app.db, fixture.seriesId)
      for (const row of rowsInSeries) taskIds.push(row.id)
      seen.push(
        `round ${String(round)}: ${String(rowsInSeries.length)} rows, ${String(rowsInSeries.filter((row) => row.status === 'pending').length)} pending`,
      )
    }
    expect(
      seen,
      'every round leaves one closed row and one pending successor (spec 8.3, 8.5, INV-7)',
    ).toEqual([
      'round 0: 2 rows, 1 pending',
      'round 1: 2 rows, 1 pending',
      'round 2: 2 rows, 1 pending',
      'round 3: 2 rows, 1 pending',
      'round 4: 2 rows, 1 pending',
    ])
  })

  test('AC-077: invariants hold afterwards', async () => {
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

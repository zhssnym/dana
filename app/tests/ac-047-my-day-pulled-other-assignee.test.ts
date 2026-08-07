/*
AC-047: given a task assigned to someone else pulled by the viewer, then it
appears in the viewer's My Day with an assignee chip, and in nobody else's.

The criterion spans two packages at one clause and the split is asserted
rather than assumed. The chip is section 9's rendering and arrives with P8;
its server half is the whole of what P4 owes, and it is a real assertion
rather than a placeholder, because 7.0 gives TaskCard an assignee object and
Q1 offers no other way for a page to know whose task this is. So the row's
assignee must be the colleague, not the viewer and not null.

"In nobody else's" is the half an implementation gets wrong by writing the
pull as a property of the task rather than of the person. my_day_entries is
keyed on (task, user), and the fixture is chosen so that the entry is the
only thing that could put this row on anyone's page: the task is undated, so
Q1's automatic clause cannot fire for the assignee or for anyone else.

The second fixture separates the two clauses of the predicate that the first
one deliberately collapses. A task assigned to the colleague and due today,
pulled by the viewer, is on both pages at once, and for different reasons:
the viewer's by their pull, the colleague's by the automatic clause. An
implementation that answered the first fixture by broadcasting the pull would
be indistinguishable from a correct one here, which is why both are present.

Spec: 6 Q1 (the OR of the automatic clause and the entry), 8.2, 7.8, 7.0
(TaskCard's assignee and pulled), 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectTaskInvariants,
  myDayRows,
  pullIntoMyDay,
} from './tasks-harness.js'
import {
  requireCard,
  expectStillSameDay,
  idsOf,
  middayZone,
  myDay,
  seedViewTask,
  sharedFolder,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'colleague', 'outsider'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  colleague: Actor
  outsider: Actor
  folderId: string
  today: string
  /** Undated, assigned to the colleague, pulled by the viewer. */
  pulled: string
  /** Due today, assigned to the colleague, pulled by the viewer. */
  pulledAndDue: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, colleague, outsider] = await cast.of(app)
    if (viewer === undefined || colleague === undefined || outsider === undefined) {
      throw new Error('cast must produce three actors')
    }
    const folderId = await sharedFolder(
      app.db,
      viewer,
      colleague,
      'p4 ac047 shared',
    )
    const today = todayIn(tz)

    const pulled = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac047 someone else\'s undated task',
    })
    const pulledAndDue = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac047 someone else\'s task due today',
      dueDate: today,
    })

    for (const taskId of [pulled, pulledAndDue]) {
      const response = await pullIntoMyDay(viewer, taskId)
      expectStatus(
        response,
        200,
        `the viewer's pull of ${taskId} must be accepted (spec 7.8; P3 is merged)`,
      )
    }

    staged = {
      viewer,
      colleague,
      outsider,
      folderId,
      today,
      pulled,
      pulledAndDue,
    }
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

describe('AC-047: a pull is one person\'s decision about someone else\'s task', () => {
  test('AC-047: the pulled task is in the viewer\'s Today group', async () => {
    const { viewer, today, pulled } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-047')
    expect(
      idsOf(body.today),
      'the entry clause of Q1 needs no assignment and no date; 8.2 puts qualify_date = added_on = today, so the row lands in Today',
    ).toContain(pulled)
  })

  test('AC-047: it carries the colleague as its assignee, which is the chip\'s server half', async () => {
    const { viewer, colleague, today, pulled } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-047')
    const card = requireCard(
      body.today,
      pulled,
      'the row must be on the page to carry anything',
    )
    expect(
      card.assignee?.id,
      '8.2: pulling someone else\'s task shows it with its assignee chip. The chip is section 9\'s rendering and arrives with P8; the assignee object 7.0 gives TaskCard is what the chip is drawn from, and it is this package\'s half',
    ).toBe(colleague.id)
    expect(
      card.pulled,
      '7.0 makes pulled a field of the card, true when the viewer holds an entry',
    ).toBe(true)
  })

  test('AC-047: it is in nobody else\'s My Day', async () => {
    const { colleague, outsider, today, pulled } = await stage()
    const theirs = await myDay(colleague, tz)
    expectStillSameDay(tz, today, 'AC-047')
    expect(
      [...idsOf(theirs.today), ...idsOf(theirs.carried), ...idsOf(theirs.recap)],
      'the task is theirs but undated, so Q1\'s automatic clause cannot fire for them, and the entry belongs to the viewer alone: my_day_entries is keyed on (task, user)',
    ).not.toContain(pulled)

    const strangers = await myDay(outsider, tz)
    expect(
      [
        ...idsOf(strangers.today),
        ...idsOf(strangers.carried),
        ...idsOf(strangers.recap),
      ],
      'a non-member sees nothing of this folder at all (spec 6, ACCESSIBLE(V); 10.2)',
    ).toEqual([])
  })

  test('AC-047: the pull wrote exactly one entry, the viewer\'s', async () => {
    const { viewer, pulled } = await stage()
    expect(
      (await myDayRows(app.db, pulled)).map((row) => String(row.user_id)),
      'INV-12 allows one entry per (task, user); an implementation that put the task on the assignee\'s page too would need a second row and there is not one',
    ).toEqual([viewer.id])
  })

  test('AC-047 adversarial: a pulled task that is also due today is on both pages, for different reasons', async () => {
    const { viewer, colleague, today, pulledAndDue } = await stage()
    const mine = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-047')
    expect(
      idsOf(mine.today),
      'the viewer holds it by their entry',
    ).toContain(pulledAndDue)

    const theirs = await myDay(colleague, tz)
    expect(
      idsOf(theirs.today),
      'and the assignee holds it by Q1\'s automatic clause, due_date = today with assignee_id = V, which the viewer\'s pull neither granted nor could take away. The first fixture and this one separate the two clauses an implementation is free to confuse',
    ).toContain(pulledAndDue)
    expect(
      (await myDayRows(app.db, pulledAndDue)).map((row) => String(row.user_id)),
      'and still exactly one entry exists, the viewer\'s: the colleague\'s row is computed, not stored',
    ).toEqual([viewer.id])
  })

  test('AC-047: the fixture satisfies section 3', async () => {
    const { viewer, colleague, folderId, pulled, pulledAndDue } = await stage()
    await expectTaskInvariants(
      app.db,
      [pulled, pulledAndDue],
      [folderId],
      [viewer.id, colleague.id],
    )
  })
})

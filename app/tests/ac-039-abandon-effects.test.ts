/*
AC-039: given abandon on a pending task, then it leaves My Day, appears
faded in its home, and never appears in Done.

Three clauses across two packages, so this file says plainly which of them
it can fail on. P3 delivers the transition and the 7.8 pull; the pages that
would render the task are 7.10's and arrive with P4, and the faded row is
section 9's and arrives with P8. What is asserted here is therefore the
state every one of those pages is a query over, which is where an
implementation of this transition can actually be wrong:

- Leaves My Day: 8.2 selects open rows with status pending, so an abandoned
  task is out of both groups by the status alone. The pull entry itself must
  survive, because 5.1's abandon row lists its side effects and deleting a
  My Day entry is not among them; an implementation that tidies it away
  changes what a later restore returns to the page.
- Never appears in Done: the Done page is keyed on completed_at (4.12's
  partial index, Q6), and INV-8 ties that column to the completed status
  alone. An abandon that writes a completion instant would put the task in
  Done, which is exactly the clause forbidding it.
- Appears faded in its home: rendering, and this package renders nothing.
  AC-053 pins it at P4 for an abandoned task in Tasks and All, and AC-097
  pins the faded row and its Restore control at P8. Recorded here rather
  than silently skipped.

Attacked beside the criterion: the reminder row must survive, which 8.6
states outright, and the repeat abandon must be a no-op that writes nothing.

Spec: 5.1 (pending to abandoned, and abandoned to abandon as a no-op), 8.2
(My Day is a query over pending rows), 8.6 (a reminder survives
abandonment), INV-8, 4.12.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  addStepOk,
  createTaskOk,
  expectTaskInvariants,
  myDayAddedOn,
  pullIntoMyDay,
  reminderRow,
  requireTaskRow,
  seedOffsetReminder,
  stepRows,
  transitionOk,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac039 home')
    const created = await createTaskOk(
      author,
      {
        title: 'p3 ac039 abandoned task',
        folder_id: folderId,
        due_date: '2026-09-20',
        due_time: '08:00',
      },
      'the task to abandon must be creatable (spec 7.6)',
    )
    await addStepOk(author, created.id, 'a step that must survive')
    // The reminder is P7's surface, so it is seeded; 8.6's claim that it
    // survives abandonment is testable without the module that computes it.
    await seedOffsetReminder(app.db, created.id, author.id, 15)
    const pull = await pullIntoMyDay(author, created.id, 'UTC')
    expectStatus(
      pull,
      200,
      'the pull the criterion needs must succeed while the task is pending (spec 7.8)',
    )
    staged = { author, folderId, taskId: created.id }
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

describe('AC-039: abandoning takes the task out of every open page', () => {
  test('AC-039: the abandon is accepted and the status is abandoned', async () => {
    const { author, taskId } = await stage()
    const body = await transitionOk(
      author,
      taskId,
      'abandon',
      'abandoning a pending task is a legal transition for any member (spec 5.1, 5.4)',
    )
    expect(body.task.status, 'the task is abandoned').toBe('abandoned')
    expect(
      (await requireTaskRow(app.db, taskId)).status,
      'and the row agrees',
    ).toBe('abandoned')
  })

  test('AC-039: it leaves My Day, because My Day selects pending rows', async () => {
    const { author, taskId } = await stage()
    await transitionOk(author, taskId, 'abandon', 'the abandon is accepted')
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.status,
      '8.2 selects open rows with status pending, so an abandoned task is in neither group',
    ).not.toBe('pending')
    expect(
      await myDayAddedOn(app.db, taskId, author.id),
      '5.1 lists this transition\'s side effects and deleting the viewer\'s pull is not among them: the page filters, the transition does not tidy',
    ).toBeDefined()
  })

  test('AC-039: it can never appear in Done', async () => {
    const { author, taskId } = await stage()
    await transitionOk(author, taskId, 'abandon', 'the abandon is accepted')
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.completed_at,
      'Done is keyed on completed_at (4.12, Q6), and INV-8 gives that column only to completed tasks',
    ).toBeNull()
    expect(
      row.completed_by,
      'the same for completed_by, which the My Day recap reads',
    ).toBeNull()
    expect(row.status, 'and the status itself is not completed').not.toBe(
      'completed',
    )
  })

  test('AC-039 adversarial: the reminder and the steps survive', async () => {
    const { author, taskId } = await stage()
    await transitionOk(author, taskId, 'abandon', 'the abandon is accepted')
    expect(
      await reminderRow(app.db, taskId),
      '8.6: the reminder row survives completion and abandonment untouched; delivery is what checks the status',
    ).toBeDefined()
    expect(
      (await stepRows(app.db, taskId)).length,
      '4.6: steps have no coupling with task status in either direction',
    ).toBe(1)
  })

  test('AC-039 adversarial: abandoning again is a no-op that writes nothing', async () => {
    const { author, taskId } = await stage()
    await transitionOk(author, taskId, 'abandon', 'the first abandon is accepted')
    const before = await requireTaskRow(app.db, taskId)
    const body = await transitionOk(
      author,
      taskId,
      'abandon',
      'abandoned to abandon is a listed no-op answering 200 (spec 5.1)',
    )
    expect(body.task.status, 'still abandoned').toBe('abandoned')
    const after = await requireTaskRow(app.db, taskId)
    expect(
      String(after.updated_at),
      'a no-op returns 200 without side effects (section 5 preamble)',
    ).toBe(String(before.updated_at))
  })

  test('AC-039 adversarial: the dates the row was abandoned with are untouched', async () => {
    const { author, taskId } = await stage()
    await transitionOk(author, taskId, 'abandon', 'the abandon is accepted')
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.due_date,
      'abandoning is not a way of clearing a date; only 8.4 clears dates',
    ).toBe('2026-09-20')
    expect(row.due_time, 'and the time stands with it (INV-6)').not.toBeNull()
  })

  test('AC-039: invariants hold afterwards', async () => {
    const { author, folderId, taskId } = await stage()
    await expectTaskInvariants(app.db, [taskId], [folderId], [author.id])
  })
})

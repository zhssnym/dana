/*
AC-028: given a PATCH clearing due_date on a task with due_time, a rule, and
a reminder, then all three are cleared or deleted in the same transaction.

The fixture is the whole difficulty. A task carrying all three dependents at
once cannot be built through 7.6's body at P3: the RFC 0001 P3 row defers the
recurrence_rule arm to P6, which delivers the 4.11 subset validator 4.11
requires revalidated server-side, and the reminder arm to P7, which delivers
the 8.6 fire instant 4.8's NOT NULL fire_at column demands. So the dated and
timed task is created through the endpoint under test and the two later
arms are seeded directly, the folders-harness precedent for surfaces later
packages own. The criterion is about what the cascade removes, and a
seeded dependent is removed by exactly the same statement as a requested
one.

Two halves are asserted separately because they fail separately. The
cascade itself: after the clear, all four of due_date, due_time,
recurrence_rule and the reminder row are gone, and series_id survives,
which 8.4 keeps deliberately for history. And the transaction: a PATCH that
clears the date and also names an assignee the target folder does not have
must leave every dependent standing, because a cascade committed ahead of
the refusal is a cascade that was not in the same transaction. That is the
only way this suite can see a transaction boundary from outside the process.

Spec: 7.6 (PATCH, the clear-date trigger), 8.4 (the cascade, one
transaction with the PATCH), INV-6, INV-13, 4.5, 4.8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  patchTask,
  patchTaskOk,
  readTask,
  reminderRow,
  requireTaskRow,
  seedOffsetReminder,
  seedRecurrence,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Fixture {
  taskId: string
  seriesId: string
}

interface Stage {
  author: Actor
  folderId: string
  outsiderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac028 cascade')
    // A user who exists and is not a member of the folder, so the refusal
    // the transaction case needs comes from 7.6's assignee guard.
    const outsiderId = await seedUser(app.db, 'ac028-outsider')
    cast.trackUser(outsiderId)
    staged = { author, folderId, outsiderId }
  }
  return staged
}

const fixtureIds: string[] = []

/** A task with due_date, due_time, a rule, and a reminder: two arms through
 * 7.6, two seeded, per the P3 row's deferral. */
async function fixture(label: string): Promise<Fixture> {
  const { author, folderId } = await stage()
  const created = await createTaskOk(
    author,
    {
      title: `p3 ac028 ${label}`,
      folder_id: folderId,
      due_date: '2026-08-24',
      due_time: '17:00',
    },
    'the dated and timed half of the fixture must be creatable through 7.6',
  )
  const seriesId = await seedRecurrence(app.db, created.id)
  await seedOffsetReminder(app.db, created.id, author.id, 30)
  fixtureIds.push(created.id)
  return { taskId: created.id, seriesId }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-028: clearing the due date clears its three dependents', () => {
  test('AC-028: the fixture really carries all three before the clear', async () => {
    const { author } = await stage()
    const { taskId } = await fixture('premise')
    const before = await readTask(author, taskId)
    expect(before.due_time, 'the fixture is timed').not.toBeNull()
    expect(
      before.recurrence_rule,
      'the fixture carries a rule, and TaskDetail reports it (spec 7.0)',
    ).not.toBeNull()
    expect(
      before.is_recurring,
      'is_recurring reports the rule the row carries (spec 7.0)',
    ).toBe(true)
    expect(
      before.reminder,
      'the fixture carries a reminder, and TaskDetail reports it (spec 7.0)',
    ).not.toBeNull()
  })

  test('AC-028: the clear removes all three and the body says so', async () => {
    const { author } = await stage()
    const { taskId } = await fixture('cascade')
    const body = await patchTaskOk(
      author,
      taskId,
      { due_date: null },
      'clearing due_date is a legal PATCH and answers 200 with the TaskDetail (spec 7.6)',
    )
    expect(body.due_date, 'the date the PATCH cleared').toBeNull()
    expect(body.due_time, 'INV-6: due_time cannot outlive the date').toBeNull()
    expect(
      body.recurrence_rule,
      '8.4: the series ends when the date is cleared',
    ).toBeNull()
    expect(body.is_recurring, 'no rule means is_recurring false').toBe(false)
    expect(body.reminder, '8.4: the reminder row is deleted').toBeNull()
  })

  test('AC-028: the row and the reminder table agree with the body', async () => {
    const { author } = await stage()
    const { taskId, seriesId } = await fixture('rows')
    await patchTaskOk(
      author,
      taskId,
      { due_date: null },
      'clearing due_date answers 200 (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(row.due_date, 'the stored due_date is null').toBeNull()
    expect(row.due_time, 'the stored due_time is null (INV-6)').toBeNull()
    expect(row.recurrence_rule, 'the stored rule is null (8.4)').toBeNull()
    expect(
      await reminderRow(app.db, taskId),
      '8.4 deletes the reminder row rather than blanking it',
    ).toBeUndefined()
    expect(
      row.series_id === null ? null : String(row.series_id),
      '8.4 keeps series_id for history: the series ends, its identity does not',
    ).toBe(seriesId)
  })

  test('AC-028 adversarial: a clear that fails on another field cascades nothing', async () => {
    const { author, outsiderId } = await stage()
    const { taskId } = await fixture('transaction')
    const response = await patchTask(author, taskId, {
      due_date: null,
      assignee_id: outsiderId,
    })
    expectStatus(
      response,
      422,
      'an assignee who is not a member of the folder is refused (spec 7.6, INV-4)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.due_date === null ? null : String(row.due_date).slice(0, 10),
      'the refused PATCH left the date standing: the cascade is in the same transaction (spec 8.4)',
    ).toBe('2026-08-24')
    expect(row.due_time, 'the refused PATCH left due_time standing').not.toBeNull()
    expect(
      row.recurrence_rule,
      'the refused PATCH left the rule standing',
    ).not.toBeNull()
    expect(
      await reminderRow(app.db, taskId),
      'the refused PATCH left the reminder row standing',
    ).toBeDefined()
  })

  test('AC-028 adversarial: clearing a date twice is harmless', async () => {
    const { author } = await stage()
    const { taskId } = await fixture('twice')
    await patchTaskOk(
      author,
      taskId,
      { due_date: null },
      'the first clear answers 200 (spec 7.6)',
    )
    const again = await patchTaskOk(
      author,
      taskId,
      { due_date: null },
      'clearing an already-cleared date is a legal PATCH of a nullable field, not a state conflict (spec 7.6)',
    )
    expect(again.due_date, 'still undated').toBeNull()
    expect(
      await reminderRow(app.db, taskId),
      'there was no second reminder to delete',
    ).toBeUndefined()
  })

  test('AC-028: invariants hold afterwards', async () => {
    const { author, folderId } = await stage()
    await expectTaskInvariants(app.db, fixtureIds, [folderId], [author.id])
  })
})

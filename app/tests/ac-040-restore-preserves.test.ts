/*
AC-040: given restore on an abandoned non-recurring task, then it is pending
with every date and the reminder configuration untouched.

Non-recurring is in the criterion because restore has two branches: 5.1's
G-SERIES guard applies when the row has a series_id, and this row has none,
so the transition is the plain one. The recurring branch is P6's, pinned
there by AC-079 and AC-080.

"Untouched" is the assertion this file is built around, and it is asserted
against a snapshot taken before the abandon rather than against literals,
so a restore that rewrites a date to something plausible fails just as a
restore that clears it does. The reminder is the sharp half: it is a
separate row, and 8.6 recomputes fire_at on several triggers, so what must
survive is the configuration, its mode and its value, which is what the
criterion says and what a restore has no reason to touch.

Attacked beside the criterion: restore on a pending task, which 5.1 lists as
a no-op returning 200, so a route that treats every restore as a state
change writes on a row it should not have touched.

Spec: 5.1 (abandoned to pending via restore; pending to restore as a no-op),
8.6 (the reminder row and what changes it), INV-6, INV-8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  reminderRow,
  requireTaskRow,
  seedOffsetReminder,
  transitionOk,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac040 restore')
    staged = { author, folderId }
  }
  return staged
}

interface Fixture {
  taskId: string
  before: TaskRow
  reminderBefore: Record<string, unknown>
}

/** A dated, timed, noted task carrying a reminder, abandoned, with its
 * whole state captured from before the abandon. */
async function abandonedFixture(label: string): Promise<Fixture> {
  const { author, folderId } = await stage()
  const created = await createTaskOk(
    author,
    {
      title: `p3 ac040 ${label}`,
      folder_id: folderId,
      notes: 'notes that must come back',
      important: true,
      due_date: '2026-09-28',
      due_time: '16:45',
    },
    'the task to abandon and restore must be creatable (spec 7.6)',
  )
  await seedOffsetReminder(app.db, created.id, author.id, 45)
  taskIds.push(created.id)
  const before = await requireTaskRow(app.db, created.id)
  const reminderBefore = (await reminderRow(app.db, created.id)) as Record<
    string,
    unknown
  >
  await transitionOk(
    author,
    created.id,
    'abandon',
    'the abandon must succeed before the restore can be tested (spec 5.1)',
  )
  return { taskId: created.id, before, reminderBefore }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-040: restoring returns the task exactly as it was', () => {
  test('AC-040: the restore answers 200 and the task is pending', async () => {
    const { author } = await stage()
    const { taskId } = await abandonedFixture('status')
    const body = await transitionOk(
      author,
      taskId,
      'restore',
      'restoring an abandoned row with no series is the plain branch of 5.1',
    )
    expect(body.task.status, 'the task is pending again').toBe('pending')
    const row = await requireTaskRow(app.db, taskId)
    expect(row.status, 'and the row agrees').toBe('pending')
    expect(
      row.completed_at,
      'a pending task carries no completion columns (INV-8)',
    ).toBeNull()
    expect(row.completed_by, 'neither of them').toBeNull()
  })

  test('AC-040: every date is untouched', async () => {
    const { author } = await stage()
    const { taskId, before } = await abandonedFixture('dates')
    await transitionOk(author, taskId, 'restore', 'the restore is accepted')
    const after = await requireTaskRow(app.db, taskId)
    expect(
      after.due_date,
      '5.1: dates, due_time, reminder configuration untouched',
    ).toBe(before.due_date)
    expect(String(after.due_time), 'the time as it was').toBe(
      String(before.due_time),
    )
  })

  test('AC-040: the reminder configuration is untouched', async () => {
    const { author } = await stage()
    const { taskId, reminderBefore } = await abandonedFixture('reminder')
    await transitionOk(author, taskId, 'restore', 'the restore is accepted')
    const after = await reminderRow(app.db, taskId)
    expect(
      after,
      'the reminder row survives the round trip: 8.6 deletes it only on removal, the clear-date cascade, or task deletion',
    ).toBeDefined()
    expect(
      Number((after as Record<string, unknown>).offset_minutes),
      'its mode and value are the configuration the criterion protects',
    ).toBe(Number(reminderBefore.offset_minutes))
    expect(
      (after as Record<string, unknown>).time_of_day,
      '4.8 admits exactly one mode, and this one is the offset',
    ).toBeNull()
  })

  test('AC-040 adversarial: the rest of the row came back as it was', async () => {
    const { author } = await stage()
    const { taskId, before } = await abandonedFixture('rest')
    await transitionOk(author, taskId, 'restore', 'the restore is accepted')
    const after = await requireTaskRow(app.db, taskId)
    expect(after.title, 'the title').toBe(before.title)
    expect(after.notes, 'the notes').toBe(before.notes)
    expect(after.important, 'the importance').toBe(before.important)
    expect(
      after.assignee_id === null ? null : String(after.assignee_id),
      'the assignee',
    ).toBe(before.assignee_id === null ? null : String(before.assignee_id))
    expect(
      after.recurrence_rule,
      'and it is still the non-recurring task the criterion names',
    ).toBeNull()
  })

  test('AC-040 adversarial: restoring a pending task is a no-op that writes nothing', async () => {
    const { author } = await stage()
    const { taskId } = await abandonedFixture('noop')
    await transitionOk(author, taskId, 'restore', 'the restore is accepted')
    const before = await requireTaskRow(app.db, taskId)
    const body = await transitionOk(
      author,
      taskId,
      'restore',
      'pending to restore is a listed no-op answering 200 (spec 5.1)',
    )
    expect(body.task.status, 'still pending').toBe('pending')
    expect(
      String((await requireTaskRow(app.db, taskId)).updated_at),
      'a no-op returns 200 without side effects (section 5 preamble)',
    ).toBe(String(before.updated_at))
  })

  test('AC-040: invariants hold afterwards', async () => {
    const { author, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [author.id])
  })
})

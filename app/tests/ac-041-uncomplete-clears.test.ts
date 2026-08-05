/*
AC-041: given uncomplete on a completed non-recurring task, then it is
pending and completed_at and completed_by are null.

The mirror of AC-036 and, like AC-040, deliberately the non-recurring
branch: 5.1's G-SERIES guard applies to rows with a series_id, and the
recurring cases are P6's, pinned there by AC-079 and AC-080.

INV-8 is why both columns matter equally. The invariant is an equivalence in
both directions, "status = completed exactly when completed_at is set and
exactly when completed_by is set", and 4.5 backs each half with its own
CHECK, so an uncomplete that clears one column and forgets the other cannot
even commit. The failure it produces is a 500 from a constraint, which is
why this file asserts the status code as well as the columns.

Attacked beside the criterion: a different member uncompletes, since 5.1
makes any member the actor and completed_by is not a lock; the dates and
steps survive, since 5.1's side effects for this row are the two columns
alone; and uncomplete on a pending task is a listed no-op.

Spec: 5.1 (completed to pending via uncomplete; pending to uncomplete as a
no-op), INV-8, 4.5, 8.3.
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
  addStepOk,
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
  stepRows,
  transitionOk,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'second'], 'p3')

interface Stage {
  owner: Actor
  second: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second] = await cast.of(app)
    if (owner === undefined || second === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, second.id)
    const folderId = await createFolder(owner, 'p3 ac041 shared')
    await addMemberOk(owner, folderId, second.id)
    staged = { owner, second, folderId }
  }
  return staged
}

/** A dated task with a step, completed by the owner, captured beforehand. */
async function completedFixture(
  label: string,
): Promise<{ taskId: string; before: TaskRow }> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p3 ac041 ${label}`,
      folder_id: folderId,
      due_date: '2026-10-05',
      due_time: '11:30',
      important: true,
    },
    'the task to complete and uncomplete must be creatable (spec 7.6)',
  )
  await addStepOk(owner, created.id, 'a step that must survive')
  taskIds.push(created.id)
  const before = await requireTaskRow(app.db, created.id)
  await transitionOk(
    owner,
    created.id,
    'complete',
    'the completion must succeed before the uncomplete can be tested (spec 5.1)',
  )
  return { taskId: created.id, before }
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-041: uncompleting clears both completion columns', () => {
  test('AC-041: the task is pending again', async () => {
    const { owner } = await stage()
    const { taskId } = await completedFixture('status')
    const body = await transitionOk(
      owner,
      taskId,
      'uncomplete',
      'uncompleting a completed row with no series is the plain branch of 5.1',
    )
    expect(body.task.status, 'the task is pending').toBe('pending')
    expect(
      (await requireTaskRow(app.db, taskId)).status,
      'and the row agrees',
    ).toBe('pending')
  })

  test('AC-041: completed_at and completed_by are null', async () => {
    const { owner } = await stage()
    const { taskId } = await completedFixture('columns')
    const body = await transitionOk(
      owner,
      taskId,
      'uncomplete',
      'the uncomplete is accepted (spec 5.1)',
    )
    expect(body.task.completed_at, 'the body reports the cleared instant').toBeNull()
    expect(body.task.completed_by, 'and the cleared actor').toBeNull()
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.completed_at,
      'INV-8 is an equivalence: a pending row carries neither column',
    ).toBeNull()
    expect(row.completed_by, 'and 4.5 backs each half with its own CHECK').toBeNull()
  })

  test('AC-041 adversarial: a different member may uncomplete', async () => {
    const { second } = await stage()
    const { taskId } = await completedFixture('other member')
    const body = await transitionOk(
      second,
      taskId,
      'uncomplete',
      'the actor of any 5.1 transition is any member of the folder, not the completer (spec 5.1, 5.4)',
    )
    expect(body.task.status, 'the task is pending').toBe('pending')
    expect(
      (await requireTaskRow(app.db, taskId)).completed_by,
      'and the completion record is gone with the completion',
    ).toBeNull()
  })

  test('AC-041 adversarial: the dates and steps survive', async () => {
    const { owner } = await stage()
    const { taskId, before } = await completedFixture('preserved')
    await transitionOk(owner, taskId, 'uncomplete', 'the uncomplete is accepted')
    const after = await requireTaskRow(app.db, taskId)
    expect(
      String(after.due_date).slice(0, 10),
      '5.1 gives this transition two side effects, and dates are not among them',
    ).toBe(String(before.due_date).slice(0, 10))
    expect(String(after.due_time), 'the time as it was').toBe(
      String(before.due_time),
    )
    expect(after.important, 'the importance as it was').toBe(before.important)
    expect(
      (await stepRows(app.db, taskId)).length,
      '4.6: no coupling between steps and status in either direction',
    ).toBe(1)
  })

  test('AC-041 adversarial: uncompleting a pending task is a no-op that writes nothing', async () => {
    const { owner } = await stage()
    const { taskId } = await completedFixture('noop')
    await transitionOk(owner, taskId, 'uncomplete', 'the uncomplete is accepted')
    const before = await requireTaskRow(app.db, taskId)
    const body = await transitionOk(
      owner,
      taskId,
      'uncomplete',
      'pending to uncomplete is a listed no-op answering 200 (spec 5.1)',
    )
    expect(body.task.status, 'still pending').toBe('pending')
    expect(
      String((await requireTaskRow(app.db, taskId)).updated_at),
      'a no-op returns 200 without side effects (section 5 preamble)',
    ).toBe(String(before.updated_at))
  })

  test('AC-041: invariants hold afterwards', async () => {
    const { owner, second, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(
      app.db,
      taskIds,
      [folderId],
      [owner.id, second.id],
    )
  })
})

/*
AC-037: given complete on an already completed task, then 200, and
completed_by is unchanged.

The idempotency contract of section 5: "Same-state repeats listed as no-op
return 200 without side effects". Two implementations pass the status half
and fail the criterion. One re-runs the update unguarded, which answers 200
while moving completed_at and completed_by to the repeat caller; that is the
lost history 4.5 keeps completed_by for. The other treats the repeat as a
conflict and answers 409, which breaks the retry contract 7.0 states for
status transitions.

The repeat is made by a different member on purpose. A second call by the
original completer would leave completed_by right by accident, and the
criterion would be satisfied by an implementation that overwrites.

Attacked beside the criterion: completed_at must not move either, and
neither must updated_at, because "without side effects" is a statement about
the row and not only about the two completion columns.

Spec: 5.1 (completed, complete, no-op 200), 8.3 (the guarded update is
what makes the repeat a no-op), 7.0 (transitions are idempotent), 4.5.
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
  createTaskOk,
  expectTaskInvariants,
  requireTaskRow,
  transitionOk,
} from './tasks-harness.js'
import type { TaskRow } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'second'], 'p3')

interface Stage {
  owner: Actor
  second: Actor
  folderId: string
  taskId: string
  afterFirst: TaskRow
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, second] = await cast.of(app)
    if (owner === undefined || second === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, second.id)
    const folderId = await createFolder(owner, 'p3 ac037 shared')
    await addMemberOk(owner, folderId, second.id)
    const created = await createTaskOk(
      owner,
      { title: 'p3 ac037 completed once', folder_id: folderId },
      'the task under repeat completion must be creatable (spec 7.6)',
    )
    await transitionOk(
      owner,
      created.id,
      'complete',
      'the first completion must succeed before the repeat can be tested (spec 5.1)',
    )
    const afterFirst = await requireTaskRow(app.db, created.id)
    staged = { owner, second, folderId, taskId: created.id, afterFirst }
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

describe('AC-037: completing a completed task is a no-op', () => {
  test('AC-037: the first completion recorded the first completer', async () => {
    const { owner, afterFirst } = await stage()
    expect(
      String(afterFirst.completed_by),
      'the premise: completed_by holds the first actor before the repeat',
    ).toBe(owner.id)
    expect(afterFirst.status, 'and the task is completed').toBe('completed')
  })

  test('AC-037: the repeat answers 200', async () => {
    const { second, taskId } = await stage()
    const body = await transitionOk(
      second,
      taskId,
      'complete',
      'a same-state repeat is a no-op answering 200, not a conflict (spec 5.1, 7.0)',
    )
    expect(body.task.status, 'the task is still completed').toBe('completed')
  })

  test('AC-037: completed_by is unchanged', async () => {
    const { owner, second, taskId, afterFirst } = await stage()
    await transitionOk(
      second,
      taskId,
      'complete',
      'the repeat answers 200 (spec 5.1)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      String(row.completed_by),
      'the repeat caller must not take credit for a completion somebody else made (spec 5.1, 4.5)',
    ).toBe(owner.id)
    expect(String(row.completed_by)).not.toBe(second.id)
    expect(
      String(row.completed_by),
      'and it is still exactly what the first completion wrote',
    ).toBe(String(afterFirst.completed_by))
  })

  test('AC-037 adversarial: the no-op wrote nothing at all', async () => {
    const { second, taskId, afterFirst } = await stage()
    await transitionOk(
      second,
      taskId,
      'complete',
      'the repeat answers 200 (spec 5.1)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      String(row.completed_at),
      'a no-op returns 200 without side effects (section 5 preamble), so the instant cannot move',
    ).toBe(String(afterFirst.completed_at))
    expect(
      String(row.updated_at),
      'and neither can updated_at, which 4.5 touches on every real mutation',
    ).toBe(String(afterFirst.updated_at))
  })

  test('AC-037 adversarial: repeating it again changes nothing further', async () => {
    const { owner, second, taskId, afterFirst } = await stage()
    await transitionOk(second, taskId, 'complete', 'the repeat answers 200')
    await transitionOk(owner, taskId, 'complete', 'and so does the next one')
    const row = await requireTaskRow(app.db, taskId)
    expect(String(row.completed_by), 'still the first completer').toBe(owner.id)
    expect(String(row.completed_at), 'still the first instant').toBe(
      String(afterFirst.completed_at),
    )
  })

  test('AC-037: invariants hold afterwards', async () => {
    const { owner, second, folderId, taskId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [folderId],
      [owner.id, second.id],
    )
  })
})

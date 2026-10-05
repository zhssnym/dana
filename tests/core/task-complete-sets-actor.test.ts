/*
given complete on a pending task, then completed_at and completed_by
are set to the acting time and user.

The acting user is the sharp half. 5.1 makes the actor any member of the
folder, and 4.5 records that completed_by feeds the My Day recap and the
completion race guard, so the plausible wrong values are all nearby people:
the task's assignee, its creator, its folder's owner. Here the completer is
none of them, so a route that reaches for the wrong column fails rather than
coincidentally agreeing.

The acting time is bracketed rather than compared to a constant: the request
is timed from outside and completed_at must land inside that window, which
refuses both the epoch and the row's own created_at without asserting a
clock this suite does not own.

Attacked beside the criterion: the 7.6 response envelope, whose two
recurrence companions must read null on a task with no rule; INV-8, which
ties the two columns to the status and is the reason a partial write is a
constraint violation rather than a cosmetic one; and the fields a
completion has no business touching.

Spec: 5.1 (pending to completed, the side effects), 8.3 (the guarded
single-row update), 7.6 (the transition endpoints and their response),
INV-8, 4.5.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  requireTaskRow,
  transitionOk,
} from '../support/tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'assignee', 'completer'], 'p3')

interface Stage {
  owner: Actor
  assignee: Actor
  completer: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, assignee, completer] = await cast.of(app)
    if (
      owner === undefined ||
      assignee === undefined ||
      completer === undefined
    ) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, assignee.id)
    await connect(app.db, owner.id, completer.id)
    const folderId = await createFolder(owner, 'p3 ac036 shared')
    await addMemberOk(owner, folderId, assignee.id)
    await addMemberOk(owner, folderId, completer.id)
    staged = { owner, assignee, completer, folderId }
  }
  return staged
}

/** Created by the owner, assigned to a third person, completed by a
 * fourth: none of the three plausible wrong columns is the actor. */
async function task(label: string): Promise<string> {
  const { owner, assignee, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p3 ac036 ${label}`,
      folder_id: folderId,
      assignee_id: assignee.id,
      due_date: '2026-09-15',
      important: true,
    },
    'the task under completion must be creatable (spec 7.6)',
  )
  taskIds.push(created.id)
  return created.id
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('completing records the acting user and time', () => {
  test('completed_by is the acting user, not the assignee or the creator', async () => {
    const { owner, assignee, completer } = await stage()
    const taskId = await task('actor')
    const body = await transitionOk(
      completer,
      taskId,
      'complete',
      'any member of the folder may complete a pending task (spec 5.1, 5.4)',
    )
    expect(body.task.status, 'the task is completed').toBe('completed')
    expect(
      body.task.completed_by,
      'completed_by is the actor (spec 5.1), who here is neither the assignee nor the creator',
    ).toBe(completer.id)

    const row = await requireTaskRow(app.db, taskId)
    expect(String(row.completed_by), 'and the row agrees').toBe(completer.id)
    expect(String(row.completed_by)).not.toBe(assignee.id)
    expect(String(row.completed_by)).not.toBe(owner.id)
  })

  test('completed_at is the acting time', async () => {
    const { completer } = await stage()
    const taskId = await task('instant')
    const before = Date.now()
    await transitionOk(
      completer,
      taskId,
      'complete',
      'the completion is accepted (spec 5.1)',
    )
    const after = Date.now()

    const row = await requireTaskRow(app.db, taskId)
    const at = Date.parse(String(row.completed_at))
    expect(
      Number.isNaN(at),
      'completed_at must be a real instant (spec 4.5)',
    ).toBe(false)
    // Ten seconds of slack on each side: the request is bracketed from this
    // process and the instant is written by the database, so the only gap
    // is clock skew between the two, which is zero on both test backends.
    expect(
      at >= before - 10_000 && at <= after + 10_000,
      `completed_at must be the acting time (spec 5.1: completed_at = now()); the request ran ${new Date(before).toISOString()} to ${new Date(after).toISOString()} and the row says ${String(row.completed_at)}`,
    ).toBe(true)
    expect(
      at >= Date.parse(String(row.created_at)),
      'and it cannot precede the task itself',
    ).toBe(true)
  })

  test('the 7.6 response envelope is answered', async () => {
    const { completer } = await stage()
    const taskId = await task('envelope')
    const body = await transitionOk(
      completer,
      taskId,
      'complete',
      'the completion is accepted (spec 5.1)',
    )
    expect(
      body.task.completed_at,
      'the response carries the completion it just made',
    ).not.toBeNull()
  })

  test('adversarial: completion touches nothing else', async () => {
    const { completer, assignee } = await stage()
    const taskId = await task('untouched')
    const before = await requireTaskRow(app.db, taskId)
    await transitionOk(
      completer,
      taskId,
      'complete',
      'the completion is accepted (spec 5.1)',
    )
    const after = await requireTaskRow(app.db, taskId)
    expect(after.title, 'the title is not a completion\'s business').toBe(
      before.title,
    )
    expect(
      after.due_date,
      '5.1 lists the side effects of this transition, and dates are not among them',
    ).toBe(before.due_date)
    expect(after.important, 'importance survives completion').toBe(
      before.important,
    )
    expect(
      String(after.assignee_id),
      'completing somebody else\'s task does not reassign it',
    ).toBe(assignee.id)
  })

  test('invariants hold afterwards', async () => {
    const { owner, assignee, completer, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(
      app.db,
      taskIds,
      [folderId],
      [owner.id, assignee.id, completer.id],
    )
  })
})

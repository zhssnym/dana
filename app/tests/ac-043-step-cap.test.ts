/*
AC-043: given a 51st step, then 422.

The cap is 50 per task (4.6, 10.3), and 4.6 records that it is enforced by
API guard rather than by a constraint, which is the whole risk: nothing
under the route will catch a miscount. So the boundary is tested from both
sides, the 50th accepted and the 51st refused, on both surfaces that can
create steps, 7.7's POST and 7.6's create body, because a package can guard
one and forget the other.

The count is a live count of rows, not a high-water mark: after the 51st is
refused, deleting a step must make room for a new one. An implementation
that counts creations rather than rows passes the plain case and fails
here, and it fails silently in production, where a task edited over a year
would eventually refuse every step.

Attacked beside the criterion: an over-cap create must leave no task at all,
since a partially applied create is worse than a refused one; and the step
title limits of 10.3, which share the endpoint.

Spec: 7.7 (POST steps, 422 over 50), 7.6 (create with steps, at most 50),
4.6 (the cap is an API guard), 10.3 (step title 1 to 300).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  addStep,
  addStepOk,
  createTask,
  createTaskOk,
  deleteStep,
  expectSweptTasks,
  expectTaskInvariants,
  patchStepOk,
  readTask,
  stepRows,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

function titles(count: number, label: string): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `p3 ac043 ${label} step ${String(index + 1)}`,
  )
}

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac043 steps')
    staged = { author, folderId }
  }
  return staged
}

/** A task already holding the full 50, built through 7.6's create body so
 * the fixture costs one request rather than fifty. */
async function fullTask(label: string): Promise<string> {
  const { author, folderId } = await stage()
  const created = await createTaskOk(
    author,
    {
      title: `p3 ac043 ${label}`,
      folder_id: folderId,
      steps: titles(50, label),
    },
    'a create carrying exactly 50 steps is inside the cap and must be accepted (spec 7.6)',
  )
  taskIds.push(created.id)
  expect(
    (await stepRows(app.db, created.id)).length,
    'the premise: the task really holds 50 steps',
  ).toBe(50)
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

describe('AC-043: the fifty-first step is refused', () => {
  test('AC-043: the 51st step answers 422', async () => {
    const { author } = await stage()
    const taskId = await fullTask('cap')
    const response = await addStep(author, taskId, { title: 'the 51st' })
    expectStatus(
      response,
      422,
      'a task holds at most 50 steps, enforced by API guard rather than by a constraint (spec 7.7, 4.6, 10.3)',
    )
    expect(
      (await stepRows(app.db, taskId)).length,
      'and the refused step was not written',
    ).toBe(50)
  })

  test('AC-043: the 50th step is accepted, so the boundary is where 10.3 puts it', async () => {
    const { author, folderId } = await stage()
    const created = await createTaskOk(
      author,
      {
        title: 'p3 ac043 boundary',
        folder_id: folderId,
        steps: titles(49, 'boundary'),
      },
      'a create carrying 49 steps must be accepted (spec 7.6)',
    )
    taskIds.push(created.id)
    const detail = await addStepOk(author, created.id, 'the 50th')
    expect(detail.steps_total, 'TaskCard counts what the task holds').toBe(50)
    expect(detail.steps_done, 'and none of them is done').toBe(0)
  })

  /*
  The response bodies frozen 7.7 now states. They were silent while this
  file was written, so it asserted the statuses the criterion names and
  nothing about what came back; the P3 shape review settled them and the
  owner entered them, which makes them contract this surface must satisfy
  and which no criterion pinned. Added here rather than left to the shape
  review's own record, because a sentence in section 7 that no test reads
  is a sentence the next implementation can quietly stop honoring.
  */
  test('AC-043 contract: the 7.7 mutations answer the affected TaskDetail', async () => {
    const { author, folderId } = await stage()
    const created = await createTaskOk(
      author,
      { title: 'p3 ac043 bodies', folder_id: folderId },
      'a task with no steps must be creatable (spec 7.6)',
    )
    taskIds.push(created.id)

    // POST answers 201 with the parent task, not with the step it created,
    // and the created step rides in the steps array with the id and
    // position the server assigned it. addStepOk judges all of that,
    // including that the body equals a fresh GET.
    const added = await addStepOk(author, created.id, 'the only step')
    expect(
      added.steps_total,
      'a step add moves steps_total, which is a field of the task and of nothing else (spec 7.7)',
    ).toBe(1)
    const step = (added.steps as { id: string; position: number }[])[0]
    expect(step, 'the created step is in the array').toBeDefined()
    expect(
      typeof (step as { id: string }).id,
      'carrying the id the server assigned it (spec 7.7)',
    ).toBe('string')
    expect(
      Number.isInteger((step as { position: number }).position),
      'and the position it assigned it',
    ).toBe(true)

    // PATCH answers the same object, and checking a step moves steps_done,
    // which is the reason the task rather than the step is the answer.
    const patched = await patchStepOk(
      author,
      created.id,
      (step as { id: string }).id,
      { done: true },
    )
    expect(
      patched.steps_done,
      'checking a step moves steps_done on the task (spec 7.7)',
    ).toBe(1)
    expect(
      (patched.steps as { done: boolean }[])[0]?.done,
      'and the step itself reads done',
    ).toBe(true)

    // DELETE keeps 7.7's 204 and carries no body, which the same paragraph
    // says outright: the one mutation here that answers nothing.
    const deleted = await deleteStep(author, (step as { id: string }).id)
    expectStatus(
      deleted,
      204,
      'DELETE /steps/:id keeps its 204 (spec 7.7)',
    )
    expect(
      deleted.body,
      '7.7: the delete carries no body, unlike the two mutations above',
    ).toBe('')
    expect(
      (await readTask(author, created.id)).steps_total,
      'and the deletion really happened',
    ).toBe(0)
  })

  test('AC-043 adversarial: a create carrying 51 steps leaves no task behind', async () => {
    const { author, folderId } = await stage()
    const response = await createTask(author, {
      title: 'p3 ac043 overfull create',
      folder_id: folderId,
      steps: titles(51, 'overfull'),
    })
    expectStatus(
      response,
      422,
      '7.6 caps the create body at 50 steps too, not only the 7.7 endpoint',
    )
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE folder_id = ${folderId} AND title = ${'p3 ac043 overfull create'}`,
      ),
      'a refused create writes no task, so no half-built task with 50 of its 51 steps exists',
    ).toBe(0)
  })

  test('AC-043 adversarial: the cap counts rows, not creations', async () => {
    const { author } = await stage()
    const taskId = await fullTask('live count')
    expectStatus(
      await addStep(author, taskId, { title: 'refused at 51' }),
      422,
      'the task is full (spec 7.7)',
    )
    const detail = await readTask(author, taskId)
    const first = (detail.steps as { id: string }[])[0]
    expect(first, 'the task has steps to delete').toBeDefined()
    expectStatus(
      await deleteStep(author, (first as { id: string }).id),
      204,
      'a step may be deleted (spec 7.7)',
    )
    // The cap is a live count of rows: deleting one makes room for one
    // (spec 4.6, 10.3), and the add answers the affected task (spec 7.7).
    await addStepOk(author, taskId, 'accepted at 50 again')
    expect(
      (await stepRows(app.db, taskId)).length,
      'and the task is back at the cap',
    ).toBe(50)
  })

  test('AC-043 adversarial: the step title limits share the endpoint', async () => {
    const { author, folderId } = await stage()
    const created = await createTaskOk(
      author,
      { title: 'p3 ac043 titles', folder_id: folderId },
      'a task with no steps must be creatable (spec 7.6)',
    )
    taskIds.push(created.id)
    expectStatus(
      await addStep(author, created.id, { title: '' }),
      422,
      'a step title is 1 to 300 characters (spec 10.3, 4.6)',
    )
    expectStatus(
      await addStep(author, created.id, { title: 'x'.repeat(301) }),
      422,
      'a step title is 1 to 300 characters (spec 10.3, 4.6)',
    )
    // Exactly 300 characters is inside the limit (spec 10.3).
    await addStepOk(author, created.id, 'y'.repeat(300))
    expect(
      (await stepRows(app.db, created.id)).length,
      'only the accepted one was written',
    ).toBe(1)
  })

  test('AC-043: invariants hold afterwards', async () => {
    const { author, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(app.db, taskIds, [folderId], [author.id])
  })
})

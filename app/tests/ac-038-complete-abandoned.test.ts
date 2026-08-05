/*
AC-038: given complete on an abandoned task, then 409.

5.1 has four rows marked never, and this file covers all four rather than
only the one the criterion names, because they are one rule with four
spellings and an implementation that hard-codes the named pair leaves the
other three open. The other three are exactly the transitions a client
retrying blind would attempt: abandon on a completed task, uncomplete on an
abandoned one, restore on a completed one.

5.1 also gives two of them normative copy, and the copy is the point: it
tells the user what to do instead ("restore the task first", "complete tasks
cannot be abandoned; un-complete first"). A 409 with a generic message is
half the behavior, so the copy is asserted where 5.1 states it.

Attacked beside the criterion: every refusal leaves the row untouched,
updated_at included, which separates a guard that refuses from a guard that
writes and then regrets.

Spec: 5.1 (the four never rows and their copy), 8.3 (the guarded update
classifies no-op against conflict), 7.0 (409 is a state machine violation).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  requireTaskRow,
  transition,
  transitionOk,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  folderId: string
  abandonedId: string
  completedId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac038 terminals')
    const abandoned = await createTaskOk(
      author,
      { title: 'p3 ac038 abandoned', folder_id: folderId },
      'the task to abandon must be creatable (spec 7.6)',
    )
    await transitionOk(
      author,
      abandoned.id,
      'abandon',
      'abandoning a pending task must succeed before its refusals can be tested (spec 5.1)',
    )
    const completed = await createTaskOk(
      author,
      { title: 'p3 ac038 completed', folder_id: folderId },
      'the task to complete must be creatable (spec 7.6)',
    )
    await transitionOk(
      author,
      completed.id,
      'complete',
      'completing a pending task must succeed before its refusals can be tested (spec 5.1)',
    )
    staged = {
      author,
      folderId,
      abandonedId: abandoned.id,
      completedId: completed.id,
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

describe('AC-038: the four forbidden transitions of 5.1 are conflicts', () => {
  test('AC-038: complete on an abandoned task answers 409', async () => {
    const { author, abandonedId } = await stage()
    const response = await transition(author, abandonedId, 'complete')
    expectStatus(
      response,
      409,
      'abandoned to completed is never a legal transition (spec 5.1)',
    )
  })

  test('AC-038: the 409 carries the 5.1 copy', async () => {
    const { author, abandonedId } = await stage()
    const response = await transition(author, abandonedId, 'complete')
    expect(
      response.body.toLowerCase(),
      '5.1 gives this refusal its copy: restore the task first',
    ).toContain('restore the task first')
  })

  test('AC-038: the abandoned task did not change', async () => {
    const { author, abandonedId } = await stage()
    const before = await requireTaskRow(app.db, abandonedId)
    await transition(author, abandonedId, 'complete')
    const after = await requireTaskRow(app.db, abandonedId)
    expect(after.status, 'the task is still abandoned').toBe('abandoned')
    expect(
      after.completed_at,
      'the refused completion wrote no completion columns (INV-8)',
    ).toBeNull()
    expect(after.completed_by, 'neither of them').toBeNull()
    expect(String(after.updated_at), 'and it touched nothing').toBe(
      String(before.updated_at),
    )
  })

  test('AC-038 adversarial: abandon on a completed task answers 409 with its own copy', async () => {
    const { author, completedId } = await stage()
    const before = await requireTaskRow(app.db, completedId)
    const response = await transition(author, completedId, 'abandon')
    expectStatus(
      response,
      409,
      'completed to abandoned is never a legal transition (spec 5.1)',
    )
    expect(
      response.body.toLowerCase(),
      '5.1 gives this refusal its copy: complete tasks cannot be abandoned, un-complete first',
    ).toContain('un-complete first')
    const after = await requireTaskRow(app.db, completedId)
    expect(after.status, 'the task is still completed').toBe('completed')
    expect(String(after.completed_by), 'and still by the same person').toBe(
      String(before.completed_by),
    )
  })

  test('AC-038 adversarial: uncomplete on an abandoned task answers 409', async () => {
    const { author, abandonedId } = await stage()
    const response = await transition(author, abandonedId, 'uncomplete')
    expectStatus(
      response,
      409,
      'abandoned to pending goes through restore, never through uncomplete (spec 5.1)',
    )
    expect(
      (await requireTaskRow(app.db, abandonedId)).status,
      'the task is still abandoned',
    ).toBe('abandoned')
  })

  test('AC-038 adversarial: restore on a completed task answers 409', async () => {
    const { author, completedId } = await stage()
    const response = await transition(author, completedId, 'restore')
    expectStatus(
      response,
      409,
      'completed to pending goes through uncomplete, never through restore (spec 5.1)',
    )
    expect(
      (await requireTaskRow(app.db, completedId)).status,
      'the task is still completed',
    ).toBe('completed')
  })

  test('AC-038: invariants hold afterwards', async () => {
    const { author, folderId, abandonedId, completedId } = await stage()
    await expectTaskInvariants(
      app.db,
      [abandonedId, completedId],
      [folderId],
      [author.id],
    )
  })
})

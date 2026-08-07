/*
AC-035: given two concurrent PATCHes touching different fields, then both
changes persist.

This is 8.3's field-write policy stated as a test: "PATCH sends only changed
fields. Two members editing different fields both win". The implementation
it fails is the natural one, a handler that reads the row, applies its
field to the object it read, and writes the object back: whichever request
read first loses its field silently, and nothing about the response says so.

The race is run as a race, two browsers and two sessions with both requests
in flight together. It is also run deterministically, because 11.15 records
that PGlite is single-connection: under the default backend the two requests
may serialize completely, and a whole-row write would then survive the
concurrent form by luck. The deterministic probe removes the luck. A PATCH
naming one field must leave every other field exactly as it was, which is
the same defect measured without a race, and it fails on both backends
identically.

Attacked beside the criterion: updated_at must move, since 4.5 says it is
touched on every mutation, and the two racers are different members, which
is the case 8.3 actually describes.

Spec: 8.3 (field writes, last write wins per field), 7.6 (PATCH, only
present fields change), 4.5 (updated_at), 11.15 (the single-connection
backend, which is why the deterministic probe exists).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTask,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'helper'], 'p3')

interface Stage {
  owner: Actor
  helper: Actor
  folderId: string
}
let staged: Stage | undefined
const taskIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper] = await cast.of(app)
    if (owner === undefined || helper === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, helper.id)
    const folderId = await createFolder(owner, 'p3 ac035 shared')
    await addMemberOk(owner, folderId, helper.id)
    staged = { owner, helper, folderId }
  }
  return staged
}

async function task(label: string): Promise<string> {
  const { owner, folderId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p3 ac035 ${label}`,
      folder_id: folderId,
      notes: 'original notes',
      important: false,
      due_date: '2026-09-10',
    },
    'the task both racers PATCH must be creatable (spec 7.6)',
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

describe('AC-035: concurrent PATCHes of different fields both persist', () => {
  test('AC-035: both requests answer 200', async () => {
    const { owner, helper } = await stage()
    const taskId = await task('raced')
    const [byOwner, byHelper] = await Promise.all([
      patchTask(owner, taskId, { title: 'p3 ac035 retitled by owner' }),
      patchTask(helper, taskId, { notes: 'rewritten by helper' }),
    ])
    expectStatus(
      byOwner,
      200,
      'each member is editing a field of a task in their own folder (spec 5.4, 8.3)',
    )
    expectStatus(
      byHelper,
      200,
      'each member is editing a field of a task in their own folder (spec 5.4, 8.3)',
    )
  })

  test('AC-035: both changes are in the row afterwards', async () => {
    const { owner, helper } = await stage()
    const taskId = await task('raced rows')
    await Promise.all([
      patchTask(owner, taskId, { title: 'p3 ac035 owner title' }),
      patchTask(helper, taskId, { notes: 'helper notes' }),
    ])
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.title,
      '8.3: two members editing different fields both win, so the title change survived',
    ).toBe('p3 ac035 owner title')
    expect(
      row.notes,
      '8.3: two members editing different fields both win, so the notes change survived',
    ).toBe('helper notes')
  })

  test('AC-035 adversarial: a one-field PATCH leaves every other field alone', async () => {
    const { owner } = await stage()
    const taskId = await task('partial')
    const before = await requireTaskRow(app.db, taskId)
    await patchTaskOk(
      owner,
      taskId,
      { title: 'p3 ac035 only the title' },
      'a partial body is the normal case: only present fields change (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, taskId)
    expect(after.title, 'the named field changed').toBe(
      'p3 ac035 only the title',
    )
    expect(
      after.notes,
      'an absent field is not a null field: a whole-row write would blank this (spec 7.6, 8.3)',
    ).toBe(before.notes)
    expect(after.important, 'importance is absent from the body').toBe(
      before.important,
    )
    expect(
      after.due_date,
      'the date is absent from the body',
    ).toBe(before.due_date)
    expect(
      after.assignee_id === null ? null : String(after.assignee_id),
      'the assignee is absent from the body',
    ).toBe(before.assignee_id === null ? null : String(before.assignee_id))
  })

  test('AC-035 adversarial: a mutation moves updated_at', async () => {
    const { owner } = await stage()
    const taskId = await task('touched')
    const before = await requireTaskRow(app.db, taskId)
    await patchTaskOk(
      owner,
      taskId,
      { important: true },
      'a legal PATCH is accepted (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, taskId)
    expect(
      Date.parse(String(after.updated_at)) >=
        Date.parse(String(before.updated_at)),
      'updated_at is touched on every mutation (spec 4.5), and it is the last-write-wins evidence',
    ).toBe(true)
    expect(
      String(after.updated_at),
      'a mutation that leaves updated_at where it was has not touched it',
    ).not.toBe(String(before.updated_at))
  })

  test('AC-035: invariants hold afterwards', async () => {
    const { owner, helper, folderId } = await stage()
    expectSweptTasks(taskIds)
    await expectTaskInvariants(
      app.db,
      taskIds,
      [folderId],
      [owner.id, helper.id],
    )
  })
})

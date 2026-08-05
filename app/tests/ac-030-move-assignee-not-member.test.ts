/*
AC-030: given a move where the assignee is not a member of the target, then
the task arrives unassigned.

The sharp edge is which of 7.6's two move rules applies, so the target here
is deliberately multi-member: a single-member target would force the
assignee to its one member (AC-031) and the unassignment this criterion
asks for would be invisible. The source is multi-member too, because the
assignee has to be somebody other than the caller for the case to exist at
all.

Attacked beside the criterion: the row's other fields survive a move that
rewrites two columns, and the assignee is dropped rather than silently
replaced by the caller, which is the plausible wrong repair; the composite
FK of 4.5 is the last line here and INV-4 is asserted after.

Spec: 7.6 (PATCH, the move rules), INV-4, INV-5, 4.5 (composite FK), 5.4
(member of both folders).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectSweptTasks,
  expectTaskInvariants,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'helper', 'other'], 'p3')

interface Stage {
  owner: Actor
  helper: Actor
  other: Actor
  sourceId: string
  targetId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper, other] = await cast.of(app)
    if (owner === undefined || helper === undefined || other === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, helper.id)
    await connect(app.db, owner.id, other.id)
    const sourceId = await createFolder(owner, 'p3 ac030 source')
    const targetId = await createFolder(owner, 'p3 ac030 target')
    await addMemberOk(owner, sourceId, helper.id)
    // The target holds the caller and somebody else, so INV-5's forcing
    // cannot be what unassigns the task.
    await addMemberOk(owner, targetId, other.id)
    staged = { owner, helper, other, sourceId, targetId }
  }
  return staged
}

const movedIds: string[] = []

async function movableTask(label: string): Promise<string> {
  const { owner, helper, sourceId } = await stage()
  const created = await createTaskOk(
    owner,
    {
      title: `p3 ac030 ${label}`,
      folder_id: sourceId,
      assignee_id: helper.id,
      notes: 'notes that must survive the move',
      important: true,
      due_date: '2026-09-01',
    },
    'a task assigned to another member of the source must be creatable (spec 7.6)',
  )
  movedIds.push(created.id)
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

describe('AC-030: a move past the assignee unassigns the task', () => {
  test('AC-030: both folders really have the memberships the case needs', async () => {
    const { owner, helper, other, sourceId, targetId } = await stage()
    expect(
      (await membershipUserIds(app.db, sourceId)).sort(),
      'the source holds the caller and the assignee',
    ).toEqual([owner.id, helper.id].sort())
    expect(
      (await membershipUserIds(app.db, targetId)).sort(),
      'the target holds the caller and a third person, so it is not single-member',
    ).toEqual([owner.id, other.id].sort())
    expect(
      await membershipUserIds(app.db, targetId),
      'and the assignee is not in it, which is the whole case',
    ).not.toContain(helper.id)
  })

  test('AC-030: the task arrives unassigned', async () => {
    const { owner, targetId } = await stage()
    const taskId = await movableTask('unassign')
    const body = await patchTaskOk(
      owner,
      taskId,
      { folder_id: targetId },
      'a move both of whose folders the caller belongs to must be accepted (spec 7.6, 5.4)',
    )
    expect(
      body.assignee,
      'the assignee is not a member of the target, so assignee becomes null (spec 7.6)',
    ).toBeNull()
    const folder = body.folder as Record<string, unknown>
    expect(folder.id, 'and the task really moved').toBe(targetId)

    const row = await requireTaskRow(app.db, taskId)
    expect(row.assignee_id, 'the stored assignee is null (INV-4)').toBeNull()
    expect(String(row.folder_id), 'the stored folder is the target').toBe(
      targetId,
    )
  })

  test('AC-030 adversarial: the assignee is dropped, not handed to the mover', async () => {
    const { owner, targetId } = await stage()
    const taskId = await movableTask('not the mover')
    await patchTaskOk(
      owner,
      taskId,
      { folder_id: targetId },
      'the move is accepted (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.assignee_id,
      '7.6 says the assignee becomes null on this move; assigning it to the caller instead would be a rule nothing states',
    ).toBeNull()
    expect(String(row.assignee_id ?? 'null')).not.toBe(owner.id)
  })

  test('AC-030 adversarial: the move rewrites two columns and no others', async () => {
    const { owner, targetId } = await stage()
    const taskId = await movableTask('preserves')
    const before = await requireTaskRow(app.db, taskId)
    await patchTaskOk(
      owner,
      taskId,
      { folder_id: targetId },
      'the move is accepted (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, taskId)
    expect(after.title, 'the title is not the move\'s business').toBe(before.title)
    expect(after.notes, 'the notes survive the move').toBe(before.notes)
    expect(after.important, 'importance survives the move').toBe(before.important)
    expect(
      after.due_date,
      'the date survives the move: only 8.4 clears dates',
    ).toBe(before.due_date)
    expect(after.status, 'the status survives the move').toBe(before.status)
  })

  test('AC-030: invariants hold afterwards', async () => {
    const { owner, helper, other, sourceId, targetId } = await stage()
    expectSweptTasks(movedIds)
    await expectTaskInvariants(
      app.db,
      movedIds,
      [sourceId, targetId],
      [owner.id, helper.id, other.id],
    )
  })
})

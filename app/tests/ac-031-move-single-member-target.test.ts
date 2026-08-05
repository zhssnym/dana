/*
AC-031: given a move into a single-member folder, then the task arrives
assigned to that member.

The complement of AC-030 on the same endpoint, and the reason both exist: a
move rewrites the assignee for two different reasons, and an implementation
that only ever nulls it passes AC-030 and fails here, while one that only
ever forces it passes here and fails there.

Two arrivals are asserted, because INV-5 is about the folder's state and not
about how the task got there: a task assigned to somebody the target does
not have, and a task already unassigned. Both must land assigned to the
target's one member.

Attacked beside the criterion: a move out of the single-member folder back
into the multi-member source, which must not carry the forcing with it, so
the forcing is attributable to the target rather than to the move.

Spec: 7.6 (PATCH, the move rules), INV-5, INV-4, 5.4.
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
  expectTaskInvariants,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'helper'], 'p3')

interface Stage {
  owner: Actor
  helper: Actor
  sharedId: string
  soloId: string
}
let staged: Stage | undefined
const movedIds: string[] = []

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper] = await cast.of(app)
    if (owner === undefined || helper === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, helper.id)
    const sharedId = await createFolder(owner, 'p3 ac031 shared')
    await addMemberOk(owner, sharedId, helper.id)
    const soloId = await createFolder(owner, 'p3 ac031 solo')
    staged = { owner, helper, sharedId, soloId }
  }
  return staged
}

async function sharedTask(
  label: string,
  assigneeId: string | null,
): Promise<string> {
  const { owner, sharedId } = await stage()
  const created = await createTaskOk(
    owner,
    { title: `p3 ac031 ${label}`, folder_id: sharedId, assignee_id: assigneeId },
    'a task in the multi-member source must be creatable, assigned or not (spec 7.6)',
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

describe('AC-031: a move into a single-member folder assigns the task', () => {
  test('AC-031: the target really has exactly one member', async () => {
    const { owner, soloId } = await stage()
    expect(
      await membershipUserIds(app.db, soloId),
      'the forcing rule turns on the member count, so the premise is asserted before the case',
    ).toEqual([owner.id])
  })

  test('AC-031: a task assigned elsewhere arrives assigned to that member', async () => {
    const { owner, helper, soloId } = await stage()
    const taskId = await sharedTask('assigned elsewhere', helper.id)
    const body = await patchTaskOk(
      owner,
      taskId,
      { folder_id: soloId },
      'a move into a folder the caller belongs to must be accepted (spec 7.6)',
    )
    const assignee = body.assignee as Record<string, unknown> | null
    expect(
      assignee,
      'a single-member target takes the task with its one member as assignee (spec 7.6, INV-5)',
    ).not.toBeNull()
    expect((assignee as Record<string, unknown>).id).toBe(owner.id)
    const row = await requireTaskRow(app.db, taskId)
    expect(String(row.assignee_id), 'the stored assignee is that member').toBe(
      owner.id,
    )
  })

  test('AC-031: an unassigned task arrives assigned too', async () => {
    const { owner, soloId } = await stage()
    const taskId = await sharedTask('unassigned', null)
    const before = await requireTaskRow(app.db, taskId)
    expect(
      before.assignee_id,
      'the premise: a multi-member folder may hold an unassigned task',
    ).toBeNull()
    await patchTaskOk(
      owner,
      taskId,
      { folder_id: soloId },
      'the move is accepted (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      String(row.assignee_id),
      'INV-5 admits no unassigned task in a single-member folder, however it arrived',
    ).toBe(owner.id)
  })

  test('AC-031 adversarial: the forcing belongs to the target, not to moves', async () => {
    const { owner, helper, soloId, sharedId } = await stage()
    const taskId = await sharedTask('round trip', helper.id)
    await patchTaskOk(
      owner,
      taskId,
      { folder_id: soloId },
      'the move into the single-member folder is accepted (spec 7.6)',
    )
    await patchTaskOk(
      owner,
      taskId,
      { folder_id: sharedId },
      'the move back into the multi-member folder is accepted (spec 7.6)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      String(row.assignee_id),
      'the assignee is a member of the multi-member target, so the move changes nothing about it (spec 7.6)',
    ).toBe(owner.id)
  })

  test('AC-031: invariants hold afterwards', async () => {
    const { owner, helper, sharedId, soloId } = await stage()
    await expectTaskInvariants(
      app.db,
      movedIds,
      [sharedId, soloId],
      [owner.id, helper.id],
    )
  })
})

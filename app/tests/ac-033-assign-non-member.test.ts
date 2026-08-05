/*
AC-033: given a PATCH setting assignee to a non-member, then 422.

422 and not 409: 7.6 routes this one through the composite foreign key of
4.5 and says so, "setting to a non-member fails (422 via composite FK)".
The wrong implementation is again a wrong layer rather than a wrong answer:
the constraint will refuse the write whatever the route does, so a route
that does not check first answers 500 with a database message, and 10.2 is
explicit that the constraints are the last line and never the first.

The folder here is multi-member on purpose. In a single-member folder 7.6
carries two rules for a body naming somebody else, the FK refusal and
"forces assignee to that member ignoring the input", and which governs is a
reading no criterion in this package needs; here only one rule can apply.

Attacked beside the criterion: a user id that belongs to nobody, which must
answer the same 422 rather than leaking the difference between a stranger
and a phantom; and the allowed side, assigning to an actual member, so the
refusal is attributable to membership.

Spec: 7.6 (PATCH, assignee_id to a non-member), 4.5 (composite FK), INV-4,
10.2 (constraints are the last line), 10.3 (422 names the field).
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
  seedUser,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
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
  outsiderId: string
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper] = await cast.of(app)
    if (owner === undefined || helper === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, helper.id)
    const folderId = await createFolder(owner, 'p3 ac033 shared')
    await addMemberOk(owner, folderId, helper.id)
    const outsiderId = await seedUser(app.db, 'ac033-outsider')
    cast.trackUser(outsiderId)
    const task = await createTaskOk(
      owner,
      { title: 'p3 ac033 assignable', folder_id: folderId },
      'the task the assignment is attempted on must be creatable (spec 7.6)',
    )
    staged = { owner, helper, outsiderId, folderId, taskId: task.id }
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

describe('AC-033: assigning to a non-member is a validation failure', () => {
  test('AC-033: the PATCH answers 422', async () => {
    const { owner, taskId, outsiderId } = await stage()
    const response = await patchTask(owner, taskId, { assignee_id: outsiderId })
    expectStatus(
      response,
      422,
      'an assignee who is not a member of the task\'s folder is refused with 422, not with the constraint\'s 500 (spec 7.6, 10.2)',
    )
    expect(
      response.body.toLowerCase(),
      'a validation failure names its field (spec 7.0, 10.3)',
    ).toContain('assignee')
  })

  test('AC-033: the assignee did not change', async () => {
    const { owner, taskId, outsiderId } = await stage()
    const before = await requireTaskRow(app.db, taskId)
    await patchTask(owner, taskId, { assignee_id: outsiderId })
    const after = await requireTaskRow(app.db, taskId)
    expect(
      after.assignee_id === null ? null : String(after.assignee_id),
      'the refused assignment left the row as it was (INV-4)',
    ).toBe(before.assignee_id === null ? null : String(before.assignee_id))
    expect(String(after.updated_at), 'and touched nothing').toBe(
      String(before.updated_at),
    )
  })

  test('AC-033 adversarial: a user id belonging to nobody answers the same 422', async () => {
    const { owner, taskId } = await stage()
    const response = await patchTask(owner, taskId, {
      assignee_id: '00000000-0000-4000-8000-000000000031',
    })
    expectStatus(
      response,
      422,
      'a phantom user is a non-member like any other, and the difference must not be observable (spec 7.6, 10.2)',
    )
  })

  test('AC-033 adversarial: assigning to an actual member succeeds', async () => {
    const { owner, helper, taskId } = await stage()
    const body = await patchTaskOk(
      owner,
      taskId,
      { assignee_id: helper.id },
      'a member of the folder is a legal assignee, so the identical shape of body must be accepted (spec 7.6)',
    )
    const assignee = body.assignee as Record<string, unknown> | null
    expect(assignee, 'the 422 above belongs to membership alone').not.toBeNull()
    expect((assignee as Record<string, unknown>).id).toBe(helper.id)
    const row = await requireTaskRow(app.db, taskId)
    expect(String(row.assignee_id), 'and the row really changed').toBe(helper.id)
  })

  test('AC-033: invariants hold afterwards', async () => {
    const { owner, helper, folderId, taskId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [folderId],
      [owner.id, helper.id],
    )
  })
})

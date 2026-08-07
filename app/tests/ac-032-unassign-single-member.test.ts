/*
AC-032: given a PATCH setting assignee to null in a single-member folder,
then 409.

409 and not 422: 7.6 calls this a rejection under INV-5 and 7.0 reserves 409
for a state or rule conflict, which is what an unassignment in a
one-member folder is. The value is well-formed; the folder is what refuses
it. An implementation answering 422 has read the wrong bullet, and an
implementation answering 200 has left INV-5 broken in the row.

The contrast case is the point of the file: the identical body in a
multi-member folder must succeed. Without it, a route that refuses every
null assignee passes the criterion while breaking the sharing model, and
the 409 would be attributable to nothing.

Spec: 7.6 (PATCH, assignee_id set to null), INV-5, 7.0 (409 is a rule
conflict), 5.4.
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
  membershipUserIds,
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
  soloId: string
  sharedId: string
  soloTaskId: string
  sharedTaskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, helper] = await cast.of(app)
    if (owner === undefined || helper === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, owner.id, helper.id)
    const soloId = await createFolder(owner, 'p3 ac032 solo')
    const sharedId = await createFolder(owner, 'p3 ac032 shared')
    await addMemberOk(owner, sharedId, helper.id)
    const solo = await createTaskOk(
      owner,
      { title: 'p3 ac032 solo task', folder_id: soloId },
      'the task in the single-member folder must be creatable (spec 7.6)',
    )
    const shared = await createTaskOk(
      owner,
      { title: 'p3 ac032 shared task', folder_id: sharedId },
      'the task in the multi-member folder must be creatable (spec 7.6)',
    )
    staged = {
      owner,
      helper,
      soloId,
      sharedId,
      soloTaskId: solo.id,
      sharedTaskId: shared.id,
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

describe('AC-032: unassigning in a single-member folder is a conflict', () => {
  test('AC-032: the two folders really have the member counts the case needs', async () => {
    const { owner, helper, soloId, sharedId } = await stage()
    expect(
      await membershipUserIds(app.db, soloId),
      'one member, so INV-5 binds every task in it',
    ).toEqual([owner.id])
    expect(
      (await membershipUserIds(app.db, sharedId)).sort(),
      'two members, so INV-5 says nothing about assignment there',
    ).toEqual([owner.id, helper.id].sort())
  })

  test('AC-032: the PATCH answers 409', async () => {
    const { owner, soloTaskId } = await stage()
    const response = await patchTask(owner, soloTaskId, { assignee_id: null })
    expectStatus(
      response,
      409,
      'setting the assignee to null in a single-member folder is rejected with 409 (spec 7.6, INV-5)',
    )
  })

  test('AC-032: the assignee did not change', async () => {
    const { owner, soloTaskId } = await stage()
    await patchTask(owner, soloTaskId, { assignee_id: null })
    const row = await requireTaskRow(app.db, soloTaskId)
    expect(
      String(row.assignee_id),
      'a 409 changes nothing: the task is still assigned to the folder\'s one member',
    ).toBe(owner.id)
  })

  test('AC-032 adversarial: a refused unassignment does not carry other fields with it', async () => {
    const { owner, soloTaskId } = await stage()
    const before = await requireTaskRow(app.db, soloTaskId)
    const response = await patchTask(owner, soloTaskId, {
      title: 'p3 ac032 renamed by a refused patch',
      assignee_id: null,
    })
    expectStatus(
      response,
      409,
      'the conflict decides the whole request, not the assignee field alone (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, soloTaskId)
    expect(
      after.title,
      'a refused PATCH applies none of its fields: the request is one unit',
    ).toBe(before.title)
    expect(String(after.updated_at), 'and it touched nothing').toBe(
      String(before.updated_at),
    )
  })

  test('AC-032 adversarial: the same body in a multi-member folder succeeds', async () => {
    const { owner, sharedTaskId } = await stage()
    const body = await patchTaskOk(
      owner,
      sharedTaskId,
      { assignee_id: null },
      'a folder with two members may hold an unassigned task, so the identical body must be accepted (spec 7.6, INV-5)',
    )
    expect(
      body.assignee,
      'the 409 above belongs to INV-5 and not to null assignees generally',
    ).toBeNull()
    const row = await requireTaskRow(app.db, sharedTaskId)
    expect(row.assignee_id, 'and the row really unassigned').toBeNull()
  })

  test('AC-032: invariants hold afterwards', async () => {
    const { owner, helper, soloId, sharedId, soloTaskId, sharedTaskId } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [soloTaskId, sharedTaskId],
      [soloId, sharedId],
      [owner.id, helper.id],
    )
  })
})

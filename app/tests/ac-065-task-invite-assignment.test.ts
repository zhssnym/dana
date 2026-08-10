/*
AC-065: given an invite carrying task_id accepted while the task is still in
the folder and unassigned, then the acceptor becomes the assignee.

This is the unconnected half of 8.7's indirect path: the target is a
stranger, so the assignment intent parks on the invite row (folder_id and
task_id both set, the 4.9 CHECK's legal shape) and applies at acceptance,
inside the same transaction that grants the membership. The order inside
that transaction is observable through INV-4: the composite FK admits an
assignee only where (folder_id, assignee_id) is a membership, so an
implementation that assigns before granting fails at the database and one
that grants without assigning fails here.

Until acceptance, the task's assignee stays unchanged, which is 8.7's own
sentence for this path, and the parked intent is visible as the TaskCard's
pending_invite_email; that derivation's value is pinned by AC-139, and here
it is read only as the premise chip the path describes.

The acceptance response carries assigned_task_id, frozen 7.5's third key,
so the wire says what the transaction did; the stored truth is read from
the row.

Rate-limit discipline: the inviter issues one POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 8.7 (indirect path, acceptance transaction), 4.9 (the CHECK),
INV-4, 5.2, 5.3 (grant guards).
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
  taskAssignee,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInviteOk,
  createInviteOk,
  freshEmail,
  postInvite,
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  readTask,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'colleague'], 'p5')

interface Stage {
  inviter: Actor
  colleague: Actor
  recipient: Actor
  folderId: string
  taskId: string
  inviteId: string
  email: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, colleague] = await cast.of(app)
    if (inviter === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    // Two members, so the task can sit unassigned: INV-5 forces the
    // assignee in a single-member folder.
    await connect(app.db, inviter.id, colleague.id)
    const folderId = await createFolder(inviter, 'p5 ac065 handed over')
    await addMemberOk(inviter, folderId, colleague.id)
    const task = await createTaskOk(
      inviter,
      {
        title: 'p5 ac065 for the newcomer',
        folder_id: folderId,
        assignee_id: null,
      },
      'a multi-member folder admits an unassigned task (spec 7.6, INV-5)',
    )
    const email = freshEmail('ac065-recipient')
    const { id } = await createInviteOk(
      inviter,
      { email, folder_id: folderId, task_id: task.id },
      'the unconnected indirect path parks an invite carrying folder_id and task_id (spec 8.7 path 3)',
    )
    const recipient = await signInActorWithEmail(app, 'ac065-recipient', email)
    cast.trackUser(recipient.id)
    staged = {
      inviter,
      colleague,
      recipient,
      folderId,
      taskId: task.id,
      inviteId: id,
      email,
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

describe('AC-065: acceptance applies the parked assignment', () => {
  test('AC-065: until acceptance, the assignee is unchanged and the intent is a chip', async () => {
    const { inviter, taskId, email } = await stage()
    expect(
      await taskAssignee(app.db, taskId),
      'the task\'s assignee stays unchanged while the invite is pending (spec 8.7 path 3)',
    ).toBeNull()
    const detail = await readTask(inviter, taskId)
    expect(
      detail.pending_invite_email,
      'the parked intent shows as the pending-invite chip, derived from invites.task_id (spec 7.0, 8.7)',
    ).toBe(email)
  })

  test('AC-065: the acceptor becomes the assignee in the granting transaction', async () => {
    const { inviter, recipient, folderId, taskId, inviteId } = await stage()
    const body = await acceptInviteOk(
      recipient,
      inviteId,
      'acceptance while the task is still in the folder and unassigned (spec 8.7)',
    )
    expect(
      body.assigned_task_id,
      'the response names the task the transaction assigned (spec 7.5)',
    ).toBe(taskId)
    expect(
      await taskAssignee(app.db, taskId),
      'the acceptor is the assignee (spec 8.7: conditional assignment, its condition met)',
    ).toBe(recipient.id)
    expect(
      await membershipUserIds(app.db, folderId),
      'and a member, which INV-4\'s composite FK required before the assignment could exist at all',
    ).toContain(recipient.id)
    expect(
      (await requireInviteRow(app.db, inviteId)).status,
      'the invite is consumed (spec 5.2)',
    ).toBe('accepted')
    expect(
      (await readTask(inviter, taskId)).pending_invite_email,
      'and the chip is gone: no pending invite carries this task any more (spec 7.0)',
    ).toBeNull()
  })

  test('AC-065 adversarial: task_id without folder_id is refused at creation', async () => {
    const { inviter, taskId } = await stage()
    const response = await postInvite(inviter, {
      email: freshEmail('ac065-floating'),
      task_id: taskId,
    })
    expectStatus(
      response,
      422,
      'V-INV rejects task_id without folder_id, 4.9\'s CHECK stated at the surface (spec 7.5, 8.7)',
    )
  })

  test('AC-065 adversarial: a task outside the named folder is refused at creation', async () => {
    const { inviter, taskId } = await stage()
    const elsewhereId = await createFolder(inviter, 'p5 ac065 elsewhere')
    const response = await postInvite(inviter, {
      email: freshEmail('ac065-mismatched'),
      folder_id: elsewhereId,
      task_id: taskId,
    })
    expectStatus(
      response,
      422,
      'V-INV rejects a task that is not inside the invite\'s folder (spec 7.5, 8.7)',
    )
  })

  test('AC-065: invariants hold afterwards', async () => {
    const { inviter, colleague, recipient, folderId, taskId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [folderId],
      [inviter.id, colleague.id, recipient.id],
    )
  })
})

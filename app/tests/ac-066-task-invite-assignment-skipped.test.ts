/*
AC-066: given an invite carrying task_id accepted after the task was moved
or assigned, then the assignment is skipped and the membership is still
granted.

The acceptance transaction's assignment arm is conditional on three facts
still holding at acceptance time: the task exists, it is still in the
invite's folder, and it is still unassigned. This file breaks each one
between creation and acceptance, the criterion's two named ways and the
third the transaction's own text guards ("if t exists"), which 4.9 makes
reachable by giving task_id ON DELETE SET NULL.

The skip is silent by design: the acceptance answers 200 with
assigned_task_id null, the membership and connection are granted whole, and
the task keeps whatever state overtook the invite. 8.7's grounds, recorded
at the kickoff ruling: a skipped assignment loses a convenience, while a
refused acceptance would consume the recipient's one chance at the folder
over a task that had already moved on.

Each sub-case parks its own invite for its own recipient, because a shared
invite would make the three acceptances order-dependent and the second one
a 409 about the first.

Rate-limit discipline: the inviter issues three POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 8.7 (the conditional assignment arm), 4.9 (ON DELETE SET NULL),
7.6 (move semantics, INV-5 on arrival), 5.2, INV-4.
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
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'
import {
  createTaskOk,
  deleteTask,
  expectTaskInvariants,
  patchTaskOk,
  requireTaskRow,
  taskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'colleague'], 'p5')

interface Stage {
  inviter: Actor
  colleague: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, colleague] = await cast.of(app)
    if (inviter === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, inviter.id, colleague.id)
    const folderId = await createFolder(inviter, 'p5 ac066 overtaken')
    await addMemberOk(inviter, folderId, colleague.id)
    staged = { inviter, colleague, folderId }
  }
  return staged
}

/** An unassigned task in the shared folder with a parked invite carrying
 * it, and the recipient signed in: the moment before the overtaking event. */
async function parked(label: string): Promise<{
  taskId: string
  inviteId: string
  recipient: Actor
}> {
  const { inviter, folderId } = await stage()
  const task = await createTaskOk(
    inviter,
    {
      title: `p5 ac066 ${label}`,
      folder_id: folderId,
      assignee_id: null,
    },
    'a multi-member folder admits an unassigned task (spec 7.6, INV-5)',
  )
  const email = freshEmail(`ac066-${label}`)
  const { id } = await createInviteOk(
    inviter,
    { email, folder_id: folderId, task_id: task.id },
    'the indirect path parks folder_id and task_id together (spec 8.7 path 3)',
  )
  const recipient = await signInActorWithEmail(app, `ac066-${label}`, email)
  cast.trackUser(recipient.id)
  return { taskId: task.id, inviteId: id, recipient }
}

/** The half that must never be lost: 200, no assignment, membership and
 * connection granted whole, invite consumed. */
async function expectGrantedWithoutAssignment(
  recipient: Actor,
  inviteId: string,
  folderId: string,
  why: string,
): Promise<void> {
  const body = await acceptInviteOk(recipient, inviteId, why)
  expect(
    body.assigned_task_id,
    'the skipped assignment reports null, never an error (spec 7.5, 8.7)',
  ).toBeNull()
  expect(
    body.connection_created,
    'the connection half of the acceptance is untouched by the skip (spec 8.7)',
  ).toBe(true)
  expect(
    await membershipUserIds(app.db, folderId),
    'the membership is still granted: the skip is the assignment\'s alone (spec 8.7)',
  ).toContain(recipient.id)
  expect(
    (await requireInviteRow(app.db, inviteId)).status,
    'and the invite is consumed (spec 5.2)',
  ).toBe('accepted')
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-066: an overtaken assignment is skipped, the grant is not', () => {
  test('AC-066: assigned in the meantime, the assignee stands', async () => {
    const { inviter, colleague, folderId } = await stage()
    const { taskId, inviteId, recipient } = await parked('assigned')
    await patchTaskOk(
      inviter,
      taskId,
      { assignee_id: colleague.id },
      'a member assigns the task before the invite is accepted (spec 7.6)',
    )
    await expectGrantedWithoutAssignment(
      recipient,
      inviteId,
      folderId,
      'acceptance after the task was assigned (spec 8.7: assignee_id is null fails, skip silently)',
    )
    expect(
      await taskAssignee(app.db, taskId),
      'the assignment that overtook the invite stands: last write is not undone by a late acceptance',
    ).toBe(colleague.id)
  })

  test('AC-066: moved in the meantime, the task stays where it went', async () => {
    const { inviter, folderId } = await stage()
    const { taskId, inviteId, recipient } = await parked('moved')
    const elsewhereId = await createFolder(inviter, 'p5 ac066 elsewhere')
    await patchTaskOk(
      inviter,
      taskId,
      { folder_id: elsewhereId },
      'a member moves the task before the invite is accepted (spec 7.6)',
    )
    // The single-member target forces the assignee on arrival (INV-5), so
    // the moved task is both elsewhere and assigned: either fact alone
    // makes the acceptance skip.
    expect(
      await taskAssignee(app.db, taskId),
      'the premise: the move into a single-member folder assigned the task to that member (spec 7.6, INV-5)',
    ).toBe(inviter.id)

    await expectGrantedWithoutAssignment(
      recipient,
      inviteId,
      folderId,
      'acceptance after the task left the folder (spec 8.7: folder_id equality fails, skip silently)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(
      row.folder_id,
      'the task stays where the move put it: the acceptance reaches into nothing (spec 8.7)',
    ).toBe(elsewhereId)
    expect(
      row.assignee_id,
      'and its assignee is untouched by the acceptance',
    ).toBe(inviter.id)
    expect(
      await membershipUserIds(app.db, elsewhereId),
      'the membership granted is the invite\'s folder, never the task\'s new home (spec 8.7: each acceptance grants only its own folder)',
    ).not.toContain(recipient.id)
  })

  test('AC-066 adversarial: deleted in the meantime, the invite grants the folder alone', async () => {
    const { inviter, folderId } = await stage()
    const { taskId, inviteId, recipient } = await parked('deleted')
    expectStatus(
      await deleteTask(inviter, taskId),
      204,
      'any member deletes the task before acceptance (spec 7.6)',
    )
    // RFC 0005 split AC-042's other half in two: the delete now marks the
    // row (7.13), so the parked task_id survives the trip to Trash and
    // 4.9's SET NULL fires at the purge instead. What must not survive is
    // the assignment: a trashed task is 8.7's "moved on" in its newest
    // form, and the acceptance skips it silently.
    expect(
      (await requireInviteRow(app.db, inviteId)).task_id,
      'the invite keeps its parked task_id while the task waits in Trash (spec 7.13, 4.9 at the purge)',
    ).toBe(taskId)
    await expectGrantedWithoutAssignment(
      recipient,
      inviteId,
      folderId,
      'acceptance after the task was trashed (spec 8.7: a task in Trash has moved on, skip silently)',
    )
    const row = await taskRow(app.db, taskId)
    expect(row, 'the task still waits in Trash').toBeDefined()
    expect(
      (row as { assignee_id?: unknown } | undefined)?.assignee_id ?? null,
      'and nothing assigned it on the way past',
    ).toBeNull()
  })

  test('AC-066: invariants hold afterwards', async () => {
    const { inviter, colleague, folderId } = await stage()
    await expectTaskInvariants(app.db, [], [folderId], [
      inviter.id,
      colleague.id,
    ])
  })
})

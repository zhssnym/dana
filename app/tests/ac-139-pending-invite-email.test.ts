/*
AC-139 (proposed): given a pending invite carrying task_id, then every
TaskCard of that task carries the invite's email as pending_invite_email;
given a newer assignment-invite for the same task, then the older invite's
task_id is cleared and the card carries the newest email; given no pending
invite carries the task, then null.

The number is proposed, not assigned; numbering section 12 additively is the
Integration Steward's at the mid-package change control, the AC-125 to
AC-130 precedent, and the text above is the transcription the amendment
would take. Routed by the RFC 0001 P5 row: 7.0's TaskCard names
pending_invite_email as derived from invites.task_id and no criterion in any
range pins the derivation. P3 asserted the key's presence and could do no
more, creating no invites, and the tolerance the suite README records on
exactly this value closes with this file. The kickoff recorded why the
criterion must exist: the read side has computed the field since P3, so it
can only ever have answered null before this package creates the rows, and
a derivation that has never answered anything is pinned by no green test.

The derivation is single-valued because 8.7 keeps it so: creating a new
assignment-invite for a task clears task_id on any earlier pending invite
for that task, so at most one pending invite carries a given task and the
chip has one email to show. That clearing sentence is asserted here on the
row as well as on the card, and the emptying side is asserted through a
terminal transition, since only pending rows feed the chip.

Setup goes through POST /invites, this package's own surface, which is why
the file fails today on the unmounted route rather than on the derivation:
a seeded row would light the chip against the merged read side and this
file would arrive green, the inverted order AC-124's header records as the
thing to avoid where it can be avoided. Here it can be.

Rate-limit discipline: the inviter issues two POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.0 (TaskCard, the derivation), 8.7 (the clearing sentence, the
"invite pending" chip of path 3), 7.5, 4.9, 5.2 (pending alone feeds Q12
and the chip alike).
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
  cancelInvite,
  createInviteOk,
  freshEmail,
  requireInviteRow,
} from './sharing-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  readTask,
} from './tasks-harness.js'
import { requireCard, requireGroup, tasksView } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'colleague'], 'p5')

interface Stage {
  inviter: Actor
  colleague: Actor
  folderId: string
  taskId: string
  firstEmail: string
  secondEmail: string
  firstInviteId: string
  secondInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, colleague] = await cast.of(app)
    if (inviter === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, inviter.id, colleague.id)
    const folderId = await createFolder(inviter, 'p5 ac139 chipped')
    await addMemberOk(inviter, folderId, colleague.id)
    const task = await createTaskOk(
      inviter,
      {
        title: 'p5 ac139 waiting for someone',
        folder_id: folderId,
        assignee_id: null,
      },
      'a multi-member folder admits the unassigned task the chip rides (spec 7.6, INV-5)',
    )
    const firstEmail = freshEmail('ac139-first')
    const first = await createInviteOk(
      inviter,
      { email: firstEmail, folder_id: folderId, task_id: task.id },
      'the first assignment-invite parks with folder_id and task_id (spec 8.7 path 3)',
    )
    staged = {
      inviter,
      colleague,
      folderId,
      taskId: task.id,
      firstEmail,
      secondEmail: freshEmail('ac139-second'),
      firstInviteId: first.id,
      secondInviteId: '',
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

describe('AC-139: the card names the email its task is waiting on', () => {
  test('AC-139: the pending invite\'s email rides the TaskDetail and the view row', async () => {
    const { inviter, folderId, taskId, firstEmail } = await stage()
    const detail = await readTask(inviter, taskId)
    expect(
      detail.pending_invite_email,
      'the TaskCard half of the detail derives the chip from invites.task_id (spec 7.0)',
    ).toBe(firstEmail)

    // The same value on a list surface: the derivation is the card's, so
    // every producer of the frozen shape must compute it, not only the
    // single-task read (the second-producer seam the P4 row recorded).
    const view = await tasksView(inviter, 'UTC')
    const group = requireGroup(
      view.groups,
      folderId,
      'the undated task\'s folder groups in Q2 (spec 6 Q2)',
    )
    const card = requireCard(
      group.rows,
      taskId,
      'the task is in its folder\'s group (spec 6 Q2)',
    )
    expect(
      card.pending_invite_email,
      'and its view card carries the same chip (spec 7.0: one shape, every producer)',
    ).toBe(firstEmail)
  })

  test('AC-139: a newer assignment-invite takes the chip over', async () => {
    const { inviter, folderId, taskId, firstInviteId, secondEmail } =
      await stage()
    const second = await createInviteOk(
      inviter,
      { email: secondEmail, folder_id: folderId, task_id: taskId },
      'a second assignment-invite for the same task (spec 8.7)',
    )
    if (staged !== undefined) staged.secondInviteId = second.id

    const first = await requireInviteRow(app.db, firstInviteId)
    expect(
      first.task_id,
      '8.7: creating a new assignment-invite clears task_id on any earlier pending invite for the task',
    ).toBeNull()
    expect(
      first.status,
      'the older invite stays pending, still able to grant its folder: only its assignment intent is superseded (spec 8.7)',
    ).toBe('pending')

    expect(
      (await readTask(inviter, taskId)).pending_invite_email,
      'so the chip is single-valued and reads the newest email (spec 7.0, 8.7)',
    ).toBe(secondEmail)
  })

  test('AC-139: the chip empties when no pending invite carries the task', async () => {
    const { inviter, taskId } = await stage()
    const secondInviteId = staged?.secondInviteId ?? ''
    expect(
      secondInviteId.length,
      'the premise: the second invite exists to cancel',
    ).toBeGreaterThan(0)
    expectStatus(
      await cancelInvite(inviter, secondInviteId),
      200,
      'the inviter cancels the chip\'s invite (spec 7.5, 5.2)',
    )
    expect(
      (await readTask(inviter, taskId)).pending_invite_email,
      'a terminal invite feeds no chip: the derivation reads pending rows alone (spec 7.0, 5.2)',
    ).toBeNull()
  })

  test('AC-139: invariants hold afterwards', async () => {
    const { inviter, colleague, folderId, taskId } = await stage()
    await expectTaskInvariants(
      app.db,
      [taskId],
      [folderId],
      [inviter.id, colleague.id],
    )
  })
})

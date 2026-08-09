/*
AC-061: given an invite to an email belonging to a roster connection, then
no invite row is created and the membership plus share-grant email exist
instead.

This is V-INV's conversion arm, 8.7's "roster pick" and "direct" paths
collapsing into one mechanism: a connected target needs no consent ceremony,
so the share happens now. Frozen 7.5 answers it 200 with converted_to_share
true, which is asserted against the 201 { invite } of the parked path;
everything else the criterion names is asserted where it lives, the
membership row and the absent invite row in the database, the share-grant
email through the ratified sink, and the target's own view of the folder on
the wire. The email must also be the right template: a conversion sends a
share grant, never an invite email, because there is nothing to accept.

The indirect path rides this file as its adversarial companion, on the
reading recorded at the P5 kickoff: its wire surface is POST /invites
carrying folder_id and task_id, V-INV's conversion arm when the email is
connected, the assignment leg reusing the P3 domain path. So a connected
target with a task attached converts the same way and additionally becomes
the assignee, one transaction, which keeps frozen 7.6's PATCH sentence
exactly true: assignee_id stays id-addressed and member-only, and the
membership exists by the time the assignment applies.

What this file deliberately does not assert: the conversion body's full key
set, which the RFC 0001 P5 row routes to the endpoint shape review, and the
bare invite to an already-connected email, whose consequent V-INV states in
folder terms only; that edge is escalated to the Integration Steward rather
than guessed at here.

Rate-limit discipline: the inviter issues two POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 8.7 (conversion, the three entry paths), 5.3 (grant guards),
11.8 and 11.10 (the observable send), 4.2, INV-4, INV-9.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  countRows,
  createFolder,
  expectStatus,
  folderInList,
  membershipUserIds,
  taskAssignee,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { inviteEmails, postInvite } from './sharing-harness.js'
import { asRecord, createTaskOk, expectTaskInvariants } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'connected', 'helper'], 'p5')

interface Stage {
  inviter: Actor
  connected: Actor
  helper: Actor
  /** The direct conversion's folder, created by the first test. */
  convertedFolderId: string
}
let staged: Stage | undefined
/** The indirect arm's folder and task, created by its own test. */
let indirectFolderId: string | undefined
let indirectTaskId: string | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, connected, helper] = await cast.of(app)
    if (inviter === undefined || connected === undefined || helper === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, inviter.id, connected.id)
    await connect(app.db, inviter.id, helper.id)
    const convertedFolderId = await createFolder(inviter, 'p5 ac061 converted')
    staged = { inviter, connected, helper, convertedFolderId }
  }
  return staged
}

async function inviteCount(inviterId: string): Promise<number> {
  return countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM invites WHERE inviter_id = ${inviterId}`,
  )
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-061: an invite to a connected email becomes the share itself', () => {
  test('AC-061: 200 converted_to_share, membership now, no invite row', async () => {
    const { inviter, connected, convertedFolderId } = await stage()
    app.emails.clear()

    const response = await postInvite(inviter, {
      email: connected.email,
      folder_id: convertedFolderId,
    })
    expectStatus(
      response,
      200,
      'a connected email converts to an instant share and answers 200, not the parked path\'s 201 (spec 7.5)',
    )
    const body = asRecord(response.json(), 'the conversion body')
    expect(
      body.converted_to_share,
      'the body says what happened: converted_to_share true (spec 7.5; the full key set rides the shape review)',
    ).toBe(true)

    expect(
      await membershipUserIds(app.db, convertedFolderId),
      'the membership exists immediately (spec 8.7: create the membership immediately)',
    ).toContain(connected.id)
    expect(
      await inviteCount(inviter.id),
      'and no invite row was created: there is nothing to accept (spec 8.7)',
    ).toBe(0)
  })

  test('AC-061: one share-grant email to the target, and no invite email at all', async () => {
    const { inviter, connected } = await stage()
    const grants = app.emails.shareGrants()
    expect(
      grants.filter((email) => email.to === connected.email).length,
      'the conversion sends one share-grant email to the target (spec 8.7, 11.8)',
    ).toBe(1)
    expect(
      grants.filter((email) => email.to === inviter.email).length,
      'and none to the inviter',
    ).toBe(0)
    expect(
      inviteEmails(app).length,
      'a conversion never sends the invite template: there is no invite (spec 8.7, 11.8)',
    ).toBe(0)
  })

  test('AC-061: the target reads the folder they were just granted', async () => {
    const { connected, convertedFolderId } = await stage()
    const entry = await folderInList(connected, convertedFolderId)
    expect(
      entry,
      'the granted member sees the folder in their own list (spec 5.4)',
    ).toBeDefined()
    expect(entry?.is_owner, 'granted, not transferred (spec 8.9)').toBe(false)
  })

  test('AC-061 adversarial: the indirect path converts and assigns in one transaction', async () => {
    const { inviter, connected, helper } = await stage()
    // A second member first, so the task can sit unassigned: INV-5 forces
    // the assignee in a single-member folder.
    indirectFolderId = await createFolder(inviter, 'p5 ac061 indirect')
    await addMemberOk(inviter, indirectFolderId, helper.id)
    const task = await createTaskOk(
      inviter,
      {
        title: 'p5 ac061 assign me',
        folder_id: indirectFolderId,
        assignee_id: null,
      },
      'a multi-member folder admits an unassigned task (spec 7.6, INV-5)',
    )
    indirectTaskId = task.id
    expect(
      await taskAssignee(app.db, task.id),
      'the premise: the task is unassigned when the indirect share fires',
    ).toBeNull()

    app.emails.clear()
    const response = await postInvite(inviter, {
      email: connected.email,
      folder_id: indirectFolderId,
      task_id: task.id,
    })
    expectStatus(
      response,
      200,
      'the indirect path\'s wire surface is POST /invites with folder_id and task_id, converting when the email is connected (spec 8.7 path 3, the P5 kickoff reading)',
    )
    expect(
      asRecord(response.json(), 'the conversion body').converted_to_share,
      'converted, not parked',
    ).toBe(true)
    expect(
      await membershipUserIds(app.db, indirectFolderId),
      'membership created instantly (spec 8.7)',
    ).toContain(connected.id)
    expect(
      await taskAssignee(app.db, task.id),
      'then the assignment applies in the same transaction, and INV-4 holds because the membership came first (spec 8.7 path 3)',
    ).toBe(connected.id)
    expect(
      await inviteCount(inviter.id),
      'still no invite row: the connected indirect path parks nothing',
    ).toBe(0)
    expect(
      app.emails.shareGrants().filter((email) => email.to === connected.email)
        .length,
      'the grant email rides the conversion here too',
    ).toBe(1)
  })

  test('AC-061: invariants hold afterwards', async () => {
    const { inviter, connected, helper, convertedFolderId } = await stage()
    await expectTaskInvariants(
      app.db,
      indirectTaskId === undefined ? [] : [indirectTaskId],
      [
        convertedFolderId,
        ...(indirectFolderId === undefined ? [] : [indirectFolderId]),
      ],
      [inviter.id, connected.id, helper.id],
    )
  })
})

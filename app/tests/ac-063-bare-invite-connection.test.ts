/*
AC-063: given a bare invite accepted, then one connection row exists serving
both rosters and no membership was granted.

The bare invite is 8.7's People-screen path: consent to appear on each
other's rosters, nothing more. Both halves of the criterion carry weight.
One connection row, because INV-9 makes the pair canonical and 4.2 stores it
once for both directions, so "serving both rosters" is one row read from two
sides; and no membership, because a bare invite names no folder and a grant
without a folder is a grant of nothing, which the acceptance transaction
expresses by making the membership arm folder-conditional.

The multi-invite sentence of 8.7 is attacked beside the criterion: a folder
invite and a bare invite to the same email are both pending at once (INV-11
counts them apart), each acceptance grants only its own folder, and the
connection is created once, which is what the response's connection_created
key exists to report. The second acceptance must find the pair already
minted and say so.

Rate-limit discipline: the inviter issues two POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5 (accept, the response keys), 8.7 (acceptance transaction, multiple
pending invites), 7.3 (both rosters), 4.2, INV-9, INV-10, 5.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectFolderInvariants,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  acceptInviteOk,
  connectionPair,
  createInviteOk,
  freshEmail,
  listConnections,
  membershipCount,
  requireInviteRow,
  rosterIds,
  signInActorWithEmail,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'cofounder'], 'p5')

interface Stage {
  inviter: Actor
  cofounder: Actor
  recipient: Actor
  folderId: string
  bareInviteId: string
  folderInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, cofounder] = await cast.of(app)
    if (inviter === undefined || cofounder === undefined) {
      throw new Error('cast must produce two actors')
    }
    // A folder with a second member, so the no-membership half below is
    // measured against a folder that grants memberships in this same file.
    await connect(app.db, inviter.id, cofounder.id)
    const folderId = await createFolder(inviter, 'p5 ac063 apart')
    await addMemberOk(inviter, folderId, cofounder.id)

    const email = freshEmail('ac063-recipient')
    const bare = await createInviteOk(
      inviter,
      { email },
      'the bare invite parks as pending (spec 7.5)',
    )
    const folderInvite = await createInviteOk(
      inviter,
      { email, folder_id: folderId },
      'a folder invite to the same email parks beside it: INV-11 counts the no-folder case as its own folder value',
    )
    const recipient = await signInActorWithEmail(app, 'ac063-recipient', email)
    cast.trackUser(recipient.id)
    staged = {
      inviter,
      cofounder,
      recipient,
      folderId,
      bareInviteId: bare.id,
      folderInviteId: folderInvite.id,
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

describe('AC-063: a bare acceptance connects and grants nothing else', () => {
  test('AC-063: accepting the bare invite mints the pair and no membership', async () => {
    const { inviter, recipient, bareInviteId } = await stage()
    const memberships = await membershipCount(app.db, recipient.id)
    expect(
      memberships,
      'the premise: the recipient holds only their own Inbox membership before accepting (INV-2, INV-3)',
    ).toBe(1)

    const body = await acceptInviteOk(
      recipient,
      bareInviteId,
      'the matched recipient accepts the bare invite (spec 7.5, 5.2)',
    )
    expect(
      body.connection_created,
      'this acceptance minted the pair (spec 7.5)',
    ).toBe(true)
    expect(body.folder, 'a bare invite grants no folder (spec 7.5)').toBeNull()
    expect(
      body.assigned_task_id,
      'and assigns no task (spec 7.5)',
    ).toBeNull()

    const pair = await connectionPair(app.db, inviter.id, recipient.id)
    expect(
      pair.length,
      'exactly one connection row serves both rosters (spec 4.2, INV-9)',
    ).toBe(1)
    expect(
      await membershipCount(app.db, recipient.id),
      'no membership was granted: the recipient still holds only their Inbox (spec 8.7)',
    ).toBe(1)

    const row = await requireInviteRow(app.db, bareInviteId)
    expect(row.status, 'the invite is accepted, a 5.2 terminal state').toBe(
      'accepted',
    )
    expect(row.accepted_by, 'and records who accepted it (spec 5.2)').toBe(
      recipient.id,
    )
    expect(
      row.responded_at,
      'responded_at is set on the terminal transition (spec 5.2)',
    ).not.toBeNull()
  })

  test('AC-063: both rosters list the other side', async () => {
    const { inviter, recipient } = await stage()
    expect(
      rosterIds(await listConnections(inviter)),
      'the inviter\'s roster gained the recipient (spec 7.3)',
    ).toContain(recipient.id)
    expect(
      rosterIds(await listConnections(recipient)),
      'and the recipient\'s roster gained the inviter: one row, two directions (spec 7.3, 4.2)',
    ).toContain(inviter.id)
  })

  test('AC-063 adversarial: the second acceptance finds the pair already minted', async () => {
    const { inviter, recipient, folderId, folderInviteId } = await stage()
    const body = await acceptInviteOk(
      recipient,
      folderInviteId,
      'the folder invite to the same email is its own acceptance (spec 8.7: multiple pending invites are all surfaced, each grants its own folder)',
    )
    expect(
      body.connection_created,
      'the connection is created once, so the second acceptance reports it found the pair (spec 8.7, 7.5)',
    ).toBe(false)
    expect(
      await connectionPair(app.db, inviter.id, recipient.id),
      'still exactly one row: the upsert is INV-9\'s idempotence, not a second edge',
    ).toHaveLength(1)
    expect(
      await membershipCount(app.db, recipient.id),
      'and this one granted its folder: Inbox plus the invited folder',
    ).toBe(2)
    expect(body.folder, 'the granted folder rides the response (spec 7.5)').not.toBeNull()
    const granted = body.folder as Record<string, unknown>
    expect(
      granted.id,
      'and it is the invite\'s own folder, no other (spec 8.7: each acceptance grants only its own folder)',
    ).toBe(folderId)
  })

  test('AC-063 adversarial: a terminal invite refuses every further transition', async () => {
    const { recipient, bareInviteId } = await stage()
    const again = await acceptInvite(recipient, bareInviteId)
    expectStatus(
      again,
      409,
      'accepted is terminal: the transition endpoints answer 409 when the invite is not pending (spec 7.5, 5.2)',
    )
  })

  test('AC-063: invariants hold afterwards', async () => {
    const { inviter, cofounder, recipient, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [inviter.id, cofounder.id, recipient.id],
    )
  })
})

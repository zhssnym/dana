/*
AC-133: Given a user with pending sent invites, bare and folder alike, when
DELETE /me completes, then each is invalidated and gone from its recipient's
pending list, while the user's already-terminal invites and invites merely
addressed to their email are untouched.

Numbered by the Integration Steward on 2026-08-09 and now section 12's own
text, with the seven below it. This file proposed it, the AC-125 to AC-130
precedent for a batch authored with its tests and numbered additively at a
mid-package change control. The RFC 0001 P5 row routed it here: the kickoff
of 2026-08-09 decided the tester session proposes criteria for 8.10's steps
1 to 6, observable outcome by outcome, because no criterion in any range
covered them, AC-009 and AC-112 pinning only the confirm string and the
session revocation the P1 stub already satisfies.

This is step 1's outcome. Invalidated is 5.2's fourth terminal state and
exists for exactly this transition, distinct from removal: the row survives
as history on a folder that survives, while a folder that dies at step 3
takes its invites with it by FK cascade (asserted in the step 3 file). The
scope is "the user's pending sent invites" and nothing wider, so three
controls ride the criterion: an already-declined invite stays declined, a
bystander's own pending invite is untouched, and an invite merely addressed
to the departing user's email keeps waiting, because step 1 sweeps by
inviter, never by email.

DELETE /me exists as the P1 stub, steps 7 and 8, so this file fails today on
its outcome assertions, wrong behavior rather than absence: the stub leaves
every invite pending. The invite rows are seeded directly rather than
created through POST /invites, deliberately: the eleven AC-059 to AC-069
files own that surface's red, and this file's red must be 8.10's own.

Spec: 8.10 step 1, 5.2 (invalidated, terminal), 4.9, 7.1 (DELETE /me), 6
Q12 (the pending list reads status pending alone).
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
  seedInvite,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  deleteAccount,
  freshEmail,
  invitesPending,
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'survivor', 'bystander'], 'p5')

interface Stage {
  departing: Actor
  survivor: Actor
  bystander: Actor
  /** Owned by departing, shared with survivor, so it outlives the deletion
   * by transfer and its invite row has somewhere to survive. */
  folderId: string
  bareInviteId: string
  folderInviteId: string
  declinedInviteId: string
  bystanderInviteId: string
  towardDepartingId: string
  recipientEmail: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [departing, survivor, bystander] = await cast.of(app)
    if (
      departing === undefined ||
      survivor === undefined ||
      bystander === undefined
    ) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, departing.id, survivor.id)
    const folderId = await createFolder(departing, 'p5 ac133 outliving')
    await addMemberOk(departing, folderId, survivor.id)

    const recipientEmail = freshEmail('ac133-recipient')
    const bareInviteId = await seedInvite(app.db, {
      inviterId: departing.id,
      email: recipientEmail,
    })
    const folderInviteId = await seedInvite(app.db, {
      inviterId: departing.id,
      email: recipientEmail,
      folderId,
    })
    const declinedInviteId = await seedInvite(app.db, {
      inviterId: departing.id,
      email: freshEmail('ac133-said-no'),
      status: 'declined',
    })
    const bystanderInviteId = await seedInvite(app.db, {
      inviterId: bystander.id,
      email: freshEmail('ac133-unrelated'),
    })
    const towardDepartingId = await seedInvite(app.db, {
      inviterId: bystander.id,
      email: departing.email,
    })
    staged = {
      departing,
      survivor,
      bystander,
      folderId,
      bareInviteId,
      folderInviteId,
      declinedInviteId,
      bystanderInviteId,
      towardDepartingId,
      recipientEmail,
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

describe('AC-133: deletion invalidates what the account had offered', () => {
  test('AC-133: both pending sent invites are invalidated, not removed', async () => {
    const { departing, bareInviteId, folderInviteId, folderId } = await stage()
    expectStatus(
      await deleteAccount(departing),
      204,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    )

    const bare = await requireInviteRow(app.db, bareInviteId)
    expect(
      bare.status,
      '8.10 step 1: the pending bare invite is invalidated, 5.2\'s deletion-owned terminal state',
    ).toBe('invalidated')

    const carried = await requireInviteRow(app.db, folderInviteId)
    expect(
      carried.status,
      'the folder invite is invalidated too: its folder survives by transfer, so the row survives as history rather than cascading away',
    ).toBe('invalidated')
    expect(
      carried.folder_id,
      'still pointing at the folder it would have granted (spec 4.9)',
    ).toBe(folderId)
  })

  test('AC-133: an invalidated invite is terminal on every endpoint', async () => {
    const { folderInviteId, recipientEmail } = await stage()
    const recipient = await signInActorWithEmail(
      app,
      'ac133-recipient',
      recipientEmail,
    )
    cast.trackUser(recipient.id)
    expect(
      (await invitesPending(recipient)).map((element) => element.id),
      'the recipient\'s pending list no longer offers it: Q12 reads status pending alone (spec 6 Q12, 7.5)',
    ).toEqual([])
    expectStatus(
      await acceptInvite(recipient, folderInviteId),
      409,
      'and accepting it is a state conflict, as every terminal state answers (spec 5.2, 7.5)',
    )
  })

  test('AC-133: the sweep is by inviter and pending status, nothing wider', async () => {
    const {
      declinedInviteId,
      bystanderInviteId,
      towardDepartingId,
    } = await stage()
    expect(
      (await requireInviteRow(app.db, declinedInviteId)).status,
      'an already-declined invite is not re-terminal: step 1 names pending invites',
    ).toBe('declined')
    expect(
      (await requireInviteRow(app.db, bystanderInviteId)).status,
      'a bystander\'s own pending invite is untouched: step 1 names the user\'s invites',
    ).toBe('pending')
    expect(
      (await requireInviteRow(app.db, towardDepartingId)).status,
      'an invite merely addressed to the departing email keeps waiting: step 1 sweeps by inviter, never by email (spec 8.10)',
    ).toBe('pending')
  })

  test('AC-133: invariants hold afterwards', async () => {
    const { survivor, bystander, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [survivor.id, bystander.id],
    )
  })
})

/*
AC-067: given a decline, then the invite is terminal, the inviter sees
declined, and a fresh invite to the same email is allowed.

Decline is the recipient's quiet no: 5.2 sets responded_at, sends nothing to
the inviter, and parks the row in a terminal state that INV-11's partial
index no longer counts, which is what makes the fresh invite legal. All
three clauses are asserted where they live: terminality on the row and
against every transition endpoint, the inviter's view on GET /invites/sent
(whose element shape frozen 7.5 leaves to the shape review, so the reading
here is the minimum the criterion needs, the invite found by id carrying a
status that reads declined), and the fresh invite as a 201 that leaves the
declined row exactly as it was.

The actor guard is attacked beside the criterion: decline is the matched
recipient's alone, by the same 5.2 rule as accept, so a non-matching
account's attempt reads as 404 under the leak rule and moves nothing. And
declining does not burn the relationship: the fresh invite waits for the
same recipient, who may accept it, because a declined invite is history,
not a block.

Rate-limit discipline: the inviter issues two POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 5.2 (decline row, terminal states, matching guard), 8.7, INV-11,
10.2 (the 404), 11.8 (nothing sent).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectFolderInvariants,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  acceptInviteOk,
  cancelInvite,
  createInviteOk,
  declineInvite,
  freshEmail,
  invitesPending,
  invitesSent,
  requireInviteRow,
  resendInvite,
  sentEntry,
  signInActorWithEmail,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter'], 'p5')

interface Stage {
  inviter: Actor
  recipient: Actor
  bystander: Actor
  folderId: string
  email: string
  inviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter] = await cast.of(app)
    if (inviter === undefined) throw new Error('cast must produce the inviter')
    const folderId = await createFolder(inviter, 'p5 ac067 declined')
    const email = freshEmail('ac067-recipient')
    const { id } = await createInviteOk(
      inviter,
      { email, folder_id: folderId },
      'the folder invite parks as pending (spec 7.5)',
    )
    const recipient = await signInActorWithEmail(app, 'ac067-recipient', email)
    cast.trackUser(recipient.id)
    const bystander = await signInActorWithEmail(
      app,
      'ac067-bystander',
      freshEmail('ac067-bystander'),
    )
    cast.trackUser(bystander.id)
    staged = { inviter, recipient, bystander, folderId, email, inviteId: id }
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

describe('AC-067: a decline is terminal, visible, and not a block', () => {
  test('AC-067 adversarial: only the matched recipient may decline', async () => {
    const { bystander, inviteId } = await stage()
    const response = await declineInvite(bystander, inviteId)
    expectStatus(
      response,
      404,
      'decline shares accept\'s matching guard, so a non-matching account reads the invite as nonexistent (spec 5.2, 7.5, 10.2)',
    )
    expect(
      (await requireInviteRow(app.db, inviteId)).status,
      'and the refused attempt moved nothing',
    ).toBe('pending')
  })

  test('AC-067: the decline lands terminal and sends nothing', async () => {
    const { recipient, inviteId } = await stage()
    app.emails.clear()
    const response = await declineInvite(recipient, inviteId)
    expectStatus(
      response,
      200,
      'the matched recipient declines (spec 7.5, 5.2)',
    )
    const row = await requireInviteRow(app.db, inviteId)
    expect(row.status, 'declined is a 5.2 terminal state').toBe('declined')
    expect(
      row.responded_at,
      'responded_at is set on the terminal transition (spec 5.2)',
    ).not.toBeNull()
    expect(
      row.accepted_by,
      'and nothing pretends it was accepted (spec 4.9)',
    ).toBeNull()
    expect(
      app.emails.sent().length,
      '5.2\'s decline row sends no email to the inviter, or anyone',
    ).toBe(0)
    expect(
      await invitesPending(recipient),
      'the recipient\'s pending list no longer carries it (spec 7.5, 6 Q12)',
    ).toEqual([])
  })

  test('AC-067: the inviter sees declined on the sent list', async () => {
    const { inviter, inviteId } = await stage()
    const sent = await invitesSent(inviter)
    const entry = sentEntry(sent, inviteId)
    expect(
      entry,
      'GET /invites/sent carries every status, so the declined invite is still listed (spec 7.5)',
    ).toBeDefined()
    expect(
      String(entry?.status),
      'and the inviter can see what happened to it: declined (spec 7.5; the element\'s full shape rides the shape review, the status is what the criterion needs)',
    ).toBe('declined')
  })

  test('AC-067 adversarial: terminal means every transition refuses', async () => {
    const { inviter, recipient, inviteId } = await stage()
    expectStatus(
      await acceptInvite(recipient, inviteId),
      409,
      'accept on a declined invite is a state conflict (spec 7.5, 5.2)',
    )
    expectStatus(
      await declineInvite(recipient, inviteId),
      409,
      'declining again is a state conflict, not an idempotent no-op: 5.2 lists no terminal repeat',
    )
    expectStatus(
      await cancelInvite(inviter, inviteId),
      409,
      'cancel on a declined invite is a state conflict (spec 7.5, 5.2)',
    )
    expectStatus(
      await resendInvite(inviter, inviteId),
      409,
      'resend on a declined invite is a state conflict (spec 7.5, 5.2)',
    )
  })

  test('AC-067: a fresh invite to the same email is allowed, and works', async () => {
    const { inviter, recipient, folderId, email, inviteId } = await stage()
    const fresh = await createInviteOk(
      inviter,
      { email, folder_id: folderId },
      'INV-11 restricts pending duplicates alone, so a declined invite blocks nothing (spec 5.2, 8.7)',
    )
    expect(fresh.id, 'a new row, not the old one revived').not.toBe(inviteId)
    expect(
      (await requireInviteRow(app.db, inviteId)).status,
      'the declined row is history and stays exactly as it was',
    ).toBe('declined')

    const waiting = await invitesPending(recipient)
    expect(
      waiting.map((element) => element.id),
      'the fresh invite waits for the same recipient: declining is not a block',
    ).toContain(fresh.id)
    const body = await acceptInviteOk(
      recipient,
      fresh.id,
      'and the recipient may take the second offer (spec 5.2, 8.7)',
    )
    expect(
      body.connection_created,
      'the acceptance mints the pair the decline never made',
    ).toBe(true)
  })

  test('AC-067: invariants hold afterwards', async () => {
    const { inviter, recipient, bystander, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [inviter.id, recipient.id, bystander.id],
    )
  })
})

/*
AC-068: given a cancel by the inviter or folder owner, then the recipient's
pending list no longer contains it; given a resend within 24 hours, then
429, and after 24 hours the email is sent again.

Two guards share this number because they share a purpose, keeping the
pending list honest without letting it become a nuisance channel. Cancel has
two legal actors, 5.2's "inviter, or owner of the attached folder", and both
are exercised: the owner canceling a member's invite is the arm an
implementation forgets. The refusals around it follow the visibility rule: a
co-member who is neither inviter nor owner can see the invite on the folder
detail, so their attempt is 403 by the 5.4 matrix; a stranger cannot see it
at all, so theirs is 404; and a bare invite has no folder and therefore no
owner arm, so anyone but its inviter reads it as 404.

The resend throttle is this package's only 429, recorded at the P5 kickoff:
10.4's per-user invite limits are P9's arm, asserted there as AC-101, while
this is 5.2's own state guard, one resend per invite per 24 hours, anchored
on last_sent_at. The refusal carries Retry-After (7.0 gives every 429 one),
sends nothing, and leaves the anchor untouched; the far side of the window
is reached by backdating last_sent_at, the only way to cross 24 hours
without waiting there (the AC-113 precedent for moved instants), and the
resend then answers 200, sends exactly one more email, and re-stamps the
anchor.

Rate-limit discipline: the member issues four POST /invites here and the
owner none, under 10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 5.2 (cancel and resend rows), 5.4 (cancel matrix), 10.2, 10.4
(the per-invite resend line), 7.0 (Retry-After), 11.8, 11.10 (the sink).
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
  backdateLastSent,
  cancelInvite,
  createInviteOk,
  freshEmail,
  inviteEmailsTo,
  invitesPending,
  requireInviteRow,
  resendInvite,
  signInActorWithEmail,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'third', 'stranger'], 'p5')

interface Stage {
  owner: Actor
  member: Actor
  third: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, third, stranger] = await cast.of(app)
    if (
      owner === undefined ||
      member === undefined ||
      third === undefined ||
      stranger === undefined
    ) {
      throw new Error('cast must produce four actors')
    }
    await connect(app.db, owner.id, member.id)
    await connect(app.db, owner.id, third.id)
    const folderId = await createFolder(owner, 'p5 ac068 throttled')
    await addMemberOk(owner, folderId, member.id)
    await addMemberOk(owner, folderId, third.id)
    staged = { owner, member, third, stranger, folderId }
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

describe('AC-068: cancel empties the wait, resend respects the day', () => {
  test('AC-068: the folder owner cancels a member\'s invite off the pending list', async () => {
    const { owner, member, folderId } = await stage()
    const email = freshEmail('ac068-canceled')
    const { id } = await createInviteOk(
      member,
      { email, folder_id: folderId },
      'any member sends folder invites (spec 5.4)',
    )
    const recipient = await signInActorWithEmail(app, 'ac068-canceled', email)
    cast.trackUser(recipient.id)
    expect(
      (await invitesPending(recipient)).map((element) => element.id),
      'the premise: the invite is waiting before the cancel',
    ).toContain(id)

    app.emails.clear()
    expectStatus(
      await cancelInvite(owner, id),
      200,
      'the attached folder\'s owner may cancel any invite for it (spec 7.5, 5.2, 5.4)',
    )
    const row = await requireInviteRow(app.db, id)
    expect(row.status, 'canceled is a 5.2 terminal state').toBe('canceled')
    expect(
      row.responded_at,
      'responded_at is set on the terminal transition (spec 5.2)',
    ).not.toBeNull()
    expect(
      app.emails.sent().length,
      'a cancel sends nothing: 5.2 gives it no email side effect',
    ).toBe(0)
    expect(
      (await invitesPending(recipient)).map((element) => element.id),
      'the recipient\'s pending list no longer contains it (spec 7.5, 6 Q12)',
    ).not.toContain(id)
  })

  test('AC-068: the inviter cancels their own, and only those two may', async () => {
    const { member, third, stranger, folderId } = await stage()
    const { id } = await createInviteOk(
      member,
      { email: freshEmail('ac068-own'), folder_id: folderId },
      'the member parks a second invite (spec 7.5)',
    )

    expectStatus(
      await cancelInvite(third, id),
      403,
      'a co-member who is neither inviter nor owner sees the invite on the folder detail, so the refusal is the matrix\'s 403, only-own (spec 5.4, 7.0)',
    )
    expectStatus(
      await cancelInvite(stranger, id),
      404,
      'a non-member cannot see the invite at all, so it reads as nonexistent (spec 10.2)',
    )
    expect(
      (await requireInviteRow(app.db, id)).status,
      'both refusals moved nothing',
    ).toBe('pending')

    expectStatus(
      await cancelInvite(member, id),
      200,
      'the inviter cancels their own (spec 5.2, 5.4)',
    )
    expect((await requireInviteRow(app.db, id)).status).toBe('canceled')
  })

  test('AC-068 adversarial: a bare invite has no owner arm', async () => {
    const { owner, member } = await stage()
    const { id } = await createInviteOk(
      member,
      { email: freshEmail('ac068-bare') },
      'a bare invite parks with no folder attached (spec 7.5)',
    )
    expectStatus(
      await cancelInvite(owner, id),
      404,
      'no folder, no folder owner: anyone but the inviter reads a bare invite as nonexistent (spec 5.2, 10.2)',
    )
    expectStatus(
      await cancelInvite(member, id),
      200,
      'while the inviter\'s own arm still works',
    )
  })

  test('AC-068: resend throttles inside 24 hours and sends beyond them', async () => {
    const { owner, member, folderId } = await stage()
    const email = freshEmail('ac068-resent')
    const { id } = await createInviteOk(
      member,
      { email, folder_id: folderId },
      'the invite whose resend window this case measures (spec 7.5)',
    )
    expect(
      inviteEmailsTo(app, email).length,
      'the premise: creation sent the first email (spec 5.2)',
    ).toBe(1)
    const created = await requireInviteRow(app.db, id)

    const throttled = await resendInvite(member, id)
    expectStatus(
      throttled,
      429,
      'a resend within 24 hours of last_sent_at is refused (spec 7.5, 5.2, 10.4)',
    )
    expect(
      throttled.headers['retry-after'],
      'and carries Retry-After, as 7.0 gives every 429',
    ).toBeDefined()
    expect(
      inviteEmailsTo(app, email).length,
      'the refusal sent nothing',
    ).toBe(1)
    expect(
      (await requireInviteRow(app.db, id)).last_sent_at,
      'and left the anchor untouched, or the throttle would extend itself',
    ).toBe(created.last_sent_at)

    expectStatus(
      await resendInvite(owner, id),
      403,
      'resend is the inviter\'s alone, and the owner can see the invite, so the refusal is 403 (spec 5.2 "inviter", 7.5, 5.4)',
    )

    await backdateLastSent(app.db, id, 25)
    const backdated = await requireInviteRow(app.db, id)
    const resent = await resendInvite(member, id)
    expectStatus(
      resent,
      200,
      'beyond 24 hours the resend goes through (spec 5.2, 7.5)',
    )
    expect(
      inviteEmailsTo(app, email).length,
      'and the email is sent again, one more through the sink (spec 5.2, 11.8)',
    ).toBe(2)
    const after = await requireInviteRow(app.db, id)
    expect(
      after.last_sent_at > backdated.last_sent_at,
      'last_sent_at is re-stamped, re-arming the throttle (spec 5.2); the instants are database-rendered strings and compare as such',
    ).toBe(true)
    expect(
      after.status,
      'a resend leaves the invite pending: it is not a state change (spec 5.2)',
    ).toBe('pending')
  })

  test('AC-068 adversarial: a canceled invite refuses resend as terminal', async () => {
    const { member } = await stage()
    const { id } = await createInviteOk(
      member,
      { email: freshEmail('ac068-dead') },
      'one more bare invite, to kill and then prod (spec 7.5)',
    )
    expectStatus(await cancelInvite(member, id), 200, 'killed')
    await backdateLastSent(app.db, id, 25)
    expectStatus(
      await resendInvite(member, id),
      409,
      'terminal outranks the window: resend on a canceled invite is a state conflict however old its anchor (spec 5.2, 7.5)',
    )
  })

  test('AC-068: invariants hold afterwards', async () => {
    const { owner, member, third, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [owner.id, member.id, third.id, stranger.id],
    )
  })
})

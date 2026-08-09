/*
AC-141: Given an invite whose email belongs to a roster connection of V and
which carries no folder, then 409 naming the existing connection, and
nothing is created: no invite row, no second connection row, and no email
sent; given the same email with a folder attached, then AC-061's conversion
runs instead, the folder being the discriminator.

Appended by the Integration Steward on 2026-08-09 from the human owner's
ruling, the AC-124 shape rather than the AC-125 one: only this test is the
Adversarial Test role's, and the criterion above is settled text quoted
rather than proposed. The history is worth keeping because this file is the
losing recommendation's own. This role escalated the edge as a genuine
silence in 8.7's conversion arm, whose condition named a connected email
while its consequent created a membership only a folder can define, and
recommended 200 with nothing created; the Steward recommended 409; the owner
took the Steward's on 2026-08-09, and the 201 fallthrough was before him and
was not taken. Frozen 7.5 now carries the rule in an appended paragraph with
its bullet byte-identical, 8.7 carries it as the clause following the
conversion arm, and 9.8 carries the People screen copy. The recommendation
this file asserts against is the one it argued for, which is the whole point
of the separation: the specification won.

The discriminator is what the file is built around, and it is why one file
holds both arms against one roster pair. A test that only refused would pass
against an endpoint refusing every bare invite, and a test that only
converted would pass against one converting everything; asserting both of
one email, with the folder as the only difference between the two requests,
is what makes either half mean something. AC-061 still owns the conversion's
full assertions, so the arm here is asserted to the depth the contrast
needs and no further.

Three attacks beside the criterion, each discarding a wrong implementation
the criterion's own sentence admits:

**A case variant of the address is the same person.** 8.7 matches
case-insensitively and lowercases before anything compares, so an
implementation lowercasing after its roster lookup answers 201 here.

**Either side of the pair meets the same refusal.** 4.2 stores one row in
canonical order with user_a_id < user_b_id (INV-9), so a lookup written as
`user_a_id = V` alone is right for one direction of every pair and wrong for
the other, which no single-direction test can see. The reverse arm sends its
one invite from the other side.

**An unconnected email still parks.** Without it the 409 is satisfied by an
endpoint that refuses every bare invite, which would break 8.7's People
screen path entirely. This is the control that makes the refusal about the
connection rather than about the bareness, the re-offer discipline AC-124's
member arm uses for the same reason.

The invite rows are counted per address rather than per inviter, so the
control's parked row and the refused addresses never share a number and no
case depends on which order the file runs in.

Rate-limit discipline: the inviter issues four POST /invites here and the
connected actor one, under 10.4's five per minute (P9's arm, AC-101).

Spec: 7.5 as amended on 2026-08-09 (the rule and its grounds), 8.7 (V-INV's
conversion arm and the refusal following it), 9.8 (the People screen copy,
P8's to render), 4.2, INV-9, 7.0 (the envelope), 11.8 and 11.10 (the send
that must not happen).
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  connect,
  countRows,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  connectionCount,
  connectionPair,
  createInviteOk,
  freshEmail,
  inviteEmails,
  postInvite,
  requireInviteRow,
} from './sharing-harness.js'
import { asRecord } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'connected'], 'p5')

interface Stage {
  inviter: Actor
  connected: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, connected] = await cast.of(app)
    if (inviter === undefined || connected === undefined) {
      throw new Error('cast must produce two actors')
    }
    // The roster pair the whole criterion turns on. Seeded, the AC-061 and
    // AC-069 precedent: the surface that would mint it is the one under
    // test, so creating it through POST /invites would make every case
    // here depend on the endpoint it is measuring.
    await connect(app.db, inviter.id, connected.id)
    const folderId = await createFolder(inviter, 'p5 ac141 discriminator')
    staged = { inviter, connected, folderId }
  }
  return staged
}

/** Invite rows for one address, whoever sent them: the refused addresses
 * must never have one, and counting per address keeps the control's parked
 * row out of every other case's number. */
async function invitesForEmail(email: string): Promise<number> {
  return countRows(
    app.db,
    sql`SELECT count(*)::int AS n FROM invites WHERE email = ${email.toLowerCase()}`,
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

describe('AC-141: a bare invite to someone already connected is refused', () => {
  test('AC-141: the refusal is 409, names the connection, and creates nothing', async () => {
    const { inviter, connected } = await stage()
    expect(
      await connectionPair(app.db, inviter.id, connected.id),
      'the premise: the pair is on both rosters before the invite (spec 4.2, INV-9)',
    ).toHaveLength(1)
    const connectionsBefore = await connectionCount(app.db, inviter.id)
    app.emails.clear()

    const response = await postInvite(inviter, { email: connected.email })
    expectStatus(
      response,
      409,
      'a bare invite to a roster connection is refused: the connection it exists to create already holds (spec 7.5 and 8.7 as ruled on 2026-08-09)',
    )
    const body = asRecord(response.json(), 'the 409 body')
    const error = asRecord(body.error, 'the 409 envelope error')
    expect(
      typeof error.code === 'string' && error.code.length > 0,
      'a 4xx carries the 7.0 envelope (AC-117)',
    ).toBe(true)
    expect(
      String(error.message).toLowerCase(),
      'and names the existing connection, the way the neighbouring 409 one clause earlier names the existing membership (spec 7.5)',
    ).toContain('connect')

    expect(
      await invitesForEmail(connected.email),
      'nothing is created: no invite row (spec 7.5)',
    ).toBe(0)
    expect(
      await connectionPair(app.db, inviter.id, connected.id),
      'no second connection row: INV-9 admits one per unordered pair, and the refusal must not have touched the one that exists',
    ).toHaveLength(1)
    expect(
      await connectionCount(app.db, inviter.id),
      'and no connection anywhere else either',
    ).toBe(connectionsBefore)
    expect(
      app.emails.sent().length,
      'and no email sent: 5.2 sends one on a created invite, and none was created (spec 7.5, 11.8)',
    ).toBe(0)
  })

  test('AC-141 adversarial: a case variant of the address is the same person', async () => {
    const { inviter, connected } = await stage()
    app.emails.clear()
    const response = await postInvite(inviter, {
      email: connected.email.toUpperCase(),
    })
    expectStatus(
      response,
      409,
      'V-INV lowercases before anything compares and matching is case-insensitive equality, so case cannot walk past the roster (spec 8.7)',
    )
    expect(
      await invitesForEmail(connected.email),
      'and the case variant created nothing either',
    ).toBe(0)
    expect(
      app.emails.sent().length,
      'nor sent anything',
    ).toBe(0)
  })

  test('AC-141 adversarial: either side of the pair meets the same refusal', async () => {
    const { inviter, connected } = await stage()
    app.emails.clear()
    // The other side sends this one. 4.2 stores the pair canonically, so a
    // roster lookup written as user_a_id = V alone is correct in exactly
    // one direction and this is the direction that finds out.
    const response = await postInvite(connected, { email: inviter.email })
    expectStatus(
      response,
      409,
      'a connection serves both rosters, so the refusal is symmetrical whichever side asks (spec 7.3, 4.2, INV-9)',
    )
    expect(
      await invitesForEmail(inviter.email),
      'and the reverse direction created nothing',
    ).toBe(0)
  })

  test('AC-141: the same email with a folder attached converts instead', async () => {
    const { inviter, connected, folderId } = await stage()
    app.emails.clear()

    const response = await postInvite(inviter, {
      email: connected.email,
      folder_id: folderId,
    })
    expectStatus(
      response,
      200,
      'the folder is the discriminator: one email, one roster, and the attached folder is the only difference between this request and the refused one (spec 7.5, 8.7)',
    )
    expect(
      asRecord(response.json(), 'the conversion body').converted_to_share,
      'the conversion arm runs, which is AC-061\'s criterion and is asserted there in full',
    ).toBe(true)
    expect(
      await membershipUserIds(app.db, folderId),
      'and it grants what only a folder can define, which is why the bare case had nothing to grant (spec 8.7)',
    ).toContain(connected.id)
    expect(
      app.emails.shareGrants().filter((email) => email.to === connected.email)
        .length,
      'with the share-grant email the grant carries (spec 8.7, 11.8)',
    ).toBe(1)
    expect(
      await invitesForEmail(connected.email),
      'still no invite row for this address, on either arm: the conversion parks nothing and the refusal created nothing',
    ).toBe(0)
  })

  test('AC-141: an unconnected email still parks a bare invite', async () => {
    const { inviter } = await stage()
    const stranger = freshEmail('ac141-stranger')
    app.emails.clear()

    const { id } = await createInviteOk(
      inviter,
      { email: stranger },
      'the control: a bare invite to someone off the roster is 8.7\'s People screen path and must still park (spec 7.5)',
    )
    expect(
      (await requireInviteRow(app.db, id)).status,
      'pending, awaiting the 5.2 lifecycle: the 409 above is about the connection and not about the bareness',
    ).toBe('pending')
    expect(
      inviteEmails(app).filter((email) => email.to === stranger).length,
      'and this one does send its invite email (spec 5.2, 11.8)',
    ).toBe(1)
  })

  test('AC-141: invariants hold afterwards', async () => {
    const { inviter, connected, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId],
      [inviter.id, connected.id],
    )
  })
})

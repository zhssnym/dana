/*
AC-060: given an invite for a folder to an email belonging to a current
member, then 409.

The 409 is V-INV's "already a member" refusal, and what makes it worth a
criterion is what it must read: current membership, not history and not
case. So the refusal is asserted three ways here, the plain address, a case
variant of it (V-INV lowercases before comparing, and matching is
case-insensitive equality per 8.7), and then the release: after the member
leaves, the same address is admitted again, which proves the guard read the
membership table rather than anything the invite's own history could
satisfy.

The release case asserts the instant-share conversion, and it took a repair
to get there. It was written expecting 201 with a parked invite, which no
implementation can produce, and the Collaboration engineer escalated it
after the package landed. The fixture connects owner and member at stage
time and has to: 5.3's add row requires the target hold a roster connection
with the actor. Leaving a folder does not touch that connection, since
R-CLEAN's three clauses reach assignments, My Day entries and the INV-5
sweep and nothing else, and 8.10 step 5 is the only thing in the
specification that deletes connection rows. So after the leave the input is
an active connected user with a folder attached, which is exactly V-INV's
conversion arm, and AC-061 asserts that arm must convert. The two inputs
are indistinguishable and both criteria cannot hold at 201.

Expecting the conversion was chosen over the alternative, dropping the
connection so the 201 stands, and the choice is not merely the smaller
edit. What the case exists to prove survives either way, since a
history-keeping implementation answers 409 to both. What only the
conversion gives is that V-INV's next clause becomes reachable: 7.5's
bullet orders the already-a-member 409 ahead of the conversion, so a 200
here is the membership clause releasing and the clause behind it running,
which is a sharper reading of "the guard read current membership" than any
status that merely differs from 409. It also pins a fact nothing else in
the suite asserts, the converse of AC-069: leaving a folder leaves the
connection intact. Dropping the connection would have bought neither, and
would have restated a parked bare-folder invite that AC-062 and AC-141's
control already own. No numbered criterion moves either way: section 12
words AC-060 as the 409 alone, so this case is this file's elaboration.

One asymmetry observed while repairing, recorded rather than escalated
because nothing here rests on it: 7.5's bullet enumerates the
already-a-member 409 and 8.7's V-INV list does not carry it, though 5.3's
add row and this criterion both fix the behavior. The assertions below do
not depend on where that clause sits, only on its not firing once the
membership is gone.

The folder guards around this one in V-INV's order are attacked beside it,
because they share the arm and no other criterion in the range owns them: a
default folder answers 409 (INV-3 says invite validation rejects default
folders), and a folder the inviter cannot see answers 404, never anything
that confirms the folder exists (10.2's leak rule; the move refusal of 7.6
was narrowed to 404 on the same ground).

Rate-limit discipline: the owner issues four POST /invites in this file and
the member none, under the five per minute that 10.4 gives P9 (AC-101).

Spec: 7.5, 8.7 (V-INV order and matching), 5.3, INV-3, 10.2, 10.3.
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
  defaultFolderOf,
  expectFolderInvariants,
  expectStatus,
  membershipUserIds,
  removeMember,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { postInvite } from './sharing-harness.js'
import { asRecord } from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'member', 'stranger'], 'p5')

interface Stage {
  owner: Actor
  member: Actor
  stranger: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, member, stranger] = await cast.of(app)
    if (owner === undefined || member === undefined || stranger === undefined) {
      throw new Error('cast must produce three actors')
    }
    await connect(app.db, owner.id, member.id)
    const folderId = await createFolder(owner, 'p5 ac060 membered')
    await addMemberOk(owner, folderId, member.id)
    staged = { owner, member, stranger, folderId }
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

describe('AC-060: a folder invite to a current member is refused', () => {
  test('AC-060: the member\'s email answers 409 and no row is written', async () => {
    const { owner, member, folderId } = await stage()
    const response = await postInvite(owner, {
      email: member.email,
      folder_id: folderId,
    })
    expectStatus(
      response,
      409,
      'V-INV rejects a folder invite whose target is already a member with 409 (spec 7.5, 8.7)',
    )
    const body = response.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      String(body.error?.message).toLowerCase(),
      'the refusal says what it refused: already a member (spec 7.5)',
    ).toContain('member')
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE inviter_id = ${owner.id} AND folder_id = ${folderId}`,
      ),
      'the refusal creates no invite row',
    ).toBe(0)
  })

  test('AC-060 adversarial: a case variant of the member\'s email is the member', async () => {
    const { owner, member, folderId } = await stage()
    const response = await postInvite(owner, {
      email: member.email.toUpperCase(),
      folder_id: folderId,
    })
    expectStatus(
      response,
      409,
      'V-INV lowercases before comparing, so case cannot smuggle a member past the guard (spec 8.7)',
    )
  })

  test('AC-060 adversarial: the default folder refuses any invite with 409', async () => {
    const { owner, member } = await stage()
    const response = await postInvite(owner, {
      email: member.email,
      folder_id: await defaultFolderOf(app.db, owner.id),
    })
    expectStatus(
      response,
      409,
      'a default folder is never shared, so V-INV rejects it with 409 (spec 7.5, 8.7, INV-3)',
    )
  })

  test('AC-060 adversarial: a folder the inviter cannot see reads as nonexistent', async () => {
    const { stranger, member, folderId } = await stage()
    const response = await postInvite(stranger, {
      email: member.email,
      folder_id: folderId,
    })
    expectStatus(
      response,
      404,
      'an inaccessible folder answers 404, never a status that confirms it exists (spec 10.2, 8.7 "accessible to the inviter")',
    )
  })

  test('AC-060: after the member leaves, the same address is admitted again', async () => {
    const { owner, member, folderId } = await stage()
    expectStatus(
      await removeMember(member, folderId, member.id),
      204,
      'a non-owner removes themselves, which is 5.3\'s leave row',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'the premise: the leave really removed the membership the guard reads',
    ).not.toContain(member.id)

    const response = await postInvite(owner, {
      email: member.email,
      folder_id: folderId,
    })
    expectStatus(
      response,
      200,
      'the guard reads current membership, so the already-a-member 409 no longer fires and the clause behind it in V-INV\'s order runs (spec 7.5, 8.7)',
    )
    expect(
      asRecord(response.json(), 'the conversion body').converted_to_share,
      'and what runs is the conversion, the leave having left the roster connection untouched: R-CLEAN reaches assignments, My Day entries and the INV-5 sweep, and 8.10 step 5 alone deletes connections (spec 5.3, 8.7)',
    ).toBe(true)
    expect(
      await membershipUserIds(app.db, folderId),
      'so the former member is admitted again, which is what this case means by allowed (spec 8.7)',
    ).toContain(member.id)
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM invites
             WHERE inviter_id = ${owner.id} AND folder_id = ${folderId}`,
      ),
      'and the conversion parks nothing: no invite row here either (spec 8.7)',
    ).toBe(0)
  })

  test('AC-060: invariants hold afterwards', async () => {
    const { owner, member, stranger, folderId } = await stage()
    await expectFolderInvariants(
      app.db,
      [folderId, await defaultFolderOf(app.db, owner.id)],
      [owner.id, member.id, stranger.id],
    )
  })
})

/*
AC-060: given an invite for a folder to an email belonging to a current
member, then 409.

The 409 is V-INV's "already a member" refusal, and what makes it worth a
criterion is what it must read: current membership, not history and not
case. So the refusal is asserted three ways here, the plain address, a case
variant of it (V-INV lowercases before comparing, and matching is
case-insensitive equality per 8.7), and then the release: after the member
leaves, the same invite is allowed, which proves the guard read the
membership table rather than anything the invite's own history could
satisfy.

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
  removeMember,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { createInviteOk, postInvite, requireInviteRow } from './sharing-harness.js'

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

  test('AC-060: after the member leaves, the same invite is allowed', async () => {
    const { owner, member, folderId } = await stage()
    expectStatus(
      await removeMember(member, folderId, member.id),
      204,
      'a non-owner removes themselves, which is 5.3\'s leave row',
    )
    const { id } = await createInviteOk(
      owner,
      { email: member.email, folder_id: folderId },
      'the guard reads current membership, so a former member\'s email is invitable again (spec 8.7)',
    )
    const row = await requireInviteRow(app.db, id)
    expect(row.status, 'and the invite is pending, awaiting the 5.2 lifecycle').toBe(
      'pending',
    )
    expect(
      row.email,
      'stored lowercased, 4.9\'s CHECK and 10.3\'s rule',
    ).toBe(member.email.toLowerCase())
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

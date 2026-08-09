/*
AC-062: given a duplicate pending invite for the same inviter, email, and
folder, then 409 naming the existing invite.

INV-11's surface: at most one pending invite per (inviter, email, folder),
the no-folder case counting as one folder value. The 409 must point at the
existing invite, which is what lets a client offer resend instead of a dead
end, so the body is searched for the survivor's id; where in the envelope it
rides is not fixed by 7.5, and the search does not guess.

The uniqueness is asserted with its exact scope, because a guard that is
broader than INV-11 refuses invites the specification allows: a different
folder for the same email is allowed, a different inviter for the same email
and folder is allowed, and the bare invite dedupes against bare alone. The
partial unique index behind all of this is AC-001's to catalog; what this
file owns is the endpoint answering 409 rather than surfacing a constraint
error, and answering it only where INV-11 actually binds. A case variant of
the duplicate is not retried here: AC-059 and AC-060 pin the lowercasing on
this endpoint, and 4.9's CHECK makes a mixed-case row unstorable, so the
dedupe can only ever see lowercased values.

Rate-limit discipline: the first inviter issues five POST /invites in this
file and the second one, under 10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 8.7 (dedupe, 409 pointing at it), INV-11, 4.9, 7.0 (envelope).
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
  createInviteOk,
  freshEmail,
  postInvite,
  requireInviteRow,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter', 'second'], 'p5')

interface Stage {
  inviter: Actor
  second: Actor
  folderId: string
  email: string
  folderInviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter, second] = await cast.of(app)
    if (inviter === undefined || second === undefined) {
      throw new Error('cast must produce two actors')
    }
    await connect(app.db, inviter.id, second.id)
    const folderId = await createFolder(inviter, 'p5 ac062 deduped')
    await addMemberOk(inviter, folderId, second.id)
    const email = freshEmail('ac062-target')
    const { id } = await createInviteOk(
      inviter,
      { email, folder_id: folderId },
      'the first folder invite parks as pending (spec 7.5)',
    )
    staged = { inviter, second, folderId, email, folderInviteId: id }
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

describe('AC-062: a pending duplicate is refused and named', () => {
  test('AC-062: the same inviter, email, and folder answers 409 naming the survivor', async () => {
    const { inviter, folderId, email, folderInviteId } = await stage()
    const response = await postInvite(inviter, { email, folder_id: folderId })
    expectStatus(
      response,
      409,
      'INV-11 admits one pending invite per (inviter, email, folder), so the duplicate is a conflict (spec 7.5, 8.7)',
    )
    expect(
      response.body,
      'the 409 points at the existing invite so a client can offer resend instead of a dead end (spec 8.7 "409 pointing at it")',
    ).toContain(folderInviteId)
    const row = await requireInviteRow(app.db, folderInviteId)
    expect(row.status, 'and the survivor is untouched').toBe('pending')
  })

  test('AC-062: the bare invite dedupes against bare alone', async () => {
    const { inviter, email } = await stage()
    const bare = await createInviteOk(
      inviter,
      { email },
      'a bare invite to the same email is a different (inviter, email, folder) value: INV-11 counts no-folder as its own folder value',
    )
    const duplicate = await postInvite(inviter, { email })
    expectStatus(
      duplicate,
      409,
      'and the second bare invite collides with the first (INV-11)',
    )
    expect(
      duplicate.body,
      'naming the bare survivor, not the folder one',
    ).toContain(bare.id)
  })

  test('AC-062 adversarial: a different inviter may invite the same email to the same folder', async () => {
    const { second, folderId, email } = await stage()
    await createInviteOk(
      second,
      { email, folder_id: folderId },
      'INV-11 is scoped per inviter: another member inviting the same email to the same folder is no duplicate (spec 8.7, 5.4 "send folder invites" for any member)',
    )
  })

  test('AC-062 adversarial: a different folder for the same email is no duplicate', async () => {
    const { inviter, email } = await stage()
    const otherFolderId = await createFolder(inviter, 'p5 ac062 second folder')
    await createInviteOk(
      inviter,
      { email, folder_id: otherFolderId },
      'INV-11 is scoped per folder: the same email invited to a different folder parks beside the first (spec 8.7)',
    )
  })

  test('AC-062: invariants hold afterwards', async () => {
    const { inviter, second, folderId } = await stage()
    await expectFolderInvariants(app.db, [folderId], [inviter.id, second.id])
  })
})

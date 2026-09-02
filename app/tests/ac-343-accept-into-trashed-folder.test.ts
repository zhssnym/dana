/*
AC-343: given a pending folder invite whose folder has been deleted and is
sitting in Trash, when the matched recipient accepts it, then 409 with the
code `folder_deleted`, the whole acceptance rolls back leaving the invite
pending with no membership and no connection made, and the same acceptance
succeeds once the folder is restored; given a bare invite carrying no folder,
then the deletion of any other folder does not touch it.

This is issue #28 and 8.7's Trash paragraph. Folder deletion used to take the
folder's pending invites with it in the same statement; RFC 0005 made deletion
soft, so the cascade moved to the 30-day purge and left a window in which the
invite is pending and the folder it names is in Trash. Nothing said which of
those two facts won, and the code took the accidental answer: the acceptance
succeeded and granted a membership on a folder that leaves every query but
Trash at once.

Three things are asserted and only one of them is the status code.

**The rollback is whole.** 8.7 makes the acceptance all-or-nothing, and the
connection upsert is the transaction's first write, before the folder is ever
read. A guard written as a return rather than as a rollback would answer 409
and still have minted a roster connection out of an invite nobody accepted, so
the connection is counted after the refusal as well as the membership. It is
the same shape AC-140 asserts for the member cap and for the same reason.

**The refusal is not terminal.** The whole argument for refusing rather than
cancelling at deletion time is that a restore repairs it by itself, so the
case restores the folder and accepts again with nothing else repaired in
between. If that second acceptance needed a fresh invite, the decision behind
this criterion would have been the wrong one.

**The code is its own.** A client has three different sentences to say here
and only the code tells them apart: 404 for an invite that is not the
caller's, 409 `conflict` for one already settled, and 409 `folder_deleted` for
one that is still good against a folder that is not. The bare-invite case at
the end is the guard's other edge: no folder means no Trash question, so an
invite that carries none is unaffected by any deletion anywhere.

Spec: 8.7 (the acceptance transaction and its Trash paragraph), 5.2 (the
accept row's second state guard), 7.5, 7.13, 8.8, 7.0 (the code), 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  createFolder,
  expectStatus,
  folderInList,
  membershipUserIds,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  acceptInvite,
  connectionCount,
  createInviteOk,
  freshEmail,
  invitesPending,
  requireInviteRow,
  signInActorWithEmail,
} from './sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter'], 'w4')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/** The 7.0 envelope's code, read from a refusal body. */
function codeOf(body: unknown): string {
  const envelope = body as { error?: { code?: unknown } }
  return String(envelope.error?.code ?? '')
}

describe('AC-343: an invite into a folder sitting in Trash', () => {
  test('AC-343: acceptance is refused, rolls back whole, and works after a restore', async () => {
    const [inviter] = (await cast.of(app)) as [Actor]
    const folderId = await createFolder(inviter, 'w4 ac343 deleted under the invite')
    const email = freshEmail('ac343-recipient')
    const { id: inviteId } = await createInviteOk(
      inviter,
      { email, folder_id: folderId },
      'the folder invite parks as pending (spec 7.5)',
    )

    const recipient = await signInActorWithEmail(app, 'ac343-recipient', email)
    cast.trackUser(recipient.id)
    // Measured before the refusal so the "nothing was written" assertions
    // below compare against a real starting point rather than against zero.
    const connectionsBefore = await connectionCount(app.db, recipient.id)
    expect(
      connectionsBefore,
      'the recipient starts with no connection to the inviter (spec 4.2)',
    ).toBe(0)

    const deletion = await inviter.browser.json(`/folders/${folderId}`, 'DELETE')
    expectStatus(
      deletion,
      200,
      'the owner soft-deletes the folder into Trash (spec 7.13, 8.8)',
    )

    // The invite is still the recipient's to see: 5.2's purge row removes it
    // at thirty days and not at the delete, which is the window this
    // criterion is about.
    expect(
      (await invitesPending(recipient)).map((element) => element.id),
      'the invite is still pending and still listed while the folder waits in Trash (spec 5.2, 6 Q12)',
    ).toContain(inviteId)

    const refused = await acceptInvite(recipient, inviteId)
    expectStatus(
      refused,
      409,
      'accepting into a folder in Trash is a state conflict (spec 8.7, 5.2, 7.0)',
    )
    expect(
      codeOf(refused.json()),
      'and it carries its own code, so a client can say something other than "no longer pending" (spec 7.0, 8.7)',
    ).toBe('folder_deleted')

    expect(
      (await requireInviteRow(app.db, inviteId)).status,
      'the refusal is not terminal: the invite is still pending (spec 8.7)',
    ).toBe('pending')
    expect(
      await membershipUserIds(app.db, folderId),
      'no membership was granted (spec 8.7, INV-10)',
    ).not.toContain(recipient.id)
    expect(
      await connectionCount(app.db, recipient.id),
      'and the rollback is whole: the connection the first line of the transaction writes went back too (spec 8.7)',
    ).toBe(connectionsBefore)

    const restore = await inviter.browser.json(`/folders/${folderId}/restore`, 'POST')
    expect(
      [200, 204].includes(restore.status),
      `the owner restores the folder inside the 30-day window (spec 7.13); answered ${String(restore.status)}`,
    ).toBe(true)

    const accepted = await acceptInvite(recipient, inviteId)
    expectStatus(
      accepted,
      200,
      'the same invite, unrepaired, is acceptable again once the folder is back (spec 8.7, issue #28)',
    )
    expect(
      await membershipUserIds(app.db, folderId),
      'and now the membership is granted (spec 8.7, INV-10)',
    ).toContain(recipient.id)
    expect(
      await folderInList(recipient, folderId),
      'the acceptor can see the folder they were let into (spec 5.4)',
    ).toBeDefined()
  })

  test('AC-343: a bare invite carries no folder and no deletion touches it', async () => {
    const [inviter] = (await cast.of(app)) as [Actor]
    const doomed = await createFolder(inviter, 'w4 ac343 unrelated folder')
    const email = freshEmail('ac343-bare')
    const { id: inviteId } = await createInviteOk(
      inviter,
      { email },
      'a bare invite parks with no folder attached (spec 7.5)',
    )

    const deletion = await inviter.browser.json(`/folders/${doomed}`, 'DELETE')
    expectStatus(deletion, 200, 'an unrelated folder goes to Trash (spec 7.13)')

    const recipient = await signInActorWithEmail(app, 'ac343-bare', email)
    cast.trackUser(recipient.id)
    const accepted = await acceptInvite(recipient, inviteId)
    expectStatus(
      accepted,
      200,
      'a bare invite has no folder, so the Trash guard has nothing to ask (spec 8.7)',
    )
    expect(
      (accepted.json() as { folder?: unknown }).folder,
      'and it grants no folder, which is what makes the guard inapplicable (spec 7.5)',
    ).toBeNull()
    expect(
      await connectionCount(app.db, recipient.id),
      'the connection is minted, the whole of what a bare invite does (spec 8.7, INV-9)',
    ).toBe(1)
  })
})

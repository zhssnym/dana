/*
AC-569: initial Responsibility content supplied when somebody is added or
invited becomes their first revision when membership activates, attributed to
the authorized grantor who wrote it -- never to the person who accepted.

Issue #230 required proof 13. Product authority: #230 "Invite / member
activation", #209 R9 section 5 read across to Responsibility.

## The rule, and the mistake it exists to stop

R9 section 5 says of Access: "Do not represent the recipient as self-granting
Access merely because they accepted." #230 says the same of Responsibility:
"history must preserve the authorized grantor/editor, not pretend the recipient
authored initial content merely by accepting."

The mistake is cheap to make and hard to see afterwards. Acceptance is a
transaction the *recipient* drives, so `actorId` is right there and reads like
the obvious thing to record. A record that took it would be wrong in the way
that matters most: the document says what somebody is expected to handle, and
who decided that is the whole question a reader of the history has.

Three activation paths reach a membership row and all three are covered, because
they are three separate pieces of code and the first two look nothing alike:

- **direct add**, `POST /folders/:id/members` with `responsibility`;
- **a parked invite**, where the content sits on the invite row for as long as
  it takes somebody to accept, and the grantor may not even be present;
- **the instant share** of 8.7, where a connected recipient becomes a member
  during the *create* and no invite row is ever written.

And the negative: no content supplied means no document. R10's "do not
fabricate" is easiest to break here, where an empty placeholder would look
tidy.

Spec: 5.3, 7.4, 7.5, 8.7; #209 R9 section 5, R10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder } from '../support/folder-access-harness.js'
import {
  Cast,
  connect,
  createFolder,
  expectStatus,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  acceptInvite,
  freshEmail,
  postInvite,
  signInActorWithEmail,
} from '../support/sharing-harness.js'
import {
  documentRows,
  paragraph,
  recordOf,
  revisionsOf,
  standingOf,
} from '../support/responsibility-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'newcomer'], 'ac569')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const SCOPE = paragraph('Runs the Thursday stock count')

describe('AC-569 initial Responsibility is attributed to its grantor', () => {
  test('AC-569 proof 13: a direct add with initial content creates the document and the first revision, named for the administrator', async () => {
    const [owner, newcomer] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 'AC-569 direct add')
    await connect(app.db, owner.id, newcomer.id)

    const added = await owner.browser.json(
      `/folders/${folderId}/members`,
      'POST',
      {
        user_id: newcomer.id,
        access: 'assigned_work',
        responsibility: SCOPE,
      },
    )
    expectStatus(
      added,
      201,
      'the add succeeds and carries the initial Responsibility with it',
    )

    const standing = await standingOf(owner, folderId, newcomer.id)
    expect(
      standing.content,
      "#230: initial content becomes the new member's current document",
    ).toEqual(SCOPE)
    expect(standing.revision_no).toBe(1)
    expect(
      standing.updated_by?.id,
      'written by the administrator who chose it',
    ).toBe(owner.id)

    const revisions = revisionsOf(await recordOf(app.db, folderId, newcomer.id))
    expect(revisions.length, 'one revision, not two').toBe(1)
    expect(
      revisions[0]?.actor_id,
      '#230 proof 13: the record names the authorized grantor rather than the person the document is about',
    ).toBe(owner.id)
    expect(revisions[0]?.member_id).toBe(newcomer.id)
    expect(revisions[0]?.transition).toBe('responsibility_created')
  })

  test('AC-569 proof 13: a parked invite carries the content, and acceptance records the inviter and not the acceptor', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 'AC-569 parked invite')
    const recipient = await signInActorWithEmail(
      app,
      'ac569-recipient',
      freshEmail('ac569-recipient'),
      'ac569',
    )
    cast.trackUser(recipient.id)

    const created = await postInvite(owner, {
      email: recipient.email,
      folder_id: folderId,
      access: 'can_comment',
      responsibility: SCOPE,
    })
    expectStatus(created, 201, 'the invite is parked with its initial content')
    const inviteId = (
      created.json() as { invite: { id: string } }
    ).invite.id

    expect(
      await documentRows(app.db, folderId, recipient.id),
      '#230: initial content "becomes active only when membership becomes active" -- a pending invite has created no document',
    ).toEqual([])

    expectStatus(
      await acceptInvite(recipient, inviteId),
      200,
      'the recipient accepts',
    )

    const revisions = revisionsOf(
      await recordOf(app.db, folderId, recipient.id),
    )
    expect(
      revisions.length,
      'acceptance creates the current document and its first revision, atomically with the membership',
    ).toBe(1)
    expect(
      revisions[0]?.actor_id,
      "#230 proof 13 and R9 section 5: do not pretend the recipient authored the content merely because they accepted. The actor is the inviter",
    ).toBe(owner.id)
    expect(revisions[0]?.member_id).toBe(recipient.id)
    expect(
      revisions[0]?.content,
      'and it is the content the inviter wrote',
    ).toEqual(SCOPE)
  })

  test("AC-569 proof 13: 8.7's instant share, which writes no invite row at all, records the inviter too", async () => {
    const [owner, newcomer] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await createFolder(owner, 'AC-569 instant share')
    await connect(app.db, owner.id, newcomer.id)

    const shared = await postInvite(owner, {
      email: newcomer.email,
      folder_id: folderId,
      access: 'can_contribute',
      responsibility: SCOPE,
    })
    expectStatus(
      shared,
      200,
      '8.7: a connected recipient becomes a member during the create, and no invite row is ever written',
    )

    const revisions = revisionsOf(await recordOf(app.db, folderId, newcomer.id))
    expect(
      revisions.length,
      'the third activation path is a third piece of code, and it owes the same revision',
    ).toBe(1)
    expect(
      revisions[0]?.actor_id,
      'named for the person who wrote the content, who here is also the person who ran the request',
    ).toBe(owner.id)
    expect(revisions[0]?.content).toEqual(SCOPE)
  })

  test('AC-569 proof 13: no initial content means no document, on every path', async () => {
    const [owner, newcomer] = (await cast.of(app)) as [Actor, Actor]
    const folderId = await sharedFolder(app, owner, 'AC-569 nothing', [
      [newcomer, 'can_edit'],
    ])
    expect(
      await documentRows(app.db, folderId, newcomer.id),
      'R10 "do not fabricate": an add with no initial Responsibility creates none',
    ).toEqual([])

    const recipient = await signInActorWithEmail(
      app,
      'ac569-empty',
      freshEmail('ac569-empty'),
      'ac569',
    )
    cast.trackUser(recipient.id)
    const created = await postInvite(owner, {
      email: recipient.email,
      folder_id: folderId,
      access: 'can_view',
      responsibility: { version: 1, blocks: [] },
    })
    expectStatus(created, 201, 'an explicitly empty initial document is accepted')
    const inviteId = (created.json() as { invite: { id: string } }).invite.id
    expectStatus(await acceptInvite(recipient, inviteId), 200, 'and accepted')
    expect(
      await documentRows(app.db, folderId, recipient.id),
      'and still writes nothing: the canonical payload of an absent document is the empty one, so there is no change to record',
    ).toEqual([])
  })

  test('AC-569: initial Responsibility is refused on an invite that names no folder', async () => {
    const [owner] = (await cast.of(app)) as [Actor, Actor]
    const recipient = await signInActorWithEmail(
      app,
      'ac569-roster',
      freshEmail('ac569-roster'),
      'ac569',
    )
    cast.trackUser(recipient.id)
    expectStatus(
      await postInvite(owner, {
        email: recipient.email,
        responsibility: SCOPE,
      }),
      422,
      'a roster invite creates no Folder standing for a Responsibility to belong to, the same rule `access` already carries',
    )
  })
})

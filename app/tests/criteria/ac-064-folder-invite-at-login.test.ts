/*
AC-064: given a folder invite, when a Google account with the exact
lowercased email signs in, then the invite is waiting and acceptance grants
connection plus membership; a different account's pending list is empty.

The criterion is the login surface end to end: the invite is created before
its recipient has ever signed in, the account arrives afterwards, and Q12
finds the parked row by nothing but the lowercased email equality of 5.2.
"Exact" is the sharp word, and it cuts both ways. Case must not matter,
because 8.7 makes matching case-insensitive equality and every store
lowercases first, so an invite typed with capitals waits for a lowercase
account. And nothing else may match either: 8.7 says "and nothing more, no
Gmail dot or plus normalization", so a dot variant of the address is a
different address whose pending list is empty and whose acceptance attempt
reads as 404, the same not-found the leak rule gives every resource the
caller cannot claim. The stranded-invite repair path is the inviter's
cancel and resend, deliberately not a looser matcher.

The pending element is judged key-exact against frozen 7.5, including that
its inviter person carries display_name and avatar_url and nothing else: a
recipient has no claim to the inviter's id. GET /me's pending_invite_count
is asserted beside the list because 7.1 carries it for exactly this surface
and Q12 rides this package.

One invite email rides the creation, counted through the ratified sink:
5.2's create row sends one email and stamps last_sent_at, and this is the
file where creation is the surface under test.

Rate-limit discipline: the inviter issues two POST /invites here, under
10.4's five per minute (P9's arm, AC-101).

Spec: 7.5, 5.2 (matching actor guard), 8.7 (exact matching, stranded
repair), 6 Q12, 7.1 (pending_invite_count), 10.2 (the 404), 11.8, 11.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  expectFolderInvariants,
  expectStatus,
  folderInList,
  membershipUserIds,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import {
  acceptInvite,
  acceptInviteOk,
  connectionPair,
  createInviteOk,
  freshEmail,
  inviteEmailsTo,
  invitesPending,
  requireInviteRow,
  signInActorWithEmail,
} from '../support/sharing-harness.js'

let app: AuthTestApp
const cast = new Cast(['inviter'], 'p5')

interface Stage {
  inviter: Actor
  folderId: string
  folderName: string
  /** The address as typed into the invite, mixed case on purpose. */
  typedEmail: string
  /** The same address as an account will hold it, lowercased. */
  email: string
  inviteId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [inviter] = await cast.of(app)
    if (inviter === undefined) throw new Error('cast must produce the inviter')
    const folderName = 'p5 ac064 waiting'
    const folderId = await createFolder(inviter, folderName)
    const email = freshEmail('ac064-recipient')
    // The same address, its case varied and nothing else: case is the one
    // thing 8.7 folds away, and everything past it must stay identical.
    const cased = email
      .split('')
      .map((ch, index) => (index % 3 === 0 ? ch.toUpperCase() : ch))
      .join('')
    app.emails.clear()
    const { id } = await createInviteOk(
      inviter,
      { email: cased, folder_id: folderId },
      'the folder invite parks as pending before its recipient exists (spec 7.5, 8.7)',
    )
    staged = { inviter, folderId, folderName, typedEmail: cased, email, inviteId: id }
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

describe('AC-064: the invite waits for exactly its email', () => {
  test('AC-064: the store lowercases and one invite email was sent', async () => {
    const { email, typedEmail, inviteId } = await stage()
    const row = await requireInviteRow(app.db, inviteId)
    expect(
      row.email,
      'the address is stored lowercased however it was typed (spec 8.7, 4.9\'s CHECK, 10.3)',
    ).toBe(email)
    expect(row.status, 'and pending, per 5.2\'s create row').toBe('pending')
    expect(
      row.last_sent_at,
      '5.2\'s create row stamps last_sent_at, the resend throttle\'s anchor',
    ).not.toBeNull()
    const sent = [
      ...inviteEmailsTo(app, email),
      ...inviteEmailsTo(app, typedEmail),
    ]
    expect(
      sent.length,
      'one email sent, to the invited address (spec 5.2, 11.8, observed through the ratified 11.10 sink)',
    ).toBe(1)
  })

  test('AC-064: the exact account signs in and finds it waiting', async () => {
    const { inviter, folderId, folderName, email, inviteId } = await stage()
    const recipient = await signInActorWithEmail(app, 'ac064-match', email)
    cast.trackUser(recipient.id)

    const pending = await invitesPending(recipient)
    const waiting = pending.find((element) => element.id === inviteId)
    expect(
      waiting,
      'the invite is waiting at login for the lowercased-equal email (spec 7.5, 5.2, 6 Q12)',
    ).toBeDefined()
    expect(
      waiting?.folder_name,
      'the element names the folder it would grant (spec 7.5)',
    ).toBe(folderName)

    const me = await recipient.browser.api('/me')
    expectStatus(me, 200, 'GET /me answers the signed-in recipient (spec 7.1)')
    expect(
      (me.json() as { pending_invite_count?: unknown }).pending_invite_count,
      '7.1 counts the same surface Q12 lists',
    ).toBe(1)

    const body = await acceptInviteOk(
      recipient,
      inviteId,
      'acceptance by the matched recipient (spec 7.5, 8.7)',
    )
    expect(body.connection_created, 'the pair is minted (spec 8.7)').toBe(true)
    expect(
      await connectionPair(app.db, inviter.id, recipient.id),
      'connection: one row, both rosters (spec 4.2)',
    ).toHaveLength(1)
    expect(
      await membershipUserIds(app.db, folderId),
      'membership: the folder now holds its second member (spec 8.7, INV-10)',
    ).toContain(recipient.id)
    expect(
      await folderInList(recipient, folderId),
      'and the folder is on the recipient\'s own list (spec 5.4)',
    ).toBeDefined()
  })

  test('AC-064: a different account\'s pending list is empty', async () => {
    const { inviter, folderId } = await stage()
    // A second parked invite, so the empty list below is measured while
    // something is genuinely waiting for somebody else.
    const otherEmail = freshEmail('ac064-other')
    const parked = await createInviteOk(
      inviter,
      { email: otherEmail, folder_id: folderId },
      'a second invite parks for a different address (spec 7.5)',
    )

    const bystander = await signInActorWithEmail(
      app,
      'ac064-bystander',
      freshEmail('ac064-bystander'),
    )
    cast.trackUser(bystander.id)
    expect(
      await invitesPending(bystander),
      'the pending list is scoped to the caller\'s own email and nothing else (spec 7.5, 6 Q12)',
    ).toEqual([])

    const theft = await acceptInvite(bystander, parked.id)
    expectStatus(
      theft,
      404,
      'a non-matching recipient reads the invite as nonexistent, never 403 (spec 7.5, 10.2)',
    )
    expect(
      (await requireInviteRow(app.db, parked.id)).status,
      'and the refused attempt moved nothing (spec 5.2)',
    ).toBe('pending')
  })

  test('AC-064 adversarial: a Gmail dot variant is a different address', async () => {
    const { inviteId, email } = await stage()
    // The invite above is already accepted; what this case needs from it is
    // only its address shape. A fresh account whose local part differs by
    // one dot must see nothing and claim nothing: matching is equality and
    // nothing more (spec 8.7), and section 13 item 1 watches this exact bet.
    const [local, domain] = email.split('@') as [string, string]
    const dotted = `${local.slice(0, 2)}.${local.slice(2)}@${domain}`
    const variant = await signInActorWithEmail(app, 'ac064-dotted', dotted)
    cast.trackUser(variant.id)
    expect(
      await invitesPending(variant),
      'the dot variant\'s pending list is empty: no Gmail normalization exists here (spec 8.7)',
    ).toEqual([])
    const claim = await acceptInvite(variant, inviteId)
    expectStatus(
      claim,
      404,
      'and its acceptance attempt reads as nonexistent, whatever the invite\'s state (spec 7.5, 10.2)',
    )
  })

  test('AC-064: invariants hold afterwards', async () => {
    const { inviter, folderId } = await stage()
    await expectFolderInvariants(app.db, [folderId], [inviter.id])
  })
})

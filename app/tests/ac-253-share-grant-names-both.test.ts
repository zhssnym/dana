/*
AC-253: given a folder shared with somebody, then the share-grant email names
the person who shared it and the folder they shared, in its subject and in
both parts, and it says so identically at both of its call sites.

**Both call sites, because item 32 rules one template across two events.**
"`share_grant` stays one template across both its call sites, the direct
member add of 7.4 and the instant-share conversion of 7.5, the ruled sentence
being true of both." So a criterion that asserted only the member add would
leave the conversion free to keep sending "Someone has shared a folder with
you on Dana", which is what both said before this package: the two sites are
`folders.ts:369` and `invites.ts:209`, and neither passed anything but an
address.

**What the two sites have in common is the fixture, not the code path.** One
is a member add against a target already connected; the other is an invite to
a connected person, which 8.7 converts into a membership instead of parking a
row. The person doing the sharing and the folder being shared are the same
facts in both, so the assertion is the same sentence twice and the second case
is the one that would have been missed.

**The subject is asserted as well as the body** because a subject is what a
person decides to open on, and because item 32's subject line is the only
place the folder name and the sharer's name appear together before the message
is opened.

Spec: 5.3, 7.4, 7.5, 8.7 (the conversion), 11.8, 10.7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail } from './auth-harness.js'
import { EmailCast, renderedOf } from './email-harness.js'
import { Cast, connect, expectStatus } from './folders-harness.js'
import { postInvite } from './sharing-harness.js'

let app: AuthTestApp
const cast = new EmailCast('grant')
const extras = new Cast(['convert-target'], 's19-grant')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await extras.cleanup(app.db)
  await cast.cleanup(app.db)
  await app.close()
})

function expectNamesBoth(
  email: OutboundEmail,
  inviterName: string,
  folderName: string,
  site: string,
): void {
  const parts = renderedOf(email)
  for (const [where, body] of [
    ['subject', parts.subject],
    ['HTML part', parts.html],
    ['text part', parts.text],
  ] as const) {
    expect(
      body,
      `item 32: the share grant sent by ${site} names the person who shared, in its ${where}`,
    ).toContain(inviterName)
    expect(
      body,
      `item 32: and names the folder they shared, in its ${where}`,
    ).toContain(folderName)
  }
  expect(
    parts.text,
    `and "Someone has shared a folder with you" is retired at ${site}, the payload now carrying a person`,
  ).not.toContain('Someone')
}

describe('AC-253: a share grant names the sharer and the folder, at both call sites', () => {
  test('AC-253: the 7.4 member add names both', async () => {
    const staged = await cast.of(app)
    expect(
      /share[\s_-]?grant/i.test(staged.shareGrant.template),
      'the member add sends the share-grant template (spec 5.3, 11.8)',
    ).toBe(true)
    expectNamesBoth(
      staged.shareGrant,
      staged.inviterName,
      staged.folderName,
      'the 7.4 member add',
    )
  })

  test('AC-253: the 7.5 instant-share conversion names both', async () => {
    const staged = await cast.of(app)
    const [target] = await extras.of(app)
    if (target === undefined) throw new Error('the extra cast must produce one actor')
    await connect(app.db, staged.inviter.id, target.id)

    const before = app.emails.sent().length
    // Not createInviteOk: 8.7's conversion answers 200 with
    // { converted_to_share, membership } rather than 201 { invite }, there
    // being no invite row to park.
    const response = await postInvite(staged.inviter, {
      email: target.email,
      folder_id: staged.folderId,
    })
    expectStatus(
      response,
      200,
      "8.7's instant share: an invite to a connected person grants the membership instead of parking a row",
    )
    expect(
      (response.json() as { converted_to_share?: unknown }).converted_to_share,
      'and says so, which is what distinguishes this call site from the create one',
    ).toBe(true)
    const produced = app.emails.sent().slice(before)
    expect(
      produced.length,
      'the conversion sends one message (spec 8.7)',
    ).toBe(1)
    const email = produced[0] as OutboundEmail
    expect(
      /share[\s_-]?grant/i.test(email.template),
      'the conversion sends the share grant, never the invite template: there is nothing to accept (spec 8.7)',
    ).toBe(true)
    expect(email.to, 'and it goes to the person who was granted').toBe(
      target.email,
    )
    expectNamesBoth(
      email,
      staged.inviterName,
      staged.folderName,
      'the 7.5 conversion',
    )
  })

  test('AC-253 adversarial: the two sites render the same words for the same facts', async () => {
    await cast.of(app)
    const grants = app.emails
      .sent()
      .filter((email) => /share[\s_-]?grant/i.test(email.template))
    expect(
      grants.length,
      'this file made exactly two share grants, one per call site',
    ).toBe(2)
    const subjects = grants.map((email) => renderedOf(email).subject)
    expect(
      subjects[0],
      'item 32 rules one template for both sites, so the same folder shared by the same person reads identically whichever route granted it',
    ).toBe(subjects[1])
  })
})

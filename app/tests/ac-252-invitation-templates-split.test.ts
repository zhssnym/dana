/*
AC-252: given a folder invitation and a bare connection invitation, then the
two are sent under different template names, so the 11.10 sink can tell them
apart; and each names the person who sent it and says what it invites to, the
folder invitation naming the folder and the connection invitation naming no
folder at all.

**Why the split is a criterion and not an implementation detail.** 7.5 makes
`folder_id` optional, so one endpoint produces two genuinely different events,
and until this package both were sent as `invite`. 11.8's template name is
what the acceptance suite counts sends through, the 11.10 sink reading a
message's template and its recipient and nothing else, so under one name **no
criterion could tell a folder invitation from a connection invitation**. This
one can, which is the testability half of Imran's ruling at RFC 0005 change
control item 32, and it is the half that makes the split worth its cost.

**The naming half is what the payload widening bought.** Before this package
the invite template rendered "Someone has invited you to share a list on
Dana", and it could not do better: `OutboundMessage` was `{template, to,
reminder?}` and the call sites passed a recipient and nothing else. So the
assertions below are as much about the route as about the template, and a
template that hardcoded a person's name would fail the second case, where a
second inviter's invitation must name the second inviter.

**The resend case exists because there are three invite-bearing call sites and
item 32 names one.** `invites.ts:474` resends a parked invite, splits on the
same `folder_id`, and would have gone on saying "Someone" had this package
widened only the two sites the ruling counts (RFC 0005 change control item
34). 5.2's 24-hour window is reached by backdating the anchor, the standing
convention for it.

**"Someone" is not deleted, it is demoted.** Item 32 keeps it as the fallback
for a `display_name` that cannot be resolved, 8.10 being able to scrub an
account between the act and the send. The last case asserts exactly that: with
the inviter's name gone, the sentence still stands and no undefined reaches a
person.

Spec: 5.2, 7.5, 8.7 (which invite is which), 11.8 (the template list, now
four), 11.10 (what a criterion may observe), 10.7.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { sql } from 'drizzle-orm'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { EmailCast, renderedOf } from './email-harness.js'
import { expectStatus } from './folders-harness.js'
import { backdateLastSent, resendInvite } from './sharing-harness.js'

let app: AuthTestApp
const cast = new EmailCast('split')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-252: the two invitations are two templates, and each names its own', () => {
  test('AC-252: the folder invitation and the connection invitation carry different template names', async () => {
    const staged = await cast.of(app)
    expect(
      staged.folderInvite.template,
      'the 11.10 sink reads a template name, and a folder invitation must be tellable from a connection invitation by it (item 32)',
    ).not.toBe(staged.connectionInvite.template)
    expect(
      staged.folderInvite.template,
      'the folder invitation names a folder in its template (spec 11.8, four templates since item 32)',
    ).toMatch(/invite[\s_-]?folder/i)
    expect(
      staged.connectionInvite.template,
      'the bare invitation, whose folder_id is null (7.5), names a connection in its template',
    ).toMatch(/invite[\s_-]?connection/i)
  })

  test('AC-252 adversarial: both still answer the harness invite matcher, so no existing criterion lost its count', async () => {
    const staged = await cast.of(app)
    for (const email of [staged.folderInvite, staged.connectionInvite]) {
      expect(
        /invite/i.test(email.template),
        'the sharing harness counts invite sends by the word, which is the tolerance the split relies on (spec 5.2, AC-059 to AC-068)',
      ).toBe(true)
    }
    expect(
      /share[\s_-]?grant/i.test(staged.folderInvite.template),
      'and neither new name may be mistaken for a share grant, which the auth harness matches the same way',
    ).toBe(false)
  })

  test('AC-252: the folder invitation names the inviter and the folder', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.folderInvite)
    for (const [where, body] of [
      ['subject', parts.subject],
      ['HTML part', parts.html],
      ['text part', parts.text],
    ] as const) {
      expect(
        body,
        `item 32: the folder invitation's ${where} names the person who sent it`,
      ).toContain(staged.inviterName)
      expect(
        body,
        `item 32: and names the folder it invites to (${where})`,
      ).toContain(staged.folderName)
    }
    expect(
      parts.text,
      'and "Someone" is no longer the sentence: it is the fallback for a name that cannot be resolved',
    ).not.toContain('Someone')
  })

  test('AC-252: the connection invitation names the inviter and no folder', async () => {
    const staged = await cast.of(app)
    const parts = renderedOf(staged.connectionInvite)
    for (const [where, body] of [
      ['subject', parts.subject],
      ['HTML part', parts.html],
      ['text part', parts.text],
    ] as const) {
      expect(
        body,
        `item 32: the connection invitation's ${where} names the person who sent it`,
      ).toContain(staged.inviterName)
      expect(
        body,
        `item 32: a bare invitation has no folder to name, and naming this file's folder in the ${where} would be an invitation to a folder nobody was invited to`,
      ).not.toContain(staged.folderName)
    }
    expect(
      parts.text,
      'a connection invitation invites the reader to connect, which is what 7.5 creates when folder_id is absent',
    ).toMatch(/connect/i)
  })

  test('AC-252 adversarial: a resend of the folder invitation is the same template and still names both', async () => {
    const staged = await cast.of(app)
    await backdateLastSent(app.db, staged.folderInviteId, 25)
    const before = app.emails.sent().length
    const response = await resendInvite(staged.inviter, staged.folderInviteId)
    expectStatus(
      response,
      200,
      '5.2 admits a resend once the 24-hour window has passed',
    )
    const resent = app.emails.sent().slice(before)
    expect(
      resent.length,
      'one resend, one message (spec 5.2)',
    ).toBe(1)
    const email = resent[0]
    expect(
      email?.template,
      'the resend site splits on the same folder_id the create site splits on (RFC 0005 change control item 34)',
    ).toMatch(/invite[\s_-]?folder/i)
    const parts = renderedOf(email as (typeof resent)[number])
    expect(parts.subject, 'and it still names the inviter').toContain(
      staged.inviterName,
    )
    expect(parts.subject, 'and still names the folder').toContain(
      staged.folderName,
    )
  })

  test('AC-252 adversarial: a scrubbed inviter falls back to "Someone" rather than to nothing', async () => {
    const staged = await cast.of(app)
    // 8.10 step 7 scrubs an account's display_name, and a parked invite it
    // created outlives it. Item 32 keeps "Someone" for exactly this.
    await app.db.execute(
      sql`UPDATE users SET display_name = NULL WHERE id = ${staged.inviter.id}`,
    )
    try {
      await backdateLastSent(app.db, staged.connectionInviteId, 25)
      const before = app.emails.sent().length
      const response = await resendInvite(
        staged.inviter,
        staged.connectionInviteId,
      )
      expectStatus(response, 200, '5.2 admits the resend')
      const email = app.emails.sent().slice(before)[0]
      const parts = renderedOf(email as NonNullable<typeof email>)
      expect(
        `${parts.subject} ${parts.text}`,
        'item 32: "Someone" survives as the fallback when a display_name cannot be resolved',
      ).toContain('Someone')
      expect(
        `${parts.subject} ${parts.text}`,
        'and nothing renders as undefined or null to a person',
      ).not.toMatch(/undefined|null/)
    } finally {
      await app.db.execute(
        sql`UPDATE users SET display_name = ${staged.inviterName} WHERE id = ${staged.inviter.id}`,
      )
    }
  })
})

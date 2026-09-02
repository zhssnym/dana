/*
AC-346: given a Google subject Dana has never seen whose verified email
already belongs to a live account, when the callback runs, then sign-in is
refused with 9.2's claimed-email page, no session is established, no second
user row exists, and the existing account is untouched; given the address
released by that account's deletion, then a new subject takes it and
provisions normally; given a dot variant of a claimed Gmail address, then it
is a different address and provisions its own account, no normalisation
existing.

Issue #17, ruled by Imran on 2026-09-03: Dana never joins two accounts because
their addresses look alike, so the behaviour does not change and the
explanation is what was missing. Both halves are asserted, and the second is
the reason this criterion is not simply "refuse".

**The refusal is asserted as words, not as a status.** A callback that
answered 403 with a blank body would satisfy every assertion about failure and
would be the thing this criterion exists to replace: before today the person
was bounced to the landing page with `?signin=failed` and nothing else. So the
9.2 copy is compared exactly, against the words a reader would see, as AC-008
does for the other rejection page, and the support address is asserted to be a
reachable action rather than a sentence.

**The two negative controls are the ones that make the guard worth having.**
An implementation that refuses any sign-in whose address is already in the
table would refuse every returning login, so the original account signs in
again afterwards. And an implementation that reached for the naive Gmail
normalisation would merge the dotted variant into the existing account, which
is exactly what the ruling defers: the dot variant must provision its own
account, because Dana does no normalisation at all (10.1, 8.7).

The deletion case is here because it is the one way an address legitimately
becomes free again: 8.10 step 7 scrubs the email and sets deleted_at, and
`users_email_active_idx` is partial on `deleted_at IS NULL`. A guard written
without that predicate would lock the address away for ever.

Spec: 10.1 (the rule and the deferral), 9.2 (the copy), 7.1, 8.10 step 7,
8.7 (matching is equality and nothing more), 11.6.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { SUPPORT_EMAIL } from '../src/shared/support.js'
import {
  attemptSignIn,
  cleanupAuthSubs,
  expectNoSession,
  rawRequest,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
  visibleText,
} from './auth-harness.js'
import type { AuthTestApp, RawResponse, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac346-${randomUUID()}.test`
const firstSub = `sub-first-${randomUUID()}`
const secondSub = `sub-second-${randomUUID()}`
const dottedSub = `sub-dotted-${randomUUID()}`
const doomedSub = `sub-doomed-${randomUUID()}`
const heirSub = `sub-heir-${randomUUID()}`

// Section 9.2, verbatim. Copy in section 9 is normative.
const HEADING = 'This email already has an account'
const BODY =
  'An account already uses this email address, and Dana never joins two ' +
  'accounts together. Sign in with the Google account you used the first ' +
  `time. If that still does not get you in, write to ${SUPPORT_EMAIL} and a ` +
  'person will answer.'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [
    firstSub,
    secondSub,
    dottedSub,
    doomedSub,
    heirSub,
  ])
  await app.close()
})

/**
 * The refusal as the person meets it: either the page itself, or one
 * same-origin redirect to it. AC-008's shape, for the same reason: 9.2 says
 * the callback renders it, and rendering it after a redirect is the same
 * product behaviour.
 */
async function refusalPage(callback: RawResponse): Promise<RawResponse> {
  if (callback.contentType.includes('text/html')) return callback
  expect(
    callback.location,
    'the refusal neither rendered a page nor redirected to one (spec 9.2)',
  ).not.toBeNull()
  const target = new URL(callback.location ?? '', app.origin)
  expect(
    target.origin,
    'the refusal redirected off the application origin',
  ).toBe(app.origin)
  return rawRequest(target)
}

describe('AC-346: a second Google account on a claimed email', () => {
  test('AC-346: it is refused, explained, and nothing is created', async () => {
    const claimed = `taken@${domain}`
    app.stub.nextIdentity({
      sub: firstSub,
      email: claimed,
      email_verified: true,
      name: 'First Arrival',
    })
    await signIn(app)
    const before = await userForSub(app.db, firstSub)
    expect(before, 'the first account must exist before the collision').toBeDefined()

    app.stub.nextIdentity({
      sub: secondSub,
      email: claimed,
      email_verified: true,
      name: 'Second Google Account',
    })
    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'the email already belongs to another account')
    expect(
      await usersForSub(app.db, secondSub),
      'a refused sign-in created a second user row (spec 10.1)',
    ).toHaveLength(0)
    expect(
      await userForSub(app.db, firstSub),
      'the refused sign-in touched the account that holds the address (spec 10.1)',
    ).toEqual(before as UserRow)

    const page = await refusalPage(callback)
    const text = visibleText(page.body)
    expect(
      text,
      `the 9.2 claimed-email heading is missing; the person was told only that sign-in failed: ${text}`,
    ).toContain(HEADING)
    expect(text, 'the 9.2 body copy is missing or reworded').toContain(BODY)

    const links = [
      ...page.body.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ]
    const support = links.find((link) =>
      (link[1] ?? '').startsWith(`mailto:${SUPPORT_EMAIL}`),
    )
    expect(
      support,
      `the ruling asks the page to point at support; found ${JSON.stringify(links.map((link) => link[1]))}`,
    ).toBeDefined()
    const back = links.find((link) => visibleText(link[2] ?? '') === 'Back to Dana')
    expect(back, 'and 9.2 gives it a way back to the landing page').toBeDefined()
    expect(
      new URL(back?.[1] ?? '', app.origin).pathname,
      'which returns to the landing page (spec 9.2)',
    ).toBe('/')
  })

  test('AC-346 negative control: the original account still signs in', async () => {
    // A guard that refused any address already in the users table would
    // refuse every returning login, and the case above cannot tell the two
    // apart. This one can.
    app.stub.nextIdentity({
      sub: firstSub,
      email: `taken@${domain}`,
      email_verified: true,
      name: 'First Arrival',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'the account that holds the address goes on signing in (spec 7.1)',
    ).not.toBe('')
    expect(
      await usersForSub(app.db, firstSub),
      'and it is still one account, adopted rather than created again (spec 7.1, INV-2)',
    ).toHaveLength(1)
  })

  test('AC-346: a Gmail dot variant is a different address and provisions', async () => {
    // 8.7 and 10.1: matching is equality and nothing more, and the dotted
    // question is deferred rather than answered by normalisation. An
    // implementation that stripped dots would refuse this sign-in, or worse,
    // hand this person the other account.
    const [local, host] = `dotted@${domain}`.split('@') as [string, string]
    const variant = `${local.slice(0, 3)}.${local.slice(3)}@${host}`

    app.stub.nextIdentity({
      sub: doomedSub,
      email: `${local}@${host}`,
      email_verified: true,
      name: 'Undotted Person',
    })
    await signIn(app)

    app.stub.nextIdentity({
      sub: dottedSub,
      email: variant,
      email_verified: true,
      name: 'Dotted Person',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'the dot variant is a different address and gets its own account (spec 10.1, 8.7)',
    ).not.toBe('')
    const dotted = await usersForSub(app.db, dottedSub)
    expect(dotted, 'exactly one account for the dotted subject').toHaveLength(1)
    expect(
      String(dotted[0]?.id),
      'and it is not the undotted person’s account: nothing was joined (Imran’s ruling on issue #17)',
    ).not.toBe(String((await userForSub(app.db, doomedSub))?.id))
  })

  test('AC-346: an address released by account deletion is claimable again', async () => {
    const released = `released@${domain}`
    app.stub.nextIdentity({
      sub: heirSub,
      email: released,
      email_verified: true,
      name: 'Temporary Holder',
    })
    const holder = await signIn(app)
    const deletion = await holder.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expect(
      deletion.status,
      `the account deletes with the literal confirm (spec 7.1); answered ${String(deletion.status)}`,
    ).toBe(204)

    // 8.10 step 7 nulls the email and stamps deleted_at, and
    // users_email_active_idx is partial on deleted_at IS NULL, so the address
    // is free. A collision guard written without that predicate would hold it
    // for ever.
    const fresh = `sub-heir-again-${randomUUID()}`
    app.stub.nextIdentity({
      sub: fresh,
      email: released,
      email_verified: true,
      name: 'New Holder',
    })
    const { session } = await signIn(app)
    expect(
      session.value,
      'a deleted account releases its address (spec 8.10 step 7, 10.1)',
    ).not.toBe('')
    await cleanupAuthSubs(app.db, [fresh])
  })
})

/*
AC-008: given Google reports the email unverified, when the callback runs,
then sign-in is refused with the explanation page and no rows are created.

Section 10.1 states the rule without qualification: "Sign-ins with an
unverified Google email are rejected." The criterion is phrased around a first
sign-in, so it says "no rows are created", but the rule it comes from is not
limited to first sign-ins. The returning-account case is therefore asserted
too, with the stronger statement the situation allows: not merely that no rows
were created, but that the existing row is untouched. An implementation that
checks email_verified only on the provisioning branch passes the criterion as
literally written and still lets an unverified claim take over an existing
account, which is the attack worth closing.

Section 13 item 9 records the assumption behind this: every allowed Google
sign-in is expected to supply a verified email, and this rejection is the
containment if a Workspace edge case ever supplies otherwise.

What is asserted about the page is that a page is what comes back rather than
a session. The normative copy for it does not exist: section 9.2 describes the
landing and login screens and names no explanation page, so its wording is
escalated rather than invented here.

Spec: 7.1, 10.1, section 13 item 9.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  attemptSignIn,
  cleanupAuthSubs,
  expectNoSession,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp, RawResponse, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac008-${randomUUID()}.test`
const strangerSub = `sub-unverified-${randomUUID()}`
const returningSub = `sub-returning-${randomUUID()}`
const verifiedSub = `sub-verified-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [strangerSub, returningSub, verifiedSub])
  await app.close()
})

/**
 * A refusal reaches the person as something readable, either directly or by
 * sending them somewhere on this origin that is. The wording is held; that
 * the answer is a page and not a session is not.
 */
function expectExplanationPage(callback: RawResponse): void {
  const isPage = callback.contentType.includes('text/html')
  const isSameOriginRedirect =
    callback.status >= 300 &&
    callback.status < 400 &&
    callback.location !== null &&
    new URL(callback.location, app.origin).origin === app.origin
  expect(
    isPage || isSameOriginRedirect,
    `a refused sign-in must answer with the explanation page (spec 10.1), got ${String(callback.status)} ${callback.contentType}`,
  ).toBe(true)
}

describe('AC-008: an unverified Google email is refused', () => {
  test('AC-008: sign-in is refused and no rows are created', async () => {
    app.stub.nextIdentity({
      sub: strangerSub,
      email: `unverified@${domain}`,
      email_verified: false,
      name: 'Unverified Person',
    })

    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'Google reported the email unverified')
    expectExplanationPage(callback)
    expect(
      await usersForSub(app.db, strangerSub),
      'a refused sign-in created a user row (spec 10.1)',
    ).toHaveLength(0)
  })

  test('AC-008 adversarial: an unverified claim cannot take over an existing account', async () => {
    // The account is established normally first, so the second attempt
    // exercises the login branch rather than the provisioning branch.
    app.stub.nextIdentity({
      sub: returningSub,
      email: `returning@${domain}`,
      email_verified: true,
      name: 'Verified Once',
    })
    await signIn(app)
    const before = await userForSub(app.db, returningSub)
    expect(before, 'the account must exist before the attack').toBeDefined()

    app.stub.nextIdentity({ email_verified: false, name: 'Impostor' })
    const { callback } = await attemptSignIn(app)

    expectNoSession(callback, 'the returning account reported an unverified email')
    const after = await userForSub(app.db, returningSub)
    expect(
      after,
      'the refused sign-in modified the existing account (spec 10.1)',
    ).toEqual(before as UserRow)
  })

  test('AC-008 positive control: a verified email signs in', async () => {
    // Without this, every assertion above is satisfied by a callback that
    // refuses everyone.
    app.stub.nextIdentity({
      sub: verifiedSub,
      email: `verified@${domain}`,
      email_verified: true,
      name: 'Verified Person',
    })

    const { session } = await signIn(app)
    expect(session.value).not.toBe('')
    expect(await usersForSub(app.db, verifiedSub)).toHaveLength(1)
  })
})

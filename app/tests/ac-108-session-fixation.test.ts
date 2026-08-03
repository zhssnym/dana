/*
AC-108: given a session identifier that existed before sign-in, when sign-in
completes, then the authenticated session uses a newly issued identifier and
the old identifier grants nothing.

This is session fixation. The attack is to get a value of your choosing into
someone's cookie jar before they sign in, and then, once they have, to use
that same value yourself. It costs nothing to prevent and everything to miss,
and it is invisible to every other criterion in this package: a server that
adopts whatever identifier arrives passes AC-005 through AC-010 and AC-110
without a mark.

Three shapes, because 11.6 states the rule twice and each half needs its own
case. "A fresh identifier is issued at every sign-in" is one statement; "no
pre-authentication session identifier is ever promoted" is another. A planted
value covers the first, the server's own pre-callback cookies cover the
second, and two consecutive sign-ins cover a server that issues one stable
identifier per account, which would satisfy both of the others by accident
while making every session identifier guessable from any earlier one.

The cookie's name is learned from a real sign-in rather than assumed, since
11.6 fixes the cookie's properties and not its name.

Spec: 11.6, 10.1.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  beginAuthorization,
  cleanupAuthSubs,
  completeCallback,
  followAuthorization,
  sessionCookieFrom,
  signIn,
  startAuthTestApp,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac108-${randomUUID()}.test`
const sub = `sub-fixation-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `fixated@${domain}`,
    email_verified: true,
    name: 'Fixation Target',
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

describe('AC-108: sign-in issues a new session identifier', () => {
  test('AC-108: a value planted before sign-in is neither adopted nor honored', async () => {
    // What the cookie is called is the implementation's business; a real
    // sign-in is what reveals it.
    const learn = await signIn(app)
    const cookieName = learn.session.name

    const planted = `attacker-chosen-${randomUUID()}`
    const victim = app.browser()
    victim.plant(cookieName, planted)

    const authorization = await beginAuthorization(app, victim)
    const callbackUrl = await followAuthorization(app, authorization)
    const callback = await completeCallback(victim, callbackUrl)
    const session = await sessionCookieFrom(app, victim, callback)

    expect(
      session.value,
      'the session adopted the identifier planted before sign-in (spec 11.6)',
    ).not.toBe(planted)

    // And the planted value must be worth nothing on its own.
    const attacker = app.browser()
    attacker.plant(cookieName, planted)
    expect(
      (await attacker.api('/me')).status,
      'the pre-sign-in identifier still grants access after sign-in completed',
    ).toBe(401)
  })

  test('AC-108 adversarial: no cookie the server set before the callback is promoted', async () => {
    // The other half of 11.6: the pre-authentication cookie that carries the
    // state, nonce, and verifier must not become the session. Whatever the
    // server sets on the way out is compared against what it sets on the way
    // back in.
    const browser = app.browser()
    const authorization = await beginAuthorization(app, browser)
    const preCallback = browser.cookies().map((cookie) => cookie.value)
    expect(
      preCallback.length,
      'the authorization request set no cookie, so state, nonce, and the PKCE verifier are being kept somewhere this test cannot see (spec 11.6)',
    ).toBeGreaterThan(0)

    const callbackUrl = await followAuthorization(app, authorization)
    const callback = await completeCallback(browser, callbackUrl)
    const session = await sessionCookieFrom(app, browser, callback)

    expect(
      preCallback,
      'the session identifier is a value the server had already issued before authentication (spec 11.6)',
    ).not.toContain(session.value)
  })

  test('AC-108 adversarial: two sign-ins by one account get two identifiers', async () => {
    // A stable per-account identifier satisfies both tests above by accident
    // and makes every future session predictable from any past one.
    const first = await signIn(app)
    const second = await signIn(app)
    expect(
      second.session.value,
      'a second sign-in reissued the same identifier: 11.6 requires a fresh one at every sign-in',
    ).not.toBe(first.session.value)
  })
})

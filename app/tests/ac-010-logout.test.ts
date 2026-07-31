/*
AC-010: given a session, when POST /auth/logout, then the next API call
returns 401.

The criterion is two assertions and one trap. The trap is that "the next API
call returns 401" is satisfied trivially by a session that never worked, so
this file proves the session authenticates before destroying it. Without that,
a suite would report AC-010 green against an implementation whose sessions do
nothing at all.

The adversarial case is the scope of the destruction. Section 10.1 draws the
distinction in two clauses: "Sign-out destroys the session; account deletion
destroys all sessions (8.10)". Singular against plural. An implementation that
deletes every row for the user on logout satisfies the criterion as written
and signs the person out of their other devices, which is a real behavior
change no other criterion in this package would catch. AC-112 holds the other
side of the pair.

Requests carry a CSRF token: logout is a mutation, 7.0 requires the header on
mutations, and an omitted one would answer 403 and make this file red for a
reason unrelated to logout.

Spec: 7.1, 10.1, 11.6.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  authUrl,
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac010-${randomUUID()}.test`
const sub = `sub-logout-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `signer@${domain}`,
    email_verified: true,
    name: 'Signing Out',
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

describe('AC-010: logout destroys the session', () => {
  test('AC-010: after POST /auth/logout the next API call answers 401', async () => {
    const { browser } = await signIn(app)

    const before = await browser.api('/me')
    expect(
      before.status,
      'the session must authenticate before logout, or the 401 below proves nothing',
    ).toBe(200)

    const logout = await browser.request(await authUrl(app, '/auth/logout'), {
      method: 'POST',
    })
    expect(logout.status, 'POST /auth/logout answers 204 (spec 7.1)').toBe(204)

    const after = await browser.api('/me')
    expect(after.status, 'the destroyed session must answer 401').toBe(401)
  })

  test('AC-010 adversarial: the destroyed identifier stays dead when replayed', async () => {
    const { browser, session } = await signIn(app)
    expect((await browser.api('/me')).status).toBe(200)

    await browser.request(await authUrl(app, '/auth/logout'), { method: 'POST' })

    // A logout that only clears the cookie, leaving the row live, would let a
    // copy of the identifier keep working. Cookie clearing is not revocation.
    const replay = app.browser()
    replay.plant(session.name, session.value)
    const response = await replay.api('/me')
    expect(
      response.status,
      'the session identifier still authenticates after logout: the cookie was cleared but the session was not destroyed (spec 10.1)',
    ).toBe(401)
  })

  test('AC-010 adversarial: logout destroys one session, not every session', async () => {
    // Section 10.1: sign-out destroys "the session", account deletion
    // destroys "all sessions". The plural belongs to AC-112 alone.
    const first = await signIn(app)
    const second = await signIn(app)
    expect((await first.browser.api('/me')).status).toBe(200)
    expect((await second.browser.api('/me')).status).toBe(200)

    await first.browser.request(await authUrl(app, '/auth/logout'), {
      method: 'POST',
    })

    expect((await first.browser.api('/me')).status).toBe(401)
    expect(
      (await second.browser.api('/me')).status,
      'logging out of one client signed the person out of the other (spec 10.1)',
    ).toBe(200)
  })
})

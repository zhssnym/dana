/*
AC-111: given a mutation with a valid session cookie but a missing or
mismatched X-CSRF-Token header, when processed, then 403 and no change; given
the session's own token, then the mutation proceeds.

Section 11.6 fixes the mechanism as double submit: "a token bound to the
session is set in a second, non-httpOnly cookie, and every mutation must echo
it in the X-CSRF-Token header; missing or mismatched answers 403 with no side
effects." Bound to the session is the phrase that decides how this file is
written. A server that checks only that the header equals the cookie is
implementing a pattern that a subdomain or a cookie-injection bug defeats,
because the attacker who can set the cookie can also set the header to match
it. So the mutation is also attempted with one account's session cookie and
another account's token, and with a token that is well formed but belongs to
nobody.

"No change" is asserted against the stored row rather than the response,
because a 403 returned after the write is still a write.

The mutation under test is PATCH /me { timezone }, which is the only mutation
7.1 gives this package that has an observable effect on a row.

Spec: 11.6, 7.0, 10.1, 11.3.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
  userForSub,
} from '../support/auth-harness.js'
import type { AuthTestApp, SignedIn, UserRow } from '../support/auth-harness.js'

let app: AuthTestApp
const domain = `ac111-${randomUUID()}.test`
const subjectSub = `sub-csrf-${randomUUID()}`
const otherSub = `sub-csrf-other-${randomUUID()}`

// Two real IANA zones so the mutation is valid on its own terms and any 422
// is a finding rather than an expected outcome (7.1).
const SETTLED = 'Asia/Karachi'
const ATTEMPTED = 'Europe/London'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [subjectSub, otherSub])
  await app.close()
})

let subject: SignedIn | undefined

async function signedInSubject(): Promise<SignedIn> {
  if (subject === undefined) {
    app.stub.nextIdentity({
      sub: subjectSub,
      email: `subject@${domain}`,
      email_verified: true,
      name: 'CSRF Subject',
    })
    subject = await signIn(app)
    // A known starting value, so "no change" below is a comparison against
    // something this file chose rather than against whatever provisioning
    // happened to store.
    const settle = await subject.browser.json('/me', 'PATCH', {
      timezone: SETTLED,
    })
    expect(
      settle.status,
      'PATCH /me with a valid token and a valid IANA zone must answer 200 (spec 7.1)',
    ).toBe(200)
  }
  return subject
}

async function currentTimezone(): Promise<string> {
  const user = await userForSub(app.db, subjectSub)
  expect(user, 'the subject account must exist').toBeDefined()
  return (user as UserRow).timezone
}

describe('AC-111: mutations require the session\'s own CSRF token', () => {
  test('AC-111: a mutation with no X-CSRF-Token answers 403 and changes nothing', async () => {
    const signedIn = await signedInSubject()
    const before = await currentTimezone()

    const response = await signedIn.browser.json(
      '/me',
      'PATCH',
      { timezone: ATTEMPTED },
      { csrf: 'omit' },
    )

    expect(
      response.status,
      'a mutation without the CSRF header must answer 403 (spec 11.6)',
    ).toBe(403)
    expect(
      await currentTimezone(),
      'the mutation was applied despite answering 403: 11.6 requires no side effects',
    ).toBe(before)
  })

  test('AC-111: a mismatched X-CSRF-Token answers 403 and changes nothing', async () => {
    const signedIn = await signedInSubject()
    const before = await currentTimezone()

    for (const token of [`forged-${randomUUID()}`, '', 'null', signedIn.session.value]) {
      const response = await signedIn.browser.json(
        '/me',
        'PATCH',
        { timezone: ATTEMPTED },
        { csrf: token },
      )
      expect(
        response.status,
        `X-CSRF-Token ${JSON.stringify(token)} is not this session's token and must answer 403`,
      ).toBe(403)
    }
    expect(await currentTimezone()).toBe(before)
  })

  test('AC-111 adversarial: another session\'s token does not authorize this session', async () => {
    // The token must be bound to the session, not merely equal to some token
    // the server has issued. A server that keeps one global token, or that
    // only checks the header against the cookie, fails here and nowhere else.
    const signedIn = await signedInSubject()
    const before = await currentTimezone()

    app.stub.nextIdentity({
      sub: otherSub,
      email: `other@${domain}`,
      email_verified: true,
      name: 'Other Account',
    })
    const other = await signIn(app)

    const response = await signedIn.browser.json(
      '/me',
      'PATCH',
      { timezone: ATTEMPTED },
      { csrf: other.csrf.value },
    )
    expect(
      response.status,
      'a token issued to a different session was accepted (spec 11.6: the token is bound to the session)',
    ).toBe(403)
    expect(await currentTimezone()).toBe(before)
  })

  test('AC-111: the session\'s own token lets the mutation proceed', async () => {
    // Without this, every 403 above is satisfied by an endpoint that refuses
    // every mutation it is ever sent.
    const signedIn = await signedInSubject()

    const response = await signedIn.browser.json('/me', 'PATCH', {
      timezone: ATTEMPTED,
    })
    expect(
      response.status,
      'a mutation carrying the session\'s own CSRF token must proceed (spec 11.6)',
    ).toBe(200)
    expect(
      await currentTimezone(),
      'the mutation answered 200 without changing the row',
    ).toBe(ATTEMPTED)

    // Put it back, so the ordering of tests in this file cannot matter.
    await signedIn.browser.json('/me', 'PATCH', { timezone: SETTLED })
  })

  test('AC-111 adversarial: an unauthenticated mutation answers 401, not 403', async () => {
    // Section 11.3 fixes the middleware order as session, then CSRF. A
    // request with no session must be turned away for having no session:
    // answering 403 would tell an unauthenticated caller that their CSRF
    // token was the only thing missing.
    const stranger = app.browser()
    const response = await stranger.json(
      '/me',
      'PATCH',
      { timezone: ATTEMPTED },
      { csrf: 'omit' },
    )
    expect(
      response.status,
      'an unauthenticated mutation must answer 401 (spec 7.0), which is also the 11.3 middleware order',
    ).toBe(401)
  })

  test('AC-111 adversarial: reads do not require the token', async () => {
    // 7.0 requires the header on mutations. A blanket check would also break
    // every page load, so the negative half is worth pinning.
    const signedIn = await signedInSubject()
    const response = await signedIn.browser.api('/me', { csrf: 'omit' })
    expect(
      response.status,
      'a GET must not require a CSRF token (spec 7.0: mutations only)',
    ).toBe(200)
  })
})

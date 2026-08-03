/*
AC-110: given the session cookie, when inspected, then it is httpOnly, Secure,
and SameSite=Lax, and its value is an opaque identifier carrying no session
data.

The flags come straight from 10.1 and 11.6 and are asserted on the Set-Cookie
line as sent, not on a parsed approximation of it, because SameSite=Strict and
SameSite=None are both wrong and both would survive a test that only asked
whether a SameSite attribute was present.

Opacity is the half that takes work. "Carrying no session data" is a claim
about what the value is, and the cheap version, checking the value is not a
JSON Web Token, misses the encoding an implementation is most likely to reach
for, which is base64 of a JSON object. So the value is searched for the
account's identifiers directly and then decoded and searched again. A value
that yields the user id, the email, or the google_sub under any of those
readings is a session carried in the cookie rather than referenced by it,
which is what 10.1's server-side session model exists to avoid.

One assertion here is also the harness checking itself: removing the cookie
identified as the session must produce a 401. If it does not, the wrong cookie
was identified and every other file that relies on that identification is
resting on nothing.

Secure is asserted although the suite speaks plain http. That is deliberate:
the attribute is a property of the cookie the server sets, not of the
connection, and an implementation that sets it only when it believes the
request arrived over TLS ships a session cookie without it whenever a proxy
terminates TLS ahead of it.

Spec: 10.1, 11.6.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
  userForSub,
} from './auth-harness.js'
import type { AuthTestApp, SignedIn, UserRow } from './auth-harness.js'

let app: AuthTestApp
let session: SignedIn | undefined
const domain = `ac110-${randomUUID()}.test`
const sub = `sub-cookie-${randomUUID()}`
const email = `cookie.holder@${domain}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

async function established(): Promise<SignedIn> {
  if (session === undefined) {
    app.stub.nextIdentity({ sub, email, email_verified: true, name: 'Cookie Holder' })
    session = await signIn(app)
  }
  return session
}

/**
 * Every reading of the value an implementation might have chosen: the raw
 * text, the whole value decoded, and each dot or colon separated segment
 * decoded, which is how signed cookies and tokens are usually shaped.
 */
function readings(value: string): string[] {
  const out = [value]
  const decode = (part: string): void => {
    for (const encoding of ['base64url', 'base64'] as const) {
      try {
        const text = Buffer.from(part, encoding).toString('utf8')
        if (text !== '') out.push(text)
      } catch {
        // Not decodable under this encoding, which is itself fine.
      }
    }
  }
  decode(value)
  for (const part of value.split(/[.:|]/)) {
    if (part !== '') decode(part)
  }
  return out
}

describe('AC-110: the session cookie is flagged and opaque', () => {
  test('AC-110: the cookie is httpOnly, Secure, and SameSite=Lax', async () => {
    const { session: cookie } = await established()

    expect(
      cookie.httpOnly,
      `the session cookie is not httpOnly (spec 10.1): ${cookie.raw}`,
    ).toBe(true)
    expect(
      cookie.secure,
      `the session cookie is not Secure (spec 10.1): ${cookie.raw}`,
    ).toBe(true)
    // Strict would break the redirect back from Google; None would remove the
    // cross-site protection entirely. The specification names one value.
    expect(
      cookie.sameSite?.toLowerCase(),
      `the session cookie must be SameSite=Lax (spec 10.1): ${cookie.raw}`,
    ).toBe('lax')
  })

  test('AC-110: the value is opaque and carries no session data', async () => {
    const { session: cookie } = await established()
    const user = await userForSub(app.db, sub)
    expect(user, 'the account must exist for its identifiers to be searched for').toBeDefined()
    const row = user as UserRow

    const texts = readings(cookie.value)
    for (const secret of [row.id, row.email ?? '', sub, row.display_name ?? '']) {
      if (secret === '') continue
      for (const text of texts) {
        expect(
          text,
          `the session cookie carries ${secret} in its value: the session is being transported rather than referenced (spec 10.1)`,
        ).not.toContain(secret)
      }
    }

    // The shape check is secondary but names the specific mistake: a JWT is
    // session data by construction, however well signed.
    expect(
      cookie.value,
      'the session cookie value is a JSON Web Token, not an opaque identifier (spec 11.6)',
    ).not.toMatch(/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./)
  })

  test('AC-110: the CSRF token rides in a second, readable cookie', async () => {
    const { csrf } = await established()
    // 11.6: "a token bound to the session is set in a second, non-httpOnly
    // cookie". If it were httpOnly the client could not echo it, and the
    // double-submit pattern would be inoperable.
    expect(
      csrf.httpOnly,
      `the CSRF cookie must be readable by the client (spec 11.6): ${csrf.raw}`,
    ).toBe(false)
    expect(csrf.value, 'the CSRF cookie carries no token').not.toBe('')
    expect(
      csrf.value,
      'the CSRF token is the session identifier: knowing one must not give the other',
    ).not.toBe((await established()).session.value)
  })

  test('AC-110: the identified cookie is the one that authenticates', async () => {
    // Proof that the identification the whole suite relies on is right: drop
    // that one cookie, keep the rest, and access must end.
    const { browser, session: cookie } = await established()
    expect((await browser.api('/me')).status).toBe(200)

    const without = browser.clone()
    without.forget(cookie.name)
    expect(
      (await without.api('/me')).status,
      'removing the cookie identified as the session did not end access, so the identification is wrong',
    ).toBe(401)
  })

  test('AC-110 adversarial: a forged identifier of the right shape grants nothing', async () => {
    const { session: cookie } = await established()
    const forged = app.browser()
    // Same length and alphabet, different bytes: a server comparing anything
    // other than a stored identifier accepts this.
    forged.plant(cookie.name, cookie.value.replace(/[A-Za-z0-9]/g, 'a'))
    expect(
      (await forged.api('/me')).status,
      'a forged identifier of the same shape was accepted',
    ).toBe(401)

    const garbage = app.browser()
    garbage.plant(cookie.name, '../../etc/passwd')
    const response = await garbage.api('/me')
    expect(
      response.status,
      'a malformed session identifier must answer 401, not crash the request',
    ).toBe(401)
  })
})

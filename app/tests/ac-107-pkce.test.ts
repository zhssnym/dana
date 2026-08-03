/*
AC-107: given an authorization request, when it is issued, then it carries a
PKCE S256 code challenge, and a token exchange with a non-matching verifier
fails.

The second half is a statement about the provider, not about Dana, so on its
own it proves nothing about this implementation: a client that never sends a
verifier cannot be caught by it. The stub therefore refuses any authorization
request arriving without a code challenge, which turns "the ordinary flow
completes" into evidence. Three facts together are what pin the criterion:
the challenge appears in the authorization request, the provider rejects a
mismatched verifier, and a real sign-in still succeeds. The third is only
reachable by a client that sent a challenge and then the verifier matching it.

The challenge is also checked for shape. An implementation that labels a
request S256 while sending the verifier itself as the challenge, which is what
the plain method does, would satisfy a bare presence check while giving up the
protection entirely; the S256 output is 43 base64url characters and a verifier
is not obliged to be.

The remaining tests are the other half of 11.6's first bullet, which names
three parameters and not one: "Authorization requests carry state, nonce, and
a PKCE S256 challenge". Nothing else in this package asserts that state and
nonce are sent at all, or that they are fresh per request; AC-105 and AC-106
attack the validation, and both are satisfiable by constant values. Constant
values are what makes them replayable, so they are checked here. The scope
assertion is here for the same reason: 10.1 restricts v1 to openid, email and
profile, "no Gmail or Calendar scopes exist anywhere in v1", and this
authorization request is the only place that is observable.

Spec: 11.6, 7.1, 10.1.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  beginAuthorization,
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { pkceChallengeFor, randomVerifier } from './oidc-stub.js'

let app: AuthTestApp
const domain = `ac107-${randomUUID()}.test`
const sub = `sub-pkce-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
  app.stub.nextIdentity({
    sub,
    email: `pkce@${domain}`,
    email_verified: true,
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

describe('AC-107: authorization requests carry a PKCE S256 challenge', () => {
  test('AC-107: the authorization request carries an S256 code challenge', async () => {
    const authorization = await beginAuthorization(app, app.browser())
    const params = authorization.searchParams

    expect(
      params.get('code_challenge_method'),
      'the authorization request must use S256 (spec 11.6)',
    ).toBe('S256')
    const challenge = params.get('code_challenge')
    expect(challenge, 'the authorization request carries no code_challenge').not.toBeNull()
    // A SHA-256 digest is 32 bytes, which is 43 characters unpadded base64url.
    // Anything else is the verifier in the clear wearing an S256 label.
    expect(
      challenge,
      'the code_challenge is not a SHA-256 digest: an S256 label over a plain challenge gives up the protection',
    ).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  test('AC-107: the provider refuses a token exchange with a non-matching verifier', async () => {
    // Test of the stub rather than of Dana, and stated as such: it is the
    // premise the test below rests on.
    const redirectUri = `${app.origin}/api/v1/auth/google/callback`
    const verifier = randomVerifier()
    const issued = await app.stub.authorize({
      redirectUri,
      codeChallenge: pkceChallengeFor(verifier),
    })
    expect(issued.code).not.toBeNull()

    const mismatched = await app.stub.exchangeCode({
      code: issued.code as string,
      codeVerifier: randomVerifier(),
      redirectUri,
    })
    expect(mismatched.status, 'a mismatched verifier must not be exchanged').toBe(400)
    expect(mismatched.body.error).toBe('invalid_grant')

    const matching = await app.stub.exchangeCode({
      code: app.stub.mintExtraCode(),
      codeVerifier: verifier,
      redirectUri,
    })
    expect(matching.status, 'the matching verifier must be exchanged').toBe(200)
  })

  test('AC-107: a full sign-in completes, which it can only do with a matching verifier', async () => {
    // The stub refuses any authorization request without a challenge, so
    // reaching a session at all means a challenge was sent; and the token
    // endpoint refuses any verifier that does not hash to it, so reaching a
    // session means the matching verifier followed.
    const { session } = await signIn(app)
    expect(session.value).not.toBe('')
    expect(await usersForSub(app.db, sub)).toHaveLength(1)
  })

  test('AC-107 adversarial: state and nonce are present and fresh on every request', async () => {
    const first = await beginAuthorization(app, app.browser())
    const second = await beginAuthorization(app, app.browser())

    for (const [label, url] of [['first', first], ['second', second]] as const) {
      expect(
        url.searchParams.get('state'),
        `the ${label} authorization request carries no state (spec 11.6)`,
      ).not.toBeNull()
      expect(
        url.searchParams.get('nonce'),
        `the ${label} authorization request carries no nonce (spec 11.6)`,
      ).not.toBeNull()
    }

    // Constant values would validate perfectly against AC-105 and AC-106 and
    // be replayable by anyone who saw one of them once.
    expect(
      second.searchParams.get('state'),
      'two authorization requests reused one state value',
    ).not.toBe(first.searchParams.get('state'))
    expect(
      second.searchParams.get('nonce'),
      'two authorization requests reused one nonce value',
    ).not.toBe(first.searchParams.get('nonce'))
    expect(
      second.searchParams.get('code_challenge'),
      'two authorization requests reused one PKCE challenge',
    ).not.toBe(first.searchParams.get('code_challenge'))
  })

  test('AC-107 adversarial: the request asks for no scope beyond openid, email, and profile', async () => {
    const authorization = await beginAuthorization(app, app.browser())
    const scopes = (authorization.searchParams.get('scope') ?? '').split(/\s+/).filter(Boolean)

    expect(scopes, 'the authorization request must ask for openid').toContain('openid')
    expect(scopes).toContain('email')
    expect(scopes).toContain('profile')
    // Section 10.1: "no Gmail or Calendar scopes exist anywhere in v1". A
    // widened scope here is invisible everywhere else in the system.
    expect(
      scopes.filter((scope) => !['openid', 'email', 'profile'].includes(scope)),
      'the authorization request asks for a scope section 10.1 forbids',
    ).toEqual([])
  })
})

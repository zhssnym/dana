/*
AC-106: given an ID token whose nonce does not match the pending
authorization's nonce, when the callback validates it, then sign-in fails.

The criterion has a useful property: an implementation that never sends a
nonce, or sends one and never checks it, fails this test rather than passing
it, because the stub's wrong value is accepted only by a callback that is not
comparing. So the mismatch case pins the check without needing to inspect the
authorization request. The absent-nonce case is here as well, because a
comparison written as "if the token has a nonce, it must match" is satisfied by
a token carrying none, and that is the same hole reopened.

The rest of this file is the persona's instruction to treat these criteria as
the floor. Nonce is one claim of several the callback must validate, and an
implementation that validates the nonce and nothing else is exactly as
compromised. Each case is one crafted token, each must be refused, and each
must be refused rather than crashing: an unhandled rejection reaching Express
5's error handler is a 500, and a 500 on attacker-controlled input is its own
finding.

Two are worth naming. A token signed with a key that is not the provider's
must fail, or signature verification is not happening at all. And a token
whose header says alg none, or says HS256 with the client secret as the HMAC
key, must fail: those are the algorithm-confusion attacks, and an
implementation that trusts the header's alg accepts both.

Spec: 11.6, 7.1, 10.1.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  attemptSignIn,
  cleanupAuthSubs,
  expectNoSession,
  signIn,
  startAuthTestApp,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import type { IdTokenOverrides } from './oidc-stub.js'

let app: AuthTestApp
const domain = `ac106-${randomUUID()}.test`
const sub = `sub-nonce-${randomUUID()}`
const controlSub = `sub-nonce-control-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub, controlSub])
  await app.close()
})

/** One crafted token, one refusal, no account, no crash. */
async function expectRefused(
  overrides: IdTokenOverrides,
  why: string,
): Promise<void> {
  app.stub.nextIdentity({
    sub,
    email: `crafted@${domain}`,
    email_verified: true,
  })
  app.stub.overrideNextIdToken(overrides)

  const { callback } = await attemptSignIn(app)

  expectNoSession(callback, why)
  expect(
    callback.status,
    `a token that ${why} must be refused, not crash the callback (answered ${String(callback.status)})`,
  ).toBeLessThan(500)
  expect(
    await usersForSub(app.db, sub),
    `a token that ${why} provisioned an account`,
  ).toHaveLength(0)
}

describe('AC-106: the callback validates the ID token', () => {
  test('AC-106: a nonce that does not match the pending authorization is refused', async () => {
    await expectRefused(
      { nonce: `wrong-nonce-${randomUUID()}` },
      'carries a nonce from no pending authorization',
    )
  })

  test('AC-106 adversarial: a token carrying no nonce at all is refused', async () => {
    // "If present, must match" is not the requirement; 11.6 says the callback
    // validates the nonce, and a token without one has not been validated.
    await expectRefused({ nonce: null }, 'carries no nonce')
  })

  test('AC-106 adversarial: a token for another audience is refused', async () => {
    await expectRefused(
      { aud: `some-other-client-${randomUUID()}` },
      'was issued for a different client',
    )
  })

  test('AC-106 adversarial: a token from another issuer is refused', async () => {
    await expectRefused(
      { iss: 'https://accounts.example.invalid' },
      'came from a different issuer',
    )
  })

  test('AC-106 adversarial: an expired token is refused', async () => {
    await expectRefused({ expiresInSeconds: -60 }, 'expired an hour ago')
  })

  test('AC-106 adversarial: a token signed with the wrong key is refused', async () => {
    // If this one passes, no signature is being verified and every case in
    // this file is forgeable by anyone who can reach the callback.
    await expectRefused({ rogueKey: true }, 'was signed with a key that is not the provider\'s')
  })

  test('AC-106 adversarial: an unsigned token is refused', async () => {
    await expectRefused({ alg: 'none' }, 'declares alg none and carries no signature')
  })

  test('AC-106 adversarial: a token HMAC-signed with the client secret is refused', async () => {
    // Algorithm confusion: the header asks the verifier to treat a symmetric
    // key it already holds as the signing key.
    await expectRefused({ alg: 'HS256' }, 'is an HS256 token keyed with the client secret')
  })

  test('AC-106 adversarial: a token without a subject is refused', async () => {
    // google_sub is the account's identity (section 4.1). A callback that
    // accepts a token without one has nothing to provision against.
    await expectRefused({ sub: null }, 'carries no subject claim')
  })

  test('AC-106 adversarial: a token without an email is refused', async () => {
    await expectRefused({ email: null }, 'carries no email claim')
  })

  test('AC-106 positive control: an untampered token signs in', async () => {
    // Without this, every refusal above is satisfied by a callback that
    // refuses every token it is ever given.
    app.stub.nextIdentity({
      sub: controlSub,
      email: `honest@${domain}`,
      email_verified: true,
    })
    const { session } = await signIn(app)
    expect(session.value).not.toBe('')
    expect(await usersForSub(app.db, controlSub)).toHaveLength(1)
  })
})

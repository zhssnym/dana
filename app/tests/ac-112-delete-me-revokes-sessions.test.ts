/*
AC-112: given a user with two active sessions on different clients, when
DELETE /me completes, then both sessions answer 401 immediately.

Two words carry the criterion. "Both", because destroying the session that
made the request is the easy half and the one an implementation gets right by
accident; the other client is the one still holding a working key to a deleted
account. And "immediately", because 11.6 provides a pruning pass on the
scheduler and then says what it is not: "Pruning is hygiene, not revocation;
revocation never waits for it." An implementation that marks sessions expired
and lets the minute-tick collect them satisfies a test that sleeps and fails
this one.

The trap is vacuity. If the second session never worked, its 401 afterwards
proves nothing, so both sessions are made to answer 200 before the deletion
runs. The same reasoning drives the replay: after the deletion, the raw cookie
values are presented from fresh jars, because a response that merely clears
cookies leaves the identifiers live for anyone who copied them.

Spec: 7.1, 10.1, 11.6, 8.10.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
} from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac112-${randomUUID()}.test`
const sub = `sub-revoke-${randomUUID()}`
const bystanderSub = `sub-bystander-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub, bystanderSub])
  await app.close()
})

describe('AC-112: account deletion revokes every session at once', () => {
  test('AC-112: both clients answer 401 immediately after DELETE /me', async () => {
    app.stub.nextIdentity({
      sub,
      email: `departing@${domain}`,
      email_verified: true,
      name: 'Departing Person',
    })

    // A bystander signed in first, so the deletion below has something it
    // could over-reach into.
    app.stub.nextIdentity({
      sub: bystanderSub,
      email: `bystander@${domain}`,
      email_verified: true,
      name: 'Unaffected Person',
    })
    const bystander = await signIn(app)

    app.stub.nextIdentity({
      sub,
      email: `departing@${domain}`,
      email_verified: true,
      name: 'Departing Person',
    })
    const laptop = await signIn(app)
    const phone = await signIn(app)

    expect(
      laptop.session.value,
      'the two clients must hold different sessions for this test to mean anything',
    ).not.toBe(phone.session.value)
    expect((await laptop.browser.api('/me')).status, 'the first client must be live').toBe(200)
    expect((await phone.browser.api('/me')).status, 'the second client must be live').toBe(200)

    const deletion = await laptop.browser.json('/me', 'DELETE', {
      confirm: 'DELETE',
    })
    expect(
      deletion.status,
      'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
    ).toBe(204)

    expect(
      (await laptop.browser.api('/me')).status,
      'the deleting client still authenticates',
    ).toBe(401)
    // No sleep, no retry: 11.6 says revocation never waits for the pruning
    // pass, so a session that only expires later is a failure here.
    expect(
      (await phone.browser.api('/me')).status,
      'the other client still authenticates after the account was deleted (spec 8.10 step 8, 11.6)',
    ).toBe(401)

    // Only that account's sessions. Deleting one account must not sign
    // everyone out.
    expect(
      (await bystander.browser.api('/me')).status,
      'deleting one account revoked an unrelated account\'s session',
    ).toBe(200)
  })

  test('AC-112 adversarial: the raw identifiers are dead, not merely cleared', async () => {
    app.stub.nextIdentity({
      sub,
      email: `departing@${domain}`,
      email_verified: true,
      name: 'Departing Again',
    })
    const laptop = await signIn(app)
    const phone = await signIn(app)
    expect((await laptop.browser.api('/me')).status).toBe(200)
    expect((await phone.browser.api('/me')).status).toBe(200)

    await laptop.browser.json('/me', 'DELETE', { confirm: 'DELETE' })

    // Fresh jars holding nothing but the identifiers, so a Set-Cookie that
    // cleared the caller's own cookies cannot be mistaken for revocation.
    for (const [label, session] of [
      ['the deleting client', laptop.session],
      ['the other client', phone.session],
    ] as const) {
      const replay = app.browser()
      replay.plant(session.name, session.value)
      expect(
        (await replay.api('/me')).status,
        `${label}'s identifier still authenticates when replayed: the cookie was cleared but the session was not destroyed`,
      ).toBe(401)
    }
  })
})

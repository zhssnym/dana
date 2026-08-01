/*
AC-105: given an OAuth callback whose state does not match the value issued
for this browser, when it is processed, then sign-in fails, no session exists,
and no user row was created or modified.

"For this browser" is the clause that separates a real check from a decorative
one. A server that merely remembers the states it has issued, without binding
each to the browser it issued it to, accepts a state minted for someone else,
which is the login cross-site request forgery this parameter exists to stop.
So a forged value is not the only case: a browser holding its own, different
pending authorization is made to present another browser's callback, and a
browser holding no pending authorization at all is made to present it too.

Single-use is 11.6's word ("the callback validates all three, single-use"),
and it needs care to test honestly. Replaying a callback verbatim is refused
by any implementation, because the authorization code was already redeemed and
the provider says so. The stub can therefore mint a fresh, valid code bound to
the same authorization, so that the replayed request differs from the original
in nothing except that the state has already been spent. That leaves exactly
one reason to refuse it.

"No user row created or modified" is asserted by snapshotting the whole row
and comparing it afterwards, because section 4.1 gives users no updated_at
column and there is nothing else to watch.

Spec: 11.6, 7.1, 10.1.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  beginAuthorization,
  cleanupAuthSubs,
  completeCallback,
  expectNoSession,
  expectRedirect,
  followAuthorization,
  startAuthTestApp,
  userForSub,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac105-${randomUUID()}.test`
const forgedSub = `sub-forged-${randomUUID()}`
const foreignSub = `sub-foreign-${randomUUID()}`
const replaySub = `sub-replay-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [forgedSub, foreignSub, replaySub])
  await app.close()
})

describe('AC-105: the callback validates state, bound and single-use', () => {
  test('AC-105: a state that was never issued is refused', async () => {
    app.stub.nextIdentity({
      sub: forgedSub,
      email: `forged@${domain}`,
      email_verified: true,
    })

    const browser = app.browser()
    const callbackUrl = await followAuthorization(
      app,
      await beginAuthorization(app, browser),
    )
    const forged = new URL(callbackUrl)
    forged.searchParams.set('state', `forged-${randomUUID()}`)

    const callback = await completeCallback(browser, forged)

    expectNoSession(callback, 'the state was never issued')
    expect(
      await usersForSub(app.db, forgedSub),
      'a callback with a forged state provisioned an account',
    ).toHaveLength(0)
  })

  test('AC-105 adversarial: one browser cannot spend another browser\'s state', async () => {
    app.stub.nextIdentity({
      sub: foreignSub,
      email: `foreign@${domain}`,
      email_verified: true,
    })

    const victim = app.browser()
    const victimCallback = await followAuthorization(
      app,
      await beginAuthorization(app, victim),
    )

    // A browser midway through its own sign-in. Its state is real and
    // outstanding, just not the one in the URL it is handed, so a server that
    // remembers issued states globally rather than per browser accepts this.
    const attacker = app.browser()
    await beginAuthorization(app, attacker)
    const hijacked = await completeCallback(attacker, victimCallback)
    expectNoSession(hijacked, 'the state was issued to a different browser')

    // And a browser with no pending authorization at all.
    const stranger = app.browser()
    const strangerCallback = await completeCallback(stranger, victimCallback)
    expectNoSession(strangerCallback, 'the browser had no pending authorization')

    expect(
      await usersForSub(app.db, foreignSub),
      'a hijacked callback provisioned an account',
    ).toHaveLength(0)
  })

  test('AC-105 adversarial: a spent state cannot be spent twice', async () => {
    app.stub.nextIdentity({
      sub: replaySub,
      email: `replayer@${domain}`,
      email_verified: true,
    })

    const browser = app.browser()
    const callbackUrl = await followAuthorization(
      app,
      await beginAuthorization(app, browser),
    )
    // The jar as it stands before the callback runs, so the replay below is
    // identical to the original request in every respect but its timing.
    const replayer = browser.clone()

    const first = await completeCallback(browser, callbackUrl)
    expectRedirect(
      first,
      'the first callback must succeed, or single-use proves nothing',
    )

    const before = await userForSub(app.db, replaySub)
    expect(before, 'the first callback must have provisioned the account').toBeDefined()

    // A fresh code for the same authorization: the provider will honor it, so
    // the only thing left that can refuse this request is the spent state.
    const replayUrl = new URL(callbackUrl)
    replayUrl.searchParams.set('code', app.stub.mintExtraCode())
    const replay = await completeCallback(replayer, replayUrl)

    expectNoSession(replay, 'the state had already been used once (spec 11.6)')
    expect(
      await usersForSub(app.db, replaySub),
      'the replay provisioned a second account',
    ).toHaveLength(1)
    expect(
      await userForSub(app.db, replaySub),
      'the replayed callback modified the account row',
    ).toEqual(before as UserRow)
  })
})

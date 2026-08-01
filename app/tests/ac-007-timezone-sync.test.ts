/*
AC-007: given a returning login from a device in a different timezone, when the
session starts, then users.timezone equals the new zone.

Held through the first pass and unblocked by the 2026-07-31 amendment. Section
7.1 previously said the value came from "the login page's detected zone" while
the frozen surface carried nothing that could deliver it; it now carries an
optional tz query parameter on GET /api/v1/auth/google, and 8.1 states exactly
when a login writes it.

The amendment specifies four behaviors, not one, and three of them are the
kind that an implementation satisfies by accident in one direction and gets
wrong in the other:

- A returning login reporting a different zone writes it. The criterion.
- A login carrying no tz syncs nothing (8.1). An implementation that treats
  absence as UTC would silently move a traveler's account to UTC on any login
  from a client that failed to detect a zone, and every reminder they own would
  move with it (8.6).
- An unparseable tz is treated as absent rather than answered 422 (7.1). This
  is a recorded deviation from the 10.3 validation rule, made deliberately so
  that a stale client-side zone database cannot lock someone out of their
  account. So the sign-in must still succeed.
- A reported zone that is a tzdb alias of the stored one is not a different
  zone (8.1): no write. US/Eastern and America/New_York are the same zone
  wearing two names, and a comparison written as string inequality writes the
  alias over the canonical name, which then reads back as a zone the person
  never chose.

One more case is here because 7.1 and 11.6 both say it in the same breath as
the parameter: tz is carried through the pending-authorization state, "never
through redirect_uri and never composed into a redirect target". A parameter
that reaches the callback by riding the redirect is attacker-controlled at the
moment it is consumed, and the natural way to implement this feature is
exactly the way the specification forbids.

Timezone values here are chosen so no assertion can pass by coincidence: none
is UTC, and none is plausibly the machine's own zone.

Spec: 7.1 (the tz parameter and the callback's sync), 8.1 (when a login
writes), 11.6 (the carrier), 4.1 (the column), INV-14.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  beginAuthorization,
  cleanupAuthSubs,
  completeCallback,
  followAuthorization,
  isIanaTimezone,
  signIn,
  startAuthTestApp,
  userForSub,
  usersForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'

let app: AuthTestApp
const domain = `ac007-${randomUUID()}.test`
const travelerSub = `sub-traveler-${randomUUID()}`
const silentSub = `sub-silent-${randomUUID()}`
const invalidSub = `sub-invalid-${randomUUID()}`
const aliasSub = `sub-alias-${randomUUID()}`
const carrierSub = `sub-carrier-${randomUUID()}`

const HOME = 'Asia/Karachi'
const AWAY = 'Europe/London'

// US/Eastern is a tzdb link to America/New_York: the same zone under two
// names. Verified against this machine's ICU, which resolves the former to
// the latter.
const CANONICAL = 'America/New_York'
const ALIAS = 'US/Eastern'

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [
    travelerSub,
    silentSub,
    invalidSub,
    aliasSub,
    carrierSub,
  ])
  await app.close()
})

async function storedZone(sub: string): Promise<string> {
  const user = await userForSub(app.db, sub)
  expect(user, `no account exists for ${sub}`).toBeDefined()
  return (user as UserRow).timezone
}

describe('AC-007: a returning login syncs users.timezone', () => {
  test('AC-007: a returning login from a different zone writes the new zone', async () => {
    app.stub.nextIdentity({
      sub: travelerSub,
      email: `traveler@${domain}`,
      email_verified: true,
      name: 'Frequent Traveler',
    })

    await signIn(app, { tz: HOME })
    expect(
      await storedZone(travelerSub),
      'the first sign-in must store the zone it reported (spec 7.1)',
    ).toBe(HOME)

    // A second device, in a different zone, signing in to the same account.
    await signIn(app, { tz: AWAY })

    expect(
      await storedZone(travelerSub),
      'a returning login reporting a different zone must update users.timezone (spec 7.1, 8.1)',
    ).toBe(AWAY)
    expect(
      await usersForSub(app.db, travelerSub),
      'the returning login created a second account instead of syncing',
    ).toHaveLength(1)
  })

  test('AC-007 adversarial: a login carrying no tz syncs nothing', async () => {
    // Section 8.1: "a login carrying no tz syncs nothing". Reading absence as
    // UTC would move a traveler's account, and every reminder instant it
    // anchors (8.6), on any login from a client that did not detect a zone.
    app.stub.nextIdentity({
      sub: silentSub,
      email: `silent@${domain}`,
      email_verified: true,
      name: 'Silent Client',
    })

    await signIn(app, { tz: HOME })
    expect(await storedZone(silentSub)).toBe(HOME)

    await signIn(app)

    expect(
      await storedZone(silentSub),
      'a login carrying no tz overwrote the stored zone (spec 8.1)',
    ).toBe(HOME)
  })

  test('AC-007 adversarial: an unparseable tz is treated as absent, not refused', async () => {
    app.stub.nextIdentity({
      sub: invalidSub,
      email: `invalid@${domain}`,
      email_verified: true,
      name: 'Stale Zone Database',
    })

    await signIn(app, { tz: HOME })
    expect(await storedZone(invalidSub)).toBe(HOME)

    // Section 7.1 makes this a deliberate deviation from the 10.3 rule that
    // invalid input answers 422: "sign-in must not fail over a stale zone
    // database". So each of these must complete, and none may be stored.
    for (const rubbish of ['Not/AZone', 'Mars/Olympus_Mons', '', 'UTC+5', '../../etc']) {
      const { session } = await signIn(app, { tz: rubbish })
      expect(
        session.value,
        `tz=${JSON.stringify(rubbish)} must be ignored, not refuse the sign-in (spec 7.1)`,
      ).not.toBe('')
      const stored = await storedZone(invalidSub)
      expect(
        stored,
        `tz=${JSON.stringify(rubbish)} was stored; an invalid zone is treated as absent (spec 7.1)`,
      ).toBe(HOME)
      expect(
        isIanaTimezone(stored),
        'users.timezone must remain a valid IANA identifier (INV-14)',
      ).toBe(true)
    }
  })

  test('AC-007 adversarial: a tzdb alias of the stored zone is not a different zone', async () => {
    // Section 8.1: "a reported zone that is a tzdb alias of the stored one is
    // not a different zone: no write". US/Eastern and America/New_York are
    // one zone; a string comparison writes the alias over the canonical name
    // and the account then reads back a zone its owner never chose.
    app.stub.nextIdentity({
      sub: aliasSub,
      email: `alias@${domain}`,
      email_verified: true,
      name: 'Same Zone Twice',
    })

    await signIn(app, { tz: CANONICAL })
    expect(await storedZone(aliasSub)).toBe(CANONICAL)

    await signIn(app, { tz: ALIAS })

    expect(
      await storedZone(aliasSub),
      `${ALIAS} is a tzdb alias of ${CANONICAL} and must not be written over it (spec 8.1)`,
    ).toBe(CANONICAL)
  })

  test('AC-007 adversarial: tz never rides a redirect', async () => {
    // Sections 7.1 and 11.6: the zone is carried in the pending-authorization
    // state, "never through redirect_uri and never composed into a redirect
    // target". Anything that reaches the callback through the redirect is
    // supplied by the browser at the moment it is consumed rather than by the
    // server that issued it.
    app.stub.nextIdentity({
      sub: carrierSub,
      email: `carrier@${domain}`,
      email_verified: true,
      name: 'Carrier Check',
    })

    const browser = app.browser()
    const authorization = await beginAuthorization(app, browser, { tz: AWAY })

    const redirectUri = authorization.searchParams.get('redirect_uri')
    expect(redirectUri, 'the authorization request carries no redirect_uri').not.toBeNull()
    expect(
      redirectUri as string,
      'the zone was composed into redirect_uri (spec 11.6 forbids it)',
    ).not.toContain(AWAY)
    expect(redirectUri as string).not.toContain(encodeURIComponent(AWAY))
    // Nor anywhere else in the authorization request: state is opaque, and a
    // zone smuggled into any other parameter is equally browser-controlled.
    for (const [name, value] of authorization.searchParams) {
      if (name === 'state') continue
      expect(
        value,
        `the zone appears in the ${name} parameter of the authorization request (spec 11.6)`,
      ).not.toContain(AWAY)
    }

    const callbackUrl = await followAuthorization(app, authorization)
    const callback = await completeCallback(browser, callbackUrl)
    expect(
      callback.location ?? '',
      'the zone was composed into the post-callback redirect target (spec 11.6)',
    ).not.toContain(AWAY)

    // And it still arrived: the carrier is the pending-authorization state,
    // so forbidding the visible routes must not mean losing the value.
    expect(
      await storedZone(carrierSub),
      'the reported zone did not reach the callback, so the state carrier is not carrying it (spec 11.6)',
    ).toBe(AWAY)
  })
})

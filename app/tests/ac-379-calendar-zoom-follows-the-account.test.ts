/*
AC-379: given `calendar_zoom` written through PATCH on the v2 settings
bundle, then the response and a fresh read both carry it, a second session
signed in to the same account on its own cookie jar reads the same value, and
another account's stored zoom is untouched.

**The second session is the whole criterion and it is not decoration.**
Imran's ruling on #140 is that the choice should "follow the account across
devices", and the alternative he ruled out by name is browser-only state. A
build that satisfied everything else by writing `localStorage` and answering
the PATCH with the value it was sent would pass a single-session case and fail
the product ruling; a second jar is the cheapest thing in this suite that can
tell those apart, because a cookie jar is what a device is here. The two
sessions are the same `sub`, so they are one account and two browsers rather
than two accounts.

**The stored row is read beside the wire**, which is `bundle-harness.ts`'s
standing discipline for this surface — `settings-harness.ts`'s before issue
#113 retired frozen 7.2 and replaced it: an endpoint that answers 200 without
writing, or writes without answering, must fail on whichever half lied.

**And the third clause is the one that catches a write with no WHERE.**
Another account's zoom is asserted unchanged for AC-122's reason on the frozen
settings pair: a bundle write is keyed on the session's user and nothing else,
and an UPDATE that lost its key would pass both of the clauses above.

Spec: 4.10 as annotated 2026-09-04, 7.2 as annotated the same day, 9.5,
12.3. Issues #140 and #142.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { CALENDAR_ZOOMS } from '../src/shared/bundle.js'
import { signIn, startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'

let app: AuthTestApp
const cast = new Cast(['chooser', 'bystander'], 'i142b')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

async function storedZoom(userId: string): Promise<unknown> {
  const found = await rows(
    app.db,
    sql`SELECT calendar_zoom FROM user_settings WHERE user_id = ${userId}::uuid`,
  )
  return found[0]?.calendar_zoom
}

describe('AC-379 the calendar zoom follows the person, not the browser', () => {
  test('a chosen zoom writes, reads back, reaches a second session, and touches nobody else', async () => {
    const [chooser, bystander] = (await cast.of(app)) as [Actor, Actor]

    const before = await storedZoom(bystander.id)
    expect(
      before,
      'the bystander starts on the default, or this case cannot tell "unchanged" from "changed to the same thing"',
    ).toBe('month')

    const written = await chooser.browser.json('/settings', 'PATCH', {
      calendar_zoom: 'week',
    })
    expectStatus(
      written,
      200,
      'the zoom is a durable account preference and writes through the bundle (Imran’s ruling on #140)',
    )
    expect(
      (written.json() as { calendar_zoom?: unknown }).calendar_zoom,
      'PATCH answers the bundle it just wrote, the fresh-GET convention this surface carries; a 200 whose body still said month would be the field accepted and dropped',
    ).toBe('week')

    const read = await chooser.browser.json('/settings', 'GET')
    expectStatus(read, 200, 'the bundle reads (spec 7.2 as annotated)')
    expect(
      (read.json() as { calendar_zoom?: unknown }).calendar_zoom,
      'and a fresh read agrees with the write, so the value was stored rather than echoed',
    ).toBe('week')

    expect(
      await storedZoom(chooser.id),
      'the stored row must carry it too: an endpoint that answers without writing fails here',
    ).toBe('week')

    /*
    The second device. A returning sign-in on the same `sub` is the same
    account, and `app.browser()` inside signIn is a jar of its own, so this
    session shares nothing with the one above except the row in the database
    — which is the point.
    */
    app.stub.nextIdentity({
      sub: chooser.sub,
      email: chooser.email,
      email_verified: true,
      name: 'I142B CHOOSER',
    })
    const second = await signIn(app)
    const elsewhere = await second.browser.json('/settings', 'GET')
    expectStatus(elsewhere, 200, 'the second session reads its own bundle (spec 7.2 as annotated)')
    expect(
      (elsewhere.json() as { calendar_zoom?: unknown }).calendar_zoom,
      'Imran’s ruling on #140: the choice follows the account across devices. A localStorage answer passes every assertion above and fails this one',
    ).toBe('week')

    expect(
      await storedZoom(bystander.id),
      'and the write is keyed on the session’s user: an UPDATE that lost its WHERE would move everybody (AC-122’s rule for the frozen pair)',
    ).toBe('month')

    // Every value 9.5 names is a value a person can choose, so the criterion
    // does not accidentally pin one of the three as the only writable one.
    for (const zoom of CALENDAR_ZOOMS) {
      const chosen = await chooser.browser.json('/settings', 'PATCH', {
        calendar_zoom: zoom,
      })
      expectStatus(chosen, 200, `9.5 names ${zoom} as a zoom, so the account can hold it`)
      expect(
        (chosen.json() as { calendar_zoom?: unknown }).calendar_zoom,
        `${zoom} round trips through the bundle`,
      ).toBe(zoom)
    }

    // Back to the default, so no chosen value is left behind for a later file
    // on a leg where this account could be met again.
    await chooser.browser.json('/settings', 'PATCH', { calendar_zoom: 'month' })
  })

  test('a bundle write that names no zoom leaves the stored one alone', async () => {
    const [chooser] = (await cast.of(app)) as [Actor, Actor]

    await chooser.browser.json('/settings', 'PATCH', { calendar_zoom: 'day' })
    const other = await chooser.browser.json('/settings', 'PATCH', {
      clock: '24h',
    })
    expectStatus(other, 200, 'another field of the same bundle writes (spec 4.19)')
    expect(
      (other.json() as { calendar_zoom?: unknown }).calendar_zoom,
      'absent means unchanged on a PATCH, which is the any-subset reading this contract carries; a write that reset the zoom to the default whenever the clock moved would be a preference nobody could keep',
    ).toBe('day')

    await chooser.browser.json('/settings', 'PATCH', {
      calendar_zoom: 'month',
      clock: '12h',
    })
  })
})

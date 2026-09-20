/*
AC-118: given a body that does not parse as JSON, parses to something other
than an object, or exceeds the parse limit, when any endpoint receives it,
then 400 in the envelope and no side effects; given a parsed object
carrying a wrong-typed field, then 422 naming the field; given unknown
fields beside valid ones, then they are ignored and the request is
processed as if they were absent.

The probes live on the merged /me surface deliberately. Body parsing is
one boot-level middleware, so pinning the mapping on any real endpoint
pins it for the application, and the retraced P2 row lands Platform's
mapping touch before the folder routes exist; probing a P2 path would keep
this file red past that touch for a missing-route reason the criterion
does not name. This file is expected red today on exactly the two ruled
edges held at the P2 merge gate, a parsed non-object body and an
over-limit body, and green at Platform's touch.

The over-limit probe carries an invalid field inside, so an implementation
with no limit at all answers 422 there and the failure still names the
mapping rather than passing by accident.

Spec: 7.0, 7.1, 10.3; RFC 0001 P2 row; section 12 amendment ddd391b.
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
import type { RawResponse } from '../support/http-client.js'

const BASELINE_ZONE = 'Asia/Karachi'

let app: AuthTestApp
let held: SignedIn | undefined
const sub = `ac118-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

/** Signed in lazily, with the timezone pinned so unchanged is checkable. */
async function holder(): Promise<SignedIn> {
  if (held === undefined) {
    app.stub.nextIdentity({
      sub,
      email: `holder-${randomUUID()}@ac118.test`,
      email_verified: true,
      name: 'Taxonomy Holder',
    })
    held = await signIn(app)
    const pin = await held.browser.json('/me', 'PATCH', {
      timezone: BASELINE_ZONE,
    })
    expect(
      pin.status,
      'pinning the baseline zone must succeed before the probes (spec 7.1)',
    ).toBe(200)
  }
  return held
}

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

async function storedZone(): Promise<string> {
  const row = (await userForSub(app.db, sub)) as UserRow
  return row.timezone
}

/** AC-118 says 400 in the envelope, so the 400 half asserts both. */
function expectEnvelopedStatus(
  response: RawResponse,
  expected: number,
  source: string,
): void {
  expect(
    response.status,
    `${source} must answer ${String(expected)} (spec 7.0; RFC 0001 P2 row); answered ${String(response.status)} with body: ${response.body.slice(0, 120)}`,
  ).toBe(expected)
  let body: unknown
  try {
    body = response.json()
  } catch {
    body = undefined
  }
  const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)
    ?.error
  expect(
    typeof error?.code === 'string' &&
      error.code.length > 0 &&
      typeof error.message === 'string' &&
      error.message.length > 0,
    `${source} must carry the 7.0 envelope`,
  ).toBe(true)
}

function rawPatchMe(
  signedIn: SignedIn,
  body: string,
): Promise<RawResponse> {
  return signedIn.browser.api('/me', {
    method: 'PATCH',
    body,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AC-118: the 7.0 status taxonomy holds on the wire', () => {
  test('AC-118: a body that does not parse answers 400 and changes nothing', async () => {
    const signedIn = await holder()
    const response = await rawPatchMe(signedIn, 'not json {')
    expectEnvelopedStatus(response, 400, 'an unparseable body')
    expect(
      await storedZone(),
      'a malformed request must have no side effects (spec 7.0)',
    ).toBe(BASELINE_ZONE)
  })

  test('AC-118: a parsed non-object body answers 400 and changes nothing', async () => {
    // The first ruled edge: arrays parse, and an array is not an object.
    // The scalar forms ride along; JSON null is not an object either, and
    // an implementation testing typeof would wrongly let it through.
    const signedIn = await holder()
    const cases: readonly [string, string][] = [
      ['["Asia/Karachi"]', 'an array body'],
      ['"Asia/Karachi"', 'a string body'],
      ['5', 'a number body'],
      ['true', 'a boolean body'],
      ['null', 'a null body'],
    ]
    for (const [body, what] of cases) {
      const response = await rawPatchMe(signedIn, body)
      expectEnvelopedStatus(response, 400, what)
    }
    expect(
      await storedZone(),
      'non-object bodies must have no side effects (spec 7.0)',
    ).toBe(BASELINE_ZONE)
  })

  test('AC-118: an over-limit body answers 400, not 413, and changes nothing', async () => {
    // The second ruled edge: a body over the parse limit is a body that
    // did not parse. The invalid zone inside keeps a missing limit from
    // passing this by accident. The limit is 10.3's 3 MB row since RFC
    // 0005 change control item 18; the padding sits above it.
    const signedIn = await holder()
    const oversized = JSON.stringify({
      timezone: 'not/a/zone',
      padding: 'p'.repeat(3 * 1024 * 1024 + 1024),
    })
    const response = await rawPatchMe(signedIn, oversized)
    expectEnvelopedStatus(response, 400, 'an over-limit body')
    expect(
      await storedZone(),
      'an over-limit request must have no side effects (spec 7.0)',
    ).toBe(BASELINE_ZONE)
  })

  test('AC-118: a wrong-typed field answers 422 naming the field', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.json('/me', 'PATCH', {
      timezone: 123,
    })
    expectEnvelopedStatus(response, 422, 'a wrong-typed timezone')
    expect(
      response.body.includes('timezone'),
      'the 422 must name the failing field (spec 7.0, 10.3)',
    ).toBe(true)
    expect(await storedZone()).toBe(BASELINE_ZONE)
  })

  test('AC-118: the second endpoint agrees, and the refusal has no side effects', async () => {
    // Any endpoint is the criterion's phrase: DELETE /me is the other
    // mounted body-taking route, and its side effect would be terminal.
    const signedIn = await holder()
    const response = await signedIn.browser.json('/me', 'DELETE', {
      confirm: 123,
    })
    expectEnvelopedStatus(response, 422, 'a wrong-typed confirm')
    expect(
      response.body.includes('confirm'),
      'the 422 must name the failing field (spec 7.0, 10.3)',
    ).toBe(true)
    const alive = await signedIn.browser.api('/me')
    expect(
      alive.status,
      'the refused DELETE /me must not have deleted anything (spec 7.1)',
    ).toBe(200)
  })

  test('AC-118: unknown fields beside valid ones are ignored', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.json('/me', 'PATCH', {
      timezone: 'Europe/London',
      legacy_flag: true,
      nested: { anything: ['at', 'all'] },
    })
    expect(
      response.status,
      'unknown fields are tolerated on a parsed object (spec 7.0)',
    ).toBe(200)
    expect(
      await storedZone(),
      'the request is processed as if the unknown fields were absent (spec 7.0)',
    ).toBe('Europe/London')

    const restore = await signedIn.browser.json('/me', 'PATCH', {
      timezone: BASELINE_ZONE,
    })
    expect(restore.status, 'restoring the baseline must succeed').toBe(200)
  })
})

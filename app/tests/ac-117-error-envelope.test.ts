/*
AC-117: given any request the mounted surface answers with a 4xx status,
when the body is inspected, then it carries the 7.0 envelope with
error.code and error.message both non-empty strings.

Any request is not enumerable, so the probes are representative: one per
reachable status of the 7.0 taxonomy on the merged surface (400, 401, 403,
404, 422), plus two aimed at package P2's paths whose exact status changes
when the package lands (a missing route's 404 today, the endpoint's own
422 or 404 after) but whose 4xx-ness does not; those two assert the range
and the envelope, leaving the exact status to the criteria that own it.
The envelope check is presence, not exclusivity, per the recorded note on
this criterion: error.code and error.message must be there as non-empty
strings, and anything beside them is not this criterion's business.

The over-limit body is deliberately not probed here: its status is the
ruled mapping AC-118 holds at this package's gate, and probing it in this
file would fail AC-117 for AC-118's reason.

Rate limiting (429) is P9's and unreachable today; its envelope joins the
probe table when that package lands.

Spec: 7.0, 7.1, 10.2; section 12 amendment ddd391b.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  cleanupAuthSubs,
  signIn,
  startAuthTestApp,
} from './auth-harness.js'
import type { AuthTestApp, SignedIn } from './auth-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
let held: SignedIn | undefined
const sub = `ac117-${randomUUID()}`

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

async function holder(): Promise<SignedIn> {
  if (held === undefined) {
    app.stub.nextIdentity({
      sub,
      email: `holder-${randomUUID()}@ac117.test`,
      email_verified: true,
      name: 'Envelope Holder',
    })
    held = await signIn(app)
  }
  return held
}

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cleanupAuthSubs(app.db, [sub])
  await app.close()
})

function expectEnvelope(response: RawResponse, source: string): void {
  expect(
    response.contentType.includes('application/json'),
    `${source} must answer JSON (spec 7.0); got content-type ${response.contentType}`,
  ).toBe(true)
  let body: unknown
  try {
    body = response.json()
  } catch {
    body = undefined
  }
  expect(
    typeof body === 'object' && body !== null,
    `${source} body must parse as a JSON object (spec 7.0); got: ${response.body.slice(0, 120)}`,
  ).toBe(true)
  const error = (body as { error?: unknown }).error
  expect(
    typeof error === 'object' && error !== null,
    `${source} must carry the envelope's error object (spec 7.0)`,
  ).toBe(true)
  const { code, message } = error as { code?: unknown; message?: unknown }
  expect(
    typeof code === 'string' && code.length > 0,
    `${source} error.code must be a non-empty string (spec 7.0)`,
  ).toBe(true)
  expect(
    typeof message === 'string' && message.length > 0,
    `${source} error.message must be a non-empty string (spec 7.0)`,
  ).toBe(true)
}

describe('AC-117: every 4xx answer carries the 7.0 envelope', () => {
  test('AC-117: 401, no session', async () => {
    const bare = app.browser()
    const response = await bare.api('/me')
    expect(response.status, 'GET /me with no session answers 401 (spec 7.0)').toBe(401)
    expectEnvelope(response, 'the 401')
  })

  test('AC-117: 403, a mutation without its CSRF token', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.json(
      '/me',
      'PATCH',
      { timezone: 'Europe/London' },
      { csrf: 'omit' },
    )
    expect(
      response.status,
      'a mutation without the CSRF header answers 403 (spec 11.6, AC-111)',
    ).toBe(403)
    expectEnvelope(response, 'the 403')
  })

  test('AC-117: 404, a route that does not exist', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.api(
      `/definitely-not-a-route-${randomUUID()}`,
    )
    expect(response.status, 'an unknown API path answers 404 (spec 7.0)').toBe(404)
    expectEnvelope(response, 'the 404')
  })

  test('AC-117: 422, a field that fails validation', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.json('/me', 'PATCH', {
      timezone: 'not/a/zone',
    })
    expect(
      response.status,
      'PATCH /me with a non-IANA zone answers 422 (spec 7.1)',
    ).toBe(422)
    expectEnvelope(response, 'the 422')
  })

  test('AC-117: 400, a body that does not parse', async () => {
    const signedIn = await holder()
    const response = await signedIn.browser.api('/me', {
      method: 'PATCH',
      body: 'not json {',
      headers: { 'content-type': 'application/json' },
    })
    expect(
      response.status,
      'an unparseable body answers 400 (spec 7.0)',
    ).toBe(400)
    expectEnvelope(response, 'the 400')
  })

  test('AC-117 adversarial: P2-path refusals wear the envelope through the package landing', async () => {
    // Today both probes answer the missing route's 404; once P2 lands they
    // answer the endpoint's own 404 and 422. Either way they are 4xx, and
    // this criterion owns only the envelope; the exact statuses belong to
    // AC-011 to AC-024.
    const signedIn = await holder()
    const probes: readonly [string, Promise<RawResponse>][] = [
      [
        'GET /folders/:id for a folder that cannot be visible',
        signedIn.browser.api(`/folders/${randomUUID()}`),
      ],
      [
        'POST /folders with an empty name',
        signedIn.browser.json('/folders', 'POST', { name: '' }),
      ],
    ]
    for (const [source, request] of probes) {
      const response = await request
      expect(
        response.status >= 400 && response.status < 500,
        `${source} must be a 4xx refusal; answered ${String(response.status)}`,
      ).toBe(true)
      expectEnvelope(response, source)
    }
  })
})

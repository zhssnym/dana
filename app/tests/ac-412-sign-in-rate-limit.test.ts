/*
AC-412: given more sign-in begins in a minute than 10.4 allows, from one
forwarded address, then the next is refused 429 with Retry-After and the 7.0
envelope; a second address is unaffected; and the callback carries a counter
of its own.

## The defect

`GET /api/v1/auth/google` and its callback carried **no limiter at all** until
issue #168, and that is older than every limit in 10.4. The reason is
structural rather than an oversight anyone can point at: `createRateLimits`
keys on the session's user id, both of these routes precede any session by
definition, and both are GETs, so even the general mutation quota would have
skipped them under `SAFE_METHODS`. There was nothing to key on, so they were
left out and nothing said so.

What that costs is bounded and real. A begin issues state, nonce and PKCE and
writes a cookie; a callback performs a **token exchange against Google**,
which makes it the only route in this API that spends an outbound request to
a third party on an unauthenticated caller's say-so.

## Why this criterion is possible now and was not before

Keying on an address means nothing without issue #153's one trusted proxy
hop. Behind Render's edge and without it, `req.ip` is the edge for every
visitor, so an address-keyed limit on a sign-in route would not be a limit —
it would be an outage, twenty begins a minute for the whole world. AC-410
pins the hop; this pins what the hop made safe to add. The second address
below is the arm that would fail on the old behaviour.

## Two counters, not one

A person being redirected back and forth spends callbacks and not begins.
One shared counter would let a stranger hammering one door lock a real
visitor out of the other, and two counters cost one map, so 10.4 has two rows
and this file asserts they are independent.

## Why it builds its own limiter set

`createApp` raises both limits far out of the way under Vitest, because every
auth criterion signs in repeatedly from one address and the suite shares this
machine. So a criterion that means to measure 10.4 constructs a real set and
hands it in, which is what AC-396 does for the CSP row and what
`auth-harness.ts` grew a `rateLimits` option for.

Spec: 10.4, 11.6, 11.11, 7.0. Issue #168.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { RATE_LIMIT_POLICY, createRateLimits } from '../src/server/security/rate-limit.js'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { rawRequest } from './http-client.js'

/** Small enough to drive quickly. The *shape* is what the cases below are
 * for; 10.4's own twenty is pinned against the policy in its own case, the
 * way AC-392 and AC-396 pin theirs, so an edit to either number fails here
 * rather than silently changing what this contract promises. */
const LIMIT = 3

/** RFC 5737 documentation addresses, which can never be a real peer. */
const CLIENT = '203.0.113.9'
const OTHER = '203.0.113.42'

let app: AuthTestApp

beforeAll(async () => {
  app = await startAuthTestApp({
    rateLimits: createRateLimits({
      limits: {
        signInBeginsPerMinute: LIMIT,
        signInCallbacksPerMinute: LIMIT,
      },
    }),
  })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await app.close()
})

/** One request to a sign-in door as a given client, following no redirect. */
async function knock(path: string, from: string): Promise<{ status: number; retryAfter: number }> {
  const response = await rawRequest(`${app.origin}${path}`, {
    headers: { 'x-forwarded-for': from },
  })
  return {
    status: response.status,
    retryAfter: Number(response.headers['retry-after'] ?? 0),
  }
}

describe('AC-412: the sign-in doors are limited, per client', () => {
  test('10.4 fixes both rows at twenty a minute', () => {
    // The header of this file used to claim the policy was asserted below
    // and nothing asserted it, which is exactly the kind of comment this
    // repository treats as a claim rather than a fact. It is a fact now.
    expect(
      RATE_LIMIT_POLICY.signInBeginsPerMinute,
      '10.4 fixes sign-in begins at twenty a minute per client (issue #168)',
    ).toBe(20)
    expect(
      RATE_LIMIT_POLICY.signInCallbacksPerMinute,
      '10.4 fixes sign-in callbacks at twenty a minute per client, counted separately',
    ).toBe(20)
  })

  test('the begin past the limit is 429 with Retry-After and the envelope', async () => {
    const accepted: number[] = []
    for (let index = 0; index < LIMIT; index += 1) {
      accepted.push((await knock('/api/v1/auth/google', CLIENT)).status)
    }
    expect(
      accepted.every((status) => status !== 429),
      'the first requests inside the limit are not refused; a begin answers 302 to Google',
    ).toBe(true)

    const refused = await knock('/api/v1/auth/google', CLIENT)
    expect(refused.status, '10.4: past the limit is 429').toBe(429)
    expect(refused.retryAfter, '10.4: every refusal carries Retry-After').toBeGreaterThan(0)

    const body = await rawRequest(`${app.origin}/api/v1/auth/google`, {
      headers: { 'x-forwarded-for': CLIENT },
    })
    const error = (body.json() as { error?: { code?: unknown; message?: unknown } }).error
    expect(error?.code, 'the refusal carries the 7.0 envelope').toBe('rate_limited')
    expect(typeof error?.message === 'string' && error.message.length > 0).toBe(true)
  })

  test('a different forwarded address is not refused', async () => {
    // The arm that would have failed before issue #153. Without one trusted
    // hop every caller shares the edge's address, so the client above would
    // have spent this one's quota and a sign-in limit would be an outage
    // rather than a limit.
    expect(
      (await knock('/api/v1/auth/google', OTHER)).status,
      'issue #168 with #153: the limit is per client, so a second visitor signs in ' +
        'while the first is refused',
    ).not.toBe(429)
  })

  test('the callback counts separately from the begin', async () => {
    // Two rows in 10.4 and two counters. The begin is already exhausted for
    // CLIENT above, so a shared counter would refuse the first callback here.
    const first = await knock('/api/v1/auth/google/callback?state=x&code=y', CLIENT)
    expect(
      first.status,
      'a spent begin quota must not refuse a callback: a person being redirected back ' +
        'and forth spends one and not the other',
    ).not.toBe(429)

    for (let index = 1; index < LIMIT; index += 1) {
      await knock('/api/v1/auth/google/callback?state=x&code=y', CLIENT)
    }
    const refused = await knock('/api/v1/auth/google/callback?state=x&code=y', CLIENT)
    expect(refused.status, 'and the callback has a limit of its own').toBe(429)
    expect(refused.retryAfter).toBeGreaterThan(0)

    expect(
      (await knock('/api/v1/auth/google/callback?state=x&code=y', OTHER)).status,
      'per client here too',
    ).not.toBe(429)
  })
})

/*
AC-392: the export's own rate limit.

Given a signed-in person, when they call GET /api/v1/me/export six times
within an hour, then the first five answer 200 and the sixth is refused 429
with Retry-After and the 7.0 envelope, exactly as 10.4 says a limit is
answered; and the refusal is that person's alone, a second account's first
call answering 200 against the same running application.

**Driven against the mounted application rather than against
`createRateLimits`, and that is the whole point of the criterion.** AC-101
measures the invite limiters in isolation, in
`src/server/security/rate-limit.test.ts`, which proves the policy and cannot
prove the wiring: a limiter that is defined, exported, and never attached to
a route passes every one of those cases. So this file drives the real route
through the real application, and for it to be able to, 7.22's limit is the
one limit in `security/rate-limit.ts` that `createApp` does **not** raise
under test. Every other file touching this endpoint rations its calls
accordingly, and each says so.

Spec: 7.22, 10.4.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { RATE_LIMIT_POLICY } from '../src/server/security/rate-limit.js'
import {
  Cast,
  expectStatus,
  requestExport,
  startAuthTestApp,
} from './export-harness.js'
import type { Actor, AuthTestApp } from './export-harness.js'

let app: AuthTestApp
const cast = new Cast(['heavy', 'bystander'], 'ac392')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-392 the export is five per hour per person', () => {
  test('the sixth call in an hour is refused 429 with Retry-After', async () => {
    const [heavy, bystander] = (await cast.of(app)) as [Actor, Actor]

    expect(
      RATE_LIMIT_POLICY.exportPerHour,
      '10.4 fixes the export at five per hour; this case is written against the policy rather than against a literal, so a change to the number moves both together',
    ).toBe(5)

    for (let call = 1; call <= RATE_LIMIT_POLICY.exportPerHour; call += 1) {
      const response = await requestExport(heavy)
      expectStatus(
        response,
        200,
        `call ${String(call)} of ${String(RATE_LIMIT_POLICY.exportPerHour)} is within the hour's quota (spec 10.4)`,
      )
    }

    const refused = await requestExport(heavy)
    expectStatus(
      refused,
      429,
      'the call past the quota is refused, and 10.4 fixes the status at 429',
    )
    expect(
      Number(refused.headers['retry-after']),
      '10.4: "Responses use 429 plus Retry-After"',
    ).toBeGreaterThan(0)
    const body = refused.json() as { error?: { code?: string } }
    expect(
      body.error?.code,
      'the 7.0 envelope, with the code every other limited route answers',
    ).toBe('rate_limited')

    // Per user, which is 10.4's first word. A limiter keyed on anything else
    // would have refused this call too.
    const other = await requestExport(bystander)
    expectStatus(
      other,
      200,
      'the quota is per user, so one person exhausting theirs refuses nobody else (spec 10.4)',
    )
  })
})

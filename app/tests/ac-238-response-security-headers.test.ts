/*
AC-238: given any response, then it carries Content-Security-Policy with
default-src 'self' and frame-ancestors 'none', and Referrer-Policy:
strict-origin-when-cross-origin, and no Strict-Transport-Security, HSTS
being the edge's alone.

Section 10.8 (RFC 0005 unit 13a, change control item 18) ends the silence
the S14 security review found: the whole response-header posture was one
disabled x-powered-by, and the upload path's safety rested on a single
predicate with no second line behind it. The criterion reads a spread of
response classes rather than one route, because a header middleware mounted
after a router covers everything but that router and looks complete from
any single probe: an unauthenticated refusal, an authenticated read, an
unmatched API path's 404, and the health endpoint.

**The second test is the polish round's amendment of 2026-08-30 (avatars
F3).** 7.2 stores Google's `picture` claim in `users.avatar_url` at first
sign-in and every surface that draws a person renders it, so a policy reading
`img-src 'self' data:` refused the account picture of every account that had
never uploaded one. It went unnoticed for months because the failure is
silent in exactly the wrong way: the disc falls back to the person's initials
on an image that will not load, so a blocked photograph and no photograph are
the same picture. A directive narrower than what the client loads is the same
defect as one wider, and this is the arm that makes the narrow case fail
loudly too.

Spec: 10.8.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'

let app: AuthTestApp
const cast = new Cast(['reader'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

function assertHeaders(response: RawResponse, surface: string): string[] {
  const failures: string[] = []
  const csp = String(response.headers['content-security-policy'] ?? '')
  if (!csp.includes("default-src 'self'")) {
    failures.push(`${surface}: CSP missing default-src 'self' (got: ${csp || 'no header'})`)
  }
  if (!csp.includes("frame-ancestors 'none'")) {
    failures.push(`${surface}: CSP missing frame-ancestors 'none'`)
  }
  const referrer = String(response.headers['referrer-policy'] ?? '')
  if (referrer !== 'strict-origin-when-cross-origin') {
    failures.push(`${surface}: Referrer-Policy is ${referrer || 'absent'}`)
  }
  if (response.headers['strict-transport-security'] !== undefined) {
    failures.push(
      `${surface}: the process set HSTS, which 10.8 gives to the edge alone; a stale max-age here would outlive any certificate mistake`,
    )
  }
  return failures
}

describe('AC-238 every response class carries the 10.8 headers', () => {
  test('refusals, reads, 404s and health all carry the set', async () => {
    const [reader] = (await cast.of(app)) as [Actor]
    const surfaces: Array<[string, RawResponse]> = [
      ['unauthenticated 401', await app.browser().request('/api/v1/me')],
      ['authenticated read', await reader.browser.request('/api/v1/me')],
      ['unmatched API 404', await app.browser().request('/api/v1/no-such-surface')],
      ['health', await app.browser().request('/api/health')],
    ]
    const failures = surfaces.flatMap(([surface, response]) =>
      assertHeaders(response, surface),
    )
    expect(failures, 'responses outside the 10.8 header set').toEqual([])
  })

  test('img-src admits the host the account picture is stored on', async () => {
    const response = await app.browser().request('/api/health')
    const csp = String(response.headers['content-security-policy'] ?? '')
    expect(
      csp,
      "7.2 stores Google's picture claim in users.avatar_url and every person-drawing surface renders it, so a policy that refuses that host draws initials for every account that never uploaded one (10.8)",
    ).toContain('https://*.googleusercontent.com')
    /* And no wider than that: the directive is sized to what the client
       loads, which is images from one fixed host and this origin's own
       files, never a host chosen at runtime. */
    expect(csp, 'img-src stays a list and never a wildcard (10.8)').not.toContain('img-src *')
  })
})

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

**The third and fourth tests are 2026-09-03's amendment, for issues #34 and
#13, and they are the second bullet's lesson applied to the rest of the
policy.** That bullet says a directive narrower than what the client loads is
the same defect as one wider. Nobody had ever read this header back from a
browser, and four things the product does were being refused: the inline
theme script (`default-src` governing it in the absence of any `script-src`),
the object URL the avatar crop loads to read the chosen file, the object URL
a just-recorded voice note plays from, and the `fetch()` of the canvas data:
URL that rebuilds the crop as a file to upload. None of it can happen in
development, where Vite serves the document and sends no policy, so the whole
set survived to production silently: the avatar crop resolved null on the
refusal and the Settings screen did nothing at all, which is why a Google
account picture worked and an uploaded one never did.

The script-src arm **recomputes the digest from `app/index.html` rather than
importing the constant the server holds**, which is the only version of this
assertion worth having: importing it would compare a value to itself and pass
for a policy naming the hash of a script that no longer exists. Editing that
script without editing the policy is the way this silently comes back, and it
is what this arm is here to catch.

Spec: 10.8.
*/
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

  test('script-src names the hash of every inline script the shell ships', async () => {
    const csp = String(
      (await app.browser().request('/api/health')).headers['content-security-policy'] ?? '',
    )
    /* Without an explicit script-src, default-src decides, and 'self' refuses
       an inline script: the theme would repaint on the second frame, which is
       a white flash on every cold load for everyone on Dark. */
    expect(csp, 'the policy states script-src rather than leaving scripts to default-src (10.8)')
      .toContain('script-src')

    const shell = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
      'utf8',
    )
    /* Scripts carrying no src attribute: the ones a hash-source has to name.
       Vite copies them into dist/client/index.html byte for byte, so the
       source file is the right one to read and needs no build to have run. */
    const inline = [...shell.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    expect(inline.length, 'app/index.html carries at least one inline script to cover').toBeGreaterThan(0)

    const missing = inline
      .map((match) => match[1] ?? '')
      .map((body) => `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`)
      .filter((hash) => !csp.includes(hash))
    expect(
      missing,
      'every inline script in app/index.html is named by a hash-source in script-src. If this fails you have edited that script: put the digest printed above into THEME_SCRIPT_HASH in app/src/server/index.ts. Left alone, the script is refused in production and nothing reports it, which is how the theme flash of issue #34 survived for months',
    ).toEqual([])

    /* And the hash is the point: widening the one directive that decides
       whether an injected script runs would be a worse trade than the flash
       it was bought to fix. */
    expect(csp, "script-src never takes 'unsafe-inline' (10.8)").not.toContain(
      "script-src 'self' 'unsafe-inline'",
    )
    expect(csp, "the policy never takes 'unsafe-eval' (10.8)").not.toContain("'unsafe-eval'")
  })

  test('the policy admits the object and data URLs the client builds from bytes it holds', async () => {
    const csp = String(
      (await app.browser().request('/api/health')).headers['content-security-policy'] ?? '',
    )
    const failures: string[] = []
    /* lib/viewer.ts squareImageFile loads the chosen file through an object
       URL to crop it, and every attachment preview draws one while its upload
       is still in flight. Refused, the crop resolves null and the Settings
       screen's `if (square)` does nothing, with no error raised anywhere:
       issue #13's "the custom upload ones are still not working". */
    if (!/img-src[^;]*\bblob:/.test(csp)) {
      failures.push(`img-src does not admit blob: (got: ${csp || 'no header'})`)
    }
    /* A voice note plays from the object URL of the Blob the recorder just
       produced, before any upload has happened. */
    if (!/media-src[^;]*\bblob:/.test(csp)) {
      failures.push('media-src does not admit blob:')
    }
    /* The crop hands its canvas data: URL back through fetch() to rebuild it
       as the File the multipart upload takes, and connect-src is the
       directive that governs fetching a data: URL. */
    if (!/connect-src[^;]*\bdata:/.test(csp)) {
      failures.push('connect-src does not admit data:')
    }
    expect(
      failures,
      'the policy is sized to what the client actually loads (10.8), and a blob: or data: URL is bytes this document already holds rather than a network destination',
    ).toEqual([])
  })
})

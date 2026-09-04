/*
AC-394: given an HTML response from this application, then its
Content-Security-Policy names the violation endpoint through both
`report-uri` and `report-to`, and the response carries a
`Reporting-Endpoints` header naming the same path.

Issue #99 is that nothing anywhere reported a CSP refusal, which is why four
directives sized wrongly against what the client loads were silent for
months. The header is where that ends: a browser that is refused something
posts a report of it, unprompted, from its own networking stack.

**Why both directives and not one.** They are two generations of the same
feature and browsers are split across them. `report-uri` is implemented
everywhere and deprecated in Chromium; `report-to` is its replacement, needs
the `Reporting-Endpoints` header to say what the endpoint name refers to,
and is not implemented by every browser Dana supports. Sending only the
modern pair loses reports today; sending only the old one loses them the day
Chromium finishes the removal — silently, which is the exact failure this
criterion exists to make impossible to reintroduce.

**Why an HTML response and not `/api/health`.** The policy that matters is
the one enforced against the document, because that is the response class
where a refusal happens: an inline script, a stylesheet, an image, an object
URL. A header middleware that covered the API and not the document would
look complete from any API probe and report nothing at all in production —
which is one line away from what `npm run dev` does today, serving the shell
from Vite with no policy on it. So this criterion asks the surface that
serves the built client, and the third case below asks an API response so
that neither can be lost while the other passes.

The shell served here is a stand-in written into a temporary directory
rather than `dist/`: `createApp` takes the client directory as an option
(11.10), the vitest legs run before the build step (11.11), and what this
criterion asserts is the header on an HTML response and not the content of
the document. AC-238 owns the relationship between the policy and the
document's inline scripts, and issue #96 owns reading a freshly built one.

Spec: 10.8, 11.12.
*/
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { CSP_REPORT_PATH } from '../src/server/routes/csp-report.js'

import { startCspReportApp } from './csp-report-harness.js'
import type { CspReportTestApp } from './csp-report-harness.js'
import type { RawResponse } from './http-client.js'

let app: CspReportTestApp
let clientDist: string

beforeAll(async () => {
  clientDist = await mkdtemp(path.join(os.tmpdir(), 'dana-csp-shell-'))
  await writeFile(
    path.join(clientDist, 'index.html'),
    '<!doctype html><html><head><title>Dana</title></head><body></body></html>',
    'utf8',
  )
  app = await startCspReportApp({ clientDist })
}, 60_000)

afterAll(async () => {
  if ((app as CspReportTestApp | undefined) !== undefined) await app.close()
  if (clientDist !== undefined) await rm(clientDist, { recursive: true, force: true })
})

/* The value of one directive, or undefined when the policy does not state it,
   read the way AC-238 reads one: by splitting on the separator, so that a
   directive whose name is a prefix of another cannot answer for it. */
function directiveOf(csp: string, name: string): string | undefined {
  return csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.slice(name.length)
    .trim()
}

function reportingFailures(response: RawResponse, surface: string): string[] {
  const failures: string[] = []
  const csp = String(response.headers['content-security-policy'] ?? '')

  const reportUri = directiveOf(csp, 'report-uri')
  if (reportUri !== CSP_REPORT_PATH) {
    failures.push(
      `${surface}: report-uri is ${reportUri ?? 'absent'} and should be ${CSP_REPORT_PATH}. Without it every browser that has not implemented the Reporting API reports nothing, which is issue #99 unchanged (got: ${csp || 'no header'})`,
    )
  }

  const reportTo = directiveOf(csp, 'report-to')
  if (reportTo !== 'csp-endpoint') {
    failures.push(
      `${surface}: report-to is ${reportTo ?? 'absent'} and should name csp-endpoint. Without it Chromium reports nothing the day it finishes removing report-uri, and nothing announces the change`,
    )
  }

  const endpoints = String(response.headers['reporting-endpoints'] ?? '')
  if (!endpoints.startsWith('csp-endpoint="')) {
    failures.push(
      `${surface}: Reporting-Endpoints is ${endpoints || 'absent'}, so report-to above names an endpoint nothing defines`,
    )
  }
  if (!endpoints.endsWith(`${CSP_REPORT_PATH}"`)) {
    failures.push(
      `${surface}: Reporting-Endpoints does not end at ${CSP_REPORT_PATH}, so the two headers disagree about where a report goes (got: ${endpoints || 'absent'})`,
    )
  }
  return failures
}

describe('AC-394 the policy names somewhere to report a refusal to', () => {
  test('the document response carries both directives and the endpoint header', async () => {
    const response = await app.get('/')
    expect(
      response.status,
      'the stand-in shell was not served, so this criterion measured no HTML at all',
    ).toBe(200)
    expect(
      response.contentType,
      'the surface under test must be the document, which is the response class a refusal happens on',
    ).toContain('text/html')

    expect(reportingFailures(response, 'document'), 'the 10.8 reporting pair').toEqual([])
  })

  test('and so does an API response, so neither surface can lose it alone', async () => {
    const response = await app.get('/api/health')
    expect(response.status).toBe(200)
    expect(reportingFailures(response, 'health'), 'the 10.8 reporting pair').toEqual([])
  })

  test('nothing else in the policy moved', async () => {
    /* The reporting pair is an addition and not a rewrite. Every directive
       10.8 already fixed is asserted here as a whole clause rather than as a
       substring, because a widening reads as a substring match just as well
       as the original does: `script-src 'self' 'unsafe-inline' '<hash>'`
       contains `script-src 'self'`. AC-238 owns what each of these is for;
       this arm owns the fact that adding a reporting endpoint changed none
       of them. */
    const csp = String(
      (await app.get('/api/health')).headers['content-security-policy'] ?? '',
    )
    const clauses = csp.split(';').map((part) => part.trim())
    const unchanged = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      "media-src 'self' blob:",
      "connect-src 'self' data: https://*.sentry.io",
    ]
    expect(
      unchanged.filter((clause) => !clauses.includes(clause)),
      'directives 10.8 fixed before issue #99, which the reporting pair must leave byte for byte',
    ).toEqual([])
    expect(
      directiveOf(csp, 'script-src')?.startsWith("'self' 'sha256-"),
      "script-src still admits this origin and one hash and nothing else (10.8); AC-238 owns which hash",
    ).toBe(true)
  })
})

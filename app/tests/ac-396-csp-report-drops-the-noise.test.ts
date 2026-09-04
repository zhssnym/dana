/*
AC-396: given a violation report that is not about this deployment — another
origin's document, a browser extension's injected script, a body over the
16 KB cap — then nothing is logged and nothing reaches Sentry, and the
answer says nothing about which of those it was; and given more than 10.4's
row allows in a minute, the next one is refused 429 with Retry-After.

**This is the caution issue #99 closes with, made a criterion.** Extensions
inject scripts and stylesheets into every page they run on, and the browser
attributes the refusal to the document, so an endpoint that logs what it
receives collects noise in proportion to how many people run an ad blocker.
An alert stream nobody can act on is an alert stream nobody reads, and then
the next real refusal is silent again — the same place issue #99 started,
reached by a different road.

**And the answer must not vary with the report.** A dropped report is
answered 204 exactly as a kept one is. The alternative is an endpoint that
tells a stranger, one probe at a time, what this deployment's origin is and
which schemes it filters, and it buys nothing: the browser posting the
report does not read the status either way.

Two things are deliberately *not* filtered here, and each has a case below,
because the value of this endpoint is entirely in what it does not drop.
A `data:` URL refused by `style-src` is extension noise and goes; the same
URL refused by `script-src` is a script being assembled at runtime, which is
the one thing 10.8's policy exists to stop. And a request over the body cap
answers 400 rather than 204 — the shape of the request is not the content of
a report, and AC-118 already fixes 400 as this surface's answer to a body
over the parse limit, so a second answer would be this contract disagreeing
with itself.

Spec: 10.4, 10.5, 10.8.
*/
import { afterEach, describe, expect, test } from 'vitest'

import { RATE_LIMIT_POLICY } from '../src/server/security/rate-limit.js'

import {
  REPORTS_JSON_TYPE,
  REPORT_URI_TYPE,
  reportUriBody,
  reportsJsonBody,
  startCspReportApp,
} from './csp-report-harness.js'
import type { CspReportTestApp } from './csp-report-harness.js'

let app: CspReportTestApp | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('AC-396 the endpoint drops what is not Dana, silently', () => {
  test('a report about another origin is dropped and answered 204', async () => {
    app = await startCspReportApp()
    const kept = await app.report(
      REPORT_URI_TYPE,
      reportUriBody({ documentUri: `${app.origin}/app`, blockedUri: 'inline' }),
    )
    const foreign = await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: 'https://a-site-that-is-not-dana.example/page',
        blockedUri: 'inline',
      }),
    )
    const noDocument = await app.report(
      REPORTS_JSON_TYPE,
      reportsJsonBody([
        { documentUrl: 'about:blank', blockedUrl: 'inline' },
      ]),
    )

    expect(
      [kept.status, foreign.status, noDocument.status],
      'the status must not vary with the content of a report, or the endpoint is an oracle for its own filters',
    ).toEqual([204, 204, 204])
    expect(
      app.violationLines().map((line) => line.fields.document_path),
      'only the report about this deployment survives',
    ).toEqual(['/app'])
  })

  test('an extension scheme is dropped whatever the directive', async () => {
    app = await startCspReportApp()
    const schemes = [
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop/inject.js',
      'moz-extension://11111111-2222-3333-4444-555555555555/content.js',
      'safari-web-extension://ABCDEF01-2345-6789/inject.js',
      'webkit-masked-url://hidden/',
      'resource://gre/modules/thing.js',
      'about:blank',
    ]
    for (const blockedUri of schemes) {
      const response = await app.report(
        REPORT_URI_TYPE,
        reportUriBody({ documentUri: `${app.origin}/app`, blockedUri }),
      )
      expect(response.status, `${blockedUri} must be answered 204 like everything else`).toBe(204)
    }

    expect(
      app.violationLines(),
      'a refusal of injected extension content is real and is nobody\'s to fix: no change to Dana would stop it, and the extension id in the host names the software a person has installed',
    ).toEqual([])
  })

  test('data: goes under style-src and stays under script-src', async () => {
    app = await startCspReportApp()
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'style-src-elem',
        blockedUri: 'data:text/css;base64,Ym9keSB7fQ==',
      }),
    )
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'script-src',
        blockedUri: 'data:text/javascript,alert(1)',
      }),
    )

    expect(
      app.violationLines().map((line) => [line.fields.directive, line.fields.blocked_uri]),
      "a data: stylesheet is what reader modes and translation widgets inject, and style-src is 'unsafe-inline' here so no such refusal can be Dana's; a data: script is code assembled at runtime, which is the refusal this whole policy exists to produce, and dropping it would be the one filter that cost more than it saved",
    ).toEqual([['script-src', 'data:']])
  })

  test('a body over the cap is refused before it is read', async () => {
    app = await startCspReportApp()
    const response = await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        blockedUri: 'inline',
        // A script sample the size of a page of application code, which is
        // exactly the field 10.5 forbids and the reason the cap is low.
        scriptSample: 'x'.repeat(32 * 1024),
      }),
    )

    expect(
      response.status,
      'AC-118 fixes 400 as this surface\'s answer to a body over the parse limit, and this endpoint is on this surface',
    ).toBe(400)
    expect(
      (response.json() as { error?: { code?: unknown; message?: unknown } }).error,
      'the 7.0 envelope, and nothing in it read out of the body (AC-117)',
    ).toEqual({ code: 'bad_request', message: 'Malformed report.' })
    expect(
      { violations: app.violationLines(), sentry: app.messages },
      'an oversized body is not an event worth a log line or a Sentry message',
    ).toEqual({ violations: [], sentry: [] })
  })

  test('an unreadable body and an unexpected content type are both quiet', async () => {
    app = await startCspReportApp()
    const garbage = await app.report(REPORT_URI_TYPE, 'this is not JSON')
    // The two types the endpoint declares are the two browsers post. A body
    // under any other type is somebody probing, and is dropped unparsed
    // rather than being handed to the 3 MB parser the rest of the API uses.
    const wrongType = await app.report(
      'application/json',
      reportUriBody({ documentUri: `${app.origin}/app`, blockedUri: 'inline' }),
    )

    expect(garbage.status).toBe(400)
    expect(wrongType.status).toBe(204)
    expect(
      { violations: app.violationLines(), sentry: app.messages },
      'neither is a report, so neither is an event',
    ).toEqual({ violations: [], sentry: [] })
  })

  test('the thirty-first report in a minute is refused (10.4)', async () => {
    const limit = RATE_LIMIT_POLICY.cspReportsPerMinute
    app = await startCspReportApp({ cspReportsPerMinute: limit })
    const body = reportUriBody({
      documentUri: `${app.origin}/app`,
      blockedUri: 'inline',
    })

    const statuses: number[] = []
    let retryAfter = 0
    for (let index = 0; index <= limit; index += 1) {
      const response = await app.report(REPORT_URI_TYPE, body)
      statuses.push(response.status)
      retryAfter = Number(response.headers['retry-after'] ?? 0)
    }

    expect(
      statuses.slice(0, limit).every((status) => status === 204),
      `the first ${String(limit)} reports in a minute are accepted, which is far above what a real breakage on a cold load produces`,
    ).toBe(true)
    expect(statuses.at(-1), '10.4: over the limit is 429').toBe(429)
    expect(retryAfter, '10.4: every refusal carries Retry-After').toBeGreaterThan(0)
    expect(
      app.violationLines(),
      'the limiter runs ahead of the parser and the filter, so a refused request costs nothing and logs nothing',
    ).toHaveLength(limit)
  })
})

/*
AC-395: given a Content-Security-Policy violation report posted from Dana's
own origin, in either of the two shapes browsers send, then the endpoint
answers 204 and writes exactly one structured log line carrying the
effective directive, the blocked URI and the document's path, and nothing
else from the report — no script sample and no query string — and hands
Sentry one message fingerprinted so that identical refusals are one issue.

**Both shapes, because a browser sends one or the other and never both.**
`application/csp-report` is what the `report-uri` directive posts:
hyphenated field names, one object under a `"csp-report"` key.
`application/reports+json` is the Reporting API's: camelCase, an array of
envelopes, `blockedURL` where the other says `blocked-uri`. An endpoint that
reads one and silently drops the other looks exactly like an endpoint that
works, because the browsers that would have told you are the ones being
dropped. That is issue #99's own failure mode reproduced one layer in, which
is why the two cases below are written as a pair rather than as one case and
a variant.

**And the fields are asserted by exclusion, not only by inclusion.** 10.5
names what may never be logged, and a violation report carries two things
that fall under it outright: `script-sample`, which is a slice of the source
that was refused and can therefore be page content, and the query string of
`document-uri`, which on any search URL is whatever someone typed. Both are
filled with recognisable strings in the bodies posted here, and the
assertion is that neither appears anywhere in what was logged or in what
reached Sentry. A criterion that only checked the three wanted fields were
present would pass just as happily on a line carrying all five.

**The fingerprint is asserted because volume is what makes an alert
worthless.** A policy that refuses the theme script refuses it on every cold
load for everybody. Without a fingerprint that is a hundred Sentry issues a
day, and the hundred-and-first is the one nobody reads; with one on the
directive and the blocked URI it is one issue with a count on it.

Spec: 10.5, 10.8, 11.12.
*/
import { afterEach, describe, expect, test } from 'vitest'

import {
  REPORTS_JSON_TYPE,
  REPORT_URI_TYPE,
  reportUriBody,
  reportsJsonBody,
  startCspReportApp,
} from './csp-report-harness.js'
import type { CspReportTestApp } from './csp-report-harness.js'

/** The two strings 10.5 forbids, planted in every body posted below. */
const SCRIPT_SAMPLE = 'document.title="the private note of a real person"'
const QUERY_STRING = 'q=a+private+search+term'

let app: CspReportTestApp | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('AC-395 a report from this origin is one line and one Sentry message', () => {
  test('the report-uri shape', async () => {
    app = await startCspReportApp()
    const response = await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app/tasks?${QUERY_STRING}`,
        effectiveDirective: 'script-src-elem',
        blockedUri: 'inline',
        scriptSample: SCRIPT_SAMPLE,
      }),
    )

    expect(response.status, 'a report is always answered 204').toBe(204)
    expect(app.violationLines()).toHaveLength(1)
    const [line] = app.violationLines()
    expect(line?.level, "a refusal is a warning: it is not an error this process made, and it is not routine (10.5)").toBe('warn')
    expect(line?.fields, 'the whole of a csp_violation line (10.5)').toEqual({
      event: 'csp_violation',
      // `inline` is the value that matters most of all: it is what issue #34
      // was, the theme script refused because no script-src named its hash.
      directive: 'script-src-elem',
      blocked_uri: 'inline',
      document_path: '/app/tasks',
    })
  })

  test('the Reporting API shape', async () => {
    app = await startCspReportApp()
    const response = await app.report(
      REPORTS_JSON_TYPE,
      reportsJsonBody([
        {
          documentUrl: `${app.origin}/app/folders/6d5f0f3c-0000-4000-8000-000000000001?${QUERY_STRING}`,
          effectiveDirective: 'img-src',
          // An absolute URL keeps its scheme and host and loses the rest: the
          // host is what tells a reader which directive to widen, and the
          // path and query of a blocked URL can be anything at all.
          blockedUrl: 'https://images.example.test/photo.jpg?signature=secret',
          sample: SCRIPT_SAMPLE,
        },
      ]),
    )

    expect(response.status, 'a report is always answered 204').toBe(204)
    expect(app.violationLines()).toHaveLength(1)
    const [line] = app.violationLines()
    expect(line?.fields, 'the whole of a csp_violation line (10.5)').toEqual({
      event: 'csp_violation',
      directive: 'img-src',
      blocked_uri: 'https://images.example.test',
      document_path: '/app/folders/6d5f0f3c-0000-4000-8000-000000000001',
    })
  })

  test('neither shape carries the sample or the query anywhere', async () => {
    app = await startCspReportApp()
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app/tasks?${QUERY_STRING}`,
        blockedUri: 'inline',
        scriptSample: SCRIPT_SAMPLE,
      }),
    )
    await app.report(
      REPORTS_JSON_TYPE,
      reportsJsonBody([
        {
          documentUrl: `${app.origin}/app?${QUERY_STRING}`,
          blockedUrl: 'https://cdn.example.test/x.js',
          sample: SCRIPT_SAMPLE,
        },
      ]),
    )

    // Everything the application logged, at every level, and everything that
    // reached the tracker: the assertion is about the process's whole output
    // rather than about the two lines this test expected.
    const emitted = JSON.stringify({ lines: app.lines, messages: app.messages })
    for (const forbidden of [SCRIPT_SAMPLE, QUERY_STRING, 'private', 'secret']) {
      expect(
        emitted.includes(forbidden),
        `"${forbidden}" reached a log line or Sentry from a violation report, which 10.5 forbids: a script sample is page content and a query string is what someone typed`,
      ).toBe(false)
    }
  })

  test('Sentry gets one message per report, fingerprinted on the pair', async () => {
    app = await startCspReportApp()
    const body = reportUriBody({
      documentUri: `${app.origin}/app`,
      effectiveDirective: 'script-src-elem',
      blockedUri: 'inline',
      scriptSample: SCRIPT_SAMPLE,
    })
    // The same refusal three times, which is what a broken policy produces:
    // once per cold load, per person, forever.
    for (let index = 0; index < 3; index += 1) {
      expect((await app.report(REPORT_URI_TYPE, body)).status).toBe(204)
    }

    expect(app.messages).toHaveLength(3)
    const fingerprints = app.messages.map((message) =>
      JSON.stringify(message.context?.fingerprint),
    )
    expect(
      new Set(fingerprints).size,
      'three identical refusals must fingerprint identically, or a broken policy fills Sentry with one issue per page load and the alert is worth nothing (11.12)',
    ).toBe(1)
    expect(app.messages[0]?.context?.fingerprint).toEqual([
      'csp-violation',
      'script-src-elem',
      'inline',
    ])
    expect(
      app.messages[0]?.context?.level,
      'a refusal is a warning in Sentry as it is in the log',
    ).toBe('warning')

    /* And a different refusal is a different issue: a fingerprint that
       collapsed everything to one would hide the second defect behind the
       first, which is the failure that looks like success. */
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'img-src',
        blockedUri: 'blob:',
      }),
    )
    expect(app.messages).toHaveLength(4)
    expect(
      JSON.stringify(app.messages[3]?.context?.fingerprint),
    ).not.toEqual(fingerprints[0])
  })

  test('one posted body of several reports is several lines', async () => {
    /* The Reporting API batches, and a cold load against a policy sized
       wrongly refuses more than one thing. A reader that took only the first
       envelope would report the theme script and hide the three refusals
       behind it, which is how three of issue #99's four defects stayed
       hidden behind the one that got noticed. */
    app = await startCspReportApp()
    const response = await app.report(
      REPORTS_JSON_TYPE,
      reportsJsonBody([
        { documentUrl: `${app.origin}/app`, effectiveDirective: 'script-src-elem', blockedUrl: 'inline' },
        { documentUrl: `${app.origin}/app`, effectiveDirective: 'img-src', blockedUrl: 'blob:' },
        { documentUrl: `${app.origin}/app`, effectiveDirective: 'media-src', blockedUrl: 'blob:' },
      ]),
    )

    expect(response.status).toBe(204)
    expect(app.violationLines().map((line) => line.fields.directive)).toEqual([
      'script-src-elem',
      'img-src',
      'media-src',
    ])
  })
})

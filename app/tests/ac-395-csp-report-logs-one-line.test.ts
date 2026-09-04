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

**The fingerprint and the throttle are asserted together, because one
without the other is not the protection it looks like.** A policy that
refuses the theme script refuses it on every cold load for everybody. The
fingerprint makes that one issue in Sentry rather than a hundred — but
Sentry's quota is denominated in *events* and not in issues, so a hundred
grouped events still spend a hundred, and this endpoint is open to the
world: 10.4's thirty requests a minute times ten violations a body was 300
events a minute from one stranger against a plan that allows about 5,000 a
month (11.12). So a fingerprint is sent at most once per ten-minute window.

**And per-fingerprint alone is still not a bound, which is the case the
last test here exists for.** The fingerprint contains the blocked URI, and
the blocked URI is a stranger's string: varying one character varies the
key. Two things answer that together. The values in the fingerprint are the
whitelisted ones the log line carries, so the key space is the directive
crossed with a keyword, a `scheme://host` or `other`; and a hard budget of
twenty events per window sits over the top, after which reports are logged
and not captured. The budget sends exactly one message saying so, because a
channel that simply went quiet under load would be indistinguishable from a
deployment with nothing wrong — which is the disease this whole issue was
opened about, reproduced one level up.

**The log line is not throttled, and the asymmetry is the design.** The log
is the complete record of how often a refusal happens; Sentry is how anyone
finds out that it does at all. A case below posts the same report twice and
asserts two lines against one message, which is the only shape that would
catch either half being wired to the other.

Spec: 10.5, 10.8, 11.12.
*/
import { afterEach, describe, expect, test } from 'vitest'

import { SENTRY_BUDGET_PER_WINDOW } from '../src/server/security/csp-report.js'

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

  test('Sentry gets one message per fingerprint per window, and the log gets all of them', async () => {
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

    expect(
      app.violationLines(),
      'every kept report is logged. The log is the record of how often a refusal happens and is throttled by nothing but the route limiter',
    ).toHaveLength(3)
    expect(
      app.messages,
      'and Sentry hears about it once. Grouping a hundred events into one issue still spends a hundred events of a quota 11.12 sizes for ordinary error volume, and this endpoint takes no session',
    ).toHaveLength(1)
    expect(app.messages[0]?.context?.fingerprint).toEqual([
      'csp-violation',
      'script-src-elem',
      'inline',
    ])
    expect(
      app.messages[0]?.context?.level,
      'a refusal is a warning in Sentry as it is in the log',
    ).toBe('warning')

    /* And a different refusal is a different fingerprint, so the throttle
       does not hide the second defect behind the first — which is the way
       a throttle fails that looks exactly like a throttle working. */
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'img-src',
        blockedUri: 'blob:',
      }),
    )
    expect(app.violationLines()).toHaveLength(4)
    expect(app.messages).toHaveLength(2)
    expect(app.messages[1]?.context?.fingerprint).toEqual([
      'csp-violation',
      'img-src',
      'blob:',
    ])
  })

  test('the budget stops Sentry and says so, and the log keeps everything', async () => {
    app = await startCspReportApp()
    const overBudget = SENTRY_BUDGET_PER_WINDOW + 2
    // Distinct fingerprints, which is what defeats the per-fingerprint
    // throttle: a stranger varying the blocked host produces a new key
    // every time, and only an absolute budget answers that.
    for (let index = 0; index < overBudget; index += 1) {
      const response = await app.report(
        REPORT_URI_TYPE,
        reportUriBody({
          documentUri: `${app.origin}/app`,
          effectiveDirective: 'script-src-elem',
          blockedUri: `https://host-${String(index)}.example.test/x.js`,
        }),
      )
      expect(response.status).toBe(204)
    }

    expect(
      app.violationLines(),
      'the log is the complete record and the budget does not touch it: every refusal that happened is here',
    ).toHaveLength(overBudget)

    const violationMessages = app.messages.filter(
      (message) => message.context?.fingerprint?.[0] === 'csp-violation',
    )
    expect(
      violationMessages,
      `at most ${String(SENTRY_BUDGET_PER_WINDOW)} Sentry events a window from this endpoint, whoever asks and however varied the fingerprints`,
    ).toHaveLength(SENTRY_BUDGET_PER_WINDOW)

    const spent = app.messages.filter(
      (message) => message.context?.fingerprint?.[0] === 'csp-violation-budget-spent',
    )
    expect(
      spent,
      'exactly one message per window saying the channel has gone blind, because a quiet alert channel and a healthy deployment look identical and that is the disease this issue was opened about',
    ).toHaveLength(1)
    expect(app.messages).toHaveLength(SENTRY_BUDGET_PER_WINDOW + 1)
  })

  test('the Sentry copy carries only what the log line carries', async () => {
    /* The fingerprint, the message and the tags are built from the
       whitelisted values and never from the report. A blocked URI is a
       caller-supplied string: unsanitised it was both a 10.5 leak into the
       tracker and an unbounded fingerprint key space, which is what made
       the budget above necessary as well as this assertion. */
    app = await startCspReportApp()
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'script-src-elem',
        blockedUri: 'https://cdn.example.test/a/b.js?token=A_LONG_SECRET_VALUE',
        scriptSample: SCRIPT_SAMPLE,
      }),
    )

    const [message] = app.messages
    expect(message?.context?.fingerprint).toEqual([
      'csp-violation',
      'script-src-elem',
      'https://cdn.example.test',
    ])
    expect(message?.message).toBe(
      'CSP refused script-src-elem: https://cdn.example.test',
    )
    expect(message?.context?.tags).toEqual({
      csp_directive: 'script-src-elem',
      csp_blocked_uri: 'https://cdn.example.test',
    })
    const [line] = app.violationLines()
    expect(
      [message?.context?.fingerprint?.[1], message?.context?.fingerprint?.[2]],
      'the two destinations receive the same two values, or one of them is not whitelisted',
    ).toEqual([line?.fields.directive, line?.fields.blocked_uri])
  })

  test('a value the whitelist refuses reaches neither destination', async () => {
    /* The case above cannot tell a whitelisted value from an unwhitelisted
       one, because for an ordinary report the two are the same string. This
       one is a value the report reader passes through and the 10.5
       whitelist refuses: `url.host` keeps the brackets of an IPv6 literal
       and `safeBlockedUri` admits no bracket, so the log says `other`. If
       the Sentry payload were built from the report rather than from the
       whitelisted fields, this is where the difference would show — and it
       is a real shape, not a contrived one: any blocked host outside the
       admitted characters lands here. */
    app = await startCspReportApp()
    await app.report(
      REPORT_URI_TYPE,
      reportUriBody({
        documentUri: `${app.origin}/app`,
        effectiveDirective: 'script-src-elem',
        blockedUri: 'https://[2001:db8::1]/payload.js',
      }),
    )

    const [line] = app.violationLines()
    expect(line?.fields.blocked_uri, 'the 10.5 whitelist refuses it').toBe('other')
    const [message] = app.messages
    expect(
      message?.context?.fingerprint,
      'and the fingerprint is built from the same refused value, so the tracker sees exactly what the log saw',
    ).toEqual(['csp-violation', 'script-src-elem', 'other'])
    expect(message?.message).toBe('CSP refused script-src-elem: other')
    expect(message?.context?.tags?.csp_blocked_uri).toBe('other')
    expect(
      JSON.stringify(app.messages),
      'nothing the whitelist refused is anywhere in what reached Sentry',
    ).not.toContain('2001:db8')
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
    // Three distinct fingerprints, so the throttle holds none of them back:
    // it bounds repetition, never the first sight of a defect.
    expect(app.messages).toHaveLength(3)
  })
})

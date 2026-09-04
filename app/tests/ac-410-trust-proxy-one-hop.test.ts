/*
AC-410: this application trusts exactly one proxy hop, so `req.ip` is the
address Render's edge appended to `X-Forwarded-For` rather than the edge
itself — and the per-address limit of 10.4 therefore buckets per client.

## The defect this closes

`trust proxy` was set nowhere in `app/src` (issue #153, found by the reviewer
on #99's branch and older than that branch). 11.11 puts production behind
Render's edge, which terminates TLS and opens its own socket to this process,
so `req.ip` was the edge's address for every visitor on earth and every
limiter keyed on an address was **one bucket for the whole deployment**. A
stranger could hold such an endpoint at 429 for everybody with a few requests
a minute.

**Nothing local could ever have shown it**, which is why it survived from the
first per-address limiter to this one: under test and in development the
socket peer *is* the real client, so every existing case measured the fixed
behaviour on the broken code. That is the whole reason this criterion sends
the header by hand instead of trusting a limiter to disagree with itself.

## Why the number is 1 and never `true`

`1` means trust the one hop nearest this process. `true` means trust the
entire header, which the client writes: a caller could then pick a fresh
address per request and never meet a limit at all. express-rate-limit refuses
that outright with `ERR_ERL_PERMISSIVE_TRUST_PROXY` — but **only from inside
its own default key generator, and every limiter in this repository supplies
its own**, verified in the installed 8.6.2 on 2026-09-04. So the library is
not a guard here in either direction: it never fired on the defect and it
would not fire on `true`. The first case below is that missing guard, written
by hand.

## What this cannot say, and it is worth knowing before reading the last case

**`POST /api/csp-report` carries the only per-address limit this application
has.** Issue #153 speaks of "the sign-in and callback limits, the upload
limits", and as of 2026-09-04 there are none: `security/rate-limit.ts` keys
every other limiter on the session's user id. So the last case drives the CSP
limiter, which is the whole of the per-client population today, and the fix
matters at least as much for the limiters that do not exist yet — every one
written from here on is per client because of this line, and would have been
per deployment without it.

Spec: 10.4, 10.5, 11.11; issue #153.
*/
import { afterEach, describe, expect, test } from 'vitest'

import {
  REPORT_URI_TYPE,
  reportUriBody,
  startCspReportApp,
} from './csp-report-harness.js'
import type { CspReportTestApp } from './csp-report-harness.js'

let app: CspReportTestApp | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

/** RFC 5737 documentation addresses, which can never be a real peer. */
const CLIENT = '203.0.113.9'
const SPOOFED = '198.51.100.7'
const OTHER_CLIENT = '203.0.113.42'

interface Probe {
  ip: unknown
  ips: unknown
}

async function probe(
  running: CspReportTestApp,
  forwardedFor?: string,
): Promise<Probe> {
  const response = await running.get(
    '/__ip-probe',
    forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  )
  expect(response.status).toBe(200)
  return response.json() as Probe
}

describe('AC-410: one proxy hop, and the limit is per client behind it', () => {
  test('the application trusts exactly one hop, and not the whole header', async () => {
    app = await startCspReportApp()
    expect(
      app.trustProxy,
      'issue #153: `trust proxy` is 1 — one hop, which is what 11.11 deploys behind. ' +
        '`false` leaves every per-address limit one bucket for the deployment; `true` lets ' +
        'a caller write their own X-Forwarded-For and never meet a limit at all',
    ).toBe(1)
    expect(
      app.trustProxy,
      'and never the boolean, which express-rate-limit will not even key on',
    ).not.toBe(true)
  })

  test('one forwarded address is the address req.ip reads', async () => {
    app = await startCspReportApp({ withIpProbe: true })
    expect(
      (await probe(app, CLIENT)).ip,
      'behind one hop, req.ip is the address the proxy forwarded and not the socket peer',
    ).toBe(CLIENT)
  })

  test('two forwarded addresses read as the last, never the first', async () => {
    // The security case, and the reason `true` is refused above. The first
    // address is whatever the caller wrote into the header themselves; the
    // last is the one Render appended, naming whoever opened the connection
    // to it.
    //
    // The `ips` arm was written expecting the whole header and corrected
    // against the run rather than the other way round: `proxy-addr` truncates
    // its list at the first *untrusted* address, so at one hop `req.ips` is
    // that one hop and the caller-written address is not merely unchosen, it
    // is not in the chain at all. That is the stronger statement and it is the
    // measured one.
    app = await startCspReportApp({ withIpProbe: true })
    const read = await probe(app, `${SPOOFED}, ${CLIENT}`)
    expect(read.ip, 'req.ip is the last address, the hop the proxy added').toBe(
      CLIENT,
    )
    expect(
      read.ip,
      'and never the first, which a client could write to walk out of every per-address limit',
    ).not.toBe(SPOOFED)
    expect(
      read.ips,
      'the trusted chain is the one hop and nothing the caller wrote reaches it',
    ).toEqual([CLIENT])
  })

  test('with no forwarded header at all, req.ip is the socket peer', async () => {
    // Local and under test, where there is no proxy. This is the arm that
    // says the fix costs nothing off Render, and it is why every existing
    // criterion that drives a limiter still measures what it always did.
    app = await startCspReportApp({ withIpProbe: true })
    const read = await probe(app)
    expect(
      String(read.ip),
      'with nothing forwarded there is no hop to trust and the peer is the answer',
    ).toMatch(/127\.0\.0\.1$/)
    expect(read.ips, 'and no forwarded chain to report').toEqual([])
  })

  test('two clients behind the edge do not share a per-address limit', async () => {
    // The product consequence, driven against the mounted route rather than
    // against the limiter alone. On the broken code every request below
    // carried one key, the loopback peer, and the fourth line would have been
    // 429 for a client that had sent nothing.
    const limit = 2
    app = await startCspReportApp({ cspReportsPerMinute: limit })
    const running = app
    const body = reportUriBody({
      documentUri: `${running.origin}/app`,
      blockedUri: 'inline',
    })
    const send = async (from: string): Promise<number> =>
      (
        await running.report(REPORT_URI_TYPE, body, {
          'x-forwarded-for': from,
        })
      ).status

    const first = [await send(CLIENT), await send(CLIENT)]
    const refused = await send(CLIENT)
    const stranger = await send(OTHER_CLIENT)

    expect(first, 'one client spends its own two').toEqual([204, 204])
    expect(refused, '10.4: past its own limit, that client is refused').toBe(429)
    expect(
      stranger,
      'issue #153: a second client behind the same edge has a bucket of its own. ' +
        'Sharing one is what a deployment without `trust proxy` does, and it lets a ' +
        'stranger hold a per-address endpoint at 429 for every visitor',
    ).toBe(204)
    expect(
      running.violationLines(),
      'and the refusal cost nothing: three reports were kept, the fourth never reached the parser',
    ).toHaveLength(3)
  })
})

/*
The harness AC-394 to AC-396 drive the CSP violation endpoint with
(issue #99).

It is its own file rather than an extension of `auth-harness.ts` because it
needs none of what that one builds. `POST /api/csp-report` takes no session,
touches no database and has no dbClient to be handed: 11.10 says a
database-free surface may construct the application bare, and this is one.
So there is no OIDC stub here, no cast, no cleanup and no 60-second
`beforeAll` — a case starts in milliseconds, which is what lets these three
criteria drive the endpoint dozens of times each.

**The two recorders are the point.** Everything this endpoint does that is
worth asserting, it does to the logger and to the error tracker, and both
are `createApp` options. So the criteria read what was recorded rather than
inspecting a process's stdout, which is how AC-103 and AC-104 already do it.

**And APP_ORIGIN has to be set before `createApp` is called, not after.**
The endpoint drops any report whose document is not this deployment's
origin, and it reads that origin at construction — the same pattern
`auth-harness.ts` needs for the same reason, and the origin is not knowable
until the port is bound, so the server exists before the application it
serves.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { createApp } from '../../src/server/index.js'
import type { ErrorTracker, MessageContext } from '../../src/server/observability/error-tracker.js'
import { createSecurityLogger } from '../../src/server/security/log.js'
import type { LogSink } from '../../src/server/security/log.js'
import { createRateLimits } from '../../src/server/security/rate-limit.js'

import { rawRequest } from './http-client.js'
import type { RawResponse } from './http-client.js'

/** One line as the logger handed it to its sink. */
export interface LoggedLine {
  level: 'info' | 'warn' | 'error'
  fields: Record<string, unknown>
  message: string
}

/** One message as the endpoint handed it to the tracker. */
export interface TrackedMessage {
  message: string
  context: MessageContext | undefined
}

export interface CspReportTestApp {
  origin: string
  /** Every line the application logged, at every level. */
  lines: LoggedLine[]
  /** Only the `csp_violation` ones, which is what the criteria count. */
  violationLines(): LoggedLine[]
  messages: TrackedMessage[]
  /**
   * POST a body to the endpoint under a content type of your choosing, and
   * since issue #153 under any extra request headers you name. AC-410 sends
   * `X-Forwarded-For`; nothing else uses the third argument, and a caller
   * that omits it sends exactly what it sent before.
   */
  report(
    contentType: string,
    body: string,
    headers?: Record<string, string>,
  ): Promise<RawResponse>
  get(path: string, headers?: Record<string, string>): Promise<RawResponse>
  /**
   * What `createApp` set `trust proxy` to, read back off the application
   * rather than off `index.ts` as text (issue #153). It is exposed because
   * the number is the whole of that fix and because the two values that are
   * wrong fail in opposite directions: `false` leaves every per-address limit
   * one bucket for the deployment, and `true` lets a caller spoof
   * `X-Forwarded-For` and never meet one at all.
   */
  trustProxy: unknown
  close(): Promise<void>
}

export interface CspReportAppOptions {
  /**
   * A real limiter at this many reports a minute. Absent, the application
   * builds its own, which under Vitest is effectively unlimited so that a
   * criterion driving the endpoint thirty times is not measuring 10.4.
   */
  cspReportsPerMinute?: number
  /** A built client directory, for the criterion that needs an HTML response. */
  clientDist?: string
  /**
   * Mounts `GET /__ip-probe`, which answers `{ ip, ips }` as express saw
   * them, on this application only (issue #153).
   *
   * **It is added after `createApp` returns and so it is not part of the
   * application under any other test**, which matters: `ac-236` and `ac-397`
   * walk the mounted router and pin its route count, and a route added inside
   * `createApp` for a criterion's convenience would move both. The path is
   * outside `/api`, so it is reached rather than swallowed by the 404 mounted
   * there, and this harness passes no `clientDist`, so no SPA fallback stands
   * in front of it either.
   *
   * There is no other way to read `req.ip` from outside. Nothing this
   * application logs or answers carries the caller's address — deliberately,
   * per 10.5 — so the alternative was to assert the setting and reason about
   * what express does with it, which is the shape of belief this criterion
   * exists to replace with a measurement.
   */
  withIpProbe?: boolean
}

export async function startCspReportApp(
  options: CspReportAppOptions = {},
): Promise<CspReportTestApp> {
  const server: Server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`

  const previousAppOrigin = process.env.APP_ORIGIN
  process.env.APP_ORIGIN = origin

  const lines: LoggedLine[] = []
  const record =
    (level: 'info' | 'warn' | 'error') =>
    (fields: Record<string, unknown>, message: string): void => {
      lines.push({ level, fields, message })
    }
  const sink: LogSink = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  }

  const messages: TrackedMessage[] = []
  const errorTracker: ErrorTracker = {
    captureException: () => undefined,
    captureMessage: (message, context) => messages.push({ message, context }),
  }

  const app = createApp({
    securityLog: createSecurityLogger(sink),
    errorTracker,
    ...(options.clientDist === undefined ? {} : { clientDist: options.clientDist }),
    ...(options.cspReportsPerMinute === undefined
      ? {}
      : {
          rateLimits: createRateLimits({
            limits: { cspReportsPerMinute: options.cspReportsPerMinute },
          }),
        }),
  })
  process.env.APP_ORIGIN = previousAppOrigin
  if (options.withIpProbe === true) {
    app.get('/__ip-probe', (request, response) => {
      response.status(200).json({ ip: request.ip, ips: request.ips })
    })
  }
  server.on('request', app)

  return {
    origin,
    lines,
    violationLines: () => lines.filter((line) => line.fields.event === 'csp_violation'),
    messages,
    trustProxy: app.get('trust proxy'),
    async report(contentType, body, headers = {}) {
      return rawRequest(`${origin}/api/csp-report`, {
        method: 'POST',
        headers: { 'content-type': contentType, ...headers },
        body,
      })
    },
    async get(path, headers = {}) {
      return rawRequest(`${origin}${path}`, { headers })
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

/**
 * A report in the `report-uri` shape, with every field a browser sends.
 *
 * The two the criteria care about are the ones that must never be logged:
 * `script-sample`, which is a slice of the refused script, and the query
 * string on `document-uri`. Both are filled with recognisable strings here
 * so that a criterion asserting their absence is asserting something.
 */
export function reportUriBody(fields: {
  documentUri: string
  effectiveDirective?: string
  blockedUri: string
  scriptSample?: string
}): string {
  return JSON.stringify({
    'csp-report': {
      'document-uri': fields.documentUri,
      referrer: '',
      'violated-directive': `${fields.effectiveDirective ?? 'script-src-elem'} 'self'`,
      'effective-directive': fields.effectiveDirective ?? 'script-src-elem',
      'original-policy': "default-src 'self'; script-src 'self'",
      disposition: 'enforce',
      'blocked-uri': fields.blockedUri,
      'status-code': 200,
      ...(fields.scriptSample === undefined
        ? {}
        : { 'script-sample': fields.scriptSample }),
    },
  })
}

/** The same report in the Reporting API shape: an array of envelopes. */
export function reportsJsonBody(
  entries: ReadonlyArray<{
    documentUrl: string
    effectiveDirective?: string
    blockedUrl: string
    sample?: string
    type?: string
  }>,
): string {
  return JSON.stringify(
    entries.map((entry) => ({
      age: 0,
      type: entry.type ?? 'csp-violation',
      url: entry.documentUrl,
      user_agent: 'criterion',
      body: {
        documentURL: entry.documentUrl,
        referrer: '',
        blockedURL: entry.blockedUrl,
        effectiveDirective: entry.effectiveDirective ?? 'script-src-elem',
        originalPolicy: "default-src 'self'; script-src 'self'",
        disposition: 'enforce',
        statusCode: 200,
        ...(entry.sample === undefined ? {} : { sample: entry.sample }),
      },
    })),
  )
}

export const REPORT_URI_TYPE = 'application/csp-report'
export const REPORTS_JSON_TYPE = 'application/reports+json'

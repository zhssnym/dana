/*
`POST /api/csp-report`, where a browser posts its own report of a refusal
(issue #99). The reading is in security/csp-report.ts; this file is the
endpoint around it.

**Outside `/api/v1` and beside `/api/health`, deliberately.** The browser
posts this itself, from its own networking stack: there is no session cookie
on it, no `X-CSRF-Token` header, and no way to put either there. Everything
under `/api/v1` requires both, and correctly, so an endpoint that cannot
have them does not belong under that mount. It is `health.ts`'s neighbour
for the same reason health is: a caller that is not a signed-in person.
`tests/ac-236-structural-guard-sweep.test.ts` carries the exemption and the
reason beside it.

**What it may do is bounded to match.** It reads nothing, writes nothing,
touches no database and takes no dbClient. The whole of its effect is a
`csp_violation` log line and a Sentry message, and both carry only what
security/csp-report.ts allows through. So the worst a stranger can do with
it is spend a bounded number of log lines, which the limiter bounds and the
16 KB cap bounds again.

**And it answers 204 for a report it drops exactly as for one it keeps.**
The status must not vary with the content of a report, or the endpoint
becomes an oracle for what this deployment's origin is and which schemes it
filters, answerable one probe at a time. What the status does vary with is
the shape of the *request* — a body over the cap or one that is not JSON is
400, the answer AC-118 fixes for every endpoint here — and with the limiter,
which is 429 with Retry-After because 10.4 says every limit answers that
way. Neither says anything about a report.
*/
import express from 'express'
import type { ErrorRequestHandler, Request, Router } from 'express'

import { errorBody } from '../http/errors.js'
import type { ErrorTracker } from '../observability/error-tracker.js'
import { originOf, violationsIn } from '../security/csp-report.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import type { SecurityLogger } from '../security/log.js'

/** The mount, in one place: index.ts mounts it here, the policy in the same
 * file names this path in `report-uri` and in `Reporting-Endpoints`, and
 * three of them agreeing by hand is three that can disagree. */
export const CSP_REPORT_PATH = '/api/csp-report'

/**
 * 16 KB. A violation report is a few hundred bytes and the Reporting API
 * batches a handful, so this is far above any real one; it is here because
 * the global parser's 3 MB (10.3's row, sized for workflow imports) would
 * let an unauthenticated stranger make this process buffer megabytes, and
 * nothing about a CSP report needs that.
 */
export const CSP_REPORT_BODY_LIMIT = 16 * 1024

/**
 * The two content types browsers post, and the reason the parser has to be
 * told about them at all: `express.json` matches `application/json` and
 * neither of these is it, so without this list every report would arrive
 * with an empty body and be dropped silently — which is the failure mode
 * this whole issue is about.
 */
export const CSP_REPORT_CONTENT_TYPES = [
  // The `report-uri` directive's shape, `{ "csp-report": { ... } }`.
  'application/csp-report',
  // The Reporting API's shape, an array of envelopes.
  'application/reports+json',
]

export interface CspReportRouterOptions {
  securityLog: SecurityLogger
  errorTracker: ErrorTracker
  rateLimits?: RateLimits
  /**
   * This deployment's own origin, APP_ORIGIN. A report about any other
   * document is dropped, which is the filter that removes a scan or an
   * extension's `about:blank` frame before anything is logged.
   */
  appOrigin?: string
}

/**
 * The origin a report has to name.
 *
 * APP_ORIGIN when it is set, which in production it always is: 11.11 makes
 * it an environment variable and `assertSignInIsPossible` refuses to boot
 * without it, so the fallback below is a development affordance and never
 * the production path. The fallback is the origin the caller reached this
 * process on, which is the Host header — no weaker than what every other
 * route on this application already trusts it for, and this one has nothing
 * to protect: a caller who forges it can log a line they could have logged
 * anyway by knowing APP_ORIGIN.
 */
function expectedOriginFor(req: Request, appOrigin: string | undefined): string {
  return (
    originOf(appOrigin) ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`
  )
}

export function createCspReportRouter(options: CspReportRouterOptions): Router {
  const router = express.Router()

  router.post(
    '/',
    // The limiter first, so a flood is refused before its body is read.
    optionalLimit(options.rateLimits?.cspReports),
    express.json({
      type: [...CSP_REPORT_CONTENT_TYPES],
      limit: CSP_REPORT_BODY_LIMIT,
    }),
    (req, res) => {
      // `unknown` and not the parser's `any`: everything below treats this
      // as a stranger's JSON, because that is what it is.
      const body: unknown = req.body
      const expectedOrigin = expectedOriginFor(req, options.appOrigin)

      for (const violation of violationsIn(body, { expectedOrigin })) {
        options.securityLog.cspViolation(violation)
        // One Sentry message per kept report, fingerprinted on the pair that
        // makes two refusals the same refusal. A policy that refuses the
        // theme script refuses it for everyone on every cold load; without
        // the fingerprint that is a hundred issues a day and nobody reads
        // the hundred-and-first. The message carries the same two values
        // and nothing else, so it is as safe as the log line.
        options.errorTracker.captureMessage?.(
          `CSP refused ${violation.directive}: ${violation.blockedUri}`,
          {
            level: 'warning',
            fingerprint: [
              'csp-violation',
              violation.directive,
              violation.blockedUri,
            ],
            tags: {
              csp_directive: violation.directive,
              csp_blocked_uri: violation.blockedUri,
            },
          },
        )
      }

      res.status(204).end()
    },
  )

  /*
  The parser's own refusals, kept inside this router.

  Over the cap and unparseable both answer 400 in the 7.0 envelope, which is
  what AC-118 fixes for every endpoint on this surface ("does not parse ...
  or exceeds the parse limit, then 400 in the envelope"), and what
  observability/request-errors.ts already does with the same body-parser
  error everywhere else. A 413 here would be a second answer to a condition
  this contract has already answered once.

  Only the parser's faults are converted. Anything else — a bug in the
  handler above — is handed on to the application's error handler, which
  logs it and answers 500, because a defect here silently answering 400
  would be the same class of silence issue #99 exists to end.
  */
  const onParserError: ErrorRequestHandler = (error, _req, res, next) => {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
        ? error.status
        : undefined
    if (status === undefined || status < 400 || status >= 500) {
      next(error)
      return
    }
    // No detail from the body: a stranger learns the request was malformed
    // and nothing about what this endpoint would have read out of it.
    res.status(400).json(errorBody('bad_request', 'Malformed report.'))
  }
  router.use(onParserError)

  return router
}

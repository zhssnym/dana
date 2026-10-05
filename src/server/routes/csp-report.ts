/*
`POST /api/csp-report`: browsers post CSP refusals here, without a session or
CSRF token, so it lives outside `/api/v1` (exempted in the ac-236 sweep). It
touches no database; its effects are a log line and a bounded Sentry message.
Always 204 whatever the report says, so it is not an oracle; only malformed or
oversized bodies (400) and the limiter (429) change the status.
*/
import express from 'express'
import type { ErrorRequestHandler, Request, Router } from 'express'

import { errorBody } from '../http/errors.js'
import type { ErrorTracker } from '../observability/error-tracker.js'
import {
  createSendBudget,
  createSendThrottle,
  originOf,
  violationsIn,
} from '../security/csp-report.js'
import { optionalLimit } from '../security/rate-limit.js'
import type { RateLimits } from '../security/rate-limit.js'
import { safeCspViolation } from '../security/log.js'
import type { SecurityLogger } from '../security/log.js'

/** Also named by the CSP header in index.ts. */
export const CSP_REPORT_PATH = '/api/csp-report'

/** 16 KB, so unauthenticated callers cannot use the global 3 MB parser limit. */
export const CSP_REPORT_BODY_LIMIT = 16 * 1024

/** express.json must be told these types, or every report arrives empty. */
export const CSP_REPORT_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
]

export interface CspReportRouterOptions {
  securityLog: SecurityLogger
  errorTracker: ErrorTracker
  rateLimits?: RateLimits
  /** Reports about any other document origin are dropped. */
  appOrigin?: string
}

/**
 * APP_ORIGIN, always set in production. The Host fallback is for development
 * only, and a forged Host can only log a line.
 */
function expectedOriginFor(req: Request, appOrigin: string | undefined): string {
  return (
    originOf(appOrigin) ?? `${req.protocol}://${req.get('host') ?? 'localhost'}`
  )
}

export function createCspReportRouter(options: CspReportRouterOptions): Router {
  const router = express.Router()

  /* The throttle lives here, not in the tracker, so the tracker never drops
     what it is handed. */
  const sentryThrottle = createSendThrottle()

  /* An absolute budget too: the throttle's keys contain a stranger's host. */
  const sentryBudget = createSendBudget()

  router.post(
    '/',
    // Limit first, so a flood is refused before its body is read.
    optionalLimit(options.rateLimits?.cspReports),
    express.json({
      type: [...CSP_REPORT_CONTENT_TYPES],
      limit: CSP_REPORT_BODY_LIMIT,
    }),
    (req, res) => {
      const body: unknown = req.body
      const expectedOrigin = expectedOriginFor(req, options.appOrigin)

      for (const violation of violationsIn(body, { expectedOrigin })) {
        /* The log line and every Sentry field are built from the same
           whitelisted values. */
        const safe = safeCspViolation(violation)

        // Always logged; the rest only decides whether Sentry hears about it.
        options.securityLog.cspViolation(safe)

        // Sentry fingerprint and throttle key: grouping alone does not save quota.
        const fingerprint = ['csp-violation', safe.directive, safe.blockedUri]
        // A separator no sanitised value can contain.
        if (!sentryThrottle.allow(fingerprint.join('\u001f'))) continue

        const verdict = sentryBudget.take()
        if (verdict === 'silent') continue
        if (verdict === 'exhausted') {
          /* Sent once per window, so a silenced channel is not mistaken for a
             healthy one. */
          options.errorTracker.captureMessage(
            'CSP report budget spent for this window; refusals are still in the log',
            {
              level: 'warning',
              fingerprint: ['csp-violation-budget-spent'],
            },
          )
          continue
        }

        options.errorTracker.captureMessage(
          `CSP refused ${safe.directive}: ${safe.blockedUri}`,
          {
            level: 'warning',
            fingerprint,
            tags: {
              csp_directive: safe.directive,
              csp_blocked_uri: safe.blockedUri,
            },
          },
        )
      }

      res.status(204).end()
    },
  )

  /*
  Parser errors (too large, not JSON) answer 400 in the 7.0 envelope (AC-118).
  Anything else goes to the app's error handler and becomes a 500.
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
    // No detail about the body.
    res.status(400).json(errorBody('bad_request', 'Malformed report.'))
  }
  router.use(onParserError)

  return router
}

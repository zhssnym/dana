/*
The 10.4 in-memory limits, one set per app shared by all routers. Assumes a
single instance; a scale-out needs a shared counter store.
*/
import type { Request, RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

import { sessionOf } from '../auth/middleware.js'
import { sendError } from '../http/errors.js'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * 60 * 1_000
const DAY_MS = 24 * 60 * 60 * 1_000
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const RATE_LIMIT_POLICY = {
  invitePerMinute: 5,
  invitePerDay: 20,
  searchPerMinute: 30,
  mutationsPerMinute: 120,
  /* The one limit on a read: an export builds the whole document in memory. */
  exportPerHour: 5,
  /* Keyed on address: browsers post CSP reports without a session. */
  cspReportsPerMinute: 30,
  /* Keyed on address: sign-in precedes any session. The callback makes an
     outbound token exchange on an unauthenticated caller's request. */
  signInBeginsPerMinute: 20,
  signInCallbacksPerMinute: 20,
} as const

export interface RateLimits {
  generalMutations: RequestHandler
  invitesPerMinute: RequestHandler
  invitesPerDay: RequestHandler
  search: RequestHandler
  dataExport: RequestHandler
  cspReports: RequestHandler
  signInBegins: RequestHandler
  signInCallbacks: RequestHandler
}

interface RateLimitOverrides {
  invitePerMinute?: number
  invitePerDay?: number
  searchPerMinute?: number
  mutationsPerMinute?: number
  exportPerHour?: number
  cspReportsPerMinute?: number
  signInBeginsPerMinute?: number
  signInCallbacksPerMinute?: number
}

export interface CreateRateLimitsOptions {
  /** Test seam only. Production always reads the authenticated user id. */
  keyFor?: (req: Request) => string
  limits?: RateLimitOverrides
}

function retryAfterSeconds(req: Request, property: string, windowMs: number): number {
  const info = (req as Request & Record<string, unknown>)[property]
  if (
    typeof info === 'object' &&
    info !== null &&
    'resetTime' in info &&
    info.resetTime instanceof Date
  ) {
    return Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 1_000))
  }
  return Math.ceil(windowMs / 1_000)
}

function limiter(options: {
  windowMs: number
  limit: number
  identifier: string
  requestPropertyName: string
  keyFor: (req: Request) => string
  skip?: (req: Request) => boolean
}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    identifier: options.identifier,
    requestPropertyName: options.requestPropertyName,
    keyGenerator: options.keyFor,
    skip: options.skip,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.set(
        'Retry-After',
        String(
          retryAfterSeconds(
            req,
            options.requestPropertyName,
            options.windowMs,
          ),
        ),
      )
      sendError(
        res,
        429,
        'rate_limited',
        'Too many requests. Please wait and try again.',
      )
    },
  })
}

export function createRateLimits(
  options: CreateRateLimitsOptions = {},
): RateLimits {
  const configured = { ...RATE_LIMIT_POLICY, ...options.limits }
  const keyFor =
    options.keyFor ?? ((req: Request) => sessionOf(req)?.userId ?? 'no-session')

  return {
    generalMutations: limiter({
      windowMs: MINUTE_MS,
      limit: configured.mutationsPerMinute,
      identifier: 'authenticated-mutations-per-minute',
      requestPropertyName: 'mutationRateLimit',
      keyFor,
      skip: (req) => SAFE_METHODS.has(req.method),
    }),
    invitesPerMinute: limiter({
      windowMs: MINUTE_MS,
      limit: configured.invitePerMinute,
      identifier: 'invite-creates-per-minute',
      requestPropertyName: 'inviteMinuteRateLimit',
      keyFor,
    }),
    invitesPerDay: limiter({
      windowMs: DAY_MS,
      limit: configured.invitePerDay,
      identifier: 'invite-creates-per-day',
      requestPropertyName: 'inviteDayRateLimit',
      keyFor,
    }),
    search: limiter({
      windowMs: MINUTE_MS,
      limit: configured.searchPerMinute,
      identifier: 'searches-per-minute',
      requestPropertyName: 'searchRateLimit',
      keyFor,
    }),
    /** No `skip`: the route is a GET, so the SAFE_METHODS skip would disable it. */
    dataExport: limiter({
      windowMs: HOUR_MS,
      limit: configured.exportPerHour,
      identifier: 'data-exports-per-hour',
      requestPropertyName: 'exportRateLimit',
      keyFor,
    }),
    /*
    Keyed on req.ip, not the session (reports have none). ipKeyGenerator folds
    IPv6 to a /56 so one client cannot walk a subnet. Per client only because
    `trust proxy` is 1 (index.ts). The library's own trust-proxy validations
    run only in its default key generator, which no limiter here uses, so
    nothing would warn if `trust proxy` became `true`.
    */
    cspReports: limiter({
      windowMs: MINUTE_MS,
      limit: configured.cspReportsPerMinute,
      identifier: 'csp-reports-per-minute',
      requestPropertyName: 'cspReportRateLimit',
      keyFor: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    }),
    /*
    Separate buckets for begin and callback, so hammering one door cannot lock
    a real visitor out of the other. Keyed on address like the CSP limiter.
    */
    signInBegins: limiter({
      windowMs: MINUTE_MS,
      limit: configured.signInBeginsPerMinute,
      identifier: 'sign-in-begins-per-minute',
      requestPropertyName: 'signInBeginRateLimit',
      keyFor: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    }),
    signInCallbacks: limiter({
      windowMs: MINUTE_MS,
      limit: configured.signInCallbacksPerMinute,
      identifier: 'sign-in-callbacks-per-minute',
      requestPropertyName: 'signInCallbackRateLimit',
      keyFor: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    }),
  }
}

/** A pass-through for router unit tests; createApp always supplies real limiters. */
export function optionalLimit(handler: RequestHandler | undefined): RequestHandler {
  return handler ?? ((_req, _res, next) => next())
}

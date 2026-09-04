/*
The in-memory P9 limits from spec 10.4. A single set is created per Express
application and shared by all of its routers, so the general mutation quota
is per user across the whole API rather than once per route file.

This deliberately assumes one running application instance. A scale-out to
multiple instances must replace the stores with one shared counter store.
*/
import type { Request, RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'

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
  /*
  7.22's data export, added 2026-09-04 with the endpoint (issue #77) and
  written into 10.4's sentence in the same change.

  **It is the first limit here on a read, and the ground is cost rather than
  abuse.** Every other GET in this API answers one page of one surface; this
  one walks nine tables for one person and builds the whole document in
  memory before a byte goes out. Five per hour is far above what the act is
  for — a person exports when they are leaving, or once out of curiosity —
  and far below what it would take to make the endpoint a way of loading the
  process.
  */
  exportPerHour: 5,
} as const

export interface RateLimits {
  generalMutations: RequestHandler
  invitesPerMinute: RequestHandler
  invitesPerDay: RequestHandler
  search: RequestHandler
  dataExport: RequestHandler
}

interface RateLimitOverrides {
  invitePerMinute?: number
  invitePerDay?: number
  searchPerMinute?: number
  mutationsPerMinute?: number
  exportPerHour?: number
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
    /** 7.22, and the only limiter here with no `skip`: the route it guards
     * is a GET, so the SAFE_METHODS skip the mutation quota carries would
     * turn this one off entirely. */
    dataExport: limiter({
      windowMs: HOUR_MS,
      limit: configured.exportPerHour,
      identifier: 'data-exports-per-hour',
      requestPropertyName: 'exportRateLimit',
      keyFor,
    }),
  }
}

/** Keeps router constructors usable in their focused unit tests. createApp
 * supplies a real limiter set in every running application. */
export function optionalLimit(handler: RequestHandler | undefined): RequestHandler {
  return handler ?? ((_req, _res, next) => next())
}

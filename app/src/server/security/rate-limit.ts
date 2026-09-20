/*
The in-memory P9 limits from spec 10.4. A single set is created per Express
application and shared by all of its routers, so the general mutation quota
is per user across the whole API rather than once per route file.

This deliberately assumes one running application instance. A scale-out to
multiple instances must replace the stores with one shared counter store.
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
  /*
  10.4's CSP-report row (issue #99). The only limit here keyed on an address
  rather than on a user, because the caller is a browser posting a violation
  report of its own accord and has no session to key on.

  Thirty a minute is chosen from both ends. A real breakage on a cold load
  produces one report per refused resource, and the shell loads a handful,
  so thirty leaves a wide margin above the case the endpoint exists to
  catch; and thirty bounds what a stranger can spend of a free-tier Sentry
  quota, which is the case it must not become.
  */
  cspReportsPerMinute: 30,
  /*
  10.4's two sign-in rows (issue #168), and the only limits here besides the
  CSP one that are keyed on an address rather than on a user — necessarily,
  because both routes precede any session by definition and there is nothing
  else to key on.

  Twenty a minute each is chosen from both ends. A person retrying a sign-in
  produces a handful, and a browser that loops a redirect produces a handful
  more, so twenty leaves a wide margin above every honest case; and twenty
  bounds what an unauthenticated stranger can make this process spend, which
  for the begin is state, nonce and PKCE plus a cookie write, and for the
  callback is an outbound token exchange against Google. The callback is the
  one that matters: it is the only route in this API that makes a request to
  a third party on an unauthenticated caller's say-so.
  */
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
    /*
    Keyed on the caller's address rather than on `keyFor`, which reads the
    session: a CSP report arrives without one, so every report in the
    deployment would otherwise share the key `no-session` and the first
    thirty reports a minute anywhere would exhaust it.

    `ipKeyGenerator` is express-rate-limit's own and collapses an IPv6
    address to its default /56 prefix, so one client cannot walk a subnet to
    reset the count. It keys on whatever it is handed, which here is `req.ip`.

    **The paragraph that stood here said this bucket was per deployment
    rather than per visitor, and it was right until issue #153 (2026-09-04).**
    `createApp` now sets `trust proxy` to 1, so `req.ip` is the address
    Render's edge appended to `X-Forwarded-For` and this limiter buckets per
    client in production as it always did under test — **on the reading that
    the edge appends that header, which 11.11 records as near-certain,
    undocumented, and failing permissively rather than neutrally if it is
    wrong.** Read that before relying on this bucket. What the old paragraph
    ruled out is what happened: it said changing `trust proxy` would move
    every limiter at once and was therefore not a change to make inside this
    one, and #153 is that change made from outside it, with 10.4 re-read and
    AC-410 stating the addresses. (That criterion's test file went in
    the 2026-09-20 cut, so it states them and does not check them.)

    **Two things about the library that the fix does not buy, said here
    because they read as safety nets and are not.** Its `trustProxy` and
    `xForwardedForHeader` validations — the ones that refuse a `trust proxy`
    of `true` and warn when the header arrives without the setting — run
    inside its *own* default key generator, and every limiter in this file
    supplies its own. Verified in the installed 8.6.2 on 2026-09-04 rather
    than recalled. So neither ever fired on the defect #153 fixes, and neither
    would fire if somebody wrote `true` tomorrow; `index.ts` carries the
    reason that must not happen, and this is the note that nothing enforces
    it. Nothing here should be read as identifying a visitor either way.
    */
    cspReports: limiter({
      windowMs: MINUTE_MS,
      limit: configured.cspReportsPerMinute,
      identifier: 'csp-reports-per-minute',
      requestPropertyName: 'cspReportRateLimit',
      keyFor: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    }),
    /*
    The two sign-in doors (issue #168, 10.4's two new rows).

    **They carried no limiter at all until 2026-09-04**, which is older than
    every limit above: `keyFor` reads the session and both of these precede
    one, so there was nothing for the general mutation quota to key on and
    they were simply left out. Both are GETs as well, so the quota's
    SAFE_METHODS skip would have turned it off even if they had carried it.

    Keyed on the address for the CSP row's reason, with the same
    `ipKeyGenerator`, and **separately rather than as one bucket**: a person
    who is being redirected back and forth spends the callback and not the
    begin, and one shared counter would let a stranger hammering one door
    lock a real visitor out of the other. Two counters cost one map.

    This is the second thing #153 bought. Before `trust proxy`, an
    address-keyed limit here would have been one bucket for every visitor
    behind Render's edge, which for a sign-in route is not a limit but an
    outage.
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

/** Keeps router constructors usable in their focused unit tests. createApp
 * supplies a real limiter set in every running application. */
export function optionalLimit(handler: RequestHandler | undefined): RequestHandler {
  return handler ?? ((_req, _res, next) => next())
}

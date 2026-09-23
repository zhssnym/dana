/*
One host, one cookie jar (issue #6).

Production answered on two addresses and redirected between neither. The
canonical one is `https://dana.so`: APP_ORIGIN names it, and the Google
callback, the CSP reporting endpoint and every link in an 11.8 email are built
from that value rather than from the request. The second is
`https://dana-iuax.onrender.com`, the Render address of the same service,
which served the whole application and said nothing about the first.

**Session cookies are host-only (10.1) — no Domain attribute is set and none
should be — so two addresses are two cookie jars.** A sign-in begun on either
one ends on the canonical host, because the callback URL comes from
configuration and never from the request (11.6, AC-109), so that is where the
session cookie lands. Open the Render address afterwards, from a bookmark or
from history, and there is no session on it at all: sign in again, land on
`dana.so` again, and a few days of that reads exactly as "every new visit
needs a fresh sign-in", which is how issue #6 was reported and why it was
investigated twice as a cookie defect. Nothing in the cookie code was wrong.

**No test could have found it, and that is worth stating.** Every criterion in
the suite drives one origin, and a second address serving identical bytes is
invisible to all of them, to the type system, and to a person who does not
read the address bar.

## What this answers

A request whose host is not the canonical one is answered here, ahead of
everything else the application does.

- **GET and HEAD: 301 to the same path and query on the canonical origin.**
  Permanent rather than temporary because it is permanent: the second address
  is not where this application lives. A browser that caches it stops asking
  the wrong host, which is most of the point — a stale bookmark heals itself.
- **Every other method: 404 in the 7.0 envelope.** A mutation aimed at the
  wrong host carries no session cookie for that host, so it was going to be
  refused anyway, and 301 is not a redirect a browser replays a body through.
  404 is the honest answer and it is the one an unknown `/api` path gets.

**One exemption, and it is exact: `/api/health`.** Render's own health check
reaches the service by its Render hostname, which is the non-canonical one by
definition, so a 301 there fails the check and with it every deploy. The path
is passed in by the mount rather than known here, so that this exemption and
the mount of the health router stay one decision in one file.

**Nothing is logged per request.** 10.5 governs what may be logged and a
redirect is not an event; the fact worth having is that this is switched on at
all, which the boot logs once, naming the host.

## Two decisions that are not obvious

**It compares hosts, not origins.** `req.hostname` against APP_ORIGIN's
hostname, case-insensitively, while the Location carries APP_ORIGIN's scheme
and port. So a request arriving on the right host over the wrong scheme is not
redirected here: TLS belongs to the edge in front of this process, which is
the same ground 10.8 gives it HSTS on, and the rule this file exists for is
about cookie jars, which are keyed by host. It is also what keeps the whole
thing inert in development and under the browser suite, where APP_ORIGIN is
`http://localhost:3000` and the server under test listens on another port of
the same host.

**The origin arrives as an option, and the environment is deliberately not
read here.** `createApp` takes it and the boot fills it from APP_ORIGIN. A
test harness can set `process.env.APP_ORIGIN` to its own ephemeral origin and
drive the auth endpoints with crafted `Host` and `X-Forwarded-Host` headers
to check AC-109, that the authorization request and its `redirect_uri` are
built from configuration and never from the request; a middleware reading
the environment would answer every one of those requests with a 301 before
an auth endpoint saw it, and the check would measure this file instead.
Production is unaffected by the
choice and both rules hold there: this redirect answers first, and the
endpoints behind it are still forbidden to trust a `Host` they can now only be
reached with.
*/
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { errorBody } from './errors.js'

/** APP_ORIGIN, parsed once into the two things a request is answered with. */
export interface CanonicalOrigin {
  /** `https://dana.so` — no trailing slash, and what a Location is built on. */
  readonly origin: string
  /** `dana.so`, lowercase — what `req.hostname` is compared against. */
  readonly host: string
}

/**
 * The canonical origin, or null when there is not one to have: unset, empty,
 * unparseable, or a scheme no browser would arrive over. Null is the whole of
 * "do nothing", and it is the ordinary state in development and under test.
 *
 * Exported because the boot logs the host it is about to enforce, and one
 * parse serving both callers is what keeps that line from being able to
 * disagree with the middleware it describes.
 */
export function canonicalOriginOf(
  appOrigin: string | undefined,
): CanonicalOrigin | null {
  if (appOrigin === undefined || appOrigin.trim() === '') return null
  let url: URL
  try {
    url = new URL(appOrigin)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.hostname === '') return null
  return { origin: url.origin, host: url.hostname.toLowerCase() }
}

/**
 * The path and query to carry across, from `req.originalUrl`.
 *
 * Normally that is the request target exactly as sent, and prefixing an origin
 * to it is the whole of the redirect. One shape is not: an absolute-form
 * request line (RFC 9112 3.2.2, which is what a proxy sends) puts a whole URL
 * there, and `https://dana.so` followed by `http://elsewhere/x` is a nonsense
 * target rather than a dangerous one — but it is not a path on this deployment
 * either, so anything not beginning with `/` becomes `/`.
 *
 * A leading `//` is left alone on purpose. In `https://dana.so//elsewhere/`
 * the authority is terminated by the first `/` after the scheme's own pair, so
 * that is a path on the canonical host and never an authority; the shape only
 * escapes when the scheme and host are omitted, and here they never are.
 */
function samePathAndQuery(originalUrl: string): string {
  return originalUrl.startsWith('/') ? originalUrl : '/'
}

export interface CanonicalHostOptions {
  /** APP_ORIGIN, or undefined for a process that has no canonical host. */
  appOrigin: string | undefined
  /**
   * Paths answered whatever host they arrive on, compared against `req.path`
   * exactly. Exactly one is passed, `/api/health`; the header says why.
   */
  exempt: readonly string[]
}

/**
 * The middleware, or null when this process has no canonical host to send
 * anyone to. Null rather than a pass-through handler, so that the mount is a
 * visible `if` rather than a layer that silently does nothing.
 */
export function canonicalHostRedirect(
  options: CanonicalHostOptions,
): RequestHandler | null {
  const canonical = canonicalOriginOf(options.appOrigin)
  if (canonical === null) return null
  const exempt = new Set(options.exempt)

  return (req: Request, res: Response, next: NextFunction): void => {
    if (exempt.has(req.path)) {
      next()
      return
    }
    // `req.hostname` is trust-proxy aware (issue #153), so behind Render's
    // edge it reads X-Forwarded-Host and names the address the visitor typed.
    // It is typed `string` and is undefined in one real case, an HTTP/1.0
    // request carrying no Host header, which Node accepts; that is a host
    // which is not the canonical one, rather than a 500 thrown out of the
    // first middleware in the chain.
    const host = req.hostname?.toLowerCase() ?? ''
    if (host === canonical.host) {
      next()
      return
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.redirect(
        301,
        `${canonical.origin}${samePathAndQuery(req.originalUrl)}`,
      )
      return
    }
    res.status(404).json(errorBody('not_found', 'Not found.'))
  }
}

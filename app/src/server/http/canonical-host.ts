/*
One host, one cookie jar: session cookies are host-only (10.1). Other hosts get
GET/HEAD 301 to the canonical origin and 404 otherwise. Hosts are compared, not
origins (TLS is the edge's). The origin is passed in, not read from env, so test
harnesses can send crafted Host headers to the auth endpoints.
*/
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { errorBody } from './errors.js'

export interface CanonicalOrigin {
  /** No trailing slash; Locations are built on it. */
  readonly origin: string
  /** Lowercase; compared with `req.hostname`. */
  readonly host: string
}

/**
 * The canonical origin, or null (unset, unparseable, non-http) meaning do
 * nothing. Exported so the boot log names exactly the host enforced.
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
 * `req.originalUrl`, or `/` when it is not a path (an absolute-form request
 * line). A leading `//` stays: after a full origin it is still a path.
 */
function samePathAndQuery(originalUrl: string): string {
  return originalUrl.startsWith('/') ? originalUrl : '/'
}

export interface CanonicalHostOptions {
  appOrigin: string | undefined
  /** Paths answered on any host, matched against `req.path` exactly. */
  exempt: readonly string[]
}

/** The middleware, or null so the mount is a visible `if`. */
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
    // Trust-proxy aware, so it reads X-Forwarded-Host behind Render. Undefined
    // for an HTTP/1.0 request with no Host: treat as non-canonical, not a 500.
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

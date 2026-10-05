/*
Session resolution, then CSRF on mutations (11.3). The order matters: a
mutation with no session is 401, not 403 (AC-111). Session context lives in a
WeakMap, so it is read only through sessionOf.
*/
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type { Db } from '../../../db/client.js'
import { sendError } from '../http/errors.js'
import { SESSION_COOKIE, readCookie, setSessionCookies } from './cookies.js'
import { resolveSession } from './sessions.js'
import { csrfTokenFor, safeEqual } from './tokens.js'

export interface SessionContext {
  userId: string
  /** The raw cookie token, for the CSRF token and for sign-out. */
  token: string
}

const contexts = new WeakMap<Request, SessionContext>()

export function sessionOf(req: Request): SessionContext | undefined {
  return contexts.get(req)
}

/**
 * Resolves the cookie and rolls its expiry. Never answers: no session is just
 * no session, and requireSession decides.
 */
export function attachSession(db: Db): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE)
    if (token === undefined || token === '') {
      next()
      return
    }
    resolveSession(db, token)
      .then((session) => {
        if (session !== null) {
          contexts.set(req, { userId: session.userId, token })
          // Roll the cookie too, or the browser drops it 30 days after sign-in
          // while the server still honours the session.
          setSessionCookies(res, token, csrfTokenFor(token))
        }
        next()
      })
      .catch(next)
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (contexts.get(req) === undefined) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
    return
  }
  next()
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Double-submit CSRF (11.6). The expected value is derived from this session's
 * own token, not compared with a cookie an attacker might also set.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const session = contexts.get(req)
  if (session === undefined) {
    // Unreachable behind requireSession; kept so 401 always precedes 403.
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.')
    return
  }
  const header = req.get('X-CSRF-Token')
  if (header === undefined || !safeEqual(header, csrfTokenFor(session.token))) {
    sendError(res, 403, 'forbidden', 'Invalid or missing CSRF token.')
    return
  }
  next()
}

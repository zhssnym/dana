/*
The 11.3 middleware order, the first two links of it: session resolution, then
CSRF verification on mutations. Rate limiting follows and the handler last.

The order is not a style preference. An unauthenticated mutation answers 401
and not 403 (AC-111), because answering 403 would tell a caller
with no session at all that a CSRF token was the only thing they were missing.

Session context rides in a WeakMap rather than on the request object, so no
route can read it without importing the accessor, and no ambient type
declaration has to widen Express's Request for the whole codebase.
*/
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import type { Db } from '../../../db/client.js'
import { sendError } from '../http/errors.js'
import { SESSION_COOKIE, readCookie, setSessionCookies } from './cookies.js'
import { resolveSession } from './sessions.js'
import { csrfTokenFor, safeEqual } from './tokens.js'

export interface SessionContext {
  userId: string
  /** The raw cookie token, needed to derive the CSRF token and to sign out. */
  token: string
}

const contexts = new WeakMap<Request, SessionContext>()

export function sessionOf(req: Request): SessionContext | undefined {
  return contexts.get(req)
}

/**
 * Resolves the cookie into a session and rolls its expiry (10.1). An absent,
 * unknown, or expired identifier is simply no session: this middleware never
 * answers, so public routes stay public and requireSession decides.
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
          // 10.1's expiry is rolling on both sides or it is not rolling: the
          // row moved to 30 days out just now, and the cookie has to move
          // with it or the browser drops a session the server still honors,
          // 30 days after sign-in however active the person has been. Same
          // values, new lifetime.
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
 * The double-submit check of 11.6. The expected value is derived from this
 * session's own token, so a token issued to another session, or a well-formed
 * token belonging to nobody, fails: the comparison is against what this
 * session's token implies rather than against the cookie the same request
 * carried, which an attacker who can set cookies also controls.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const session = contexts.get(req)
  if (session === undefined) {
    // Unreachable behind requireSession, and kept because the 401-before-403
    // order is a security property rather than an accident of composition.
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

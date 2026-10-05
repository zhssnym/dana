/*
The three 11.6 cookies. Secure is always set: TLS ends before this process, so
a flag derived from the request would never be set. SameSite=Lax so the
session survives the redirect back from Google.
*/
import type { Request, Response } from 'express'

export const SESSION_COOKIE = 'dana_session'
export const CSRF_COOKIE = 'dana_csrf'
export const PENDING_COOKIE = 'dana_pending'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const TEN_MINUTES_MS = 10 * 60 * 1000

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (header === undefined) return undefined
  for (const pair of header.split(';')) {
    const equals = pair.indexOf('=')
    if (equals === -1) continue
    if (pair.slice(0, equals).trim() !== name) continue
    const raw = pair.slice(equals + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      // A malformed value must not throw (a resent bad cookie would 500 every
      // request); it simply fails the session lookup, giving 401.
      return raw
    }
  }
  return undefined
}

/** The pending-authorization pointer: httpOnly and short-lived. */
export function setPendingCookie(res: Response, value: string): void {
  res.cookie(PENDING_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TEN_MINUTES_MS,
  })
}

export function clearPendingCookie(res: Response): void {
  res.clearCookie(PENDING_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
}

/** Set together: the double-submit CSRF check needs both. */
export function setSessionCookies(
  res: Response,
  sessionToken: string,
  csrfToken: string,
): void {
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_MS,
  })
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_MS,
  })
}

/**
 * Drops queued Set-Cookie lines for these names, so a logout response does not
 * also carry the rolling-expiry refresh of the cookie it deletes.
 */
function dropQueuedCookies(res: Response, names: readonly string[]): void {
  const queued = res.getHeader('Set-Cookie')
  if (queued === undefined) return
  const lines = (Array.isArray(queued) ? queued : [String(queued)]).filter(
    (line) => !names.some((name) => line.startsWith(`${name}=`)),
  )
  if (lines.length === 0) res.removeHeader('Set-Cookie')
  else res.setHeader('Set-Cookie', lines)
}

export function clearSessionCookies(res: Response): void {
  dropQueuedCookies(res, [SESSION_COOKIE, CSRF_COOKIE])
  // Same attributes as when set, so the deletion targets the same cookie.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
}

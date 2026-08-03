/*
The three cookies of 11.6 and the flags they carry.

Secure is set unconditionally on all three, never derived from the request's
transport. TLS terminates ahead of the process (11.11), so the process always
speaks plain http and a derived flag would never be set at all: the attribute
describes the cookie the server is asking the browser to keep, not the hop it
arrived over.

SameSite is Lax rather than Strict because the session cookie has to survive
the browser's redirect back from Google, which Strict would drop, and rather
than None because None is no cross-site protection at all.

Reading is hand-rolled rather than pulled from a dependency: the header is one
line of key=value pairs, and the only subtlety is that a cookie value may
contain an equals sign, so the split is on the first one only.
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
      // decodeURIComponent throws URIError on malformed percent-encoding, and
      // a cookie is attacker-controlled input: "dana_session=%" would
      // otherwise take down every route behind this middleware with a 500,
      // and keep doing it, because nothing on that path clears the cookie the
      // browser goes on resending. An undecodable value is simply not a
      // session identifier, so it is returned as it stands and fails the
      // lookup, which is the 401 that 7.0 requires.
      return raw
    }
  }
  return undefined
}

/** The pending-authorization pointer: httpOnly, so it can never be mistaken
 * for the readable CSRF cookie, and short-lived. */
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

/** The session identifier (httpOnly) and its CSRF token (readable), together,
 * because 11.6's double submit is inoperable if either is set without the
 * other. */
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

export function clearSessionCookies(res: Response): void {
  for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, {
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
  }
}

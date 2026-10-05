/*
 * Reads the CSRF token from the readable `dana_csrf` cookie (spec 11.6 double submit). Match the cookie by
 * name; never fall back to "the only readable cookie".
 */

/** Spec 11.6. The server sets this cookie, non-httpOnly, at sign-in. */
const CSRF_COOKIE = 'dana_csrf'

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    // Send an undecodable value as is: the server answers 403 instead of the client throwing.
    return raw
  }
}

export function csrfToken(): string | null {
  const header = typeof document === 'undefined' ? '' : document.cookie
  for (const pair of header.split(';')) {
    const equals = pair.indexOf('=')
    if (equals === -1) continue
    if (pair.slice(0, equals).trim() !== CSRF_COOKIE) continue
    return decode(pair.slice(equals + 1).trim())
  }
  return null
}

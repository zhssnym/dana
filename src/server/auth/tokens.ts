/*
The auth cryptography, all node:crypto. The session id is 32 random bytes,
base64url, carrying nothing; only its sha256 is stored, so a database backup
grants no sessions. The CSRF token is an HMAC of the session token: bound to
the session, and it cannot be turned back into the session id (AC-110).
*/
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Domain separation for the derived token. */
const CSRF_LABEL = 'dana.csrf.v1'

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Lowercase hex sha256, the sessions key (10.1). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function csrfTokenFor(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update(CSRF_LABEL).digest('hex')
}

/**
 * Constant-time comparison. Both sides are hashed to a fixed width first,
 * because timingSafeEqual throws on unequal lengths.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

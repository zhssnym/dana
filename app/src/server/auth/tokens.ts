/*
The module's only cryptography, and deliberately the smallest amount that
does the job: a CSPRNG for identifiers, sha256 for the digest 10.1 stores,
one HMAC for the CSRF token, and constant-time comparison. Nothing here is
invented; every primitive is node:crypto's.

Two choices worth the words.

**The session identifier is 32 random bytes, base64url.** 11.6 calls it
opaque, so it carries nothing: not the user id, not an encoding of one, not a
signed envelope. The database stores only sha256 of it (10.1), so the value
the browser holds exists nowhere at rest and a stolen database backup grants
no sessions.

**The CSRF token is derived from the session token rather than stored.** 11.6
requires it bound to the session; deriving it with an HMAC keyed by the
session token satisfies that binding without a column the sessions table does
not have, and the derivation runs one way: the token in the readable cookie
cannot be turned back into the session identifier in the httpOnly one, which
is the property AC-110's last assertion is about. A stored binding would need
a migration in app/db, which is the Data engineer's path and the Steward's to
schedule; this needs neither.
*/
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Domain separation, so the derived token cannot collide with another use. */
const CSRF_LABEL = 'dana.csrf.v1'

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** The lowercase hex sha256 digest 10.1 fixes as the sessions key. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function csrfTokenFor(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update(CSRF_LABEL).digest('hex')
}

/**
 * Constant-time string comparison. timingSafeEqual throws on a length
 * mismatch, which would leak length through the exception, so both sides are
 * digested to a fixed width first and the comparison always runs.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest()
  const right = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/*
The token 11.6's double-submit pattern puts in a second, readable cookie, read
back so every mutation can echo it in X-CSRF-Token.

**The cookie has a name now, and the guess is gone.** 11.6 named both cookies
at the second P8 change control on 2026-08-11, on this session's own
escalation: the session cookie is `dana_session` and the CSRF cookie is
`dana_csrf`. Until then this section fixed only that the second was readable
and the first was not, so this file preferred a name and fell back to whatever
the sole readable cookie turned out to be. That fallback was worse than the
guess it protected. It is correct exactly while nothing else sets a readable
cookie, and on the day something does, every mutation carries the wrong value
and earns a 403 that says nothing about why. Removing it is the client return
11.6 routes, and this is it.

The constant is transcribed rather than imported, which is 11.6's own ruling
on the recommendation this escalation carried. `src/shared` is the contract as
code, the section 7 schemas both sides import, and a transport detail of
section 11 is not part of that contract; naming the cookies in the
specification lets each side transcribe one specified constant, the discipline
the acceptance suite already runs on for section 9's copy. So the name below
is the specification's, and it is the only thing this file matches on.
*/

/** Spec 11.6, transcribed. The server sets this at sign-in, non-httpOnly. */
const CSRF_COOKIE = 'dana_csrf'

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    // An undecodable value is not a token, but it is what the browser holds,
    // and handing it to the server produces the 403 of 11.6 rather than an
    // exception that never reaches the wire at all. The server's own reader
    // makes the same choice for the same reason.
    return raw
  }
}

/** The token, or null when no session has been established in this browser. */
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

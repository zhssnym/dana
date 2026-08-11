/*
The token 11.6's double-submit pattern puts in a second, readable cookie, read
back so every mutation can echo it in X-CSRF-Token.

Identified by property before it is identified by name, which is the
discipline both test harnesses already run on: 11.6 fixes that the session
cookie is httpOnly and the CSRF cookie is not, and fixes neither name.
`document.cookie` exposes exactly the non-httpOnly cookies, so from here the
readable set is the whole visible set, and 11.6 says there is one of them at
sign-in.

The name is still preferred when it is present, because "the only readable
cookie" stops being true the day anything else sets one, and a client that
guessed wrong would fail every write with a 403 that says nothing about why.
The constant is duplicated rather than imported: src/client cannot import
src/server (tsconfig.client.json compiles this directory into the browser
bundle), and src/shared does not carry it. That duplication is the one thing
in this file worth an escalation, and it is recorded in README.md beside the
recommendation, which is to move the two cookie names into src/shared where
both sides can read one definition.
*/

const PREFERRED_NAME = 'dana_csrf'

interface Cookie {
  readonly name: string
  readonly value: string
}

function readableCookies(): Cookie[] {
  const header = typeof document === 'undefined' ? '' : document.cookie
  const out: Cookie[] = []
  for (const pair of header.split(';')) {
    const equals = pair.indexOf('=')
    if (equals === -1) continue
    const name = pair.slice(0, equals).trim()
    if (name === '') continue
    out.push({ name, value: decode(pair.slice(equals + 1).trim()) })
  }
  return out
}

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
  const cookies = readableCookies()
  const named = cookies.find((cookie) => cookie.name === PREFERRED_NAME)
  if (named !== undefined) return named.value
  const sole = cookies.length === 1 ? cookies[0] : undefined
  return sole === undefined ? null : sole.value
}

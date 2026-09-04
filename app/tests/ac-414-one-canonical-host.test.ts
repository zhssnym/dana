/*
AC-414: given APP_ORIGIN, when a request arrives for any other host, then a
GET or HEAD is answered 301 to the same path and query on the canonical
origin, any other method is answered 404 in the 7.0 envelope, `/api/health` is
answered whatever host it arrives on, and a request already on the canonical
host is untouched; given no APP_ORIGIN, then nothing redirects.

## The defect this closes

Production answered on two addresses (issue #6). `https://dana.so` is the
canonical one, the one APP_ORIGIN names and the one the Google callback, the
CSP reporting endpoint and every 11.8 email link are built from; and
`https://dana-iuax.onrender.com`, the Render address of the same service,
served the whole application and redirected nowhere.

**Session cookies are host-only (10.1), so two addresses are two cookie jars.**
A sign-in begun on either ends on the canonical host, because 11.6 builds the
callback from configuration and never from the request, so the cookie lands
there; open the Render address afterwards and there is no session on it. Sign
in again, land on `dana.so` again, and a few days of that is the report this
closes: "every new visit requires a fresh sign-in". Two investigations went
into the cookie and the session table, which were correct throughout.

**Nothing in this suite could have caught it and this criterion still cannot
catch the recurrence of the cause**, which is worth saying plainly rather than
leaving a reader to infer that it is covered. Every criterion drives one
origin, so a second address serving identical bytes is invisible to all of
them; what is asserted here is that the application refuses to be that second
address, and *how many addresses a hosting platform has pointed at this
service* is not a fact any test in this repository can read. That part lives
in 11.11 and in the boot's one log line.

## Why the criterion drives options rather than the environment

`createApp` takes `appOrigin` (11.10's seam), so both halves of this — set and
unset — are two applications built in one process rather than a test mutating
`process.env` and racing every other file in the worker. The production wiring
is the boot passing APP_ORIGIN into that option, which is one line in `main()`.

The middleware deliberately does not read the environment itself, and AC-109
is the reason: its harness sets `process.env.APP_ORIGIN` to its own ephemeral
origin and then drives the auth endpoints with crafted `Host` and
`X-Forwarded-Host` headers, so a redirect reading the environment would answer
those requests with a 301 before an auth endpoint saw one. AC-109 would keep
passing and would have stopped measuring what it exists for. Measured rather
than argued: with the environment fallback in place, AC-109 loses 2 of its 5
cases, and they are the two crafted-Host ones.

## The pass-through case is a 401 and not a 404, on purpose

The cheap way to assert "a canonical request is untouched" is to check that no
`Location` came back, and that passes just as well against a middleware that
404s everything. So the canonical arm below drives `POST /api/v1/tasks` and
expects **401**: a mutation that reaches the router and is refused for want of
a session has demonstrably passed through this middleware, where the same
request on the other host is 404 before any router sees it. The two statuses
are the measurement.

Spec: 10.1, 11.11; issue #6.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createApp } from '../src/server/index.js'

import { rawRequest } from './http-client.js'
import type { RawResponse } from './http-client.js'

const CANONICAL = 'https://canonical.example'
const CANONICAL_HOST = 'canonical.example'
const OTHER_HOST = 'other.example'

interface Running {
  origin: string
  close: () => Promise<void>
}

/**
 * An application on a real socket. `createApp` is built with no database: the
 * only routes these cases reach either need none (`/api/health`) or are
 * refused before they touch one (a mutation with no session), which is the
 * database-free construction 11.10 promises and AC-236's harness relies on.
 */
async function start(appOrigin?: string): Promise<Running> {
  const server: Server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  server.on(
    'request',
    createApp(appOrigin === undefined ? {} : { appOrigin }),
  )
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      }),
  }
}

let enforcing: Running
let unset: Running

beforeAll(async () => {
  enforcing = await start(CANONICAL)
  unset = await start()
}, 30_000)

afterAll(async () => {
  await enforcing?.close()
  await unset?.close()
})

/** node:http rather than fetch, which drops a Host header as a forbidden
 * name; the same reason AC-109 speaks through this client. */
function ask(
  running: Running,
  path: string,
  hostHeader: string,
  method = 'GET',
): Promise<RawResponse> {
  return rawRequest(`${running.origin}${path}`, { method, hostHeader })
}

describe('AC-414: one canonical host, so a session has one home', () => {
  test('a GET for another host is 301 to the same path and query', async () => {
    const response = await ask(enforcing, '/app/foo?x=1', OTHER_HOST)

    expect(
      response.status,
      `issue #6: a GET on ${OTHER_HOST} must be sent to the canonical host, permanently`,
    ).toBe(301)
    expect(
      response.location,
      'the path and the query cross with the redirect, or the person loses the page they asked for',
    ).toBe(`${CANONICAL}/app/foo?x=1`)
  })

  test('HEAD is redirected too, and no other method is', async () => {
    const head = await ask(enforcing, '/app/foo?x=1', OTHER_HOST, 'HEAD')
    expect(head.status, 'HEAD is the safe twin of GET and travels with it').toBe(
      301,
    )
    expect(head.location).toBe(`${CANONICAL}/app/foo?x=1`)

    // A mutation aimed at the wrong host carries no cookie for that host, so
    // it was refused either way; 404 rather than a redirect no browser would
    // replay the body through.
    const post = await ask(enforcing, '/api/v1/tasks', OTHER_HOST, 'POST')
    expect(
      post.status,
      'a mutation on the wrong host is not redirected: 301 drops the body',
    ).toBe(404)
    expect(post.location, 'and it is not a redirect at all').toBeNull()

    const body = post.json() as { error?: { code?: unknown; message?: unknown } }
    expect(body.error?.code, '7.0 envelope: a non-empty code').toBe('not_found')
    expect(
      typeof body.error?.message === 'string' && body.error.message.length > 0,
      '7.0 envelope: a non-empty message',
    ).toBe(true)
  })

  test('/api/health answers on any host, because Render probes by its own', async () => {
    const response = await ask(enforcing, '/api/health', OTHER_HOST)

    expect(
      response.status,
      "Render's health check reaches this service by its Render hostname; a 301 here fails the check and with it the deploy",
    ).toBe(200)
    expect((response.json() as { status?: unknown }).status).toBe('ok')
  })

  test('the canonical host passes through, whatever its case', async () => {
    // 401 and not 404: this request reached the router and was refused for
    // want of a session, which is what passing through looks like. The same
    // request on the other host is 404 above, before any router sees it.
    const mutation = await ask(
      enforcing,
      '/api/v1/tasks',
      CANONICAL_HOST,
      'POST',
    )
    expect(
      mutation.status,
      'a request on the canonical host must reach the application',
    ).toBe(401)

    const page = await ask(enforcing, '/app/foo?x=1', CANONICAL_HOST)
    expect(page.status, 'and must not be redirected to itself').not.toBe(301)
    expect(page.location).toBeNull()

    // Host names are case-insensitive and a person's browser is not obliged
    // to agree with APP_ORIGIN's spelling.
    const shouty = await ask(enforcing, '/app/foo?x=1', 'CANONICAL.EXAMPLE')
    expect(
      shouty.status,
      'the comparison is case-insensitive, as host names are',
    ).not.toBe(301)
    expect(shouty.location).toBeNull()
  })

  test('with no APP_ORIGIN, nothing redirects', async () => {
    const response = await ask(unset, '/app/foo?x=1', OTHER_HOST)

    expect(
      response.status,
      'a process with no canonical origin has nowhere to send anyone: development, and every other criterion',
    ).not.toBe(301)
    expect(response.location).toBeNull()

    const mutation = await ask(unset, '/api/v1/tasks', OTHER_HOST, 'POST')
    expect(
      mutation.status,
      'and it does not refuse mutations by host either',
    ).toBe(401)
  })
})

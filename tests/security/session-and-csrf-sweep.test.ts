/*
structural: every mutating route on the mounted application answers
401 with no session and 403 with a session but no X-CSRF-Token, and every
reading route answers 401 with no session unless it is one of three named
public reads, all enumerated over the router rather than sampled.

A one-off route review decays the moment a router is added; a structural
criterion, one that interrogates the artifact rather than sampling it, keeps
being true. This walks the mounted Express router, collects every POST, PATCH,
PUT and DELETE, and drives each one twice: bare, expecting 401 (requireSession
precedes requireCsrf, so an unauthenticated caller is never told a token was
all they lacked), and signed in without the header, expecting 403 with no side
effects.

Two exemptions on that half, each carrying its reason in the map below. The
development login precedes any session by design and is absent from
production builds (11.6); in this harness it is not mounted at all.
`POST /api/csp-report` is the browser's own report of a policy refusal, posted
from its networking stack with no cookie and no header this application could
ask it to add.

The mutating exemptions are asserted in one direction only: an exemption for a
route this application mounts must answer something other than a bare 401, so
an entry written for a gated route fails here. The converse (an exemption must
name a mounted route) cannot be asserted, because the development login is
absent from this harness. The reason strings are what a reviewer reads.

GET is swept too. The public reads are a Map because each one owes a reason,
and both directions are asserted: a GET absent from the map must answer 401,
and a GET named in the map must exist and must not answer 401, so an entry
that outlives its route, or one written for a gated route, fails here. No
guard stops someone adding a route and an entry in the same change; that is a
reviewer's job.

CSRF is asserted on the mutating half only. 10.4's token defends unsafe
methods; a GET that changed state would be a defect in the route, not a
missing header.

Two surfaces sit outside the walk and neither is a data route: express.static
and the SPA fallback in index.ts are mounted only when clientDist is present,
which a test application never sets.

**The walk is one level deep.** It reads layer.route at the top of the
application's stack and nested.route one stack down, so a router mounted
inside another router contributes nothing: its routes are silently absent and
every assertion here passes over a smaller surface than it claims. Every
router in src/server is mounted directly on the application in index.ts; keep
it that way (see src/server/routes/README.md).

Spec: 10.1, 10.2, 10.4, 11.6.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['sweeper'], 's14')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

/* The shapes below restate what the sweep reads from Express rather than
 * importing Express's own types: this suite measures the mounted artifact
 * and cannot borrow its definition of correct (the auth-harness rule). */
interface RouteShape {
  path: string | readonly string[]
  methods: Record<string, boolean>
}
interface LayerShape {
  name?: string
  match?: (path: string) => boolean
  route?: RouteShape
  handle?: { stack?: LayerShape[] }
}

const MUTATING = ['post', 'patch', 'put', 'delete'] as const
const READING = ['get'] as const

/**
 * The mutating routes that answer without a session, and why each one does.
 * A Map rather than a Set since issue #99 gave it a second entry: one
 * exemption needs no explanation and two need one each.
 */
const EXEMPT = new Map<string, string>([
  [
    'POST /api/v1/auth/dev-login',
    'by design: it precedes any session, and it is absent from production builds (11.6, AC-114)',
  ],
  [
    'POST /api/csp-report/',
    "the browser's own report of a Content-Security-Policy refusal (10.8). The browser posts it from its own networking stack, with no session cookie and no X-CSRF-Token, and nothing this application can do would put either there: requiring one would mean receiving no reports at all, which is the silence the endpoint exists to end. It is safe to leave open because it reads nothing and writes nothing — no dbClient reaches it — and the whole of its effect is one whitelisted log line and one Sentry message, bounded by a 16 KB body cap and by 10.4's own limiter row. It answers 204 for a report it keeps and 204 for one it drops, so it is not an oracle either",
  ],
])

/**
 * The reads that answer without a session, and why each one does. Nothing is
 * here because it failed; every entry is a route that cannot require a
 * session without ceasing to do its job, and the sweep proves that by
 * refusing an entry whose route answers 401 after all.
 */
const PUBLIC_READS = new Map<string, string>([
  [
    'GET /api/health/',
    'the platform probe. The host calls it with no cookie to decide whether this instance is alive, so a session requirement would report every healthy deploy as sick',
  ],
  [
    'GET /api/v1/auth/google',
    'where a session begins: 10.1\'s OAuth start, which redirects to Google. A caller who had a session would not be here',
  ],
  [
    'GET /api/v1/auth/google/callback',
    'the provider\'s return leg, carrying the code and state that 10.1 exchanges for the first session. It authenticates by that exchange, not by a cookie that does not exist yet',
  ],
])

/** Mount points this application uses; a router layer is attributed to the
 * first one its own regexp accepts, which is exact for non-overlapping
 * prefixes like these. A mount missing from this list is not skipped, which
 * would at least be visible: its routes are attributed to no mount and are
 * enumerated under a bare path, so they miss their own exemption and fail
 * for a reason that names the wrong thing. `/api/csp-report` joined the list
 * with the route (issue #99). */
const MOUNTS = ['/api/v1', '/api/health', '/api/csp-report', '/api']

function routesWith(
  application: unknown,
  methods: readonly string[],
): Array<{ method: string; path: string }> {
  const stack = (application as { router?: { stack?: LayerShape[] } }).router?.stack
  expect(
    Array.isArray(stack),
    'the mounted application no longer exposes router.stack: the sweep must be rewritten against the new shape, never skipped',
  ).toBe(true)

  const found: Array<{ method: string; path: string }> = []
  const collect = (route: RouteShape, mount: string): void => {
    const paths = typeof route.path === 'string' ? [route.path] : route.path
    for (const method of methods) {
      if (route.methods[method] !== true) continue
      for (const path of paths) {
        found.push({ method: method.toUpperCase(), path: `${mount}${path}` })
      }
    }
  }

  // One level, deliberately and not by omission: a top-level route, or a
  // route on a router mounted on the application. A router mounted on a
  // router is not descended into, and nothing here reports that it was
  // skipped: a hidden mount makes this sweep quietly prove less. Mount every
  // router directly on the application. See the header.
  for (const layer of stack as LayerShape[]) {
    if (layer.route !== undefined) {
      collect(layer.route, '')
      continue
    }
    const sub = layer.handle?.stack
    if (!Array.isArray(sub)) continue
    const mount =
      MOUNTS.find((candidate) => layer.match?.(candidate) === true) ?? ''
    for (const nested of sub) {
      if (nested.route !== undefined) collect(nested.route, mount)
    }
  }

  const seen = new Set<string>()
  return found.filter(({ method, path }) => {
    const key = `${method} ${path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mutatingRoutes(application: unknown): Array<{ method: string; path: string }> {
  return routesWith(application, MUTATING).filter(
    ({ method, path }) => !EXEMPT.has(`${method} ${path}`),
  )
}

function readingRoutes(application: unknown): Array<{ method: string; path: string }> {
  return routesWith(application, READING)
}

/** Params become a syntactically valid uuid so nothing fails on shape
 * before the chain has answered; the chain runs first either way. */
function addressable(path: string): string {
  return path.replace(/:[A-Za-z_]+/g, '00000000-0000-4000-8000-000000000000')
}

describe('every mutating route is behind the whole chain', () => {
  test('bare answers 401 and session-without-token answers 403, on every route', async () => {
    const [sweeper] = (await cast.of(app)) as [Actor]
    const routes = mutatingRoutes(app.application)

    // A sweep over an empty enumeration proves nothing. No pinned count: the
    // sweep below is the check, and it covers whatever the walker finds.
    expect(routes.length, 'the walker found no mutating routes').toBeGreaterThan(0)

    const failures: string[] = []
    const jsonBody = {
      body: '{}',
      headers: { 'content-type': 'application/json' },
      csrf: 'omit',
    } as const
    for (const { method, path } of routes) {
      const target = addressable(path)
      const bare = await app.browser().request(target, { method, ...jsonBody })
      if (bare.status !== 401) {
        failures.push(`${method} ${path}: bare answered ${String(bare.status)}, not 401`)
      }
      const tokenless = await sweeper.browser.request(target, { method, ...jsonBody })
      if (tokenless.status !== 403) {
        failures.push(
          `${method} ${path}: session without X-CSRF-Token answered ${String(tokenless.status)}, not 403`,
        )
      }
    }

    /* And every exemption that names a route this application actually
       mounts must be a live one. An entry whose route answers 401 after all
       is excusing nothing and hiding whatever comes to sit behind it, which
       is the direction PUBLIC_READS is asserted in below. It is scoped to
       the mounted ones because the development login is deliberately absent
       from this harness, so the other direction — an exemption must name a
       mounted route — is the one assertion this half cannot make. */
    const mounted = new Set(
      routesWith(app.application, MUTATING).map(
        ({ method, path }) => `${method} ${path}`,
      ),
    )
    for (const [key, reason] of EXEMPT) {
      if (!mounted.has(key)) continue
      const [method = 'POST', path = '/'] = key.split(' ')
      const bare = await app.browser().request(addressable(path), {
        method,
        ...jsonBody,
      })
      if (bare.status === 401) {
        failures.push(
          `${key}: exempted from the chain (${reason}) and it answers 401 bare, so the exemption is dead. Delete the entry rather than leaving a gated route looking ungated`,
        )
      }
    }

    expect(
      failures,
      'routes outside the 10.1/11.6 chain; each line is one hole in the chokepoint',
    ).toEqual([])
  })

  test('bare answers 401 on every reading route but the named public ones', async () => {
    const routes = readingRoutes(app.application)

    // A sweep over an empty enumeration proves nothing. No pinned count: the
    // sweep below is the check, and it covers whatever the walker finds.
    expect(routes.length, 'the walker found no reading routes').toBeGreaterThan(0)

    const failures: string[] = []
    for (const { method, path } of routes) {
      const key = `${method} ${path}`
      const bare = await app.browser().request(addressable(path), { method })
      const reason = PUBLIC_READS.get(key)
      if (reason === undefined) {
        if (bare.status !== 401) {
          failures.push(
            `${key}: bare answered ${String(bare.status)}, not 401. A read with no requireSession is 10.2's named hole; add the middleware, or add the route to PUBLIC_READS with the reason it can never have one`,
          )
        }
        continue
      }
      if (bare.status === 401) {
        failures.push(
          `${key}: exempted as a public read (${reason}) and it answers 401, so the exemption is dead. Delete the entry rather than leaving a gated route looking ungated`,
        )
      }
    }

    for (const key of PUBLIC_READS.keys()) {
      if (!routes.some(({ method, path }) => `${method} ${path}` === key)) {
        failures.push(
          `${key}: exempted as a public read and no such route is mounted, so the entry excuses nothing and hides whatever replaces that path`,
        )
      }
    }

    expect(
      failures,
      'reads outside 10.1\'s session requirement, and exemptions that no longer describe the application',
    ).toEqual([])
  })
})

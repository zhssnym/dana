/*
AC-236: structural: every mutating route on the mounted application answers
401 with no session and 403 with a session but no X-CSRF-Token, and every
reading route answers 401 with no session unless it is one of three named
public reads, all enumerated over the router rather than sampled.

The S14 security review's route sweep found the chain held on the day it
ran, and its own record says the result decays the moment a router is
added. AC-114's precedent is that a structural criterion, one that
interrogates the artifact rather than sampling it, is the form that keeps
being true. This walks the mounted Express router, collects every POST,
PATCH, PUT and DELETE, and drives each one twice: bare, expecting 401
(requireSession precedes requireCsrf, so an unauthenticated caller is never
told a token was all they lacked), and signed in without the header,
expecting 403 with no side effects.

The one exemption on that half is the development login, which precedes any
session by design and is absent from production builds (11.6, AC-114); it is
filtered by name, and in this harness it is not mounted at all.

**GET is swept too, added for issue #33.** It was left out when this file was
written, and 10.2 said so plainly: a GET route added with no requireSession
passed the entire suite. The sweep was extended before the exemptions were
written, so that what the enumeration reported decided them rather than the
other way round: on 2026-09-02 the walk found 36 GET routes, 33 answered 401
bare with no change to any of them, and the three that did not are the three
below. **No route was excused to make this pass**, which is the only reading
under which an allowlist is a guard rather than a way of recording a hole.

The public reads are a Map rather than a Set because each one owes a reason,
and both directions are asserted. A GET absent from the map must answer 401.
A GET named in the map must exist in the enumeration and must *not* answer
401, so an entry that outlives the route it excuses, or one written for a
route that is in fact gated, fails here instead of quietly widening the
exemption. What the guard cannot do is stop someone adding a route and an
entry in the same change; that is a reviewer's job, and the reason string is
what the reviewer reads.

CSRF is asserted on the mutating half only. 10.4's token defends unsafe
methods; a GET that changed state would be a defect in the route rather than
a missing header, and this file cannot see one.

Two surfaces sit outside the walk and neither is a data route. express.static
and the SPA fallback in index.ts are mounted only when clientDist is present,
which a test application never sets, and they serve the built client rather
than anything from the database. The landing page is the same static bundle.

Spec: 10.1, 10.2, 10.4, 11.6.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

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

/** By design: precedes any session, absent from production builds (11.6). */
const EXEMPT = new Set(['POST /api/v1/auth/dev-login'])

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
 * prefixes like these. */
const MOUNTS = ['/api/v1', '/api/health', '/api']

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

describe('AC-236 every mutating route is behind the whole chain', () => {
  test('bare answers 401 and session-without-token answers 403, on every route', async () => {
    const [sweeper] = (await cast.of(app)) as [Actor]
    const routes = mutatingRoutes(app.application)

    // A sweep over an empty enumeration proves nothing: the count guards
    // the walker itself against an Express refactor hollowing it out.
    expect(
      routes.length,
      `the walker found only ${String(routes.length)} mutating routes, which is fewer than the surface has had since S7: the enumeration is broken, not the application`,
    ).toBeGreaterThan(20)

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
    expect(
      failures,
      'routes outside the 10.1/11.6 chain; each line is one hole in the chokepoint',
    ).toEqual([])
  })

  test('bare answers 401 on every reading route but the named public ones', async () => {
    const routes = readingRoutes(app.application)

    expect(
      routes.length,
      `the walker found only ${String(routes.length)} reading routes, and there were 36 on 2026-09-02 when this half was written: the enumeration is broken, not the application`,
    ).toBeGreaterThan(25)

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

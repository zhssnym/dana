/*
AC-236: structural: every mutating route on the mounted application answers
401 with no session and 403 with a session but no X-CSRF-Token, enumerated
over the router rather than sampled.

The S14 security review's route sweep found the chain held on the day it
ran, and its own record says the result decays the moment a router is
added. AC-114's precedent is that a structural criterion, one that
interrogates the artifact rather than sampling it, is the form that keeps
being true. This walks the mounted Express router, collects every POST,
PATCH, PUT and DELETE, and drives each one twice: bare, expecting 401
(requireSession precedes requireCsrf, so an unauthenticated caller is never
told a token was all they lacked), and signed in without the header,
expecting 403 with no side effects.

The one exemption is the development login, which precedes any session by
design and is absent from production builds (11.6, AC-114); it is filtered
by name, and in this harness it is not mounted at all.

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

/** By design: precedes any session, absent from production builds (11.6). */
const EXEMPT = new Set(['POST /api/v1/auth/dev-login'])

/** Mount points this application uses; a router layer is attributed to the
 * first one its own regexp accepts, which is exact for non-overlapping
 * prefixes like these. */
const MOUNTS = ['/api/v1', '/api/health', '/api']

function mutatingRoutes(application: unknown): Array<{ method: string; path: string }> {
  const stack = (application as { router?: { stack?: LayerShape[] } }).router?.stack
  expect(
    Array.isArray(stack),
    'the mounted application no longer exposes router.stack: the sweep must be rewritten against the new shape, never skipped',
  ).toBe(true)

  const found: Array<{ method: string; path: string }> = []
  const collect = (route: RouteShape, mount: string): void => {
    const paths = typeof route.path === 'string' ? [route.path] : route.path
    for (const method of MUTATING) {
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
    if (seen.has(key) || EXEMPT.has(key)) return false
    seen.add(key)
    return true
  })
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
})

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

Two exemptions on that half, each filtered by name and each carrying its
reason in the map below, the same shape the public reads use. The
development login precedes any session by design and is absent from
production builds (11.6, AC-114); in this harness it is not mounted at all.
`POST /api/csp-report` is the browser's own report of a policy refusal
(issue #99), and the browser posts it from its own networking stack with no
cookie and no header this application could ask it to add.

**The mutating exemptions are asserted in one of the two directions
PUBLIC_READS is asserted in, and the missing one is named rather than
forgotten.** An exemption whose route this application actually mounts must
answer something other than 401 bare, so an entry written for a route that
turns out to be gated fails here instead of quietly excusing nothing. The
converse — that an exemption must name a mounted route — cannot be asserted
on this half, because the development login is deliberately absent from this
harness and has been since this file was written. What covers that gap is
the count below, which moves in the same change as any route, and the reason
string, which a reviewer reads.

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

**Both counts below are pinned to equality, and the walk is one level deep.**
It reads layer.route at the top of the application's stack and nested.route
one stack down, so a router mounted inside another router contributes nothing
and says nothing about it: its routes are absent from the enumeration and
every assertion here then passes over a smaller surface than it claims.
Verified 2026-09-03 at 15, at 16 on 2026-09-04 with 7.22's export router, and
at 17 the same day when the wave-1 merges brought issue #99's alongside it:
every Router() instance in src/server is mounted directly on the application
in index.ts, and every router.use() call inside one attaches middleware rather
than a router, so the walk does see the whole surface today. The sixteenth is
the export router (issue #77), one GET at a literal path; the seventeenth is
the CSP report router, which builds its own rather than taking the preamble's
because it takes no session and so wants none of it.
**Grepping `Router()` does not find seventeen and that is not
a change to this fact**: since issue #36 the fourteen routers under
src/server/routes that take a session are constructed by routes/preamble.ts,
which also registers that session middleware, so the literal call sites are
four — that one, auth/router.ts, routes/health.ts and routes/csp-report.ts —
for all seventeen instances. It was fifteen and three before those two issues.
The counts are the only thing that would notice the day that
stops being true, which is why they are exact numbers carrying a date rather
than floors.

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
    "the browser's own report of a Content-Security-Policy refusal (issue #99). The browser posts it from its own networking stack, with no session cookie and no X-CSRF-Token, and nothing this application can do would put either there: requiring one would mean receiving no reports at all, which is the silence the endpoint exists to end. It is safe to leave open because it reads nothing and writes nothing — no dbClient reaches it — and the whole of its effect is one whitelisted log line and one Sentry message, bounded by a 16 KB body cap and by 10.4's own limiter row. It answers 204 for a report it keeps and 204 for one it drops, so it is not an oracle either",
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
  // skipped, so the counts in the two tests below are what stand between a
  // hidden mount and a sweep that quietly proves less. See the header.
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

    // A sweep over an empty enumeration proves nothing, and a sweep over a
    // hollowed-out one proves less than it appears to: this count guards the
    // walker itself. Equality rather than a floor, because the floor it
    // replaces was `> 20` against 65 actual routes, so two thirds of this
    // surface could have gone missing from the walk without a word. Measured
    // 2026-09-03, dev-login excluded by EXEMPT. 66 to 67 the same day, for
    // POST /covers/photo (issues #20 and #100), which is this sentence's own
    // instruction followed rather than an exception to it: the sweep already
    // passed on the new route, and only the count moved. 67 to 68 on
    // 2026-09-04 for POST /shelves/:id/duplicate (issues #117 and #128),
    // the same way round: the sweep passed on it — 401 bare, 403 without
    // CSRF — before this number was touched.
    //
    // **It counts the routes this sweep drives, not the routes mounted**, so
    // POST /api/csp-report (issue #99) moved it not at all on the same day:
    // the walker finds it and EXEMPT removes it. A route that arrives with an
    // exemption therefore moves the map above rather than this number, and
    // the two together are still one line per mutating route.
    //
    // **68 to 67 on 2026-09-04, and it is the first time this number has gone
    // down.** Issue #113 retired `PATCH /api/v1/me/settings`, frozen 7.2's
    // write, into 7.23's `/settings` bundle on the owner's ruling. The
    // instruction above is the same in this direction and is worth saying
    // once, because the guard reads differently going down: a fall is what
    // this count exists to be suspicious of, since a nested router hiding
    // routes looks exactly like a route deleted on purpose. What separates
    // them is that the deletion is in the same diff, and the route it names
    // answers 404 on the mounted application rather than being merely absent
    // from the walk — `bundle-contract.test.ts` asserts that for the surface
    // that replaced it.
    //
    // **68 to 70 on 2026-09-20 for the two dependency mutations** (issue
    // #224): `POST /tasks/:id/dependencies` and
    // `DELETE /tasks/:id/dependencies/:dependencyId`. The same way round as
    // every rise above — the sweep passed on both of them, 401 bare and 403
    // without CSRF, before this number was touched — and the read the same
    // change adds moves the count below rather than this one.
    //
    // 70 to 82 on 2026-09-20, for the twelve mutating routes of the Label
    // surface (issue #226): four Personal definition writes, four Folder
    // definition writes, and the two assignment pairs. Same instruction
    // followed as every rise above it: the sweep passed on all twelve first —
    // each answers 401 bare and 403 with a session and no X-CSRF-Token — and
    // only then was this number moved, in the change that added them.
    // `GET /labels` is the thirteenth route of that surface and moves the
    // reading count below rather than this one.
    //
    // **#224 and #226 were open at once and each moved this number from 68,
    // to 70 and to 80. The resolution is neither side but the sum: 82.** The
    // two dependency mutations and the twelve Label mutations are fourteen
    // distinct routes and all fourteen are now mounted, so the count was
    // re-derived by running this sweep on the merged tree rather than by
    // arithmetic on the two diffs.
    //
    // **82 to 84 on 2026-09-20 for the two Access-administration mutations**
    // (issue #228): `PATCH /folders/:id/members/:userId`, which changes one
    // member's Access preset, and `POST /folders/:id/owner-recovery`, the
    // structural owner's custody recovery. The same way round as every rise
    // above — the sweep passed on both before this number was touched, 401
    // bare and 403 without CSRF — and the two Access-history reads the same
    // change adds move the count below rather than this one. #228 read 72 on
    // its own tree, which held neither #224's two nor #226's twelve; the
    // resolution is again the sum, and 84 is what this sweep itself reported
    // on the rebased tree rather than what either diff implies.
    //
    // **84 to 86 on 2026-09-20 for the two Responsibility mutations** (issue
    // #230): `PUT /folders/:id/members/:userId/responsibility`, which commits
    // a Responsibility document state, and
    // `PUT /folders/:id/members/:userId/self-edit-grant`, which turns R7
    // section O's explicit narrow grant on or off. The same way round as
    // every rise above — the sweep passed on both before this number was
    // touched, 401 bare and 403 without CSRF — and the three Responsibility
    // reads the same change adds move the count below rather than this one.
    // **#230 read 74 on its own tree, which was #228's and held neither
    // #224's two nor #226's twelve; the resolution is the sum a third time,
    // and 86 is what this sweep itself reported on the rebased tree rather
    // than what either diff implies.**
    //
    // **86 to 95 on 2026-09-21 for the nine facet mutations** (issue #210,
    // M1-F): `POST /folders/:id/facets`, `PATCH` and `DELETE
    // /folders/:id/facets/:facetId`, `PUT /folders/:id/facets/order`, `PUT
    // /folders/:id/facets/my-order`, `POST
    // /folders/:id/facets/:facetId/share`, `POST
    // /folders/:id/facets/:facetId/page/actions`, `POST
    // /facets/:id/restore` and `DELETE /trash/facets/:id`. The same way round
    // as every rise above — the sweep passed on all nine before this number
    // was touched, 401 bare and 403 without CSRF — and the two facet reads the
    // same change adds move the count below rather than this one. #210 read 86
    // on its own tree, which is `main` at 46dbabd, so 95 is the sum and is
    // this sweep's own answer rather than an arithmetic on a diff.
    expect(
      routes.length,
      `the walker found ${String(routes.length)} mutating routes and there were 95 after issue #224 added the two task-dependency mutations, issue #226 added the twelve mutating routes of the Label surface, issue #228 added the two Access-administration mutations, issue #230 added the two Responsibility mutations and issue #210 added the nine facet mutations. Fewer means the enumeration lost sight of routes that still exist, a router mounted inside another router being the way that happens; more means a route was added, and this number moves with it in the same change`,
    ).toBe(95)

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

    // Equality for the same reason as the mutating count: 36 when this half
    // was written on 2026-09-02 and 36 again on 2026-09-03 when the floor
    // became a number. A nested router hiding five GETs would have taken
    // this to 31 and passed `> 25` in silence. 37 to 38 on 2026-09-04, for
    // GET /me/export (7.22, issue #77), which is this sentence's own
    // instruction followed rather than an exception to it: the sweep already
    // passed on the new route, answering 401 bare, and only the count moved.
    // 38 to 37 the same day, the other way: issue #113 retired
    // `GET /api/v1/me/settings` with its sibling write, on the owner's
    // ruling. See the mutating count above for why a fall is read more
    // carefully than a rise.
    //
    // 37 to 39 on 2026-09-20, for the two Dana Link reads of issue #223,
    // `GET /references/search` and `GET /references/:kind/:id`. Same
    // instruction followed as for `/me/export` above: the sweep already
    // passed on both — each answers 401 bare — and only the count moved, in
    // the change that added them.
    //
    // 39 to 40 on 2026-09-20 for `GET /tasks/:id/dependencies` (issue #224),
    // which earns no PUBLIC_READS entry and needs none: it answers 401 bare,
    // which the sweep below established before this number moved.
    //
    // 40 to 41 on 2026-09-20, for `GET /labels`, the definition listing of
    // issue #226 and the only read on that surface. It answers 401 bare, so
    // it earns no PUBLIC_READS entry; the sweep passed on it before this
    // number moved.
    //
    // **Three branches were open at once and each moved this number from 37.
    // #223 and #224 both read 40 on their own trees, and so did #226, and 40
    // is nevertheless wrong for the merge of them: the resolution is the sum,
    // 41.** Two sides agreeing on a number is not the same as the number
    // being right, because each counted its own route against a base that
    // did not hold the others'. The two reads of #223, the one read of #224
    // and `GET /labels` from #226 are four distinct routes and all four are
    // now mounted; this count was re-derived by running the sweep on the
    // merged tree rather than by taking either side.
    //
    // 41 to 43 on 2026-09-20 for the two Access-history reads (issue #228):
    // `GET /folders/:id/access-history` and
    // `GET /folders/:id/members/:userId/access-history`. Neither earns a
    // PUBLIC_READS entry and neither needs one: both answer 401 bare, which
    // the sweep below established before this number moved. #228 read 42 on
    // its own tree, which held none of the four above it, so 43 is this
    // sweep's own answer on the rebased tree and not either diff's.
    //
    // 43 to 46 on 2026-09-20 for the three Responsibility reads (issue #230):
    // `GET /folders/:id/members/:userId`, the member-details projection,
    // `GET /folders/:id/members/:userId/responsibility` and
    // `GET /folders/:id/members/:userId/responsibility/history`. None earns a
    // PUBLIC_READS entry and none needs one: all three answer 401 bare, which
    // the sweep below established before this number moved. **#230 read 45 on
    // its own tree, which was #228's and held none of the four above it, so
    // 46 is the sum and is this sweep's own answer on the rebased tree.**
    //
    // 46 to 48 on 2026-09-21 for the two facet reads (issue #210):
    // `GET /folders/:id/facets`, the facet listing, and
    // `GET /folders/:id/facets/:facetId/page`, a blank facet's document.
    // Neither earns a PUBLIC_READS entry and neither needs one: both answer
    // 401 bare, which the sweep below established before this number moved.
    // #210 read 46 on its own tree, which is `main` at 46dbabd, so 48 is this
    // sweep's own answer on that tree.
    expect(
      routes.length,
      `the walker found ${String(routes.length)} reading routes and there were 48 after issue #223 added the two Dana Link reads, issue #224 added the task-dependency read, issue #226 added the Label definition listing, issue #228 added the two Access-history reads, issue #230 added the three Responsibility reads and issue #210 added the two facet reads. Fewer means the enumeration lost sight of routes that still exist; more means a GET was added, and it must either answer 401 bare or earn a PUBLIC_READS entry, and this number moves with it in the same change`,
    ).toBe(48)

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

/*
AC-114: given a production build, when the development login route is called,
then it does not exist (404), regardless of environment variables.

The last four words decide what this test has to do. If the route were merely
guarded at runtime by an environment variable, then setting that variable in
production would bring it back, and the criterion says it must not. The only
mechanism that satisfies the sentence is one where the compiled artifact does
not contain the route at all, so the test compiles the production build and
interrogates that, rather than asking the source module how it feels about
NODE_ENV.

It is compiled the way the build script compiles it, tsconfig.build.json, and
the output goes under dist/, which is gitignored, and inside app/ so that the
compiled modules still resolve node_modules. TypeScript is invoked through
process.execPath rather than npx: npx would risk a network fetch, and spawning
a .cmd shim throws EINVAL on current Node. It is invoked with `--noCheck` since
2026-09-20, which emits the same bytes without checking the types a second
time; compileProductionBuild below carries the measurement and the reason.

The route is then called twice, once with DANA_DEV_LOGIN set and NODE_ENV
production, and once with DANA_DEV_LOGIN set and NODE_ENV development, which
is the "regardless" made concrete. An implementation that gates the route on
NODE_ENV alone passes the first and fails the second, and it should, because
NODE_ENV is an environment variable like any other.

The last test is what keeps the rest honest. Today nothing anywhere registers
this route, so a build that omits it is indistinguishable from a build that
never had it, and the dist assertions pass for the wrong reason. So the
development case is asserted too: with the flag set, in the source module, the
route must exist. That is what CLAUDE.md and .env.example promise it does, and
it is what fails today.

This file imports nothing from the auth harness. Its cases turn on environment
variables applied around a fresh module load, and a static import of the
application anywhere in its graph would be hoisted above the assignment,
settling the question before the test asked it.

The 2026-07-31 amendment made three of this file's assumptions contract rather
than inference. 11.6 fixes "absent" as excluded from the compiled output at
build time and never a runtime guard, which is what the structural case below
now asserts directly rather than only through behavior. It also fixes the flag
as read at createApp() call time, which is what buildApp exists to honor.
11.15 records the mechanism hazard behind all of it: tsc compiles and emits a
tsconfig-excluded file whenever any resolvable import references it, a literal
dynamic import() included, so the exclusion holds only for a loader using a
computed specifier that treats the failed load as a 404.

Spec: 11.6, 11.10, 11.15. Repository: app/.env.example, CLAUDE.md.
*/
import { spawn } from 'node:child_process'
import { readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { rawRequest } from '../support/http-client.js'

// Every npm script runs from app/, and so does Vitest.
const appDir = process.cwd()
const outDir = path.join(appDir, 'dist', 'acceptance-build')
const compiledEntry = path.join(outDir, 'src', 'server', 'index.js')

// The base is settled at /api/v1 by the amended 7.1, but both spellings are
// probed anyway: this file asserts absence, and a route wrongly mounted at the
// root is still a route that exists. Checking more paths can only make an
// absence claim stronger.
const DEV_LOGIN_PATHS = ['/api/v1/auth/dev-login', '/auth/dev-login']

// Every test here loads a whole module graph through a fresh import: express,
// pino, drizzle and pglite, uncached because vi.resetModules() precedes each
// one. That does not fit in Vitest's default five second test timeout on a
// cold run, and a timeout would report as an Error rather than as an
// assertion, which is the one failure mode this suite must never produce.
const MODULE_LOAD_TIMEOUT = 120_000

type CreateApp = () => unknown

interface RunningApp {
  origin: string
  server: Server
}

const servers: Server[] = []

async function serve(app: unknown): Promise<RunningApp> {
  const server = createServer()
  servers.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  server.on('request', app as (...args: unknown[]) => void)
  const { port } = server.address() as AddressInfo
  return { origin: `http://127.0.0.1:${String(port)}`, server }
}

/*
Emit, and deliberately not a second type-check (issue #273, 2026-09-20).

**What was wrong.** This hook ran the whole production type-check inside the
test leg, and on a loaded machine it was the first thing to fall: the 300 second
cap was hit in CI runs 209, 210, 214 and 217 — four of the last five `main`
runs, and 217 was otherwise 1762 of 1762 green. A leg that goes red on its own
weight teaches everyone to re-run rather than to read, which is the actual cost.

**Why `--noCheck` is the right size of change.** What AC-114 needs is the
*emitted* server code, so that it can be booted and asked whether the route is
there. It does not need the types checked a second time — `npm run typecheck`
owns that, over `tsconfig.server.json`, whose file set is a superset of the one
`tsconfig.build.json` narrows, so nothing goes unchecked as a result of this.
`--noCheck` arrived in TypeScript 5.6 and this repository is on 5.9.3.

Measured on a Linux container, idle, at the change: **12.3 and 13.0 seconds
against 4.1 and 3.9**, and 11.7 seconds of CPU against 4.7. The two outputs
were compared file by file and are **byte-identical**, 258 files either way.

**Why not esbuild, which is installed and would take 0.4 seconds.** Measured, so
the number is real, and rejected on what it would cost the third case below.
A per-file transpile emits exactly the files it is handed, while tsc emits a
tsconfig-*excluded* file whenever a resolvable import names it — which is the
11.15 hazard that case exists to catch. Under esbuild, an implementation that
imported `./dev-login.js` with a literal dynamic import would emit no such file,
the loader would treat the failed load as a 404, and all three cases would pass
over a build whose source imports the development login module. That is a check
that cannot fail, and it is the shape of fault this whole branch was about.
A bundle is worse again: it would inline the module and leave no file to find.

So the mechanism changes and nothing else does. Every assertion below is
untouched, and both halves were re-proved by mutation at the change: mounting
the route unconditionally in `src/server/index.ts` turned the two behavioural
cases red, and adding a literal `import './auth/dev-login.js'` to the same file
made `tsc --noCheck` emit the module and turned the structural case red.
*/
async function compileProductionBuild(): Promise<void> {
  await rm(outDir, { recursive: true, force: true })
  const tsc = path.join(appDir, 'node_modules', 'typescript', 'bin', 'tsc')

  const result = await new Promise<{ code: number; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [tsc, '-p', 'tsconfig.build.json', '--outDir', outDir, '--noCheck'],
        { cwd: appDir },
      )
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
      child.on('error', reject)
      child.on('close', (code) => {
        resolve({ code: code ?? 1, output })
      })
    },
  )

  expect(
    result.code,
    `the production build did not compile, so AC-114 cannot be assessed:\n${result.output}`,
  ).toBe(0)
}

beforeAll(async () => {
  await compileProductionBuild()
}, 300_000)

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  }
  await rm(outDir, { recursive: true, force: true })
})

/**
 * Loads a module fresh and constructs the application, both while the case's
 * environment is applied.
 *
 * The construction has to happen inside that window. An earlier version of
 * this helper restored the environment as soon as the import resolved and
 * handed the factory back to the caller, which then called it with the
 * variables already put back: every case here would have been asking about
 * whatever DANA_DEV_LOGIN happened to be outside the test. It was invisible
 * while the route existed nowhere and both readings answered 404. The
 * 2026-07-31 amendment settles which reading is right, 11.6 fixing the flag as
 * read at createApp() call time and never at module load, so the window has to
 * cover the call.
 *
 * 11.10 makes createApp synchronous, performing no I/O and opening no
 * database, and says a route-presence probe may construct it bare. So no
 * dbClient is passed: this file asks only whether a route exists.
 */
async function buildApp(
  specifier: string,
  environment: Record<string, string | undefined>,
): Promise<unknown> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(environment)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
  try {
    const loaded = (await import(specifier)) as { createApp: CreateApp }
    return loaded.createApp()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function devLoginStatuses(origin: string): Promise<number[]> {
  const statuses: number[] = []
  for (const route of DEV_LOGIN_PATHS) {
    const response = await rawRequest(`${origin}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    statuses.push(response.status)
  }
  return statuses
}

describe('AC-114: the development login route is absent from production builds', () => {
  test('AC-114: the compiled build answers 404 with DANA_DEV_LOGIN set', async () => {
    const app = await buildApp(pathToFileURL(compiledEntry).href, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'production',
    })
    const { origin } = await serve(app)

    expect(
      await devLoginStatuses(origin),
      'the development login route exists in a production build (spec 11.6)',
    ).toEqual([404, 404])
  }, MODULE_LOAD_TIMEOUT)

  test('AC-114: the compiled build answers 404 regardless of NODE_ENV', async () => {
    // The "regardless of environment variables" clause, made concrete. A
    // route gated on NODE_ENV rather than removed from the build reappears
    // the moment the variable is wrong, which is a production incident that
    // looks like a configuration typo.
    const app = await buildApp(pathToFileURL(compiledEntry).href, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'development',
    })
    const { origin } = await serve(app)

    expect(
      await devLoginStatuses(origin),
      'the development login route returned in the production build once NODE_ENV was changed (spec 11.6)',
    ).toEqual([404, 404])
  }, MODULE_LOAD_TIMEOUT)

  test('AC-114: no development login module is emitted into the production build', async () => {
    // Behavior alone cannot separate "excluded from the build" from "present
    // and guarded", and 11.6 requires the former in those words. 11.15
    // explains how the latter happens by accident: tsc emits a
    // tsconfig-excluded file anyway if any resolvable import names it, so an
    // implementation can exclude the module, import it literally, and ship it
    // regardless. What that produces is a file in the output tree.
    const emitted = await readdir(outDir, { recursive: true })
    const devLoginModules = emitted
      .map((entry) => String(entry))
      .filter((entry) => /dev[-_]?login/i.test(entry))

    expect(
      devLoginModules,
      `the production build emitted a development login module (spec 11.6): ${devLoginModules.join(', ')}`,
    ).toEqual([])
  }, MODULE_LOAD_TIMEOUT)

  test('AC-114 control: with the flag set, the development build does have the route', async () => {
    // Without this the two tests above are satisfied by a route that exists
    // nowhere at all, which is exactly the state of the repository today.
    // CLAUDE.md and .env.example both say DANA_DEV_LOGIN=1 enables
    // POST /api/v1/auth/dev-login.
    const sourceEntry = pathToFileURL(
      path.join(appDir, 'src', 'server', 'index.ts'),
    ).href
    const app = await buildApp(sourceEntry, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'development',
    })
    const { origin } = await serve(app)

    const statuses = await devLoginStatuses(origin)
    expect(
      statuses.some((status) => status !== 404),
      'DANA_DEV_LOGIN=1 enables no development login route, so the production-build assertions above prove nothing',
    ).toBe(true)
  }, MODULE_LOAD_TIMEOUT)

  test('AC-114 control: without the flag, the development build does not have it', async () => {
    const sourceEntry = pathToFileURL(
      path.join(appDir, 'src', 'server', 'index.ts'),
    ).href
    const app = await buildApp(sourceEntry, {
      DANA_DEV_LOGIN: undefined,
      NODE_ENV: 'development',
    })
    const { origin } = await serve(app)

    expect(
      await devLoginStatuses(origin),
      'the development login route is reachable without DANA_DEV_LOGIN',
    ).toEqual([404, 404])
  }, MODULE_LOAD_TIMEOUT)
})

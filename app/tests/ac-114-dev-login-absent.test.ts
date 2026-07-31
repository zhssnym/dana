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
a .cmd shim throws EINVAL on current Node.

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

This file deliberately imports nothing from the harness. Its source-side case
turns on an environment variable read at module load, and a static import
anywhere in its graph would be hoisted above the assignment.

Spec: 11.6. Repository: app/.env.example, CLAUDE.md.
*/
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { rawRequest } from './http-client.js'

// Every npm script runs from app/, and so does Vitest.
const appDir = process.cwd()
const outDir = path.join(appDir, 'dist', 'acceptance-build')
const compiledEntry = path.join(outDir, 'src', 'server', 'index.js')

// Both spellings, because which base the auth routes mount under is itself
// unsettled (7.0 fixes /api/v1, 7.1 spells the endpoints /auth/...). A route
// that exists under either one exists.
const DEV_LOGIN_PATHS = ['/api/v1/auth/dev-login', '/auth/dev-login']

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

async function compileProductionBuild(): Promise<void> {
  await rm(outDir, { recursive: true, force: true })
  const tsc = path.join(appDir, 'node_modules', 'typescript', 'bin', 'tsc')

  const result = await new Promise<{ code: number; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [tsc, '-p', 'tsconfig.build.json', '--outDir', outDir],
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

/** Loads a module fresh, with the environment the case is about already set. */
async function loadApp(
  specifier: string,
  environment: Record<string, string | undefined>,
): Promise<CreateApp> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(environment)) {
    previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
  try {
    const loaded = (await import(specifier)) as { createApp: CreateApp }
    return loaded.createApp
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
    const createApp = await loadApp(pathToFileURL(compiledEntry).href, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'production',
    })
    const { origin } = await serve(createApp())

    expect(
      await devLoginStatuses(origin),
      'the development login route exists in a production build (spec 11.6)',
    ).toEqual([404, 404])
  })

  test('AC-114: the compiled build answers 404 regardless of NODE_ENV', async () => {
    // The "regardless of environment variables" clause, made concrete. A
    // route gated on NODE_ENV rather than removed from the build reappears
    // the moment the variable is wrong, which is a production incident that
    // looks like a configuration typo.
    const createApp = await loadApp(pathToFileURL(compiledEntry).href, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'development',
    })
    const { origin } = await serve(createApp())

    expect(
      await devLoginStatuses(origin),
      'the development login route returned in the production build once NODE_ENV was changed (spec 11.6)',
    ).toEqual([404, 404])
  })

  test('AC-114 control: with the flag set, the development build does have the route', async () => {
    // Without this the two tests above are satisfied by a route that exists
    // nowhere at all, which is exactly the state of the repository today.
    // CLAUDE.md and .env.example both say DANA_DEV_LOGIN=1 enables
    // POST /api/v1/auth/dev-login.
    const sourceEntry = pathToFileURL(
      path.join(appDir, 'src', 'server', 'index.ts'),
    ).href
    const createApp = await loadApp(sourceEntry, {
      DANA_DEV_LOGIN: '1',
      NODE_ENV: 'development',
    })
    const { origin } = await serve(createApp())

    const statuses = await devLoginStatuses(origin)
    expect(
      statuses.some((status) => status !== 404),
      'DANA_DEV_LOGIN=1 enables no development login route, so the production-build assertions above prove nothing',
    ).toBe(true)
  })

  test('AC-114 control: without the flag, the development build does not have it', async () => {
    const sourceEntry = pathToFileURL(
      path.join(appDir, 'src', 'server', 'index.ts'),
    ).href
    const createApp = await loadApp(sourceEntry, {
      DANA_DEV_LOGIN: undefined,
      NODE_ENV: 'development',
    })
    const { origin } = await serve(createApp())

    expect(
      await devLoginStatuses(origin),
      'the development login route is reachable without DANA_DEV_LOGIN',
    ).toEqual([404, 404])
  })
})

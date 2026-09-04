/*
AC-399 and AC-400: every route that reads a JSON body reads it through
`parseBody`, and the line that helper writes carries the route and the key
names and nothing else.

## Why a guard at all, and not just the helper

Issue #104 is 11.14's admitted remedy for the class of loss where a client
sends a key nobody declared: `z.object` strips it, the route answers 200, and
nothing separates that from a request that never carried it. The helper alone
would not be that remedy. A helper a new route can simply forget has exactly
the failure shape of the hand-written `accessOf(...)` gates — about twenty of
them, and forgetting one fails nothing (issue #74) — so building it without a
guard reproduces the problem it was built to solve, one layer up.

`ac-236-structural-guard-sweep.test.ts` is the model, and its counts are the
part worth copying: pinned to equality, so a route cannot join or leave the
application without the number moving in the same change.

## Which of the two shapes this is, and what that costs

There were two ways to write AC-399 and this is the cheaper one, said plainly
because the difference matters to whoever reads a green run.

**What was written** is a source sweep: no file under `src/server` may parse
`req.body` other than through the helper, with an allowlist of zero, and the
call sites and the modules holding them are counted to equality.

**What was not written** is the runtime sweep — enumerate the mounted router
the way AC-236 does, drive every body-taking mutation with an unknown key
merged into a minimal valid body, and assert the line for each. That is the
honest structural form, because it proves the path a request actually takes
rather than the spelling of the source. It needs a table of one valid body,
valid path ids and satisfied preconditions per route for twenty-nine routes,
including a multipart upload and an endpoint that fetches from an external
host, and that table was more than the night this landed in held. AC-400
below buys back the part of it that can be bought cheaply: it drives the real
mounted application end to end, so the runtime path is proven to exist on real
routes rather than only asserted to be spelled correctly everywhere.

**So the honest statement of the limit is this.** A route that imports the
helper and ignores what it returns passes AC-399. So does one that reads a
body from somewhere other than `req.body`, or that hand-rolls a parse in a
domain module. What the sweep does catch is the way this will actually be
lost: the next route written by copying an older one, with the two lines that
were the convention before this helper existed. And the counts catch the rest
of it the way AC-236's do — not by understanding, but by refusing to stay the
same while the surface changes.

Spec: 7.0, 10.5, 11.14, 11.15; issue #104.
*/
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createSecurityLogger } from '../src/server/security/log.js'
import type { LogSink } from '../src/server/security/log.js'
import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast } from './folders-harness.js'
import type { Actor } from './folders-harness.js'

/* ------------------------------------------------------------------ *
 * AC-399, the source sweep
 * ------------------------------------------------------------------ */

const SERVER_ROOT = fileURLToPath(new URL('../src/server/', import.meta.url))

/**
 * The one file allowed to parse `req.body` directly, because it is the
 * helper. An allowlist of one entry and no room for a second: an exemption
 * here would be a route excused from the guard, which is the thing this file
 * exists to make impossible.
 */
const PARSER = 'http/parse-body.ts'

/**
 * Test files are not routes. Four route modules under `src/server` build
 * little express applications of their own to drive a handler, and
 * `http/errors.test.ts` declares demo routes that parse a body the old way on
 * purpose — the strict schema #105 is about lives there, because 11.14 rules
 * that nothing in `app/src/shared/` may be strict. None of them is mounted by
 * `createApp`, so none of them can lose a caller's field.
 */
const isSource = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.test.ts')

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(SERVER_ROOT, {
    recursive: true,
    withFileTypes: true,
  })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      `${entry.parentPath.slice(SERVER_ROOT.length)}/${entry.name}`
        .replaceAll('\\', '/')
        .replace(/^\/+/, ''),
    )
    .filter(isSource)
    .sort()
}

async function read(relative: string): Promise<string> {
  return readFile(`${SERVER_ROOT}${relative}`, 'utf8')
}

describe('AC-399 no route parses a request body except through parseBody', () => {
  test('the two spellings of a direct parse appear nowhere but the helper', async () => {
    const files = await sourceFiles()
    expect(
      files.length,
      'the walk found no source under src/server, which is a broken walk rather than a clean tree',
    ).toBeGreaterThan(50)

    /* Both forms: the checked one this repository writes everywhere, and the
       throwing one it writes nowhere, which is worth refusing before somebody
       reaches for it as the way around a guard that only names the other. */
    const direct = /(?:safeParse|parse)\(req\.body\)/
    const offenders: string[] = []
    for (const file of files) {
      if (file === PARSER) continue
      const source = await read(file)
      for (const [index, line] of source.split('\n').entries()) {
        if (direct.test(line)) offenders.push(`${file}:${String(index + 1)}`)
      }
    }

    expect(
      offenders,
      `these parse req.body without parseBody, so a key the caller sent and nobody declared is dropped there in silence (issue #104): ${offenders.join(', ')}`,
    ).toEqual([])
  })

  test('the helper is called from every module that reads a body, counted', async () => {
    const files = await sourceFiles()
    const sites: string[] = []
    const modules = new Set<string>()
    for (const file of files) {
      if (file === PARSER) continue
      const source = await read(file)
      for (const [index, line] of source.split('\n').entries()) {
        if (!/\bparseBody\(/.test(line)) continue
        sites.push(`${file}:${String(index + 1)}`)
        modules.add(file)
      }
    }

    /* Equality on both, for AC-236's reason rather than by imitation of it.
       A sweep over an empty enumeration proves nothing and one over a
       hollowed-out enumeration proves less than it appears to, so the number
       that would otherwise drift silently is the assertion.

       Measured 2026-09-04 at the change that introduced the helper: 29 call
       sites across 11 modules. Issue #104 was written against 28 across 11,
       and the extra one arrived with the wave-1 routes merged the same day,
       which is this sentence's own instruction followed rather than an
       exception to it. A new body-taking route moves the first number by one
       and may move the second; **before you move either, check that the
       sweep above passed** — if it failed, the number is telling you a route
       parses a body directly, and moving it is the thing the backend
       README's rule 2 forbids. */
    expect(
      sites.length,
      `parseBody is called from ${String(sites.length)} places and there were 29 on 2026-09-04. Fewer means a route stopped using it, which the sweep above catches only if it went back to req.body; more means a body-taking route was added, and this number moves with it in the same change`,
    ).toBe(29)
    expect(
      [...modules].sort().length,
      `${String(modules.size)} modules read a request body and there were 11 on 2026-09-04: ${[...modules].sort().join(', ')}`,
    ).toBe(11)
  })
})

/* ------------------------------------------------------------------ *
 * AC-400, the behaviour, driven through the mounted application
 * ------------------------------------------------------------------ */

interface Line {
  level: 'info' | 'warn' | 'error'
  fields: Record<string, unknown>
  message: string
}

let lines: Line[] = []
const recordingSink: LogSink = {
  info: (fields, message) => lines.push({ level: 'info', fields, message }),
  warn: (fields, message) => lines.push({ level: 'warn', fields, message }),
  error: (fields, message) => lines.push({ level: 'error', fields, message }),
}

let app: AuthTestApp
const cast = new Cast(['prober'], 'ac399')

beforeAll(async () => {
  app = await startAuthTestApp({ securityLog: createSecurityLogger(recordingSink) })
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

const unknownFieldLines = (): Line[] =>
  lines.filter((line) => line.fields['event'] === 'unknown_request_fields')

const PROBE = '__unknown_probe__'
const SECRET = 'a-title-nobody-may-ever-read-in-a-log'

describe('AC-400 an undeclared key is observed, and nothing of its value is', () => {
  test('one warn line, naming the route and the key and no value', async () => {
    const [prober] = (await cast.of(app)) as [Actor]
    lines = []

    const created = await prober.browser.request('/api/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Kitchen', [PROBE]: SECRET }),
    })

    /* 7.0's tolerance is untouched and that is the whole design: the key is
       still stripped, the answer is still 201, and what changed is that the
       silence has a line in it now (11.14). */
    expect(created.status).toBe(201)

    const written = unknownFieldLines()
    expect(
      written.length,
      'a body carrying a key no schema declares wrote no line, so the loss is still silent',
    ).toBe(1)
    const [line] = written as [Line]
    expect(line.level, 'searchable in production means warn, not info').toBe('warn')
    expect(line.fields).toEqual({
      event: 'unknown_request_fields',
      route: 'POST /api/v1/folders',
      fields: [PROBE],
      count: 1,
    })

    /* 10.5, measured over the whole line rather than over the fields
       somebody thought to name. */
    const emitted = JSON.stringify(line)
    expect(emitted).not.toContain(SECRET)
    expect(emitted).not.toContain('Kitchen')
  })

  test('the route is the mounted template and never the id in the URL', async () => {
    const [prober] = (await cast.of(app)) as [Actor]
    const created = await prober.browser.request('/api/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Study' }),
    })
    const folder = created.json() as { id: string }
    lines = []

    const patched = await prober.browser.request(`/api/v1/folders/${folder.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Study again', colour: 'blue' }),
    })
    expect(patched.status).toBe(200)

    const [line] = unknownFieldLines() as [Line]
    expect(line.fields['route']).toBe('PATCH /api/v1/folders/:id')
    expect(line.fields['fields']).toEqual(['colour'])
    expect(JSON.stringify(line)).not.toContain(folder.id)
  })

  test('a body every key of which is declared writes nothing at all', async () => {
    const [prober] = (await cast.of(app)) as [Actor]
    lines = []

    const created = await prober.browser.request('/api/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Garage', description: 'the one with the bikes' }),
    })
    expect(created.status).toBe(201)

    /* The absence is half the criterion. A line on every request would be a
       line nobody reads, and the search 11.14 asked for would be worthless
       the day it was needed. */
    expect(
      unknownFieldLines(),
      'a clean body wrote an unknown-field line, so the signal is noise',
    ).toEqual([])
  })

  test('a refused body writes nothing either, the 422 having named the fields', async () => {
    const [prober] = (await cast.of(app)) as [Actor]
    lines = []

    const refused = await prober.browser.request('/api/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', [PROBE]: SECRET }),
    })
    expect(refused.status).toBe(422)
    expect(unknownFieldLines()).toEqual([])
  })
})

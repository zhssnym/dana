/*
The gate describes the host it ran on, rather than the host it was written on.

**Why this is a guard and not a criterion.** It pins nothing in spec section
12. `npm run gate` is not a behaviour of Dana, it is the thing that certifies
Dana's behaviours, and `tests/README.md` names that split exactly. The sibling
`guard-gate-port.test.ts` is the same argument for the port.

**What it is guarding**, all of it from issue #273, and all of it the same
fault wearing three hats: **the gate stating something about its host that
nobody measured.**

1. **The engine version is a reading.** `test (Postgres 18)` was a string
   literal, and until issue #235 it could not be wrong — 11.10's CREATE
   DATABASE carries `LOCALE_PROVIDER builtin`, which arrived in Postgres 17, so
   a 16 server failed in global setup before a single file ran. #235 gave that
   statement a libc fallback and made a sub-18 server a supported gate host,
   and the first records produced away from the author's machine all said 18
   over a leg that ran on 16.13. The gate record is what a pull request offers
   instead of six re-run steps; a line in it that nobody measured is the exact
   class CLAUDE.md opens by warning about, in the one document whose whole job
   is to be true.
2. **An unreadable version says so.** The fix would otherwise commit the
   original fault: a number invented from an empty answer is no better than a
   number written down in 2026-09.
3. **The browser leg refuses a dot-segment path.** Express refuses any path
   carrying a dot segment to `res.sendFile()`, and the SPA fallback answers
   every client route through exactly that, so `GET /app` is a 404 while `GET
   /` still succeeds through `express.static`. Every spec then fails on a
   missing sidebar and the application looks broken. `.claude/worktrees/` is
   where an agent's worktree is made by default, and #235 made the browser leg
   runnable on the containers those agents run in, so what used to be a fact
   about one session's old `.work` directory is now the default path on a
   newly capable host.

**The third is pinned twice on purpose**, and the second pin is the one worth
having: the refusal's texts, and **the Express behaviour the refusal exists
because of**. A guard that only checked the message would keep the refusal
alive long after the reason for it had gone, and the reason is a property of a
dependency rather than of this repository. If Express ever stops refusing dot
segments, the second half of this file goes red and the precondition can be
deleted on evidence.

Issue #273; spec 11.10, 11.11; `CLAUDE.md`'s browser-leg bullets.
*/
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import {
  browserLegPathRefusal,
  dotSegmentIn,
  pgliteVersion,
  postgresVersion,
  testStepName,
  versionText,
} from '../../scripts/gate.mjs'
import { prepareLegDatabaseOnce } from '../support/postgres-leg-admin.js'

const APP = new URL('../../', import.meta.url)

const target = process.env.TEST_DATABASE_URL
const onPostgres = target !== undefined && target !== ''

describe('the gate record: the engine version is read from the server', () => {
  /*
  The prose first and the number behind it, because they fail in different
  ways. `SHOW server_version` on the container answers
  `16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)` — a fact about the host that
  `160013` is not — and a server that answers nothing usable must produce no
  version at all rather than a plausible one.
  */
  it('takes the leading version from what the server said', () => {
    expect(versionText('16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)', '160013')).toBe('16.13')
    expect(versionText('18.0', '180000')).toBe('18.0')
    expect(versionText('17.2 (Debian 17.2-1.pgdg120+1)', '170002')).toBe('17.2')
  })

  it('falls back to the number the locale clause is chosen on', () => {
    expect(versionText(undefined, '160013')).toBe('16.13')
    expect(versionText('', '180000')).toBe('18.0')
  })

  it('reads nothing rather than guessing, when there is nothing to read', () => {
    expect(versionText(undefined, undefined)).toBeNull()
    expect(versionText('', '')).toBeNull()
    expect(versionText(null, 'not a number')).toBeNull()
    expect(versionText(undefined, '80400')).toBeNull()
  })

  it('says the version was unread rather than naming one', () => {
    expect(testStepName('postgres', null)).toBe('test (Postgres, version unread)')
    expect(testStepName('pglite', null)).toBe('test (PGlite fallback, version unread)')
  })

  it('names the version it was given', () => {
    expect(testStepName('postgres', '16.13')).toBe('test (Postgres 16.13)')
    expect(testStepName('postgres', '18.0')).toBe('test (Postgres 18.0)')
    expect(testStepName('pglite', '0.5.4')).toBe('test (PGlite 0.5.4 fallback)')
  })

  /*
  The end-to-end half, and the only one that can tell that the reading is
  wired to a server at all. It runs against this worker's own database rather
  than the base one, spec 11.10's isolation holding here as everywhere;
  `server_version` is a property of the server, so any database answers it.
  */
  it.runIf(onPostgres)('agrees with what this host would tell you itself', async () => {
    await prepareLegDatabaseOnce()
    const client = new pg.Client({ connectionString: target })
    // Issue #174's listener, for the same reason the leg's own connections
    // carry one: a socket reset on an unlistened client throws.
    client.on('error', () => {})
    await client.connect()
    try {
      const answer = await client.query<{ server_version: string }>('SHOW server_version')
      const said = answer.rows[0]?.server_version ?? ''
      const read = await postgresVersion(target ?? '')

      expect(read, `the server said ${said} and the gate read nothing`).not.toBeNull()
      expect(said.startsWith(read ?? '')).toBe(true)
      expect(testStepName('postgres', read)).toBe(`test (Postgres ${read ?? ''})`)
    } finally {
      await client.end()
    }
  })

  it('names the PGlite that is installed, which is not the range package.json declares', async () => {
    const version = await pgliteVersion()
    expect(version, 'no PGlite version could be read from node_modules').not.toBeNull()
    expect(version).toMatch(/^[0-9]+\.[0-9]+/)
    expect(testStepName('pglite', version)).toContain(version ?? '')
    // The line this replaces, pinned by the shape it had rather than by a
    // description of it.
    expect(testStepName('pglite', version)).not.toBe('test (PGlite fallback)')
  })

  /*
  The two step names as they were spelled — quoted, because both files talk
  about the old literals in prose and a text search that could not tell a
  string from a sentence would fail on the explanation of its own fix.
  */
  it('leaves no engine version written down in gate.mjs', async () => {
    const text = await readFile(fileURLToPath(new URL('scripts/gate.mjs', APP)), 'utf8')
    expect(text).not.toContain("'test (Postgres 18)'")
    expect(text).not.toContain("'test (PGlite fallback)'")
    expect(text).toContain('testStepName')
  })
})

describe('the browser leg: a path carrying a dot segment', () => {
  it('finds the segment, on either separator', () => {
    expect(dotSegmentIn('/home/user/dana/.claude/worktrees/one/app/')).toBe('.claude')
    expect(dotSegmentIn('/home/user/dana/.work/app')).toBe('.work')
    expect(dotSegmentIn('C:\\Users\\hassan\\dana\\.work\\app')).toBe('.work')
    expect(dotSegmentIn('/tmp/dana-wt/app/')).toBeNull()
    expect(dotSegmentIn('C:\\Users\\hassan\\dana\\app')).toBeNull()
  })

  it('refuses the leg and says which segment and why', () => {
    const refusal = browserLegPathRefusal('/home/user/dana/.claude/worktrees/one/app/')
    expect(refusal).not.toBeNull()
    expect(refusal?.note).toContain('.claude')
    expect(refusal?.advice).toContain('sendFile')
    expect(refusal?.advice).toContain('404')
  })

  it('lets a dot-free path through', () => {
    expect(browserLegPathRefusal('/tmp/dana-wt/app/')).toBeNull()
  })

  /*
  The wiring, because an exported refusal nobody calls is a check that cannot
  fail — which is the other half of the issue this file answers.
  */
  it('is asked before the browser leg starts', async () => {
    const text = await readFile(fileURLToPath(new URL('scripts/gate.mjs', APP)), 'utf8')
    expect(text).toContain('browserLegPathRefusal(APP)')
  })
})

/* ------------------------------------------------------------------ *
 * The reason the refusal exists, measured rather than recalled
 * ------------------------------------------------------------------ */

const made: string[] = []

afterAll(async () => {
  for (const directory of made) await rm(directory, { recursive: true, force: true })
})

/** A dist directory holding one index.html, at a path this test chooses. */
async function distAt(...segments: string[]): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dana-dot-'))
  made.push(root)
  const dist = path.join(root, ...segments)
  await mkdir(dist, { recursive: true })
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>dana</title>')
  return dist
}

/**
 * The SPA fallback of `src/server/index.ts`, reduced to the two lines this is
 * about, answering on a port the operating system picks.
 */
async function answersFrom(dist: string, route: string): Promise<number> {
  const app = express()
  app.use(express.static(dist))
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(dist, 'index.html'))
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.on('listening', resolve))
  const address = server.address() as net.AddressInfo
  try {
    const answer = await fetch(`http://127.0.0.1:${String(address.port)}${route}`)
    // Read the body so the socket closes rather than being destroyed under a
    // server that is about to be asked to stop.
    await answer.text()
    return answer.status
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe('why the browser leg refuses it: Express and res.sendFile', () => {
  it('serves a client route from a dot-free path', async () => {
    const dist = await distAt('build', 'dist')
    expect(await answersFrom(dist, '/')).toBe(200)
    expect(await answersFrom(dist, '/app')).toBe(200)
  })

  /*
  The asymmetry is the whole trap and is why this is asserted in both
  directions: `GET /` still succeeds, through `express.static` and not through
  `sendFile`, so the application answers its root and 404s every route the
  specs actually drive. Measured 2026-09-20 on Express 5.2.1 on Linux, which
  repeats the 2026-08-16 Windows measurement CLAUDE.md carries.
  */
  it('404s the same route from a path carrying a dot segment, while the root still works', async () => {
    const dist = await distAt('.work', 'dist')
    expect(dotSegmentIn(dist)).toBe('.work')
    expect(await answersFrom(dist, '/')).toBe(200)
    expect(await answersFrom(dist, '/app')).toBe(404)
  })
})

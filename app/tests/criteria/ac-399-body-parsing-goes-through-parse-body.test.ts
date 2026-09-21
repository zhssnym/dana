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

**What was written** is a source sweep: no file under `src/server` may touch
`req.body` other than through the helper, with every exception named and its
reads counted, and the helper's call sites and the modules holding them
counted to equality.

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

**The first draft of this file was weaker than that and the correction is
worth keeping.** It matched the two spellings of a parse, `safeParse(req.body)`
and `.parse(req.body)`, and four readers were invisible to it because they
assign `req.body` to a local first — so the guard could be walked around by a
rename, which is the one thing a guard may not be. It now enumerates the
*mention*, and every mention outside the helper is named below with its reason
and its count.

Spec: 7.0, 10.5, 11.14, 11.15; issue #104.
*/
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createSecurityLogger } from '../../src/server/security/log.js'
import type { LogSink } from '../../src/server/security/log.js'
import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { Cast } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

/* ------------------------------------------------------------------ *
 * AC-399, the source sweep
 * ------------------------------------------------------------------ */

const SERVER_ROOT = fileURLToPath(new URL('../../src/server/', import.meta.url))

const PARSER = 'http/parse-body.ts'

/**
 * Every place under `src/server` that touches `req.body` at all, and why each
 * one is not a route parsing a shared schema.
 *
 * **The number is part of the entry deliberately.** An allowlist that names a
 * file excuses everything that file will ever do with a body; one that names a
 * file *and a count* excuses exactly what was read and understood on the day it
 * was written, and a second read in the same file fails here rather than
 * inheriting the first one's reason.
 *
 * `reads` counts **lines that mention `req.body`**, not occurrences: the sweep
 * reports line numbers so that a failure points at something a reader can
 * open, and two mentions on one line would count once. No line here has two.
 */
const DIRECT_READERS = new Map<string, { reads: number; reason: string }>([
  [
    PARSER,
    {
      reads: 2,
      reason:
        'the helper itself: the safeParse every route now goes through, and the read that compares the body’s own keys against the schema’s declared ones',
    },
  ],
  [
    'auth/dev-login.ts',
    {
      reads: 1,
      reason:
        'not a section 7 route, and absent from production builds (11.6, AC-114). It merges the query string over the body so that a plain HTML form, which cannot post JSON, can still name the account, and every field is optional — there is no declared key set an unknown one could be measured against',
    },
  ],
  [
    'routes/csp-report.ts',
    {
      reads: 1,
      reason:
        "a stranger's JSON rather than this contract's (issue #99). The browser composes the report and app/src/shared/ declares no schema for it, so every key in it is one nobody declared; violationsIn narrows it to the three fields 10.5 admits and drops the rest, which is a stricter answer than logging them",
    },
  ],
  [
    'index.ts',
    {
      reads: 1,
      reason:
        "7.0's malformed-body guard, which runs before any router and asks one question of the parsed value: whether it is an object at all. It reads no field and knows no schema, and a body it lets past is one every route below then parses through the helper",
    },
  ],
  [
    'routes/tasks.ts',
    {
      reads: 1,
      reason:
        "7.6's 'status is not accepted here (409 if present)', asked before the schema parses because the schema would strip the field and answer 200 to a request 7.6 refuses. It is the opposite of a silent drop, and that is why it cannot go through the helper: the helper's answer for an undeclared key is to log it and carry on, and this key has to stop the request",
    },
  ],
])

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

/**
 * The source with its comments and string literals blanked out, line numbering
 * preserved.
 *
 * Counting raw source counts prose. The comments in this repository are long
 * and argumentative and name the things they discuss, so both `req.body` and
 * `parseBody(` appear inside them; a count taken over raw text would partly be
 * a count of how often somebody explained the rule. Characters are replaced
 * rather than removed so a line number in a failure message still points at the
 * line a reader will open.
 *
 * It is a scanner and not a parser. It knows `//`, the block form, the three
 * quote characters and a backslash escape, and nothing else — a regular
 * expression literal containing a quote would confuse it. There is none under
 * `src/server`, and the day one arrives the symptom is a count that moved,
 * which is the failure this file exists to make loud.
 */
function withoutCommentsOrStrings(source: string): string {
  const LINE = 1
  const BLOCK = 2
  let out = ''
  let mode: number | string = 0
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] as string
    const next = source[i + 1]
    const blank = char === '\n' ? '\n' : ' '
    if (mode === 0) {
      if (char === '/' && next === '/') {
        mode = LINE
        out += '  '
        i += 1
      } else if (char === '/' && next === '*') {
        mode = BLOCK
        out += '  '
        i += 1
      } else if (char === '"' || char === "'" || char === '`') {
        mode = char
        out += ' '
      } else out += char
    } else if (mode === LINE) {
      if (char === '\n') mode = 0
      out += blank
    } else if (mode === BLOCK) {
      if (char === '*' && next === '/') {
        mode = 0
        out += '  '
        i += 1
      } else out += blank
    } else if (char === '\\') {
      out += '  '
      i += 1
    } else if (char === mode) {
      mode = 0
      out += ' '
    } else out += blank
  }
  return out
}

async function code(relative: string): Promise<string> {
  return withoutCommentsOrStrings(
    await readFile(`${SERVER_ROOT}${relative}`, 'utf8'),
  )
}

describe('AC-399 no route parses a request body except through parseBody', () => {
  test('every req.body reader outside the helper is named, with its reason', async () => {
    const files = await sourceFiles()
    expect(
      files.length,
      'the walk found almost no source under src/server, which is a broken walk rather than a clean tree',
    ).toBeGreaterThan(50)

    /* The mention rather than the parse. Matching `safeParse(req.body)`
       catches the way this is lost by copying an older route, and misses the
       way it is lost by anyone who has read this file: assign `req.body` to a
       local and the spelling is gone. Enumerating the mention catches both
       and cannot be renamed around. */
    const reads = new Map<string, string[]>()
    for (const file of files) {
      const source = await code(file)
      for (const [index, line] of source.split('\n').entries()) {
        if (!line.includes('req.body')) continue
        reads.set(file, [...(reads.get(file) ?? []), `${file}:${String(index + 1)}`])
      }
    }

    const unnamed = [...reads]
      .filter(([file]) => !DIRECT_READERS.has(file))
      .flatMap(([, sites]) => sites)
    expect(
      unnamed,
      `these read req.body without going through parseBody and without a reason recorded above, so a key the caller sent and nobody declared is dropped there in silence (issue #104): ${unnamed.join(', ')}`,
    ).toEqual([])

    const drifted: string[] = []
    for (const [file, entry] of DIRECT_READERS) {
      const found = reads.get(file)?.length ?? 0
      if (found !== entry.reads) {
        drifted.push(
          `${file}: ${String(found)} reads of req.body against the ${String(entry.reads)} this allowlist was written for — read the new one and either route it through the helper or extend the reason (${entry.reason})`,
        )
      }
      expect(entry.reason.length, `${file} owes a reason`).toBeGreaterThan(40)
    }
    expect(drifted, drifted.join('; ')).toEqual([])
  })

  test('the helper is called from every module that reads a body, counted', async () => {
    const files = await sourceFiles()
    const sites: string[] = []
    const modules = new Set<string>()
    for (const file of files) {
      if (file === PARSER) continue
      const source = await code(file)
      /* A call and not a mention, over source whose comments and strings are
         already blanked: the identifier, an open parenthesis, and something
         that could be a schema.

         **Over the file and not over the line, since 2026-09-20 and issue
         #275**, and the sentence this replaces is worth keeping because it was
         an honest note about a limitation that then bit. It said the count
         could see "a call whose first argument sits on the same line, which
         all 28 do", and that the wrapping case was "the first thing to check
         if this number ever disagrees with a grep". It did. Issue #228 added
         `PATCH /folders/:id/members/:userId`, whose one-line `parseBody` call
         in `routes/folders.ts` is 82 columns against a formatter's 80, so it
         was wrapped, so the sweep could not see it, and the pinned count did
         not move when a call site was added. Nothing failed — the branch's
         author noticed only because they expected a number to move.

         **The formatter deciding what a guard can see is the part that makes
         this worth more than an off-by-one.** Whether a call was counted
         depended on whether its first argument happened to fit in 80 columns,
         so a renamed variable or a longer route path could move a site in or
         out of the census with nothing behind it. `\s` matches a newline, so
         matching the blanked file text rather than each of its lines costs one
         regex flag and removes the whole class.

         The two properties the line-by-line form had are kept. Comments and
         strings are still blanked, so `parseBody(` inside prose or a literal
         still does not count; and the line number is still reported, computed
         from the offset of the match, so a failure still points at a line a
         reader can open. One thing does change: this counts *calls*, where the
         old form counted lines carrying at least one. No line in the tree has
         two, so the numbers below are unaffected by that; a line that grew a
         second call would now be counted twice, which is the honest reading of
         "call sites".

         **What it still cannot see** is a call reached through an alias or a
         property — `const p = parseBody` and then `p(schema, …)`. That is
         deliberate and is the same boundary the `req.body` sweep above draws:
         the fault this counts exists to catch is a route written by copying an
         older one, and an alias is a deliberate act. */
      const call = /\bparseBody\(\s*[A-Za-z_$]/g
      for (const found of source.matchAll(call)) {
        const line = source.slice(0, found.index).split('\n').length
        sites.push(`${file}:${String(line)}`)
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
       reads a body outside the helper, and moving it is the thing the backend
       README's rule 2 forbids.

       **29 to 28 the same day, and it is the first fall.** Issue #113 retired
       `PATCH /api/v1/me/settings` on the owner's ruling and deleted
       `auth/settings.ts` with it, which was one call site and one module. A
       fall is read more carefully than a rise, for AC-236's reason: a route
       that stopped calling the helper and a route that was deleted look the
       same from here. What separates them is the sweep above — it passed —
       and the diff, where the module is gone rather than merely quiet. The
       module count falls with it, 11 to 10: `auth/settings.ts` was the whole
       of that module's body reading, so it leaves the list rather than
       shrinking inside it.

       **29 to 30 on 2026-09-20** for `POST /tasks/:id/dependencies` (issue
       #224), the one body-taking route of that slice; its two siblings take
       no body at all. The module count does not move: `routes/tasks.ts` was
       already reading bodies, so the new call site joins a module that is
       already on the list. The sweep above passed on the new route before
       this number was touched, which is the condition the paragraph above
       sets. */
    /* 30 to 34 on 2026-09-20, and 10 modules to 11, for issue #226's Label
       surface. Four of its thirteen routes take a body — the create and the
       patch in each of the two scopes — and all four go through the helper;
       the archive and restore pairs and the four assignment routes carry no
       body at all, and `GET /labels` reads the query string rather than a
       body, so none of those nine moves this number. `routes/labels.ts` is
       the eleventh module. Same instruction followed as every rise above:
       the sweep passed on the new file first.

       **#224 and #226 were open at once and each moved the site count off 29,
       to 30 and to 33. The resolution is the sum, 34, and neither side.** The
       one call site of #224 and the four of #226 are five distinct sites and
       all five are now in the tree; the number was re-derived by running this
       sweep on the merged tree rather than by arithmetic on the two diffs.
       The module count is not a sum: #224 added no module, so 11 stands as
       #226 left it. */
    /* **34 to 35 on 2026-09-20, and no route was added** (issue #275). Every
       rise above this one came from a body-taking route arriving. This one is
       the matcher above learning to see a call that had been in the tree since
       #228 landed: `parseBody` in `routes/folders.ts` for
       `PATCH /folders/:id/members/:userId`, wrapped across lines because the
       one-line form is 82 columns, and therefore invisible to a sweep that
       read one line at a time. So the number moved while the application did
       not, which is the one direction this comment has never had to explain
       before, and it is worth being plain about what that means: the census
       was short by one for as long as that call has existed, and `35` is the
       first reading of this tree that anything has taken.

       The module count does not move with it. `routes/folders.ts` was already
       reading bodies through the helper, so the newly visible site joins a
       module that was already counted, and 11 stands as #226 left it.

       The condition the paragraphs above set was met before either number was
       touched: the `req.body` sweep passed, so nothing is reading a body
       outside the helper and the count was the only thing that had anything
       to say. **And the widening was proved rather than assumed** — a second
       `parseBody` call was written in a wrapped form into a file this sweep
       reaches, the count read 36, and the file was put back.

       **A branch open at the same time also moves these two numbers.**
       Nothing here is the arithmetic of two diffs, on the rule two paragraphs
       up: whoever merges second re-runs this sweep on the merged tree and
       takes the number it reports, which is neither side's and is not
       necessarily their sum. */
    /* **35 to 37 on 2026-09-21** for issue #230's two body-taking
       Responsibility routes: the Responsibility commit and the self-edit
       grant toggle. Both go through the helper; the three Responsibility
       reads take no body at all and move nothing here. The module count does
       not move either: both live in `routes/folders.ts`, which is already on
       the list and is the same module #275's newly visible call sits in.
       **#230 read 32 on its own tree, which was #228's and held neither
       #224's one site nor #226's four, and 36 on the tree before this one,
       which held neither #275's widening; the resolution is the sum a third
       time, and 37 is what this sweep itself reported on the merged tree
       rather than what any diff implies.** Same instruction followed as every
       rise above: the sweep passed on the two new routes first. */
    /* **37 to 43, and 11 to 12, on 2026-09-21** (issue #210, M1-F). Six new
       call sites, all in one new module, `routes/facets.ts`: the facet
       create, the patch, the two order writes, the share confirmation and the
       facet document transaction. The other four facet routes -- the listing,
       the page read, the delete and the two Trash acts -- take no body at all
       and move nothing here. #210 read 37 and 11 on its own tree, which is
       `main` at 46dbabd, so 43 and 12 are this sweep's own answers on that
       tree. Same instruction followed as every rise above: the sweep passed
       on all six new routes first. */
    expect(
      sites.length,
      `parseBody is called from ${String(sites.length)} places and there were 43 after issue #224 added the task-dependency create, issue #226 added the four body-taking Label routes, issue #275 taught this sweep to read the file rather than the line, issue #230 added the Responsibility commit and the self-edit grant toggle and issue #210 added the six body-taking facet routes. Fewer means a route stopped using it, and the sweep above is what says whether it went back to req.body; more means a body-taking route was added, and this number moves with it in the same change`,
    ).toBe(43)
    expect(
      [...modules].sort().length,
      `${String(modules.size)} modules read a request body and there were 12 after issue #226 added routes/labels.ts and issue #210 added routes/facets.ts, unmoved by issue #275 because the call it made visible is in a module that was already counted: ${[...modules].sort().join(', ')}`,
    ).toBe(12)
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

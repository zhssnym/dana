/*
The Postgres leg's isolation, asserted rather than believed, plus spec 11.10's
three verification queries made executable.

**Why this file exists.** Issue #32 is a defect nothing in the suite could see:
282 files shared one `dana_test`, they wrote over each other, and the only
symptom was a count that climbed in whichever file happened to be running at the
time. The fix (tests/postgres-leg.ts) is infrastructure, and infrastructure that
nothing asserts is infrastructure that can be silently undone by a config edit
six months from now, at which point the suite goes back to being intermittently
wrong and nobody is told. So this file asserts the three things the fix has to be
true for: that a file is not on the shared database, that the database it is on
is empty when it starts, and that the database it is on sorts text the way spec
11.10 requires.

**And 11.10's checks were prose until now.** That section carries three SQL
queries under the heading "Verify rather than assume", and until this file they
were three queries a person could run by hand. A leg that creates its databases
at run time needs them run every time, because the statement that creates a
database and the statement that fixes its message language are two statements
and the second one can fail on its own (see SERVER_MESSAGE_PROSE_FILES).

**On the PGlite leg most of this is skipped, deliberately.** There is nothing to
check there: every createTestDb() is already an isolated database, which is the
property this file exists to give the other leg. The two things that are checked
on both are the empty start and the source scan, because both are statements
about the suite rather than about an engine.
*/
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { createTestDb, rows } from './helpers.js'
import { connect } from './postgres-leg-admin.js'
import {
  BASE_URL_ENV,
  SERVER_MESSAGE_PROSE_FILES,
  databaseNameOf,
  legBaseUrl,
  workerDatabasePattern,
} from './postgres-leg.js'

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

/*
The fragments a PostgreSQL server writes in prose rather than as an identifier.

Every one of these is language dependent, so a test asserting one only passes
where lc_messages is C. Constraint and index names are deliberately not here:
those appear verbatim in a translated message, which is exactly why the eight
other adversarial assertions in AC-001 survived the French cluster that caught
the ninth.
*/
const SERVER_PROSE = [
  'null value in column',
  'violates not-null constraint',
  'violates foreign key constraint',
  'violates check constraint',
  'duplicate key value violates',
  'invalid input syntax for',
  'could not serialize access',
]

function testFilesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'e2e') continue
      testFilesUnder(full, found)
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

describe('the Postgres leg gives each worker its own database (issue #32)', () => {
  test('a file starts on a database holding no rows it did not create', async () => {
    const counted = await rows(client.db, sql`SELECT count(*)::int AS n FROM users`)
    expect(counted[0]?.n, 'the database this file was handed already had users in it').toBe(0)
  })

  test('a file is not on the database TEST_DATABASE_URL names', async () => {
    if (client.kind !== 'postgres') return
    const baseUrl = process.env[BASE_URL_ENV]
    expect(baseUrl, 'the global setup published no base URL, so no isolation is in force').toBeDefined()
    const baseName = databaseNameOf(baseUrl ?? '')

    const here = await rows(client.db, sql`SELECT current_database() AS name`)
    const name = String(here[0]?.name)
    expect(name).not.toBe(baseName)
    expect(
      workerDatabasePattern(baseName).test(name),
      `${name} is not one of this run's per-worker databases`,
    ).toBe(true)
  })

  /*
  Spec 11.10's first two verification queries, run against the database this
  file was actually handed rather than against the one a person typed into psql
  once. The ordering is the whole point: section 6 asks two agents to produce
  byte-identical result sequences, nothing in the migrations or the query
  modules writes COLLATE, so every ordering over text takes the database
  default, and a worker database that inherited this cluster's French locale
  would answer this differently from PGlite while passing everything else.
  */
  test('11.10: the database is builtin C.UTF-8 over UTF8 and orders by code point', async () => {
    if (client.kind !== 'postgres') return

    const locale = await rows(
      client.db,
      sql`SELECT datlocprovider::text AS provider, datlocale AS locale,
                 pg_encoding_to_char(encoding) AS encoding
            FROM pg_database WHERE datname = current_database()`,
    )
    expect(locale[0]?.provider).toBe('b')
    expect(locale[0]?.locale).toBe('C.UTF-8')
    expect(locale[0]?.encoding).toBe('UTF8')

    const ordered = await rows(
      client.db,
      sql`SELECT string_agg(v, '|' ORDER BY v) AS probe FROM (VALUES
            ('Zebra'),('apple'),('Apple'),('a-b'),('ab'),('coté'),('côte'),('_x')) AS s(v)`,
    )
    expect(ordered[0]?.probe).toBe('Apple|Zebra|_x|a-b|ab|apple|coté|côte')
  })

  /*
  11.10's third query, run against the base database rather than this one.

  That is the honest place for it. lc_messages is a superuser-context GUC and
  the role this leg authenticates as cannot set it on a database it creates, so
  the created databases answer in the cluster's language and the base database
  is where the suite's one assertion on server prose is routed. Asserting C here
  therefore asserts the thing that actually has to hold: that the database
  AC-001 runs against still answers in English. If someone rebuilds dana_test
  and omits 11.10's second statement, this is what says so.
  */
  test('11.10: the database that answers AC-001 has lc_messages = C', async () => {
    const baseUrl = legBaseUrl()
    if (baseUrl === undefined) return
    const base = await connect(baseUrl)
    try {
      const shown = await base.query<{ lc_messages: string }>('SHOW lc_messages')
      expect(
        shown.rows[0]?.lc_messages,
        'the base database no longer answers in English, so AC-001 reads a translated ' +
          'message; spec 11.10 carries the ALTER DATABASE that fixes it',
      ).toBe('C')
    } finally {
      await base.end()
    }
  })

  /*
  The guard on the routing list.

  SERVER_MESSAGE_PROSE_FILES routes one file to the base database because it
  reads server prose. A second such file added anywhere else would pass on
  PGlite, pass on any cluster whose messages are English, and fail on this one
  with a message in French about a message in French. This is the cheap way to
  be told at the moment it is written instead.
  */
  test('only the declared files assert the text of a server message', () => {
    const offenders: string[] = []
    for (const file of [...testFilesUnder('tests'), ...testFilesUnder('src'), ...testFilesUnder('db')]) {
      const name = path.basename(file)
      if (name === 'postgres-leg-isolation.test.ts') continue
      if (SERVER_MESSAGE_PROSE_FILES.includes(name)) continue
      const source = readFileSync(file, 'utf8')
      for (const fragment of SERVER_PROSE) {
        if (source.includes(fragment)) offenders.push(`${file}: ${fragment}`)
      }
    }
    expect(
      offenders,
      'these files read the prose of a PostgreSQL server message, which is only English ' +
        'where lc_messages is C. Add them to SERVER_MESSAGE_PROSE_FILES in ' +
        'tests/postgres-leg.ts, or assert a constraint name instead, which every ' +
        'translation keeps verbatim',
    ).toEqual([])
  })
})

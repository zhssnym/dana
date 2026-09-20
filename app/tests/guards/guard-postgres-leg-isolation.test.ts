/*
The Postgres leg's isolation, asserted rather than believed, plus spec 11.10's
verification queries made executable.

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

**And 11.10's checks were prose until now.** That section carries its
verification queries under the heading "Verify rather than assume", and until
this file they were queries a person could run by hand. A leg that creates its
databases at run time needs them run every time, against the database it
created, because that is the database whose locale nobody chose by hand.

**One thing is guarded here that no query can check: that no test reads the
prose of a server message.** The created databases answer in the cluster's
language, which on this machine is French, because `lc_messages` is a
superuser-context GUC the leg's role cannot set (postgres-leg.ts). Until issue
#92 one file did read prose and had to be routed to the base database for it,
which made that file the one place a branch's forward-only migrations could
reach another branch's run. The source scan at the end is what keeps that from
coming back.

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

import type { DbClient } from '../../db/client.js'
import { createTestDb, rows } from '../support/helpers.js'
import { BASE_URL_ENV, databaseNameOf, workerDatabasePattern } from '../support/postgres-leg.js'

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
the ninth. Neither are SQLSTATEs or the schema, table, column and constraint
fields of an error, which is what the ninth asserts now (helpers.ts,
expectRejectedWith).
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
  Spec 11.10's two verification queries, run against the database this file
  was actually handed rather than against the one a person typed into psql
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
  The guard on server prose.

  A test that asserts the text of a server message passes on PGlite, passes on
  any cluster whose messages are English, and fails on this one with a message
  in French about a message in French; and the only ways to make it pass here
  are a superuser statement nobody may have to hand, or a routing back to the
  base database, which is the sharing issue #92 ended. This is the cheap way to
  be told at the moment it is written instead, and it names the alternative.
  */
  test('no test file asserts the text of a server message', () => {
    const offenders: string[] = []
    for (const file of [...testFilesUnder('tests'), ...testFilesUnder('src'), ...testFilesUnder('db')]) {
      if (path.basename(file) === 'guard-postgres-leg-isolation.test.ts') continue
      const source = readFileSync(file, 'utf8')
      for (const fragment of SERVER_PROSE) {
        if (source.includes(fragment)) offenders.push(`${file}: ${fragment}`)
      }
    }
    expect(
      offenders,
      'these files read the prose of a PostgreSQL server message, which is only English ' +
        'where lc_messages is C, and the Postgres leg cannot set that on the databases it ' +
        'creates. Assert the SQLSTATE and the table or column field of the error instead ' +
        '(expectRejectedWith in tests/helpers.ts), or a constraint name, which every ' +
        'translation keeps verbatim',
    ).toEqual([])
  })
})

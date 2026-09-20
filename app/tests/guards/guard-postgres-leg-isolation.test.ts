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
import {
  BASE_URL_ENV,
  createDatabaseSql,
  databaseNameOf,
  localeProviderFor,
  workerDatabasePattern,
} from '../support/postgres-leg.js'

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
  Spec 11.10's verification queries, run against the database this file was
  actually handed rather than against the one a person typed into psql once. A
  leg that creates its databases at run time needs them run every time, because
  that is the database whose locale nobody chose by hand.

  Split in two on 2026-09-20 so that the contract and the spelling of it are
  asserted separately: this one is what must be true on every server, and the
  one below is which provider said so.
  */
  test('11.10: the database orders by code point over UTF8', async () => {
    if (client.kind !== 'postgres') return

    /*
    The ordering is the contract and it is asserted unconditionally. Section 6
    asks two agents to produce byte-identical result sequences, nothing in the
    migrations or the query modules writes COLLATE, so every ordering over text
    takes the database default; a worker database that inherited a cluster's
    French locale answers this differently from PGlite while passing everything
    else. This probe is what would catch that, whatever provider named the
    locale.
    */
    const ordered = await rows(
      client.db,
      sql`SELECT string_agg(v, '|' ORDER BY v) AS probe FROM (VALUES
            ('Zebra'),('apple'),('Apple'),('a-b'),('ab'),('coté'),('côte'),('_x')) AS s(v)`,
    )
    expect(ordered[0]?.probe).toBe('Apple|Zebra|_x|a-b|ab|apple|coté|côte')

    const encoded = await rows(
      client.db,
      sql`SELECT pg_encoding_to_char(encoding) AS encoding
            FROM pg_database WHERE datname = current_database()`,
    )
    expect(encoded[0]?.encoding).toBe('UTF8')
  })

  /*
  The other half of 11.10's sentence, and it is asserted on **both** legs.

  11.10 says the statement fixes how the database "sorts and folds" text.
  Everything above this is the sorting half. This is the folding half, and it
  is a different setting: sorting is LC_COLLATE and folding is LC_CTYPE, the
  one `lower()`, `upper()` and ILIKE read. Nothing asserted it until
  2026-09-20 and issue #235, when a first draft of the version fallback
  created its databases with ctype `C` — the same ordering, ASCII-only folding
  — and every test in this file passed on it.

  What that would have cost is section 7 rather than anything here. Q2's
  folder order is `ORDER BY lower(name)` and Q8's search is ILIKE, so on a
  French name the two legs answer different result sequences while both read
  green. That is the class CLAUDE.md records for `current_date`: a
  cross-engine disagreement no leg is positioned to see.

  `ÉCOLE` is the probe because it is the cheapest character that separates
  the two: ASCII-only folding leaves the accented capital alone and answers
  `École`. The ordering below is the same four names under `lower()`, which is
  where a reader would actually meet the difference.
  */
  test('11.10: the database folds text by the whole Unicode case database', async () => {
    const folded = await rows(
      client.db,
      sql`SELECT lower('ÉCOLE') AS lowered, upper('école') AS uppered,
                 ('CAFÉ' ILIKE 'café') AS matched`,
    )
    expect(folded[0]?.lowered, 'lower() folds an accented capital').toBe('école')
    expect(folded[0]?.uppered, 'and upper() the other way').toBe('ÉCOLE')
    expect(folded[0]?.matched, 'Q8 searches with ILIKE, which reads the same setting').toBe(true)

    const ordered = await rows(
      client.db,
      sql`SELECT string_agg(v, '|' ORDER BY lower(v)) AS probe FROM (VALUES
            ('échelle'),('École'),('Épée'),('équipe')) AS s(v)`,
    )
    expect(
      ordered[0]?.probe,
      "Q2's folder order is ORDER BY lower(name), so the fold decides the sequence " +
        'section 7 hands two agents, which 11.10 asks to be byte-identical',
    ).toBe('échelle|École|Épée|équipe')
  })

  /*
  The provider that ordering came from, asserted as the strongest one this
  server can express.

  11.10 is normative for the gate machine and writes `LOCALE_PROVIDER builtin
  BUILTIN_LOCALE 'C.UTF-8'`, which arrived in Postgres 17; the gate runs 18 and
  this asserts exactly what it asserted before. Below 17 there is no builtin
  provider and no `pg_database.datlocale` column to read one out of — a 16
  server answers the query with `column "datlocale" does not exist` — so the
  leg creates the database with libc `LC_COLLATE 'C'`, which is the same
  code-point ordering the test above proves, from the C library rather than
  from Postgres itself. Both branches are asserted so that neither server
  silently gives something else: what is not allowed on any version is a
  collation that is not C.
  */
  test('11.10: the locale provider is the strongest this server offers', async () => {
    if (client.kind !== 'postgres') return

    const shown = await rows(client.db, sql`SHOW server_version_num`)
    const version = Number(shown[0]?.server_version_num)
    expect(Number.isFinite(version), 'the server did not answer server_version_num').toBe(true)

    if (version >= 170000) {
      const locale = await rows(
        client.db,
        sql`SELECT datlocprovider::text AS provider, datlocale AS locale
              FROM pg_database WHERE datname = current_database()`,
      )
      expect(locale[0]?.provider, '11.10 wants the builtin provider on 17 and above').toBe('b')
      expect(locale[0]?.locale).toBe('C.UTF-8')
      return
    }

    const locale = await rows(
      client.db,
      sql`SELECT datlocprovider::text AS provider, datcollate AS collate, datctype AS ctype
            FROM pg_database WHERE datname = current_database()`,
    )
    expect(locale[0]?.provider, 'below 17 the only provider that gives C ordering is libc').toBe('c')
    expect(locale[0]?.collate, 'byte ordering').toBe('C')
    /* Not 'C', which orders identically and folds ASCII only; the test above
       is what that would have broken, and did not until #235 wrote it. This
       is also what PGlite's own database carries, so the two legs agree. */
    expect(locale[0]?.ctype, 'whole-Unicode folding').toBe('C.UTF-8')
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

/*
The version floor itself, which is otherwise pinned by nothing but whichever
server happens to be running. Both tests are pure and run on either leg.
*/
describe('the leg picks its CREATE DATABASE clause by server version (issue #235)', () => {
  test('17 is the floor, and it is a floor rather than a range', () => {
    expect(localeProviderFor(160013), '16 has no builtin provider').toBe('libc')
    expect(localeProviderFor(169999), 'and nothing below 17 does').toBe('libc')
    expect(localeProviderFor(170000), '17.0 is where LOCALE_PROVIDER builtin arrives').toBe(
      'builtin',
    )
    expect(localeProviderFor(180003), 'and the gate machine is above it').toBe('builtin')
  })

  test('both clauses fix byte ordering, and both fold the whole of Unicode', () => {
    const builtin = createDatabaseSql('dana_test_r1_w1', 'builtin')
    const libc = createDatabaseSql('dana_test_r1_w1', 'libc')

    // 11.10's statement, character for character, is what a gate run sends.
    expect(builtin).toBe(
      `CREATE DATABASE "dana_test_r1_w1" TEMPLATE template0 ENCODING 'UTF8' ` +
        `LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    )

    /* The fallback's ctype is the half a first draft got wrong: C orders the
       same and folds ASCII only, so every other test in this file passed on
       it while section 7's ORDER BY lower(name) came out in a different
       sequence. C.UTF-8 is what PGlite carries and what 18's builtin gives. */
    expect(libc).toContain(`LC_COLLATE 'C' LC_CTYPE 'C.UTF-8'`)
    expect(libc, 'the clause the older server cannot parse is absent').not.toContain(
      'LOCALE_PROVIDER',
    )
    for (const statement of [builtin, libc]) {
      expect(statement, 'never inherit the cluster default').toContain('TEMPLATE template0')
      expect(statement).toContain(`ENCODING 'UTF8'`)
    }
  })
})

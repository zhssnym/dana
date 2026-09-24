/*
The Postgres leg's administrative half: creating, migrating, emptying, sweeping
and dropping the per-worker databases of spec 11.10.

Split from `postgres-leg.ts` for one measured reason, recorded there: this
module imports `pg` and, lazily, the database seam, and the seam pulls in
PGlite's WebAssembly build. Loading it from the setup file that runs before all
282 test files cost 106 seconds of setup across nine files that open no database
at all. Only two callers reach this module, and both pay for those imports
anyway: the global setup, which runs once in Vitest's own process, and
`helpers.ts`, which no file imports unless it wants a database.
*/
import { randomInt } from 'node:crypto'

import pg from 'pg'

import type { LocaleProvider } from './postgres-leg.js'
import {
  BASE_URL_ENV,
  RUN_LOCK_CLASS,
  createDatabaseSql,
  localeProviderFor,
  quoteIdent,
  withDatabase,
  workerDatabasePattern,
} from './postgres-leg.js'

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/*
Which CREATE DATABASE locale clause this server can parse, asked once.

Cached per process rather than per call. In practice that is one call: the only
caller is ensureDatabase, which prepareLegDatabaseOnce guards, so the cache
never sees a second hit and is here so that it would stay correct if it did.
One server per run, and the answer is a property of the server rather than of
the connection, so a differently-targeted admin client would give the same one.
*/
let localeProvider: LocaleProvider | undefined

async function providerFor(admin: pg.Client): Promise<LocaleProvider> {
  if (localeProvider !== undefined) return localeProvider
  const answer = await admin.query<{ server_version_num: string }>(
    'SHOW server_version_num',
  )
  const raw = answer.rows[0]?.server_version_num
  /*
  Tested for digits rather than handed to Number, which answers 0 for an empty
  string and for whitespace. A 0 is finite, so the lenient test would take a
  server that answered nothing as one below 17 and create its databases with
  the fallback clause, which on a 17+ server is the weaker of the two and would
  never be noticed. Refusing is the honest answer: the leg cannot run against a
  server it cannot identify.
  */
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) {
    throw new Error(
      `the server answered SHOW server_version_num with ${JSON.stringify(raw)}, which is not ` +
        'a version number, so the Postgres leg cannot tell which CREATE DATABASE locale ' +
        'clause it understands.',
    )
  }
  localeProvider = localeProviderFor(Number(raw))
  return localeProvider
}

/** Opens a client against one database. The caller always ends it. */
export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url })
  /*
  The same hazard the pool in db/client.ts carries, and issue #174 measured it
  there: a connected pg.Client emits 'error' on itself the moment its socket
  dies (`_handleErrorEvent`, pg/lib/client.js) whether or not a query is in
  flight, and an EventEmitter 'error' with no listener throws. These are the
  connections held longest in the leg — the registry connection lives for the
  whole run in Vitest's own process, and the target one is held across a
  TRUNCATE of every table — so an unlistened one turns a reset that cost one
  query into a lost run.

  Nothing is swallowed. A query in flight still rejects with this error and its
  caller still fails on it; this only stops the second copy, the one the client
  emits at the same time, from arriving as an uncaught exception.
  */
  client.on('error', (error: Error) => {
    process.stderr.write(`[postgres leg] connection error: ${error.message}\n`)
  })
  await client.connect()
  return client
}

/**
 * Creates the database if it is not there and brings it to the current
 * migration. Safe to call twice: a duplicate CREATE is the answer we wanted,
 * and the migrator is idempotent by its own journal.
 *
 * Answers whether it created the database, which is how a caller knows the
 * thing is already empty and needs no TRUNCATE.
 */
export async function ensureDatabase(
  admin: pg.Client,
  baseUrl: string,
  name: string,
): Promise<boolean> {
  try {
    await admin.query(createDatabaseSql(name, await providerFor(admin)))
  } catch (error) {
    // 42P04 is duplicate_database, which is the answer this wanted. Nothing
    // migrates on this path and nothing needs to: the caller is createTestDb(),
    // which runs the migrator itself immediately afterwards under its advisory
    // lock, so a database left half-built by a run that died between the CREATE
    // and the migration is finished rather than trusted.
    if (errorCode(error) !== '42P04') throw error
    return false
  }
  // Nothing sets lc_messages on the new database. The role cannot, it being a
  // superuser-context GUC, and since issue #92 nothing in the suite reads a
  // server message, so the database answers in the cluster's language and no
  // test can tell (spec 11.10).

  // Imported here rather than at the top so that the module graph of this file
  // stays out of anything that only wants to read or empty a database.
  const { createDbClient } = await import('../../db/client.js')
  const client = await createDbClient({ url: withDatabase(baseUrl, name) })
  try {
    await client.runMigrations()
  } finally {
    await client.close()
  }
  return true
}

/**
 * Empties every table in `public`, so a file never starts on top of the rows of
 * the file that shared its slot before it.
 *
 * The list is read from the catalog rather than written down, so a migration
 * that adds a table needs no edit here. `drizzle.__drizzle_migrations` is in its
 * own schema and is deliberately out of range: truncating it would make the next
 * migrator run re-apply every migration against tables that already exist.
 */
export async function truncateAll(client: pg.Client): Promise<void> {
  await client.query(`SET lock_timeout = '30s'`)
  const listed = await client.query<{ list: string | null }>(
    `SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename) AS list
       FROM pg_tables WHERE schemaname = 'public'`,
  )
  const list = listed.rows[0]?.list
  if (list === undefined || list === null) return
  await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

/**
 * Brings the database this file is about to use into a usable, empty state.
 *
 * Called once per test file, from `createTestDb()`, which is the only door to a
 * database in the suite. A file that reached one by some other route would find
 * a database that does not exist and fail loudly with 3D000, which is the
 * failure this whole scheme is worth having: the alternative to loud is a file
 * quietly sharing the base database again.
 */
export async function prepareLegDatabase(baseUrl: string, targetUrl: string): Promise<void> {
  const name = decodeURIComponent(new URL(targetUrl).pathname.replace(/^\//, ''))
  /*
  Whether the database exists is asked of the base database, never learned by
  connecting to the target and catching 3D000. The server refuses such a
  connection with a FATAL and exits, and on Windows that exit can reset the
  socket before the client reads the FATAL: the file then fails whole on
  `read ECONNRESET` with every test skipped, which is how the CI runner lost
  one file per run.
  */
  const admin = await connect(baseUrl)
  let created = false
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (found.rows.length === 0) created = await ensureDatabase(admin, baseUrl, name)
  } finally {
    await admin.end()
  }
  if (created) return
  const client = await connect(targetUrl)
  try {
    await truncateAll(client)
  } finally {
    await client.end()
  }
}

/*
Which database this process has already prepared.

Vitest's default `isolate: true` gives every test file its own process, so this
module is loaded fresh per file and the guard is per file by construction; the
URL is remembered rather than a boolean so that a run which somehow retargeted
mid-file would prepare the new database instead of skipping it. Under
`isolate: false` files would share the flag and only the first would be emptied,
which is why that setting would need this revisited rather than merely noticed.
*/
let preparedFor: string | undefined

/**
 * Prepares whatever database TEST_DATABASE_URL now names, once per test file,
 * and does nothing on the PGlite leg.
 */
export async function prepareLegDatabaseOnce(): Promise<void> {
  const baseUrl = process.env[BASE_URL_ENV]
  const targetUrl = process.env.TEST_DATABASE_URL
  if (baseUrl === undefined || baseUrl === '') return
  if (targetUrl === undefined || targetUrl === '') return
  if (preparedFor === targetUrl) return
  await prepareLegDatabase(baseUrl, targetUrl)
  preparedFor = targetUrl
}

/** Every database on the cluster this leg owns, with the run that owns it. */
export async function ownedDatabases(
  admin: pg.Client,
  base: string,
): Promise<{ name: string; runId: number }[]> {
  const pattern = workerDatabasePattern(base)
  const listed = await admin.query<{ datname: string }>(
    `SELECT datname FROM pg_database WHERE datname LIKE $1 ESCAPE '\\'`,
    [base.replace(/([%_\\])/g, '\\$1') + '\\_r%\\_w%'],
  )
  const owned: { name: string; runId: number }[] = []
  for (const row of listed.rows) {
    const captured = pattern.exec(row.datname)?.[1]
    if (captured === undefined) continue
    owned.push({ name: row.datname, runId: Number(captured) })
  }
  return owned
}

/**
 * Takes an unused run id and holds it for the life of `registry`.
 *
 * Random rather than sequential because two runs starting together must not
 * have to negotiate, and the lock is what makes the choice safe: a collision
 * with a live run fails the try and is retried rather than silently shared.
 */
export async function claimRunId(registry: pg.Client): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = randomInt(1, 2_147_483_647)
    const taken = await registry.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [RUN_LOCK_CLASS, candidate],
    )
    if (taken.rows[0]?.locked === true) return candidate
  }
  throw new Error('could not claim a run id for the Postgres leg after 50 attempts')
}

/** Releases this run's claim. Called once, from the global teardown. */
export async function releaseRunId(registry: pg.Client, runId: number): Promise<void> {
  await registry.query('SELECT pg_advisory_unlock($1, $2)', [RUN_LOCK_CLASS, runId])
}

/**
 * Drops the databases of runs that are no longer running, and nothing else.
 *
 * The test is the run lock: a run that is alive holds it, so an id this can
 * lock belongs to a process that has exited. That is what makes two overlapping
 * runs safe, and it is why this cannot be written as "drop everything older
 * than an hour": a database carries no creation timestamp, and any guess would
 * eventually delete a live run's database out from under it.
 */
export async function sweepDeadRuns(
  admin: pg.Client,
  base: string,
  currentRunId: number,
): Promise<string[]> {
  const byRun = new Map<number, string[]>()
  for (const entry of await ownedDatabases(admin, base)) {
    if (entry.runId === currentRunId) continue
    byRun.set(entry.runId, [...(byRun.get(entry.runId) ?? []), entry.name])
  }
  const dropped: string[] = []
  for (const [runId, names] of byRun) {
    const taken = await admin.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [RUN_LOCK_CLASS, runId],
    )
    if (taken.rows[0]?.locked !== true) continue
    try {
      for (const name of names) {
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`)
        dropped.push(name)
      }
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1, $2)', [RUN_LOCK_CLASS, runId])
    }
  }
  return dropped
}

/**
 * Drops what this run created, and answers how many. Called once, from the
 * global teardown.
 *
 * Concurrently, on a connection each, because DROP DATABASE is fsync bound and
 * the first one on a busy cluster pays for a checkpoint the rest then ride:
 * measured 2026-09-03 under heavy load at 22.8 seconds for the first and 0.8
 * and 0.5 for the two behind it. Serially that cost is the whole run's, at the
 * end, where nothing else is happening. A failure to drop is reported and not
 * raised: the databases of a run that has ended are exactly what the next run's
 * sweep is for, so a teardown that cannot finish must not turn a green run red.
 */
export async function dropRunDatabases(
  admin: pg.Client,
  baseUrl: string,
  base: string,
  runId: number,
): Promise<{ dropped: number; failed: number }> {
  const mine = (await ownedDatabases(admin, base)).filter((entry) => entry.runId === runId)
  const results = await Promise.all(
    mine.map(async (entry) => {
      // DROP DATABASE cannot run from a connection to the database it drops, so
      // every one of these is a connection to the base database, as `admin` is.
      const client = await connect(withDatabase(baseUrl, base))
      try {
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(entry.name)} WITH (FORCE)`)
        return true
      } catch {
        return false
      } finally {
        await client.end()
      }
    }),
  )
  return {
    dropped: results.filter(Boolean).length,
    failed: results.length - results.filter(Boolean).length,
  }
}

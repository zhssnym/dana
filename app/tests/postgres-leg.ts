/*
One database per Vitest worker for the Postgres leg (spec 11.10): the names,
and nothing else.

**What this exists to stop.** PGlite hands every `createTestDb()` its own
in-process database, so two test files cannot see each other. The Postgres leg
pointed all 282 files at one `dana_test`, and they could: the fingerprint is a
count that climbs across successive tests, `expected 2 to be 1`, then 3, then
4, where a logic error would give one constant wrong number. Issue #32 recorded
it on the first CI runs this repository ever had, against `ac-153` and
`ac-251`, both of which pass alone in 2.4 seconds. A check that goes red for
reasons unrelated to the change teaches everyone to ignore it, which is the
actual cost.

**The unit of isolation is Vitest's pool slot, not the file.** `VITEST_POOL_ID`
is an integer between 1 and maxWorkers that the pool allocates from a free set
and returns when a file finishes, so the files running concurrently at any
instant hold distinct ids. That is exactly the property the shared database
lacked. Files that share a slot run one after another rather than at the same
time, and the database is emptied before each of them, so a file never starts
on top of another file's rows either.

**Why this module imports nothing.** It is loaded by the setup file that runs
before every one of the 282 files, including the two hundred that never open a
database. Its first draft imported `pg` and `db/client.js`, which pulls PGlite's
WebAssembly build into every worker process: measured 2026-09-03 at 106 seconds
of setup across nine `src/shared` files that touch no database at all, against
under a tenth of a second before. Everything with a runtime dependency lives in
`postgres-leg-admin.ts`, which only the global setup and `helpers.ts` load, and
both of those pay for those modules anyway.
*/

/** The run's id, published by the global setup so workers can name their database. */
export const RUN_ID_ENV = 'DANA_PG_LEG_RUN'
/** The unmodified connection string, kept because workers overwrite TEST_DATABASE_URL. */
export const BASE_URL_ENV = 'DANA_PG_LEG_BASE'
/** '1' when a database this leg creates reports lc_messages = C, '0' otherwise. */
export const ENGLISH_ENV = 'DANA_PG_LEG_ENGLISH'

/*
The advisory lock class that says "this run is alive".

A run takes pg_advisory_lock(RUN_LOCK_CLASS, runId) on a connection it holds
open for its whole length, so the lock dies with the process however the process
dies. That is the whole of the self-healing story: the next run sweeps any
<base>_r<id>_w<n> database whose id it can lock, because a lock it can take
belongs to nobody, and leaves alone every id it cannot, because that run is
still using it. A killed run therefore costs the next one a DROP and costs a
concurrent run nothing at all.

Advisory locks are scoped to a database, the lock tag carrying the database oid,
so every holder must be connected to the base database, and they are. The single
argument form helpers.ts uses for its migration lock is a different lock space
from this two argument form, so the numbers could not collide even if they were
equal.
*/
export const RUN_LOCK_CLASS = 727002

/**
 * Test files that assert the text of a PostgreSQL server message rather than
 * an identifier, and therefore need `lc_messages = C`.
 *
 * **This list exists because of a privilege, not a preference.** `lc_messages`
 * is a superuser-context GUC: the role the leg authenticates as owns the
 * database it creates and still cannot set that parameter, at session level,
 * through the startup packet, or with ALTER DATABASE, and CREATE DATABASE with
 * a TEMPLATE does not copy it, because pg_db_role_setting is a shared catalog
 * keyed by the database's own oid. All four were measured on 2026-09-03 rather
 * than assumed. So a database this leg creates answers in the cluster's
 * language, which on this machine is French, and the one assertion in the
 * repository that reads server prose, AC-001's adversarial NOT NULL case
 * asserting `null value in column "folder_id"`, would fail on it.
 *
 * The file named here therefore runs against the base database, which a
 * superuser did set `lc_messages = C` on when it was created. That costs
 * nothing in isolation: no other file is on the base database, so AC-001 has it
 * to itself, which is more isolation than it had before rather than less.
 *
 * **One statement removes this list.** Either of these, run once by a
 * superuser, makes every database this leg creates answer in English, at which
 * point ENGLISH_ENV is '1' and the routing never fires:
 *
 *     ALTER ROLE dana_ci SET lc_messages = 'C';
 *     GRANT SET ON PARAMETER lc_messages TO dana_ci;
 *
 * `tests/postgres-leg-isolation.test.ts` fails if a file outside this list
 * grows an assertion on server prose, so the list cannot rot quietly.
 */
export const SERVER_MESSAGE_PROSE_FILES: readonly string[] = [
  'ac-001-constraint-catalog.test.ts',
]

/** The connection string for the leg, or undefined when this is the PGlite leg. */
export function legBaseUrl(): string | undefined {
  const raw = process.env[BASE_URL_ENV] ?? process.env.TEST_DATABASE_URL
  return raw === undefined || raw === '' ? undefined : raw
}

function parse(url: string): URL {
  try {
    return new URL(url)
  } catch {
    throw new Error(
      'TEST_DATABASE_URL is not a URL. The Postgres leg derives one database ' +
        'per worker from it, which needs a postgres:// or postgresql:// form ' +
        'rather than a keyword/value connection string.',
    )
  }
}

/** The database a connection string names. */
export function databaseNameOf(url: string): string {
  const name = decodeURIComponent(parse(url).pathname.replace(/^\//, ''))
  if (name === '') {
    throw new Error(
      'TEST_DATABASE_URL names no database, so no worker database can be derived from it.',
    )
  }
  return name
}

/** The same connection string against a different database. */
export function withDatabase(url: string, database: string): string {
  const next = parse(url)
  next.pathname = '/' + encodeURIComponent(database)
  return next.toString()
}

/** `<base>_r<run>_w<slot>`, the database one pool slot of one run owns. */
export function workerDatabaseName(base: string, runId: number, poolId: number): string {
  const name = `${base}_r${runId}_w${poolId}`
  if (name.length > 63) {
    throw new Error(
      `the derived database name ${name} exceeds Postgres's 63 byte identifier limit; ` +
        'the database TEST_DATABASE_URL names is too long for the leg to derive from.',
    )
  }
  return name
}

/** Matches every database this leg owns for the given base name. */
export function workerDatabasePattern(base: string): RegExp {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}_r(\\d+)_w(\\d+)$`)
}

/** Postgres identifier quoting: the only escape inside a quoted name is a doubled quote. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/*
Spec 11.10's normative CREATE DATABASE, with one deliberate difference.

11.10 writes OWNER dana_ci. This omits the OWNER clause, which makes the
creating role the owner, because the role name lives in a connection string this
file must never read a credential out of and would be wrong the moment the leg
ran as anything else. On this machine the creating role is dana_ci, so the two
statements agree; anywhere else the clause would have been a lie.
*/
export function createDatabaseSql(name: string): string {
  return (
    `CREATE DATABASE ${quoteIdent(name)} TEMPLATE template0 ENCODING 'UTF8' ` +
    `LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C' LC_CTYPE 'C'`
  )
}

/**
 * The database one test file runs against, or undefined on the PGlite leg.
 *
 * Everything gets its pool slot's own database. The exception is a file that
 * asserts the text of a server message: those need `lc_messages = C`, which
 * only a superuser can give a created database, so when the run has measured
 * that its own databases answer in the cluster's language those files go to the
 * base database instead. SERVER_MESSAGE_PROSE_FILES carries the whole argument
 * and the one statement that retires it.
 */
export function targetDatabaseUrl(testFileName: string): string | undefined {
  const runId = process.env[RUN_ID_ENV]
  const baseUrl = process.env[BASE_URL_ENV]
  if (runId === undefined || baseUrl === undefined || baseUrl === '') return undefined

  const baseName = databaseNameOf(baseUrl)
  if (SERVER_MESSAGE_PROSE_FILES.includes(testFileName) && process.env[ENGLISH_ENV] === '0') {
    return withDatabase(baseUrl, baseName)
  }
  const poolId = Number(process.env.VITEST_POOL_ID ?? '1')
  return withDatabase(
    baseUrl,
    workerDatabaseName(baseName, Number(runId), Number.isFinite(poolId) ? poolId : 1),
  )
}

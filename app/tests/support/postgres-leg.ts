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

export type LocaleProvider = 'builtin' | 'libc'

/**
 * Which spelling of the locale clause a server understands.
 *
 * `LOCALE_PROVIDER builtin` arrived in Postgres 17 and the gate machine runs
 * 18, so that is the normative form and what a gate run uses. A 16 server
 * answers the same statement with `option "builtin_locale" not recognized`
 * (SQLSTATE 42601), which reads as a broken suite and is a server too old for
 * the clause rather than anything wrong with the leg.
 *
 * Read from `server_version_num`, which is an integer like `160013`.
 */
export function localeProviderFor(serverVersionNum: number): LocaleProvider {
  return serverVersionNum >= 170000 ? 'builtin' : 'libc'
}

/*
Spec 11.10's normative CREATE DATABASE, with two deliberate differences.

11.10 writes OWNER dana_ci. This omits the OWNER clause, which makes the
creating role the owner, because the role name lives in a connection string this
file must never read a credential out of and would be wrong the moment the leg
ran as anything else. On this machine the creating role is dana_ci, so the two
statements agree; anywhere else the clause would have been a lie.

And the locale clause is chosen by server version, because 11.10's spelling
needs Postgres 17. **The two spellings have to agree on two things and not
one**, which the first draft of this got wrong and a review caught by running
it. 11.10's own sentence is that the statement fixes how the database "sorts
and folds" text, and those are two different settings:

- **sorting** is LC_COLLATE, and `C` is byte order under either provider;
- **folding** is LC_CTYPE, and it is what `lower()`, `upper()` and `ILIKE`
  read. `C` folds ASCII only. `C.UTF-8` folds the whole Unicode case database.

Measured 2026-09-20 on a 16.13 server, the same database twice but for ctype:

    LC_CTYPE 'C'        lower('ÉCOLE') = 'École'   'CAFÉ' ILIKE 'café' → false
    LC_CTYPE 'C.UTF-8'  lower('ÉCOLE') = 'école'   'CAFÉ' ILIKE 'café' → true

Both order identically, so the ordering probe in the guard cannot tell them
apart. What can tell them apart is section 7: Q2's folder order is
`ORDER BY lower(name)` and Q8's search is ILIKE, so on a French name the two
answer different result sequences — the exact "byte-identical result
sequences" property 11.10's preamble exists to hold. PGlite, the other leg,
reports datcollate `C` and datctype `C.UTF-8` and folds the Unicode way, as
does 18's builtin `C.UTF-8`. So the fallback takes `LC_CTYPE 'C.UTF-8'` and
agrees with both, and the one combination that agrees with neither — collate
C with ctype C — is what this comment exists to stop coming back.

What the builtin provider still buys on 17+ is that neither setting depends on
the host's libc at all. That is why it stays the normative form and why the
fallback is confined to servers which cannot express it.
*/
export function createDatabaseSql(name: string, provider: LocaleProvider): string {
  const locale =
    provider === 'builtin'
      ? `LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C' LC_CTYPE 'C'`
      : `LC_COLLATE 'C' LC_CTYPE 'C.UTF-8'`
  return (
    `CREATE DATABASE ${quoteIdent(name)} TEMPLATE template0 ENCODING 'UTF8' ` +
    locale
  )
}

/**
 * The database one test file runs against, or undefined on the PGlite leg.
 *
 * Every file gets its pool slot's own database, and nothing is routed anywhere
 * else. So no test may assert the prose of a server message: prose needs
 * `lc_messages = C`, a superuser-context GUC the role this leg runs as cannot
 * set on a database it creates (at session level, through the startup packet,
 * with ALTER DATABASE, or by inheriting it from a TEMPLATE, all four
 * measured). Assert the SQLSTATE and the fields of the server's error instead,
 * which no locale translates (helpers.ts, serverErrorFields).
 */
export function targetDatabaseUrl(): string | undefined {
  const runId = process.env[RUN_ID_ENV]
  const baseUrl = process.env[BASE_URL_ENV]
  if (runId === undefined || baseUrl === undefined || baseUrl === '') return undefined
  const poolId = Number(process.env.VITEST_POOL_ID ?? '1')
  return withDatabase(
    baseUrl,
    workerDatabaseName(
      databaseNameOf(baseUrl),
      Number(runId),
      Number.isFinite(poolId) ? poolId : 1,
    ),
  )
}

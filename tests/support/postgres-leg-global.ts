/*
Vitest globalSetup for the Postgres leg: claims the run, sweeps what dead runs
left behind, and publishes what the workers need to name their own database.

**Why this is a global setup and not just a setup file.** Two things happen
once per run rather than once per file, claiming a run id and sweeping, and one
failure is better met once than in every worker, a role that cannot CREATE
DATABASE. This module
runs in Vitest's own process, before any worker starts, and its mutations to
`process.env` reach the forks because the pool builds each worker's environment
from `process.env` at the moment it spawns them, after global setup has
returned. Verified against the installed Vitest 4.1.10 on 2026-09-03 rather than
recalled, along with the fact that `config.maxWorkers` is undefined here, which
is why the worker databases are created on demand by the workers rather than
allocated up front from a count this cannot see.

**On the PGlite leg this file does nothing at all.** It returns before opening a
connection, so `env -u TEST_DATABASE_URL npm test` is the run it always was.

Spec: 11.10 (the two legs, the locale statement, and what the second leg is an
authority for) and 11.11 (the CI step, which refuses to start rather than fall
back to PGlite).
*/
import type pg from 'pg'

import {
  claimRunId,
  connect,
  dropRunDatabases,
  ensureDatabase,
  releaseRunId,
  sweepDeadRuns,
} from './postgres-leg-admin.js'
import {
  BASE_URL_ENV,
  RUN_ID_ENV,
  databaseNameOf,
  legBaseUrl,
  workerDatabaseName,
} from './postgres-leg.js'

/*
The registry connection, held open for the whole run.

It is the liveness token: the advisory lock it holds is what tells the next
run's sweep that this run is still here, and the server releases it the moment
this process dies, however it dies. A module-level handle is safe because setup
and teardown are the same module instance in the same process.
*/
let registry: pg.Client | undefined
let runId = 0
let baseName = ''
let baseConnection = ''

export async function setup(): Promise<void> {
  const baseUrl = legBaseUrl()
  if (baseUrl === undefined) return

  baseConnection = baseUrl
  baseName = databaseNameOf(baseUrl)
  registry = await connect(baseUrl)
  runId = await claimRunId(registry)

  const dropped = await sweepDeadRuns(registry, baseName, runId)

  /*
  Slot 1 is created here rather than on demand for one reason: a role without
  CREATEDB should fail the run once, in this process, with the message below,
  rather than in every worker at once with the driver's own; and slot 1 is a
  database the run is going to create anyway. Every other slot is created by
  the worker that first needs it.
  */
  const first = workerDatabaseName(baseName, runId, 1)
  try {
    await ensureDatabase(registry, baseUrl, first)
  } catch (error) {
    if ((error as { code?: unknown }).code === '42501') {
      throw new Error(
        'the Postgres leg cannot create its per-worker databases: the role ' +
          'TEST_DATABASE_URL authenticates as has no CREATEDB privilege. One ' +
          'statement from a superuser fixes it, ALTER ROLE <that role> CREATEDB, ' +
          'and spec 11.10 records why the leg needs it.',
        { cause: error },
      )
    }
    throw error
  }

  process.env[RUN_ID_ENV] = String(runId)
  process.env[BASE_URL_ENV] = baseUrl

  /*
  One line, and it names no connection string. A person reading a CI log needs
  to be able to tell this leg apart from the PGlite one, and to see that no
  file is on the base database, which is the fact that changes how a red in a
  constraint catalog assertion is read: a schema another branch left there can
  reach nobody.
  */
  process.stdout.write(
    `[postgres leg] one database per worker: ${baseName}_r${runId}_w<slot>` +
      `; no file runs on ${baseName}` +
      (dropped.length > 0 ? `; swept ${dropped.length} database(s) from dead runs` : '') +
      '\n',
  )
}

export async function teardown(): Promise<void> {
  if (registry === undefined) return
  const started = Date.now()
  try {
    const { dropped, failed } = await dropRunDatabases(registry, baseConnection, baseName, runId)
    await releaseRunId(registry, runId)
    /*
    The elapsed time is printed because it is the one part of this scheme whose
    cost is not visible in Vitest's own Duration, which stops at the last test.
    DROP DATABASE is fsync bound, so on a machine whose disk is busy it is the
    difference between a leg that took six minutes and a command that took
    eighteen, and a number nobody can see is a number nobody will believe.
    Anything left undropped is the next run's sweep to collect, not a failure.
    */
    process.stdout.write(
      `[postgres leg] dropped ${dropped} worker database(s) in ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s` +
        (failed > 0 ? `; ${failed} left for the next run's sweep` : '') +
        '\n',
    )
  } finally {
    await registry.end()
    registry = undefined
  }
}

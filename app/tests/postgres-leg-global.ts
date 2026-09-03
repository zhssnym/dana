/*
Vitest globalSetup for the Postgres leg: claims the run, sweeps what dead runs
left behind, and publishes what the workers need to name their own database.

**Why this is a global setup and not just a setup file.** Three things happen
once per run rather than once per file: claiming a run id, sweeping, and
deciding whether a database this leg creates can answer in English. This module
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
authority for) and 11.11 (the CI step and the guard that stops it running PGlite
twice).
*/
import type pg from 'pg'

import {
  claimRunId,
  connect,
  dropRunDatabases,
  ensureDatabase,
  releaseRunId,
  speaksEnglish,
  sweepDeadRuns,
} from './postgres-leg-admin.js'
import {
  BASE_URL_ENV,
  ENGLISH_ENV,
  RUN_ID_ENV,
  databaseNameOf,
  legBaseUrl,
  withDatabase,
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

export async function setup(): Promise<void> {
  const baseUrl = legBaseUrl()
  if (baseUrl === undefined) return

  baseName = databaseNameOf(baseUrl)
  registry = await connect(baseUrl)
  runId = await claimRunId(registry)

  const dropped = await sweepDeadRuns(registry, baseName, runId)

  /*
  Slot 1 is created here rather than on demand for one reason: the answer to
  "does a database this leg creates speak English" is a measurement, not an
  inference from a privilege bit, and slot 1 is a database the run is going to
  create anyway. Every other slot is created by the worker that first needs it.
  */
  const first = workerDatabaseName(baseName, runId, 1)
  await ensureDatabase(registry, baseUrl, first)
  const probe = await connect(withDatabase(baseUrl, first))
  let english: boolean
  try {
    english = await speaksEnglish(probe)
  } finally {
    await probe.end()
  }

  process.env[RUN_ID_ENV] = String(runId)
  process.env[BASE_URL_ENV] = baseUrl
  process.env[ENGLISH_ENV] = english ? '1' : '0'

  /*
  One line, and it names no connection string. A person reading a CI log needs
  to be able to tell this leg apart from the PGlite one and to see which mode the
  lc_messages privilege left it in, and both facts change how a red is read.
  */
  process.stdout.write(
    `[postgres leg] one database per worker: ${baseName}_r${runId}_w<slot>` +
      `; server messages ${english ? 'English' : `not English, AC-001 routed to ${baseName}`}` +
      (dropped.length > 0 ? `; swept ${dropped.length} database(s) from dead runs` : '') +
      '\n',
  )
}

export async function teardown(): Promise<void> {
  if (registry === undefined) return
  try {
    await dropRunDatabases(registry, baseName, runId)
    await releaseRunId(registry, runId)
  } finally {
    await registry.end()
    registry = undefined
  }
}

import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'

export type Db = PgliteDatabase | NodePgDatabase

export interface DbClient {
  kind: 'pglite' | 'postgres'
  db: Db
  runMigrations(): Promise<void>
  close(): Promise<void>
}

export interface DbClientOptions {
  // Explicit connection string; the server boot passes DATABASE_URL here so
  // production can never be redirected by a stray test variable.
  url?: string
  // PGlite storage directory; omitted means in-memory, which is what tests
  // want: every createDbClient() call is then a fresh, isolated database.
  dataDir?: string
}

// The .sql files are not compiled into dist/, so the folder is resolved from
// the working directory, which every npm script and the production start
// command set to app/. Same contract as the version read in routes/health.ts.
const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')

/** An error's message with its errno code, which is the part worth grepping. */
function describe(error: Error): string {
  const code = (error as { code?: unknown }).code
  return `${error.message}${typeof code === 'string' ? ` (${code})` : ''}`
}

// PGlite runs single-connection (spec 11.15): callers must never open a
// second concurrent client against the same dataDir.
export async function createDbClient(
  options: DbClientOptions = {},
): Promise<DbClient> {
  const url =
    options.url ??
    (process.env.TEST_DATABASE_URL === '' ? undefined : process.env.TEST_DATABASE_URL)

  if (url !== undefined) {
    const pool = new pg.Pool({ connectionString: url })
    /*
    Two windows in which a dead socket kills the process rather than a query,
    both measured on 2026-09-04 for issue #174 with a proxy between this pool
    and the cluster so that one real RST could be delivered on demand.

    An **idle** pooled connection: node-postgres re-emits its socket error on
    the pool itself (`pool.emit('error', err, client)`, pg-pool/index.js), and
    an EventEmitter 'error' with no listener throws whatever it was handed. The
    probe ended the process with `Error: read ECONNRESET` thrown from
    node:internal/stream_base_commons and no frame of ours anywhere in it.

    A connection **checked out** by pool.connect(), which is every
    db.transaction() and every migration run: pg-pool removes its own listener
    for the duration (`_acquireClient`), and pg's Client emits socket errors on
    itself as well as rejecting the query in flight (`_handleErrorEvent`,
    pg/lib/client.js). The pool listener does not reach this one, measured: with
    it alone the transaction probe still died uncaught.

    A query run through pool.query() is the one window that was already safe,
    pg-pool attaching its own `once('error')` for its length; the probe confirms
    it rejects and lives.

    That uncaught exception is the whole of the flake this fixes. On the
    Postgres leg it ends the worker, Vitest attributes it to whichever file was
    running, and the report shows one file lost as a suite with a socket message
    and no assertion failing — a different file each time, every one of them
    green alone. It is not connection exhaustion: measured the same day, the
    whole leg peaks at 17 and 18 client backends across two runs, against a
    max_connections of 100.

    Neither listener swallows anything a caller would otherwise see. A query in
    flight still rejects with the same error; these stop the second copy of it,
    the one the emitter throws, from ending the process. Production runs one
    instance through this same seam, where a reset idle connection is the
    ordinary fate of a long-lived pool, so this is not a test concession.
    */
    pool.on('connect', (client) => {
      client.on('error', (error: Error) => {
        process.stderr.write(`[db] connection lost: ${describe(error)}\n`)
      })
    })
    pool.on('error', (error: Error) => {
      process.stderr.write(`[db] idle pooled connection discarded: ${describe(error)}\n`)
    })
    const db = drizzleNodePg(pool)
    return {
      kind: 'postgres',
      db,
      runMigrations: async () => {
        await migrateNodePg(db, { migrationsFolder })
      },
      close: async () => {
        await pool.end()
      },
    }
  }

  const pglite =
    options.dataDir === undefined
      ? await PGlite.create({ extensions: { pg_trgm } })
      : await PGlite.create(options.dataDir, { extensions: { pg_trgm } })
  const db = drizzlePglite(pglite)
  return {
    kind: 'pglite',
    db,
    runMigrations: async () => {
      await migratePglite(db, { migrationsFolder })
    },
    close: async () => {
      await pglite.close()
    },
  }
}

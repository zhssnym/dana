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
  /**
   * Called once for each pooled connection this seam loses, on the Postgres
   * backend only. The boot wires it to a structured warn-level line and the
   * error tracker (`observability/connection-lost.ts`); absent, the seam
   * writes one plain line to stderr, which is what the suite and the database
   * scripts want and all they would read.
   *
   * It exists because the first fix for issue #174 traded a loud crash for a
   * silent one: a process that no longer dies of a reset connection also says
   * nothing about it, and a pool losing one a minute would reach no alert at
   * all. Reporting is the caller's because this module has no logger and must
   * not grow one — `db/client.ts` is imported by the migration scripts and by
   * every test.
   */
  onConnectionLost?: (event: ConnectionLostEvent) => void
}

/** One pooled connection dying, in the only two fields it can safely carry. */
export interface ConnectionLostEvent {
  /** The driver's errno or SQLSTATE code, where the failure has one. */
  code: string | undefined
  /**
   * The driver's own message, which for a connection-level failure is its own
   * text (`read ECONNRESET`, `Connection terminated unexpectedly`) rather than
   * anything a caller sent: this event is emitted by the connection, not by a
   * statement, so no SQL and no bound value reaches it. The 10.5 logger
   * whitelists it again on the way out regardless, and turns anything that is
   * not plain words into `other`.
   */
  message: string
}

// The .sql files are not compiled into dist/, so the folder is resolved from
// the working directory, which every npm script and the production start
// command set to the repository root.
const migrationsFolder = path.resolve(process.cwd(), 'db', 'migrations')

function lost(error: Error): ConnectionLostEvent {
  const code = (error as { code?: unknown }).code
  return { code: typeof code === 'string' ? code : undefined, message: error.message }
}

/** What a process with no logger to wire says: the suite, and the db scripts. */
function writeToStderr(event: ConnectionLostEvent): void {
  process.stderr.write(
    `[db] connection lost: ${event.message}` +
      `${event.code === undefined ? '' : ` (${event.code})`}\n`,
  )
}

// Every connection this server opens carries `dana.step8 = on`. Migration
// 0062's overlap guards refuse membership and invite writes on a project with
// other pages from a connection without it: that is the previous release,
// still serving during a deploy, whose writes name one page and would now
// reach the whole project. A client opened any other way is refused the
// same. Removed with the contract migration that drops those guards.
//
// PGlite runs single-connection (spec 11.15): callers must never open a
// second concurrent client against the same dataDir.
export async function createDbClient(
  options: DbClientOptions = {},
): Promise<DbClient> {
  const url =
    options.url ??
    (process.env.TEST_DATABASE_URL === '' ? undefined : process.env.TEST_DATABASE_URL)

  if (url !== undefined) {
    // dana.step8: see the note above createDbClient.
    const pool = new pg.Pool({ connectionString: url, options: '-c dana.step8=on' })
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
    ordinary fate of a long-lived pool, so this is not a test concession — and
    a crash traded for silence is not a fix either, which is why every loss is
    reported to `onConnectionLost` and the boot wires that to a structured line
    and to the error tracker.
    */
    const report = options.onConnectionLost ?? writeToStderr
    pool.on('connect', (client) => {
      client.on('error', (error: Error) => {
        report(lost(error))
      })
    })
    /*
    Required, and deliberately silent. pg-pool re-emits on the pool what the
    client above has already reported (`pool.emit('error', err, client)` is
    reached from the very listener it adds to that client), so a second report
    here would be a second line for one dead connection. What this cannot be is
    absent: with no listener at all the re-emit is what throws.
    */
    pool.on('error', () => undefined)
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
  await pglite.exec("SET dana.step8 = 'on'")
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

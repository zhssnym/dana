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
  // The server passes DATABASE_URL, so a test variable cannot redirect production.
  url?: string
  // PGlite folder. Unset means in memory: each test gets a fresh database.
  dataDir?: string
  // Called for each lost Postgres connection. Unset writes one line to stderr.
  onConnectionLost?: (event: ConnectionLostEvent) => void
}

/** One pooled connection dying, in the only two fields it can safely carry. */
export interface ConnectionLostEvent {
  /** The driver's errno or SQLSTATE code, where the failure has one. */
  code: string | undefined
  /** The driver's connection message. It never carries SQL or bound values. */
  message: string
}

// The .sql files are not in dist/. Every script and production start from the repository root.
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

// Every connection sets `dana.step8 = on`. Migration 0062 refuses membership and invite writes
// without it. Do not remove it until a migration drops those guards.
// PGlite has one connection: never open two clients on one dataDir.
export async function createDbClient(
  options: DbClientOptions = {},
): Promise<DbClient> {
  const url =
    options.url ??
    (process.env.TEST_DATABASE_URL === '' ? undefined : process.env.TEST_DATABASE_URL)

  if (url !== undefined) {
    // dana.step8: see the note above createDbClient.
    const pool = new pg.Pool({ connectionString: url, options: '-c dana.step8=on' })
    /* Without an 'error' listener, a reset socket throws and ends the process (issue #174).
    The pool listener covers idle connections, and this client listener covers checked-out ones. */
    const report = options.onConnectionLost ?? writeToStderr
    pool.on('connect', (client) => {
      client.on('error', (error: Error) => {
        report(lost(error))
      })
    })
    // Required, and silent: the client listener above already reported this loss.
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

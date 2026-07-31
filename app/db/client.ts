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

/*
The one structural adapter between Dana's two Drizzle database backends and
the server modules that execute SQL. Keeping it here means domain, auth,
scheduling, and background work all unwrap rows and open transactions in the
same way.
*/
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../db/client.js'

export interface Executor {
  execute(statement: SQL): Promise<unknown>
}

interface Transactional {
  transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>
}

export async function inTransaction<T>(
  db: Db,
  run: (tx: Executor) => Promise<T>,
): Promise<T> {
  return (db as unknown as Transactional).transaction(run)
}

export async function rowsOf(
  executor: Executor,
  statement: SQL,
): Promise<Record<string, unknown>[]> {
  const result = (await executor.execute(statement)) as unknown as {
    rows: Record<string, unknown>[]
  }
  return result.rows
}

/*
Row and transaction adapters over the app/db/client.ts handle, for the
domain modules in this directory.

The Db union (PGlite and node-postgres backends) will not surface a common
transaction method through its own types, so the call goes through one
structural interface here, and execute results are unwrapped to their rows
in one place. The auth module (src/server/auth/provisioning.ts) and the
acceptance harness (tests/helpers.ts) each carry their own copy of the same
two adapters, deliberately not imported: the auth module's are its
internals, not its public surface, and the harness measures this code
rather than sharing definitions with it. Three private copies is one more
than taste wants; folding them into a shared home is a consolidation
candidate for the Steward, sensible at the P9 sweep.
*/
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'

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

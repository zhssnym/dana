/*
The database handle the two transaction-taking functions of this module run
on, and the row unwrapper they read results through.

Structurally identical to the pair in src/server/domain/db.ts and
deliberately not imported from it: that file declares its own scope as the
domain modules in its directory, and an import the other way would point this
module at the one that calls it. Structural typing is what makes the
duplication harmless, because the executor a caller already holds satisfies
this interface without an adapter. db.ts records two other copies of the same
two adapters, for reasons of its own, and names folding them into a shared
home as a consolidation candidate for the Steward at the P9 sweep; this is a
fourth, with the same note.
*/
import type { SQL } from 'drizzle-orm'

/**
 * Whatever the caller is running inside: a transaction, per 8.3 and 8.5.
 *
 * Neither function taking one of these opens a transaction of its own. 8.5's
 * generation runs inside the same transaction as the status transition, which
 * is what makes it exactly-once under any race, and 5.1's guard has to see
 * and change the series in the same breath as the update it guards. The
 * shape is P5's deleteAccountData(tx, userId), for the same reason.
 */
export interface Executor {
  execute(statement: SQL): Promise<unknown>
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

/*
The one structural adapter between Dana's two Drizzle database backends and
the server modules that execute SQL. Keeping it here means domain, auth,
scheduling, and background work all unwrap rows and open transactions in the
same way.
*/
import { sql } from 'drizzle-orm'
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

/**
 * A set of uuids as **one** bind parameter, for a child statement restricted
 * to the parents a scoped read already produced.
 *
 * The list rides as a jsonb array unnested in the statement rather than as an
 * IN list of literals, because an account at 10.3's 200-folder cap with a
 * thousand tasks in each would otherwise need two hundred thousand bind
 * parameters, three times what the wire protocol carries. An empty array
 * yields no rows and needs no special case at the call sites.
 *
 * Measured on both legs on 2026-09-04, which is the reason for the spelling:
 * `= ANY(${ids})` reads like the obvious answer and is not one, drizzle
 * expanding a JavaScript array into a parameter *list* rather than binding a
 * single array, so the statement reaches the database as
 * `unnest(($1, $2)::uuid[])` and fails identically on PGlite and Postgres.
 *
 * It lived in `domain/export.ts` until issue #226, which needed the same
 * spelling for the Label projections and had no business importing the
 * account export to get it. The measurement above is why this is a shared
 * function rather than a line each caller writes for itself.
 */
export function idSet(ids: readonly string[]): SQL {
  return sql`(SELECT e::uuid FROM
    jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) e)`
}

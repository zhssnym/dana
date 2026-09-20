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

/** One half of an `IdPairs` row: the id a copy was made from, and the id the
 * copy was given. */
export type IdPair = readonly [old: string, fresh: string]

/**
 * A source-to-copy id mapping as **one** bind parameter, joinable as
 * `m(old_id, new_id)`.
 *
 * `idSet`'s argument one column wider, and it exists for the same reason at
 * the other end of a duplication: a copy that has to remap a child table
 * — issue #227's Folder Label assignments are the first — otherwise does one
 * statement per row, and the row count here is 10.3's task cap rather than a
 * handful. The pairs ride as a jsonb array of two-element arrays because that
 * is the one shape both backends unnest without a composite type to declare;
 * `e->>0` and `e->>1` are then ordinary text, cast once.
 *
 * An empty array yields no rows, so a join against it drops everything, which
 * is what a copy with nothing to remap wants and needs no special case.
 */
export function pairSet(pairs: readonly IdPair[]): SQL {
  return sql`(SELECT (e->>0)::uuid AS old_id, (e->>1)::uuid AS new_id
    FROM jsonb_array_elements(${JSON.stringify(pairs)}::jsonb) e)`
}

/* The adapter between Dana's two Drizzle backends and the code that runs SQL. */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../db/client.js'

export interface Executor {
  execute(statement: SQL): Promise<unknown>
}

/**
 * Rows one duty of the 11.7 tick may claim per pass. An overlapping pass is
 * skipped, not queued, and the reclaim awaits an object-store remove per row
 * (50 to 100 ms on S3), so 200 keeps a pass well inside the 60-second tick.
 * Duties are idempotent, so the rest is found next pass.
 */
export const SWEEP_BATCH = 200

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
 * A uuid set as one bind parameter (a jsonb array), so large sets do not
 * exceed the wire protocol's parameter limit. Do not use `= ANY(${ids})`:
 * drizzle expands an array into a parameter list, which fails on both backends.
 */
export function idSet(ids: readonly string[]): SQL {
  return sql`(SELECT e::uuid FROM
    jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) e)`
}

/** A source id and the id of its copy. */
export type IdPair = readonly [old: string, fresh: string]

/**
 * A source-to-copy id mapping as one bind parameter, joinable as
 * `m(old_id, new_id)`. An empty array yields no rows.
 */
export function pairSet(pairs: readonly IdPair[]): SQL {
  return sql`(SELECT (e->>0)::uuid AS old_id, (e->>1)::uuid AS new_id
    FROM jsonb_array_elements(${JSON.stringify(pairs)}::jsonb) e)`
}

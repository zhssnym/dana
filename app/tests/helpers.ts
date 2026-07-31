/*
Shared harness for the acceptance suite. The database seam (app/db/client.ts)
picks the backend: in-memory PGlite by default, where every createTestDb()
call is an isolated database, or one shared Postgres when TEST_DATABASE_URL
is set. The shared case drives two rules here. Migration runs under an
advisory lock, because Vitest runs test files in parallel workers and two
drizzle migrators racing on a fresh database both try to create the same
tables. And test files must keep their rows self-identifying (random UUIDs,
never TRUNCATE) and remove them on the way out, so parallel files sharing one
database cannot interfere.
*/
import pg from 'pg'
import { DrizzleQueryError, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { expect } from 'vitest'

import { createDbClient } from '../db/client.js'
import type { Db, DbClient } from '../db/client.js'

// Arbitrary constant; workers only need to agree on it.
const MIGRATION_LOCK_KEY = 727001

export async function createTestDb(): Promise<DbClient> {
  const client = await createDbClient()
  if (client.kind === 'postgres') {
    // The lock must live on its own connection: a pooled query could take the
    // lock on one session and try to release it from another.
    const lock = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL ?? '',
    })
    await lock.connect()
    try {
      await lock.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
      try {
        await client.runMigrations()
      } finally {
        await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      }
    } finally {
      await lock.end()
    }
  } else {
    await client.runMigrations()
  }
  return client
}

export async function rows(
  db: Db,
  query: SQL,
): Promise<Record<string, unknown>[]> {
  const result = (await db.execute(query)) as unknown as {
    rows: Record<string, unknown>[]
  }
  return result.rows
}

// Drizzle wraps every failed query, on both backends, in a DrizzleQueryError
// whose message embeds the statement's full SQL and params. That message must
// never enter the searched text: a fragment that happens to appear in the
// statement itself (a column name, say) would then match any rejection
// whatsoever, and the attribution the fragment exists for would be vacuous.
// The prefix check is belt and braces against a second module instance of
// the class ever slipping into the graph.
function isQueryTextWrapper(error: Error): boolean {
  return (
    error instanceof DrizzleQueryError ||
    error.message.startsWith('Failed query: ')
  )
}

// Both backends surface the Postgres error text, but the wrapping differs
// (drizzle nests the driver error under cause), so the search walks the
// chain and also picks up the node-postgres structured constraint field.
export function errorChainText(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 10 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof Error) {
      if (!isQueryTextWrapper(current)) {
        parts.push(current.message)
      }
      const constraint = (current as { constraint?: unknown }).constraint
      if (typeof constraint === 'string') {
        parts.push(constraint)
      }
      current = current.cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return parts.join('\n')
}

// nameFragment is normally the exact constraint or index name from section 4:
// naming it makes the rejection attributable to the guard under test rather
// than to whatever else the doomed statement might have tripped.
export async function expectRejectedBy(
  attempt: () => Promise<unknown>,
  nameFragment: string,
): Promise<void> {
  let failure: unknown
  let rejected = false
  try {
    await attempt()
  } catch (error) {
    failure = error
    rejected = true
  }
  expect(
    rejected,
    `statement succeeded, expected rejection by ${nameFragment}`,
  ).toBe(true)
  expect(errorChainText(failure)).toContain(nameFragment)
}

// Deletion order honors the two RESTRICT foreign keys of section 4
// (tasks.created_by, folders.owner_id); everything else cascades. In-memory
// PGlite discards the database at close, so this is load-bearing only for
// the shared TEST_DATABASE_URL case.
export async function cleanupUsers(
  db: Db,
  userIds: readonly string[],
): Promise<void> {
  for (const id of userIds) {
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
}

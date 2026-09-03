/*
Shared harness for the acceptance suite. The database seam (app/db/client.ts)
picks the backend: in-memory PGlite by default, where every createTestDb() call
is an isolated database, or a real Postgres when TEST_DATABASE_URL is set.

**The Postgres leg no longer shares one database, corrected 2026-09-03 against
issue #32.** This comment used to say that it did, and that test files must keep
their rows self-identifying and "never TRUNCATE" because parallel files shared
one `dana_test`. They did share it, and they interfered: the fingerprint was a
count that climbed across successive tests. Each Vitest pool slot now gets a
database of its own, emptied before every file, so the files running at the same
instant cannot see each other and a file cannot start on top of the rows of the
file that ran before it. tests/postgres-leg.ts is the whole of it and spec 11.10
is the contract.

The advice the old comment gave is still good practice and nothing depends on it
any more: self-identifying rows and a cleanup on the way out are what let a file
be read on its own. What has changed is that a file which forgets is now only
its own problem.

The migration advisory lock stands. It is uncontended now, each slot's database
being reached by one process at a time and already migrated before any test
opens it, and it costs one connection; it is the thing that would still be
holding the line if the isolation above were ever bypassed.
*/
import pg from 'pg'
import { DrizzleQueryError, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { expect } from 'vitest'

import { createDbClient } from '../db/client.js'
import type { Db, DbClient } from '../db/client.js'
import { prepareLegDatabaseOnce } from './postgres-leg-admin.js'

// Arbitrary constant; workers only need to agree on it.
const MIGRATION_LOCK_KEY = 727001

export async function createTestDb(): Promise<DbClient> {
  // Creates and empties this file's own database on the Postgres leg, once per
  // file; a no-op on PGlite. Here rather than in the setup file so that a file
  // which never opens a database never opens a connection either.
  await prepareLegDatabaseOnce()
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

/*
The structured fields of a PostgreSQL error, read off the driver's error object
rather than out of its message.

A server error carries two kinds of content. The message, the detail and the
severity are prose, written in the server's lc_messages language and translated
wholesale on a cluster whose language is not English. The SQLSTATE and the
schema, table, column and constraint names are fields of the ErrorResponse in
their own right (protocol fields C, s, t, c and n), never translated, and set by
the server from the object that failed rather than from anything in the
statement it was sent. Both drivers the suite runs on surface every one of them
on the error drizzle nests under `cause`: node-postgres as DatabaseError, PGlite
as its own error class. Measured 2026-09-03 against pg 8.22.0 and PGlite 0.5.4
with a NOT NULL violation, the Postgres side on a created database answering in
French, which is what this machine's cluster hands the Postgres leg (spec 11.10,
issue #92): code 23502, table tasks, column folder_id on both, with the message
in French on one and in English on the other.
*/
export interface ServerErrorFields {
  /** SQLSTATE, five characters: 23502 not_null_violation, 23505 unique_violation, and so on. */
  code: string
  schema?: string
  table?: string
  column?: string
  constraint?: string
}

export function serverErrorFields(error: unknown): ServerErrorFields | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const candidate = current as Error & Partial<Record<keyof ServerErrorFields, unknown>>
    if (typeof candidate.code === 'string') {
      const fields: ServerErrorFields = { code: candidate.code }
      for (const key of ['schema', 'table', 'column', 'constraint'] as const) {
        const value = candidate[key]
        if (typeof value === 'string') fields[key] = value
      }
      return fields
    }
    current = current.cause
  }
  return undefined
}

/**
 * Asserts that `attempt` is rejected by the server with the given SQLSTATE
 * and, for every other field named, the given value. The comparison is over
 * the named fields only, so `{ code: '23502', column: 'folder_id' }` says
 * nothing about the table.
 *
 * Use this where the thing to pin is which column or which class of violation,
 * and expectRejectedBy where it is a constraint or index name, which every
 * translation keeps verbatim. Never assert the message: it is prose in the
 * cluster's language, and tests/postgres-leg-isolation.test.ts fails a file
 * that does.
 */
export async function expectRejectedWith(
  attempt: () => Promise<unknown>,
  expected: ServerErrorFields,
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
    `statement succeeded, expected rejection with ${JSON.stringify(expected)}`,
  ).toBe(true)
  const actual = serverErrorFields(failure)
  expect(
    actual,
    `the rejection carried no SQLSTATE, so it did not come from the server: ${errorChainText(failure)}`,
  ).toBeDefined()
  const observed = Object.fromEntries(
    (Object.keys(expected) as (keyof ServerErrorFields)[]).map((key) => [key, actual?.[key]]),
  )
  expect(observed).toEqual(expected)
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

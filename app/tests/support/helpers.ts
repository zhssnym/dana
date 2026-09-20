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

import { createDbClient } from '../../db/client.js'
import type { Db, DbClient } from '../../db/client.js'
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
    // Held across the whole migration run, and an unlistened pg.Client throws
    // its socket errors as uncaught exceptions rather than merely rejecting
    // the query. Issue #174, and postgres-leg-admin.ts carries the reasoning.
    lock.on('error', (error: Error) => {
      process.stderr.write(`[postgres leg] migration lock connection error: ${error.message}\n`)
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
 * cluster's language, and tests/guard-postgres-leg-isolation.test.ts fails a file
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

interface BlockingColumn {
  table_schema: string
  table_name: string
  column_name: string
  not_null: unknown
}

/**
 * Every column whose foreign key onto `users(id)` would make the database
 * refuse a delete, with whether that column can hold a null.
 *
 * **Read from `pg_constraint` rather than from `information_schema`, because
 * the delete rule is the whole question and `information_schema` does not
 * carry `confdeltype`.** A column that cascades or nulls itself needs nothing
 * from a test helper: the database already knows what to do with it, and
 * doing it here instead is how a cleanup starts destroying rows that belong
 * to somebody else. Only `'r'` (RESTRICT) and `'a'` (NO ACTION) refuse, so
 * only those are swept.
 *
 * The sessions table lives outside the section 4 model (10.1) and the model
 * grows a table at a time, so the set is discovered rather than listed. Single
 * column keys only, which every key onto `users(id)` is; a composite one would
 * need a different statement and there is none to write it against.
 */
async function blockingColumnsOnUsers(db: Db): Promise<BlockingColumn[]> {
  return (await rows(
    db,
    sql`
      SELECT n.nspname   AS table_schema,
             child.relname AS table_name,
             col.attname   AS column_name,
             col.attnotnull AS not_null
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_attribute col
        ON col.attrelid = c.conrelid AND col.attnum = c.conkey[1]
      JOIN pg_attribute referenced
        ON referenced.attrelid = c.confrelid AND referenced.attnum = c.confkey[1]
      WHERE c.contype = 'f'
        AND parent.relname = 'users'
        AND referenced.attname = 'id'
        AND array_length(c.conkey, 1) = 1
        AND c.confdeltype IN ('a', 'r')
      ORDER BY child.relname, col.attname
    `,
  )) as unknown as BlockingColumn[]
}

/**
 * Removes every trace of the named users, and is the one implementation of
 * that: `cleanupAuthUsers` in `auth-harness.ts` is a name for this function
 * rather than a second copy of it.
 *
 * **It used to delete tasks, then folders, then the user, and that was a list
 * of the RESTRICT keys section 4 had when it was written** (issue #112,
 * 2026-09-04). The list went out of date the way lists do. `events.actor_id`
 * is RESTRICT too, and deliberately: 4.13 soft-deletes users so that their
 * acts outlive them. An event owned by a folder cascades away with the folder,
 * so the list held for as long as every event had one; a folder-less event
 * left a row nothing touched and the `DELETE FROM users` then raised, in
 * `afterAll`, in whichever file happened to hold the fixture, naming a foreign
 * key rather than the change that caused it. #65 met it once on a shelf event.
 *
 * **The first fix for that swept every column referencing `users`, and that
 * was too much.** It is recorded rather than quietly replaced, because the
 * fault is easy to write again: `DELETE FROM tasks WHERE completed_by = <id>`
 * removes a task standing in somebody else's folder, taking its steps and
 * comments with it, and the survivor's fixture then fails somewhere unrelated.
 * A cleanup that destroys rows the departing account does not own is a worse
 * bug than the one it replaced, because it is silent.
 *
 * **So the rule is: do only what the database would otherwise refuse.** Ask
 * `pg_constraint` which columns block a delete, and leave every CASCADE and
 * SET NULL column alone, the engine being better at those than this file is.
 * Of the ones that block, the shape of the column decides the act, and the act
 * is the smallest one that clears the refusal:
 *
 * - **NOT NULL, so the row cannot outlive the person: delete the row.** These
 *   are the account's own content and its own acts, and there is nothing else
 *   they could be — `tasks.created_by`, `folders.owner_id` (the two the old
 *   helper named), `comments.author_id`, `events.actor_id`, `files.owner_id`,
 *   `invites.inviter_id`, `reminders.created_by`.
 * - **Nullable, so the row is somebody else's and merely mentions the person:
 *   null the mention.** `tasks.completed_by` and `invites.accepted_by`. A task
 *   in a shared folder that the departing account happened to tick is the
 *   folder owner's task, and deleting it would be this helper answering a
 *   question nobody asked it.
 *
 * `reminders.created_by` is NOT NULL and so goes with its author even where
 * the task survives, which is the database's own ruling rather than a choice
 * made here; a nullable column would have been nulled.
 *
 * **And one case the database refuses both ways, which this raises on rather
 * than guessing at.** `tasks_completed_by_check` is
 * `(status = 'completed') = (completed_by IS NOT NULL)`, so a completed task
 * standing in a survivor's folder can neither keep a completer who no longer
 * exists nor be given a null one. The three ways out are all decisions rather
 * than mechanics: delete the survivor's task, reopen it, or refuse. Two of
 * those quietly change somebody else's data, and a helper that runs in
 * `afterAll` is the worst place in the repository to make that choice on
 * nobody's authority, so this refuses and says which constraint refused and
 * what to do about it. In the product this cannot arise: 4.19 soft-deletes an
 * account (4.13) precisely so that its acts survive it, and nothing hard
 * deletes a user outside this suite.
 *
 * **No ordering is required and none is imposed.** Every foreign key onto
 * `tasks` and onto `folders` is CASCADE except `invites.task_id`, which is
 * SET NULL, so nothing refuses either delete and the old tasks-then-folders
 * rank was never load-bearing. The only order the constraints ask for is that
 * all of this precede `DELETE FROM users`, which it does. The statements run
 * in the catalog's own order, sorted by table and column so that two runs
 * issue the same sequence and a log is readable.
 *
 * In-memory PGlite discards its database at close, so this is load-bearing
 * only where a database outlives the file that used it.
 */
export async function cleanupUsers(
  db: Db,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return
  const blocking = await blockingColumnsOnUsers(db)

  for (const id of userIds) {
    for (const reference of blocking) {
      const target = sql.raw(
        `"${reference.table_schema}"."${reference.table_name}"`,
      )
      const column = sql.raw(`"${reference.column_name}"`)
      // pg answers a bool as a boolean and PGlite agrees; 't' is read too
      // rather than trusting one driver's spelling of the same catalog.
      const notNull =
        reference.not_null === true || String(reference.not_null) === 't'
      if (notNull) {
        await db.execute(sql`DELETE FROM ${target} WHERE ${column} = ${id}`)
        continue
      }
      try {
        await db.execute(
          sql`UPDATE ${target} SET ${column} = NULL WHERE ${column} = ${id}`,
        )
      } catch (failure) {
        const where = `${reference.table_name}.${reference.column_name}`
        throw new Error(
          `cleanupUsers cannot release ${where} for user ${id}: the row belongs to somebody ` +
            'else and a CHECK on it refuses the null, so the only ways through are to ' +
            'delete their row or to rewrite its other columns, and this helper will do ' +
            'neither on its own authority. Clean up the row yourself before calling this, ' +
            `or do not create it. The server's own error follows: ${errorChainText(failure)}`,
        )
      }
    }
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
}

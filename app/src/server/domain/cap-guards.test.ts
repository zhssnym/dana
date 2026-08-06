/*
The 10.3 caps this directory enforces, checked for the one property no run of
the acceptance suite can check.

Every cap here is a guard rather than a constraint: 4.6 says so for the 50
steps, and neither the 25 members of a folder nor the 200 custom folders of an
account has anything under it either. A guard that counts and then inserts is
only a limit while nothing else can insert between the two, and 11.15 records
that PGlite is single-connection, so on both legs of CI these paths run one at
a time and a missing lock is invisible. That is what let two of them merge:
the defect cannot fail a test that cannot express it.

So this file checks the shape of the decision rather than its outcome under
concurrency. It drives each guard against a real database through a recorder
that renders every statement it issues, and asserts that the lock is the first
statement of the transaction, that the count comes after it, and that the
insert comes after the count. Under Postgres that ordering is what makes the
second caller wait and then read the count the first one left; without it the
two read the same number and both pass.

The assertions name the race in their own words, so a later edit that drops a
lock fails here with the reason rather than with a diff.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/helpers.js'
import type { Executor } from './db.js'
import { addMember, createFolder } from './folders.js'
import { addStep } from './tasks.js'

let client: DbClient
let db: Db

const dialect = new PgDialect()

/*
A Db that records what it is asked to run and then runs it. The domain modules
reach their database through two methods only, execute and transaction (the
adapters in db.ts), so wrapping those two is the whole surface. Statements are
rendered by drizzle's own dialect rather than matched as objects, because what
is under test is the SQL that reaches Postgres.
*/
function recording(real: Db, log: string[]): Db {
  const wrap = (target: Executor): Executor => ({
    execute: async (statement: SQL) => {
      log.push(
        dialect.sqlToQuery(statement).sql.replace(/\s+/g, ' ').trim().toLowerCase(),
      )
      return target.execute(statement)
    },
  })
  const transactional = real as unknown as {
    transaction: <T>(run: (tx: Executor) => Promise<T>) => Promise<T>
  }
  const proxy = {
    execute: wrap(real as unknown as Executor).execute,
    transaction: async <T>(run: (tx: Executor) => Promise<T>): Promise<T> => {
      log.push('begin')
      const out = await transactional.transaction((tx) => run(wrap(tx)))
      log.push('commit')
      return out
    },
  }
  return proxy as unknown as Db
}

function indexOfStatement(
  log: readonly string[],
  matches: (statement: string) => boolean,
  what: string,
): number {
  const found = log.findIndex(matches)
  expect(found, `the guard must issue ${what}; it issued ${JSON.stringify(log)}`).toBeGreaterThan(-1)
  return found
}

/* ------------------------------------------------------------------ *
 * Fixtures, seeded directly: this is a unit test of one module, not an
 * acceptance run, so the rows arrive by insert rather than by sign-in.
 * ------------------------------------------------------------------ */

async function seedUser(label: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`cap-${label}-${randomUUID()}`},
                ${`${label}-${randomUUID()}@cap-guards.test`},
                ${`Cap ${label}`})
        RETURNING id`,
  )
  return String(found[0]?.id)
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${'cap guards'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${ownerId}::uuid)`,
  )
  return folderId
}

async function seedTask(folderId: string, ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'cap guards task'}, ${ownerId}::uuid,
                ${ownerId}::uuid)
        RETURNING id`,
  )
  return String(found[0]?.id)
}

const seededUsers: string[] = []

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  for (const id of seededUsers) {
    await db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM connections
                          WHERE user_a_id = ${id} OR user_b_id = ${id}`)
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
  await client.close()
})

describe('the 10.3 caps decide under a lock, not beside one', () => {
  test('addStep locks the task before it counts its steps (7.7, 4.6, 10.3)', async () => {
    const ownerId = await seedUser('step-owner')
    seededUsers.push(ownerId)
    const folderId = await seedFolder(ownerId)
    const taskId = await seedTask(folderId, ownerId)

    const log: string[] = []
    const result = await addStep(recording(db, log), ownerId, taskId, {
      title: 'a step',
    })
    expect(result.kind, 'the add still succeeds: this changes when, not what').toBe(
      'added',
    )

    expect(log[0], 'the whole decision is one transaction').toBe('begin')
    expect(
      log[1],
      'and its first statement takes the row lock, so a second add waits here rather than reading the same count',
    ).toContain('for update of t')

    const counted = indexOfStatement(
      log,
      (statement) => statement.includes('count(*)') && statement.includes('from steps'),
      'the count that decides the 50 cap',
    )
    const inserted = indexOfStatement(
      log,
      (statement) => statement.startsWith('insert into steps'),
      'the insert the count admitted',
    )
    expect(
      counted,
      'the count must follow the lock, or two adds at 49 both read 49 and both pass (10.3, 4.6)',
    ).toBeGreaterThan(1)
    expect(
      inserted,
      'and the insert must follow the count it was admitted by',
    ).toBeGreaterThan(counted)
    expect(log[log.length - 1], 'all of it committing together').toBe('commit')
  })

  test('addMember locks the folder before it counts its members (7.4, 5.3, 10.3)', async () => {
    const ownerId = await seedUser('member-owner')
    const targetId = await seedUser('member-target')
    seededUsers.push(ownerId, targetId)
    const folderId = await seedFolder(ownerId)
    await db.execute(sql`
      INSERT INTO connections (user_a_id, user_b_id)
      VALUES (least(${ownerId}::uuid, ${targetId}::uuid),
              greatest(${ownerId}::uuid, ${targetId}::uuid))
    `)

    const log: string[] = []
    const result = await addMember(
      recording(db, log),
      ownerId,
      folderId,
      targetId,
      { isOwner: true, isDefault: false },
    )
    expect(result.kind, 'the add still succeeds: this changes when, not what').toBe(
      'added',
    )

    expect(
      log[0],
      'these five statements were not in a transaction at all when this merged at P2',
    ).toBe('begin')
    expect(
      log[1],
      'and the first of them takes the folder row, which is what a membership set is named by',
    ).toContain('for update')

    const counted = indexOfStatement(
      log,
      (statement) =>
        statement.includes('count(*)') && statement.includes('from folder_members'),
      'the count that decides the 25 cap',
    )
    const inserted = indexOfStatement(
      log,
      (statement) => statement.startsWith('insert into folder_members'),
      'the insert the count admitted',
    )
    expect(
      counted,
      'the count must follow the lock, or two members adding two different people at 24 both read 24 (10.3, 5.3)',
    ).toBeGreaterThan(1)
    expect(
      inserted,
      'and the insert must follow the count it was admitted by',
    ).toBeGreaterThan(counted)
    expect(log[log.length - 1], 'all of it committing together').toBe('commit')

    expect(
      (
        await rows(
          db,
          sql`SELECT 1 AS present FROM folder_members
              WHERE folder_id = ${folderId} AND user_id = ${targetId}`,
        )
      ).length,
      'and the membership the transaction wrote is really there',
    ).toBe(1)
  })

  test('createFolder locks the owner before it counts their folders (7.4, 10.3)', async () => {
    const ownerId = await seedUser('folder-owner')
    seededUsers.push(ownerId)

    const log: string[] = []
    const result = await createFolder(recording(db, log), ownerId, 'capped')
    expect(result.kind, 'the create still succeeds: this changes when, not what').toBe(
      'created',
    )

    expect(log[0], 'the guard and the two inserts are one transaction').toBe('begin')
    expect(
      log[1],
      'and it opens by locking the account, the only row that names the set being counted',
    ).toContain('for update')

    const counted = indexOfStatement(
      log,
      (statement) => statement.includes('count(*)') && statement.includes('from folders'),
      'the count that decides the 200 cap',
    )
    const inserted = indexOfStatement(
      log,
      (statement) => statement.startsWith('insert into folders'),
      'the insert the count admitted',
    )
    expect(
      counted,
      'the count must follow the lock, or two creates at 199 both read 199 and both insert (10.3)',
    ).toBeGreaterThan(1)
    expect(
      inserted,
      'and the insert must follow the count it was admitted by',
    ).toBeGreaterThan(counted)
    expect(log[log.length - 1], 'all of it committing together').toBe('commit')
  })

  test('the default-folder refusal still answers before any row is read (INV-3)', async () => {
    const ownerId = await seedUser('default-guard')
    seededUsers.push(ownerId)
    const log: string[] = []
    const result = await addMember(
      recording(db, log),
      ownerId,
      randomUUID(),
      ownerId,
      { isOwner: true, isDefault: true },
    )
    expect(result.kind).toBe('default_folder')
    expect(
      log,
      'INV-2 fixes is_default at creation, so this answer needs no row and opens no transaction',
    ).toEqual([])
  })
})

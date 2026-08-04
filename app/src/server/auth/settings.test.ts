/*
The settings module's own tests, for the three properties AC-119 to AC-123
cannot reach from outside.

The criteria own the behavior of the endpoints and this file does not repeat
them. What it pins is beneath the wire: that the empty subset writes nothing
at all rather than touching updated_at, which the criteria cannot see because
7.2's body carries only the three booleans; that absent fields survive a write
untouched at the function boundary, sequentially, which is the half of AC-120's
property a test can pin without concurrency; and that a broken INV-14 refuses
rather than answering plausible defaults, which no request can provoke because
provisioning always writes the row.

The functions are driven directly rather than through HTTP: the route layer
is validate-then-delegate, the acceptance suite drives it end to end, and
what is under test here is what the statements do to the table.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { provisionUser } from './provisioning.js'
import { readSettings, writeSettings } from './settings.js'

let dbClient: DbClient
let db: Db
const domain = `settings-${randomUUID()}.test`
const created: string[] = []

async function account(): Promise<string> {
  const sub = `settings-${randomUUID()}`
  const user = await provisionUser(
    db,
    {
      sub,
      email: `${sub}@${domain}`,
      displayName: 'Settings tester',
      avatarUrl: null,
    },
    undefined,
  )
  created.push(user.id)
  return user.id
}

async function updatedAt(userId: string): Promise<unknown> {
  const found = await rows(
    db,
    sql`SELECT updated_at FROM user_settings WHERE user_id = ${userId}`,
  )
  return found[0]?.updated_at
}

beforeAll(async () => {
  dbClient = await createTestDb()
  db = dbClient.db
}, 60_000)

afterAll(async () => {
  if ((dbClient as DbClient | undefined) === undefined) return
  await cleanupUsers(db, created)
  await dbClient.close()
})

describe('writeSettings (7.2: any subset, only the present fields)', () => {
  test('the empty subset writes nothing, updated_at included', async () => {
    const userId = await account()
    const before = await updatedAt(userId)

    const answered = await writeSettings(db, userId, {})
    expect(answered, 'the unchanged row is still the answer').toEqual(
      await readSettings(db, userId),
    )
    expect(
      await updatedAt(userId),
      'a request that changed nothing must not stamp the row as changed',
    ).toEqual(before)
  })

  test('a one-field write leaves the other two columns exactly as they were', async () => {
    // Absent-unchanged at the function boundary, and no more than that: a
    // read-merge-write passes this too, because sequentially it rewrites the
    // same values it read. Only concurrency separates the two, which is why
    // AC-120 races them and why this cannot stand in for that.
    const userId = await account()
    await writeSettings(db, userId, {
      show_important: false,
      show_all: false,
      show_done: true,
    })

    const answered = await writeSettings(db, userId, { show_all: true })
    expect(answered, 'the answer is the row the write produced').toEqual({
      show_important: false,
      show_all: true,
      show_done: true,
    })
    expect(
      await readSettings(db, userId),
      'the absent fields keep the values the earlier write left',
    ).toEqual(answered)
  })

  test('a write does stamp updated_at, so the no-op case above means something', async () => {
    const userId = await account()
    const before = await updatedAt(userId)
    await writeSettings(db, userId, { show_done: true })
    expect(await updatedAt(userId)).not.toEqual(before)
  })
})

describe('the INV-14 refusal (4.10: three NOT NULL booleans, one row per user)', () => {
  test('a missing settings row refuses rather than answering defaults', async () => {
    // Unreachable through the API, since provisioning writes the row in the
    // same transaction as the user. Answering 4.10's defaults here would hand
    // an account settings it never had, two of them the inverse of what it
    // would read once the row existed.
    const userId = await account()
    await db.execute(sql`DELETE FROM user_settings WHERE user_id = ${userId}`)

    await expect(readSettings(db, userId)).rejects.toThrow(/INV-14/)
    await expect(
      writeSettings(db, userId, { show_done: true }),
      'a write that matched no row must not answer as though it had',
    ).rejects.toThrow(/INV-14/)
  })
})

/*
A unit test of the shared count helper, not an acceptance criterion. Protocol
section 8 puts unit tests inside a module with that module's owner, and
folders-harness.ts is this role's.

It exists for the same reason tasks-harness.test.ts exists: a reader whose
contract lived only in the heads of its callers, and a failure mode that
reported nothing when they broke it. countRows returned
Number(found[0]?.n ?? NaN), so a query answering any column other than n
produced NaN rather than a count or an error. Against .toBe(0) that is a
visible red. Against a before-and-after comparison it is not visible at all:
Object.is(NaN, NaN) is true and toBe uses Object.is, so an assertion that a
refused create wrote no row passed with NaN on both sides while the row count
was never read. Two P6 call sites did exactly that and were found at the
implementer review rather than by the suite, which is the wrong way round.

The helper now asserts its contract. This file is the guard that it keeps
asserting it, and that the guard did not cost the forty-odd correct callers
anything: count(*) answers exactly one row even when it counts to zero, which
is the property the whole convention rests on and the one case below pins
directly.

Everything here is seeded and read directly. No route and no application boot
is involved.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { cleanupAuthUsers } from './auth-harness.js'
import { countRows, seedTask } from './folders-harness.js'
import { createTestDb } from './helpers.js'

let client: DbClient
let userId: string
let folderId: string

beforeAll(async () => {
  client = await createTestDb()
  const db = client.db
  const inserted = await db.execute(sql`
    INSERT INTO users (google_sub, email, display_name)
    VALUES (${`p6-count-${randomUUID()}`},
            ${`count-${randomUUID()}@p6-harness.test`}, ${'Count Guard'})
    RETURNING id
  `)
  userId = String(
    (inserted as unknown as { rows: { id: unknown }[] }).rows[0]?.id,
  )
  const folder = await db.execute(sql`
    INSERT INTO folders (name, owner_id, is_default)
    VALUES (${'p6 count guard'}, ${userId}::uuid, ${false})
    RETURNING id
  `)
  folderId = String(
    (folder as unknown as { rows: { id: unknown }[] }).rows[0]?.id,
  )
  await db.execute(sql`
    INSERT INTO folder_members (folder_id, user_id)
    VALUES (${folderId}::uuid, ${userId}::uuid)
  `)
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await cleanupAuthUsers(client.db, [userId])
  await client.close()
})

describe('countRows', () => {
  test('counts rows through the count(*)::int AS n contract', async () => {
    expect(
      await countRows(
        client.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ),
      'an empty folder counts zero, and count(*) answers one row saying so rather than no rows at all',
    ).toBe(0)

    await seedTask(client.db, { folderId, createdBy: userId })
    await seedTask(client.db, { folderId, createdBy: userId })
    expect(
      await countRows(
        client.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ),
      'and it counts what is there',
    ).toBe(2)
  })

  test('refuses a query that cannot answer it, rather than returning NaN', async () => {
    // The defect this file was written for. Before the guard this call
    // answered NaN, and NaN is the one value that makes a before-and-after
    // comparison pass no matter what happened in between.
    await expect(
      countRows(
        client.db,
        sql`SELECT id FROM tasks WHERE folder_id = ${folderId}::uuid`,
      ),
    ).rejects.toThrow(/named n/)
  })

  test('refuses a query that answers no row at all', async () => {
    // count(*) always answers a row, so this shape is a misuse too: a
    // predicate that matched nothing would otherwise read as NaN and, with
    // the guard, says which of the two it was.
    await expect(
      countRows(
        client.db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE 1 = 0 GROUP BY id`,
      ),
    ).rejects.toThrow(/named n/)
  })
})

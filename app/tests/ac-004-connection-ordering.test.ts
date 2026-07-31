/*
AC-004: given a connection row with user_a_id greater than user_b_id, when
inserted, then rejected (INV-9).

The guard is connections_user_order_check (section 4.2), a strict ordering,
so equality (a self-connection) must be rejected too. The canonical ordering
is what lets the primary key enforce at-most-one-row-per-unordered-pair, the
other half of INV-9, so the duplicate-pair rejection is asserted alongside.

uuid comparison in Postgres is bytewise, which for the lowercase canonical
text form matches lexicographic string order, so the fixture ids are ordered
in JavaScript by plain string comparison.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { cleanupUsers, createTestDb, expectRejectedBy, rows } from './helpers.js'

let client: DbClient
const [low, mid, high] = [randomUUID(), randomUUID(), randomUUID()].sort() as [
  string,
  string,
  string,
]

// Cold PGlite instances compile WASM, and parallel workers all do it at
// once, so setup gets far more than the default hook timeout.
beforeAll(async () => {
  client = await createTestDb()
  await client.db.execute(
    sql`INSERT INTO users (id) VALUES (${low}), (${mid}), (${high})`,
  )
}, 60_000)

afterAll(async () => {
  // Setup can fail before assignment; a missing client must not bury the
  // original failure under a TypeError.
  if ((client as DbClient | undefined) === undefined) return
  await cleanupUsers(client.db, [low, mid, high])
  await client.close()
})

async function pairCount(a: string, b: string): Promise<number> {
  const result = await rows(
    client.db,
    sql`
      SELECT count(*)::int AS n FROM connections
      WHERE (user_a_id = ${a} AND user_b_id = ${b})
         OR (user_a_id = ${b} AND user_b_id = ${a})
    `,
  )
  return Number(result[0]?.n)
}

describe('AC-004: connections are canonically ordered (INV-9)', () => {
  test('AC-004: user_a_id greater than user_b_id is rejected', async () => {
    await expectRejectedBy(
      () =>
        client.db.execute(sql`
          INSERT INTO connections (user_a_id, user_b_id) VALUES (${mid}, ${low})
        `),
      'connections_user_order_check',
    )
    expect(await pairCount(low, mid)).toBe(0)
  })

  test('AC-004 adversarial: a self-connection is rejected (ordering is strict)', async () => {
    await expectRejectedBy(
      () =>
        client.db.execute(sql`
          INSERT INTO connections (user_a_id, user_b_id) VALUES (${low}, ${low})
        `),
      'connections_user_order_check',
    )
    expect(await pairCount(low, low)).toBe(0)
  })

  test('AC-004 positive control: the canonical ordering inserts', async () => {
    await client.db.execute(sql`
      INSERT INTO connections (user_a_id, user_b_id) VALUES (${low}, ${mid})
    `)
    expect(await pairCount(low, mid)).toBe(1)
  })

  test('AC-004 adversarial: one row per unordered pair (INV-9, connections_pkey)', async () => {
    await client.db.execute(sql`
      INSERT INTO connections (user_a_id, user_b_id) VALUES (${low}, ${high})
    `)
    await expectRejectedBy(
      () =>
        client.db.execute(sql`
          INSERT INTO connections (user_a_id, user_b_id) VALUES (${low}, ${high})
        `),
      'connections_pkey',
    )
    expect(await pairCount(low, high)).toBe(1)
  })
})

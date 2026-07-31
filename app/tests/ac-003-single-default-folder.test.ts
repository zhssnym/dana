/*
AC-003: given a second is_default folder for the same owner, when inserted,
then rejected (INV-2).

The guard is the partial unique index folders_one_default_per_owner_idx
(section 4.3). The adversarial cases close the ways a wrong replacement
could still pass a naive test: more non-default folders for the same owner
must stay legal (so a plain UNIQUE on owner_id would go red), a default for
another owner must stay legal (per-owner scope), and promoting an existing
folder by UPDATE must be as closed as inserting one.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { cleanupUsers, createTestDb, expectRejectedBy, rows } from './helpers.js'

let client: DbClient
const ownerA = randomUUID()
const ownerB = randomUUID()
const inboxA = randomUUID()

// Cold PGlite instances compile WASM, and parallel workers all do it at
// once, so setup gets far more than the default hook timeout.
beforeAll(async () => {
  client = await createTestDb()
  await client.db.execute(
    sql`INSERT INTO users (id) VALUES (${ownerA}), (${ownerB})`,
  )
  await client.db.execute(sql`
    INSERT INTO folders (id, owner_id, name, is_default)
    VALUES (${inboxA}, ${ownerA}, 'Inbox', true)
  `)
}, 60_000)

afterAll(async () => {
  // Setup can fail before assignment; a missing client must not bury the
  // original failure under a TypeError.
  if ((client as DbClient | undefined) === undefined) return
  await cleanupUsers(client.db, [ownerA, ownerB])
  await client.close()
})

async function defaultCount(ownerId: string): Promise<number> {
  const result = await rows(
    client.db,
    sql`SELECT count(*)::int AS n FROM folders WHERE owner_id = ${ownerId} AND is_default`,
  )
  return Number(result[0]?.n)
}

describe('AC-003: one default folder per owner (INV-2)', () => {
  test('AC-003: a second default folder for the same owner is rejected', async () => {
    await expectRejectedBy(
      () =>
        client.db.execute(sql`
          INSERT INTO folders (owner_id, name, is_default)
          VALUES (${ownerA}, 'Second inbox', true)
        `),
      'folders_one_default_per_owner_idx',
    )
    expect(await defaultCount(ownerA)).toBe(1)
  })

  test('AC-003 adversarial: promoting an existing folder to default is rejected', async () => {
    const folderId = randomUUID()
    await client.db.execute(sql`
      INSERT INTO folders (id, owner_id, name, is_default)
      VALUES (${folderId}, ${ownerA}, 'Ambitious folder', false)
    `)
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`UPDATE folders SET is_default = true WHERE id = ${folderId}`,
        ),
      'folders_one_default_per_owner_idx',
    )
    const after = await rows(
      client.db,
      sql`SELECT is_default FROM folders WHERE id = ${folderId}`,
    )
    expect(after[0]?.is_default).toBe(false)
    expect(await defaultCount(ownerA)).toBe(1)
  })

  test('AC-003 positive control: more non-default folders for the same owner are legal', async () => {
    // A plain UNIQUE on owner_id would reject this; the index must be
    // partial on is_default.
    await client.db.execute(sql`
      INSERT INTO folders (owner_id, name, is_default)
      VALUES (${ownerA}, 'Groceries', false)
    `)
    expect(await defaultCount(ownerA)).toBe(1)
  })

  test('AC-003 positive control: another owner keeps their own default', async () => {
    await client.db.execute(sql`
      INSERT INTO folders (owner_id, name, is_default)
      VALUES (${ownerB}, 'Inbox', true)
    `)
    expect(await defaultCount(ownerB)).toBe(1)
    expect(await defaultCount(ownerA)).toBe(1)
  })
})

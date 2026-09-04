/*
A unit test of the shared cleanup helper, not an acceptance criterion. Protocol
section 8 puts a unit test inside a module with that module's owner, and
`helpers.ts` is the acceptance suite's own.

**It exists because `cleanupUsers` had a failure mode that reported the wrong
thing in the wrong file** (issue #112, fixed 2026-09-04). The helper deleted
tasks, then folders, then the user, which was a hand-written list of the
RESTRICT foreign keys section 4 held on the day it was written. `events.actor_id`
is RESTRICT too, and deliberately: 4.13 soft-deletes users so that their acts
outlive them. An event that belongs to a folder cascades away with the folder,
so the list was complete for as long as every event had one. A folder-less
event -- a shelf, an account-level act, anything the model gains next -- left a
row the helper never touched, and the `DELETE FROM users` then raised.

**The cost is in how that presents rather than in the raise itself.** It fires
in `afterAll`, so Vitest reports it as a suite error rather than as a failed
assertion; it fires in whichever file happens to hold the fixture rather than in
the file whose change created the event; and what it says is the name of a
foreign key. A session in #65 met exactly this, on a shelf event carrying a null
`folder_id`, and read it as a broken contract test.

So the helper now discovers the columns referencing `users` from the catalog,
which is what `auth-harness.ts` had always done, and the two are one function.
The cases below are the guard on that: the folder-less event is the row the old
list could not reach, and the second case is the old list's own work, kept
asserted so that a future rewrite cannot drop it while still passing the first.

Everything here is seeded and read directly. No route and no application boot is
involved.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../db/client.js'
import { cleanupAuthUsers } from './auth-harness.js'
import { cleanupUsers, createTestDb, rows } from './helpers.js'

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

/** A user of this file's own, identified so no other file can collide with it. */
async function seedUser(db: Db, what: string): Promise<string> {
  const tag = randomUUID()
  const inserted = await rows(
    db,
    sql`
      INSERT INTO users (google_sub, email, display_name)
      VALUES (${`helpers-${what}-${tag}`},
              ${`${what}-${tag}@helpers-harness.test`},
              ${'Cleanup Guard'})
      RETURNING id
    `,
  )
  return String(inserted[0]?.id)
}

async function countUsers(db: Db, id: string): Promise<number> {
  const found = await rows(db, sql`SELECT count(*)::int AS n FROM users WHERE id = ${id}::uuid`)
  return Number(found[0]?.n)
}

async function countEvents(db: Db, id: string): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM events WHERE actor_id = ${id}::uuid`,
  )
  return Number(found[0]?.n)
}

describe('cleanupUsers', () => {
  test('deletes a user whose only act is an event belonging to no folder', async () => {
    const db = client.db
    const userId = await seedUser(db, 'folderless')
    await db.execute(sql`
      INSERT INTO events (actor_id, verb, subject_kind, subject_id, subject_name, folder_id)
      VALUES (${userId}::uuid, ${'created'}, ${'shelf'}, ${randomUUID()}::uuid,
              ${'a shelf owned by nobody'}, ${null})
    `)
    expect(
      await countEvents(db, userId),
      'the fixture is the row the old deletion list could not reach: an event with a null ' +
        'folder_id, which nothing cascades away',
    ).toBe(1)

    // The assertion is that this resolves. Before issue #112 it raised on
    // events_actor_id_fkey, in afterAll, in whichever file held the fixture.
    await cleanupUsers(db, [userId])

    expect(await countEvents(db, userId), 'the act went with its actor').toBe(0)
    expect(
      await countUsers(db, userId),
      'and the user is gone, which is the whole of what the helper promises its callers',
    ).toBe(0)
  })

  test('still deletes the folder and the task the old list named', async () => {
    const db = client.db
    const userId = await seedUser(db, 'owned')
    const folder = await rows(
      db,
      sql`
        INSERT INTO folders (name, owner_id, is_default)
        VALUES (${'helpers cleanup guard'}, ${userId}::uuid, ${false})
        RETURNING id
      `,
    )
    const folderId = String(folder[0]?.id)
    await db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id)
      VALUES (${folderId}::uuid, ${userId}::uuid)
    `)
    await db.execute(sql`
      INSERT INTO tasks (folder_id, title, created_by)
      VALUES (${folderId}::uuid, ${'helpers cleanup guard task'}, ${userId}::uuid)
    `)
    await db.execute(sql`
      INSERT INTO events (actor_id, verb, subject_kind, subject_id, subject_name, folder_id)
      VALUES (${userId}::uuid, ${'created'}, ${'folder'}, ${folderId}::uuid,
              ${'helpers cleanup guard'}, ${folderId}::uuid)
    `)

    await cleanupUsers(db, [userId])

    const folders = await rows(
      db,
      sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}::uuid`,
    )
    expect(
      Number(folders[0]?.n),
      'tasks before folders and folders before the user: both hold RESTRICT keys, and this ' +
        'is the ordering the catalog sweep has to keep now that it no longer names them',
    ).toBe(0)
    expect(await countEvents(db, userId), 'the folder-owned event went too').toBe(0)
    expect(await countUsers(db, userId), 'and so did the user').toBe(0)
  })

  test('takes an empty list without touching anything', async () => {
    const db = client.db
    const userId = await seedUser(db, 'untouched')
    await cleanupUsers(db, [])
    expect(
      await countUsers(db, userId),
      'a caller with nothing to clean up deletes nothing, which is what lets a fixture ' +
        'that failed to seed call this in afterAll regardless',
    ).toBe(1)
    await cleanupUsers(db, [userId])
  })
})

describe('cleanupAuthUsers', () => {
  test('is the same sweep, so the two harnesses cannot drift apart again', async () => {
    const db = client.db
    const userId = await seedUser(db, 'auth')
    await db.execute(sql`
      INSERT INTO events (actor_id, verb, subject_kind, subject_id, subject_name, folder_id)
      VALUES (${userId}::uuid, ${'created'}, ${'shelf'}, ${randomUUID()}::uuid,
              ${'a shelf owned by nobody'}, ${null})
    `)

    await cleanupAuthUsers(db, [userId])

    expect(
      await countUsers(db, userId),
      'the auth harness swept every referencing column while the acceptance harness named ' +
        'two of them, and issue #112 made the second the first. This is the case that ' +
        'fails if anyone gives either name a body of its own again',
    ).toBe(0)
  })
})

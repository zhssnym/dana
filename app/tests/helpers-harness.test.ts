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

async function countRowsWhere(db: Db, query: Parameters<typeof rows>[1]): Promise<number> {
  const found = await rows(db, query)
  return Number(found[0]?.n)
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
      'a folder whose owner is gone goes with them: folders.owner_id is RESTRICT and NOT ' +
        'NULL, so the row cannot outlive the person and the sweep deletes it. No ordering ' +
        'against the task above is claimed here and none is required: every foreign key ' +
        'onto tasks and onto folders is CASCADE bar one that is SET NULL, so neither delete ' +
        'can be refused by the other. What the constraints do require is that both precede ' +
        'DELETE FROM users, which is the last statement the helper issues',
    ).toBe(0)
    expect(await countEvents(db, userId), 'the folder-owned event went too').toBe(0)
    expect(await countUsers(db, userId), 'and so did the user').toBe(0)
  })

  test('leaves a survivor the rows that merely mention the departing account', async () => {
    const db = client.db
    const survivor = await seedUser(db, 'survivor')
    const departing = await seedUser(db, 'departing')

    const folder = await rows(
      db,
      sql`
        INSERT INTO folders (name, owner_id, is_default)
        VALUES (${'helpers shared folder'}, ${survivor}::uuid, ${false})
        RETURNING id
      `,
    )
    const folderId = String(folder[0]?.id)
    for (const member of [survivor, departing]) {
      await db.execute(sql`
        INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${member}::uuid)
      `)
    }
    const assigned = await rows(
      db,
      sql`
        INSERT INTO tasks (folder_id, title, created_by, assignee_id)
        VALUES (${folderId}::uuid, ${'assigned to the leaver'}, ${survivor}::uuid,
                ${departing}::uuid)
        RETURNING id
      `,
    )
    const assignedId = String(assigned[0]?.id)
    const invite = await rows(
      db,
      sql`
        INSERT INTO invites (folder_id, inviter_id, email, status, accepted_by, responded_at)
        VALUES (${folderId}::uuid, ${survivor}::uuid, ${'someone@helpers-harness.test'},
                ${'accepted'}, ${departing}::uuid, now())
        RETURNING id
      `,
    )
    const inviteId = String(invite[0]?.id)

    await cleanupUsers(db, [departing])

    expect(
      await countRowsWhere(
        db,
        sql`SELECT count(*)::int AS n FROM folders WHERE id = ${folderId}::uuid`,
      ),
      'the folder belongs to the survivor and the departing account was only a member of ' +
        'it. folder_members cascades, so the membership goes and the folder does not. The ' +
        'sweep that this replaced deleted by every column referencing users, which took ' +
        'rows like these with it',
    ).toBe(1)
    expect(
      await countRowsWhere(
        db,
        sql`SELECT count(*)::int AS n FROM tasks WHERE id = ${assignedId}::uuid`,
      ),
      'the task assigned to them stands: assignee_id points at folder_members, which ' +
        'cascades, so the database unassigns it and nothing here has to',
    ).toBe(1)
    expect(
      await countRowsWhere(
        db,
        sql`SELECT count(*)::int AS n FROM invites WHERE id = ${inviteId}::uuid`,
      ),
      'and the invite the survivor sent stands, with the acceptance nulled rather than the ' +
        'row deleted: invites.accepted_by is NO ACTION and nullable, so the smallest act ' +
        'that clears the refusal is to drop the mention',
    ).toBe(1)
    const accepted = await rows(
      db,
      sql`SELECT accepted_by FROM invites WHERE id = ${inviteId}::uuid`,
    )
    expect(
      accepted[0]?.accepted_by,
      'the mention itself is gone, which is what let the user row go',
    ).toBeNull()
    expect(await countUsers(db, departing), 'and the departing account is gone').toBe(0)
    expect(await countUsers(db, survivor), 'while the survivor is not').toBe(1)

    await cleanupUsers(db, [survivor])
  })

  /*
  The one row the schema will not let this helper release, asserted as a
  refusal because a refusal is what it is.

  `tasks_completed_by_check` is `(status = 'completed') = (completed_by IS NOT
  NULL)`, so a completed task in a survivor's folder can neither keep a
  completer who is being deleted nor be given a null one. Deleting the
  survivor's task and reopening it are both changes to somebody else's data,
  and an `afterAll` helper is the wrong place to choose between them. This
  pins the choice not being made silently, and it names the constraint so that
  whoever meets it knows what they met. In the product it cannot arise: 4.13
  soft-deletes an account so that its acts survive it.
  */
  test('refuses, by name, the completed task it cannot release', async () => {
    const db = client.db
    const survivor = await seedUser(db, 'checked-survivor')
    const departing = await seedUser(db, 'checked-departing')
    const folder = await rows(
      db,
      sql`
        INSERT INTO folders (name, owner_id, is_default)
        VALUES (${'helpers checked folder'}, ${survivor}::uuid, ${false})
        RETURNING id
      `,
    )
    const folderId = String(folder[0]?.id)
    for (const member of [survivor, departing]) {
      await db.execute(sql`
        INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${member}::uuid)
      `)
    }
    await db.execute(sql`
      INSERT INTO tasks (folder_id, title, created_by, status, completed_by, completed_at)
      VALUES (${folderId}::uuid, ${'ticked by the leaver'}, ${survivor}::uuid,
              ${'completed'}, ${departing}::uuid, now())
    `)

    await expect(
      cleanupUsers(db, [departing]),
      'the refusal names the column it could not release, so a caller who meets this in ' +
        'afterAll is told what to do rather than left with a foreign key name',
    ).rejects.toThrow(/tasks\.completed_by/)

    // Left as this file found it, the refusal above having changed nothing.
    await db.execute(sql`DELETE FROM tasks WHERE folder_id = ${folderId}::uuid`)
    await cleanupUsers(db, [departing])
    await cleanupUsers(db, [survivor])
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

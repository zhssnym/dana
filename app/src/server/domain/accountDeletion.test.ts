/*
The 8.10 transaction's steps 1 to 6, driven directly.

This file exists because of where the seam falls. The acceptance criteria that
own these steps, AC-133 to AC-138, all arrive through DELETE /me, whose route
is the Security engineer's and still runs the P1 stub's steps 7 and 8 alone;
the call swap is that role's session, placed after this one by the RFC 0001 P5
row. So on the tree this package commits, the function below is reachable from
no acceptance test at all, and shipping it uncovered until a later session
wires it would be shipping it unmeasured.

What is checked here is the end state of one deletion over a fixture shaped to
exercise every step at once, plus the two orderings that make the transaction
safe rather than merely correct-looking: the transfer runs before the deletion,
so a folder with other members survives instead of cascading away, and nothing
is left owning a folder, which is what keeps 4.3's RESTRICT tripwire from
firing on step 7's scrub.

The caller's transaction is this file's too, the shape the seam fixes: the
function opens nothing, so the test opens one, and a route will later open the
same one around steps 7 and 8.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/helpers.js'
import { deleteAccountData } from './accountDeletion.js'
import { inTransaction } from '../database.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

async function seedUser(label: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`del-${label}-${randomUUID()}`},
                ${`${label}-${randomUUID()}@account-deletion.test`},
                ${`Deletion ${label}`})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(
  ownerId: string,
  name: string,
  options: { isDefault?: boolean } = {},
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name, is_default)
        VALUES (${ownerId}::uuid, ${name}, ${options.isDefault ?? false})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await joinFolder(folderId, ownerId)
  return folderId
}

async function joinFolder(folderId: string, userId: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${userId}::uuid)`,
  )
}

async function seedTask(
  folderId: string,
  createdBy: string,
  assigneeId: string | null,
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'deletion fixture'},
                ${assigneeId}::uuid, ${createdBy}::uuid)
        RETURNING id`,
  )
  return String(found[0]?.id)
}

async function seedInvite(
  inviterId: string,
  options: { folderId?: string; status?: string } = {},
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO invites (inviter_id, email, folder_id, status)
        VALUES (${inviterId}::uuid,
                ${`invitee-${randomUUID()}@account-deletion.test`},
                ${options.folderId ?? null}::uuid,
                ${options.status ?? 'pending'})
        RETURNING id`,
  )
  return String(found[0]?.id)
}

async function connect(a: string, b: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid))
  `)
}

async function scalar(statement: ReturnType<typeof sql>): Promise<unknown> {
  const found = await rows(db, statement)
  return found[0] === undefined ? undefined : Object.values(found[0])[0]
}

interface Fixture {
  departing: string
  survivor: string
  bystander: string
  transferredFolder: string
  soloFolder: string
  defaultFolder: string
  guestFolder: string
  soloTask: string
  transferredTask: string
  guestTask: string
  guestUnassignedTask: string
  pendingInvite: string
  declinedInvite: string
  soloFolderInvite: string
  towardDeparting: string
}

let fixture: Fixture | undefined

/*
One account holding every shape step 1 to 6 must handle: invites of two
statuses plus one merely addressed to it, an owned folder with another member
(transfers), an owned folder without one and a default folder (both die), a
membership in somebody else's folder that drops that folder to a single
member (R-CLEAN with its INV-5 sweep), two connections of which one is not
theirs, and a My Day entry in a folder that survives.
*/
async function seedFixture(): Promise<Fixture> {
  const departing = await seedUser('departing')
  const survivor = await seedUser('survivor')
  const bystander = await seedUser('bystander')

  await connect(departing, survivor)
  await connect(survivor, bystander)

  const transferredFolder = await seedFolder(departing, 'shared, outlives')
  await joinFolder(transferredFolder, survivor)
  const transferredTask = await seedTask(transferredFolder, departing, departing)

  const soloFolder = await seedFolder(departing, 'nobody else, dies')
  const soloTask = await seedTask(soloFolder, departing, departing)

  const defaultFolder = await seedFolder(departing, 'Inbox', { isDefault: true })

  const guestFolder = await seedFolder(survivor, "survivor's own")
  await joinFolder(guestFolder, departing)
  const guestTask = await seedTask(guestFolder, survivor, departing)
  const guestUnassignedTask = await seedTask(guestFolder, survivor, null)

  // A My Day entry on a task whose folder survives and whose membership the
  // sweep removes: step 4 takes this one, which is what leaves step 6 with
  // the remainder it is named for.
  await db.execute(sql`
    INSERT INTO my_day_entries (task_id, user_id, added_on)
    VALUES (${guestTask}::uuid, ${departing}::uuid, current_date)
  `)
  await db.execute(sql`
    INSERT INTO my_day_entries (task_id, user_id, added_on)
    VALUES (${guestTask}::uuid, ${survivor}::uuid, current_date)
  `)

  return {
    departing,
    survivor,
    bystander,
    transferredFolder,
    soloFolder,
    defaultFolder,
    guestFolder,
    soloTask,
    transferredTask,
    guestTask,
    guestUnassignedTask,
    pendingInvite: await seedInvite(departing, {
      folderId: transferredFolder,
    }),
    declinedInvite: await seedInvite(departing, { status: 'declined' }),
    soloFolderInvite: await seedInvite(departing, { folderId: soloFolder }),
    towardDeparting: await seedInvite(bystander),
  }
}

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
  fixture = await seedFixture()
  const it = fixture
  await inTransaction(db, async (tx) => {
    await deleteAccountData(tx, it.departing)
  })
}, 60_000)

afterAll(async () => {
  for (const id of seededUsers) {
    await db.execute(sql`DELETE FROM my_day_entries WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM invites WHERE inviter_id = ${id}`)
    await db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM connections
                          WHERE user_a_id = ${id} OR user_b_id = ${id}`)
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
  await client.close()
})

function staged(): Fixture {
  if (fixture === undefined) throw new Error('the fixture must be seeded')
  return fixture
}

describe('8.10 steps 1 to 6, inside the caller\'s transaction', () => {
  test('step 1: pending sent invites are invalidated, and nothing else is', async () => {
    const it = staged()
    expect(
      await scalar(
        sql`SELECT status FROM invites WHERE id = ${it.pendingInvite}`,
      ),
      'the pending invite the account had offered is invalidated, 5.2\'s terminal state for this transition',
    ).toBe('invalidated')
    expect(
      await scalar(
        sql`SELECT responded_at FROM invites WHERE id = ${it.pendingInvite}`,
      ),
      'with responded_at set, which 4.9 gives to any terminal transition',
    ).not.toBeNull()
    expect(
      await scalar(
        sql`SELECT status FROM invites WHERE id = ${it.declinedInvite}`,
      ),
      'an already-terminal invite is not re-terminal: step 1 names pending ones',
    ).toBe('declined')
    expect(
      await scalar(
        sql`SELECT status FROM invites WHERE id = ${it.towardDeparting}`,
      ),
      'and an invite merely addressed to this account keeps waiting: the sweep is by inviter, never by email',
    ).toBe('pending')
  })

  test('step 2: a folder with another member survives under 8.9\'s heir', async () => {
    const it = staged()
    expect(
      await scalar(
        sql`SELECT owner_id FROM folders WHERE id = ${it.transferredFolder}`,
      ),
      'the remaining member takes the folder rather than losing it (spec 8.9)',
    ).toBe(it.survivor)
    expect(
      await scalar(sql`SELECT id FROM tasks WHERE id = ${it.transferredTask}`),
      'and its work survives with it: a transfer is not a deletion',
    ).toBe(it.transferredTask)
  })

  test('step 3: the default folder and the sole-member folder are gone with their load', async () => {
    const it = staged()
    for (const [label, folderId] of [
      ['the default folder, which INV-2 never lets transfer', it.defaultFolder],
      ['the folder nobody else was in', it.soloFolder],
    ] as const) {
      expect(
        await scalar(sql`SELECT id FROM folders WHERE id = ${folderId}`),
        `${label} is deleted (spec 8.10 step 3)`,
      ).toBeUndefined()
    }
    expect(
      await scalar(sql`SELECT id FROM tasks WHERE id = ${it.soloTask}`),
      'the 8.8 cascade took its tasks',
    ).toBeUndefined()
    expect(
      await scalar(
        sql`SELECT id FROM invites WHERE id = ${it.soloFolderInvite}`,
      ),
      'and the pending invite carrying it is removed by the FK cascade of 5.2\'s folder-deleted row, not invalidated: invalidation is for rows that survive',
    ).toBeUndefined()
  })

  test('step 4: guest memberships leave as a clean leave would', async () => {
    const it = staged()
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM folder_members
             WHERE user_id = ${it.departing}`,
      ),
      'no membership of the account remains anywhere',
    ).toBe(0)
    expect(
      await scalar(sql`SELECT assignee_id FROM tasks WHERE id = ${it.guestTask}`),
      'R-CLEAN unassigned the leaver\'s task, and the folder then held exactly one member, so INV-5\'s sweep gave it to them (spec 5.3)',
    ).toBe(it.survivor)
    expect(
      await scalar(
        sql`SELECT assignee_id FROM tasks WHERE id = ${it.guestUnassignedTask}`,
      ),
      'the same sweep takes the task that was never theirs (INV-5)',
    ).toBe(it.survivor)
    expect(
      await scalar(sql`SELECT id FROM tasks WHERE id = ${it.guestTask}`),
      'and removal never deletes a task (spec 8.8)',
    ).toBe(it.guestTask)
  })

  test('steps 5 and 6: rosters and My Day entries are empty of the account', async () => {
    const it = staged()
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM connections
             WHERE user_a_id = ${it.departing} OR user_b_id = ${it.departing}`,
      ),
      'every connection row containing the account is deleted outright (spec 4.2)',
    ).toBe(0)
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM connections
             WHERE user_a_id = least(${it.survivor}::uuid, ${it.bystander}::uuid)
               AND user_b_id = greatest(${it.survivor}::uuid, ${it.bystander}::uuid)`,
      ),
      'while two survivors\' own pair is untouched: the sweep is by user, not by table',
    ).toBe(1)
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM my_day_entries
             WHERE user_id = ${it.departing}`,
      ),
      'and no My Day entry of the account survives, whichever step reached each one',
    ).toBe(0)
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM my_day_entries
             WHERE user_id = ${it.survivor}`,
      ),
      'the survivor\'s own pull on the same task stands (INV-12)',
    ).toBe(1)
  })

  test('the account owns nothing, which is what step 7 needs to be able to run', async () => {
    const it = staged()
    expect(
      await scalar(
        sql`SELECT count(*)::int FROM folders WHERE owner_id = ${it.departing}`,
      ),
      '4.3 makes folders.owner_id RESTRICT, so the whole ordering of 8.10 exists to leave this at zero before the row is touched',
    ).toBe(0)
    expect(
      await scalar(sql`SELECT id FROM users WHERE id = ${it.departing}`),
      'and the row itself is still here: steps 1 to 6 delete no user, the scrub is step 7 and the auth module\'s',
    ).toBe(it.departing)
  })
})

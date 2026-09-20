/*
The zone sync's own tests, for the three properties the acceptance criteria
cannot reach from outside.

AC-007 owns the column, AC-086 owns the instants moving through both doors, and
AC-154 owns which states the trigger may touch. None of them is repeated here.
What this file pins is beneath the wire, and each case is a defect that would
leave every one of those criteria green:

- The recompute runs behind the write. 8.6's engine reads the current row
  through a join rather than taking a zone, so a call placed before the UPDATE
  computes every instant in the zone the request is replacing and records the
  answer as fresh. Nothing about that fails loudly, and the criteria could not
  see it if their fixtures ever stopped changing zones.
- The column and the instants commit together. Two statements in two
  transactions pass every criterion, because nothing they drive faults between
  them; what it costs is an account left in a new zone with every reminder still
  computed for the old one, which no request can then repair, the zone already
  matching what the next login reports.
- An uncomputable row is reported, never thrown. Frozen 7.1 declines to fail
  sign-in over a zone problem, and the row this needs (a reminder on a task with
  no due_date) is one 8.4's cascade makes unreachable over HTTP, so the suite
  cannot construct the case at all.

Zones are Asia/Karachi (+05:00), Pacific/Honolulu (-10:00) and Africa/Nairobi
(+03:00), none of which observes DST, so every difference measured here is a
zone difference and no fixture predicts a transition (section 13 item 25). Due
dates are thirty days out so the instants stay future and the rows stay
scheduled, which is the state the trigger is scoped to.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { inTransaction } from '../database.js'
import { writeTimezone } from './timezone-sync.js'

let dbClient: DbClient
let db: Db
const created: string[] = []

const KARACHI = 'Asia/Karachi'
const HONOLULU = 'Pacific/Honolulu'
const NAIROBI = 'Africa/Nairobi'

/** A YYYY-MM-DD thirty days out, so 12:00 local on it is comfortably future in
 * every zone here and a recomputed row stays scheduled. */
const DUE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
/** 12:00 on DUE, in the two zones a case reads an instant back in. Nairobi is
 * the zone of the write that gets rolled back, so no instant is ever computed
 * in it. */
const IN_KARACHI = `${DUE}T07:00:00.000Z`
const IN_HONOLULU = `${DUE}T22:00:00.000Z`

async function seedUser(timezone: string): Promise<string> {
  const sub = `tz-sync-${randomUUID()}`
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name, timezone)
        VALUES (${sub}, ${`${sub}@tz-sync.test`}, ${'Zone fixture'}, ${timezone})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  created.push(id)
  return id
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${'zone sync'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${folderId}::uuid, ${ownerId}::uuid, 'full_control')`,
  )
  return folderId
}

/**
 * A task assigned to its creator carrying a scheduled reminder at the due
 * instant, whose fire_at is already the correct answer for the assignee's
 * current zone. A recompute that ran against the replaced zone therefore leaves
 * the row exactly as it found it, which is what makes the ordering case
 * measurable rather than a coincidence.
 */
async function remindedTask(
  ownerId: string,
  folderId: string,
  fireAt: string,
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, due_date, due_time, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'zone sync fixture'}, ${DUE}::date,
                ${'12:00'}::time, ${ownerId}::uuid, ${ownerId}::uuid)
        RETURNING id`,
  )
  const taskId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, 0, NULL, ${fireAt}::timestamptz,
                'scheduled', NULL, ${ownerId}::uuid)`,
  )
  return taskId
}

/**
 * The row 8.4's cascade exists to prevent: a reminder whose task carries no
 * due_date, and so nothing for either arm of 8.6's computation to work from.
 *
 * It takes the time_of_day mode because that is the only one the table admits
 * here. 4.11's tasks_due_time_requires_date_check refuses a due_time without a
 * date, and reminders_mode_check requires exactly one of the two columns, so an
 * offset reminder cannot be written on a dateless task at all.
 */
async function datelessRemindedTask(
  ownerId: string,
  folderId: string,
  fireAt: string,
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'dateless fixture'}, ${ownerId}::uuid,
                ${ownerId}::uuid)
        RETURNING id`,
  )
  const taskId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, NULL, ${'12:00'}::time, ${fireAt}::timestamptz,
                'scheduled', NULL, ${ownerId}::uuid)`,
  )
  return taskId
}

async function fireAtOf(taskId: string): Promise<string> {
  const found = await rows(
    db,
    sql`SELECT to_char(fire_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS fire_at
          FROM reminders WHERE task_id = ${taskId}::uuid`,
  )
  return String(found[0]?.fire_at)
}

async function zoneOf(userId: string): Promise<string> {
  const found = await rows(
    db,
    sql`SELECT timezone FROM users WHERE id = ${userId}`,
  )
  return String(found[0]?.timezone)
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

describe('writeTimezone (8.1 and 8.6: the write, then the fifth trigger)', () => {
  test('the recompute reads the zone this call wrote, not the one it replaced', async () => {
    const userId = await seedUser(KARACHI)
    const folderId = await seedFolder(userId)
    const taskId = await remindedTask(userId, folderId, IN_KARACHI)

    const outcome = await inTransaction(db, (tx) =>
      writeTimezone(tx, userId, HONOLULU),
    )

    expect(
      await fireAtOf(taskId),
      'the recompute must run behind the write. Called before it, the engine reads Asia/Karachi through its join and rewrites the instant it already held, which is the one failure of this module that reports success',
    ).toBe(IN_HONOLULU)
    expect(
      outcome.recomputed.map((row) => row.taskId),
      'and the row is reported as recomputed, once',
    ).toEqual([taskId])
    expect(
      outcome.recomputed[0]?.state,
      '8.6: an instant still in the future leaves the row scheduled',
    ).toBe('scheduled')
  })

  test('the column and the instants commit together', async () => {
    const userId = await seedUser(KARACHI)
    const folderId = await seedFolder(userId)
    const taskId = await remindedTask(userId, folderId, IN_KARACHI)

    // A fault after both statements and before the commit, which is the shape
    // any later work in the same transaction could take.
    await expect(
      inTransaction(db, async (tx) => {
        await writeTimezone(tx, userId, NAIROBI)
        throw new Error('a fault after the sync, inside the same transaction')
      }),
    ).rejects.toThrow('a fault after the sync')

    expect(
      await zoneOf(userId),
      'the write is the caller transaction\'s to lose',
    ).toBe(KARACHI)
    expect(
      await fireAtOf(taskId),
      'and the instants go back with it. Split across two transactions, this leaves an account in a zone whose reminders were computed for the previous one, and no later login repairs it because the column already matches what the device reports',
    ).toBe(IN_KARACHI)
  })

  test('a row the engine cannot compute is reported, and the sync still lands', async () => {
    const userId = await seedUser(KARACHI)
    const folderId = await seedFolder(userId)
    // 4.8 calls a reminder on a dateless task impossible and 8.4's cascade is
    // what makes it so, which is why no request can build this fixture and no
    // acceptance criterion can hold this module to an answer for it.
    const dateless = await datelessRemindedTask(userId, folderId, IN_KARACHI)
    const computable = await remindedTask(userId, folderId, IN_KARACHI)

    const outcome = await inTransaction(db, (tx) =>
      writeTimezone(tx, userId, HONOLULU),
    )

    expect(
      outcome.unresolved.map((row) => row.taskId),
      'the malformed row is named rather than thrown over. Frozen 7.1 refuses to fail sign-in over a zone problem, and one uncomputable reminder taking down every login for the account would be that refusal defeated through another door',
    ).toEqual([dateless])
    expect(
      await zoneOf(userId),
      'so the write stands: the transaction commits',
    ).toBe(HONOLULU)
    expect(
      await fireAtOf(computable),
      'and every row the engine could compute moved, the unresolved one costing only itself',
    ).toBe(IN_HONOLULU)
    expect(
      await fireAtOf(dateless),
      'while the row with nothing to compute from is left as it was found',
    ).toBe(IN_KARACHI)
  })
})

/*
A unit test of the P3 harness readers, not an acceptance criterion. Protocol
section 8 puts unit tests inside a module with that module's owner, and
tasks-harness.ts is this role's.

It exists because of a defect this suite could not see. The readers took
date and instant columns straight from the driver, and the two backends
disagree about what that hands to JS: PGlite returns the string Postgres
printed, node-postgres parses OID 1082 and OID 1184 into a JS Date. Under
that divergence, three criterion files compared "Mon Aug 24" against a 4.11
date and would have failed on the postgres:18 leg alone, while every
"a no-op wrote nothing" assertion in the package compared instants at the
one-second resolution of Date.prototype.toString and would have passed no
matter what was written inside that second. The first is a red on the leg
11.10 makes the authority; the second is a green that asserts nothing, and
this file exists mostly for the second.

The repair is in the readers: the database prints every temporal value
through to_char, which answers text on both backends. What this file adds
is the guard that the repair holds. It runs on both CI legs, so if a reader
ever goes back to handing a driver-typed value to a test, one attributable
failure says so here rather than twenty scattered ones saying something
else in twenty criterion files, or worse, nothing at all.

Everything here is seeded and read directly. No route is involved, which is
why this file is meaningful before the P3 surface is mounted.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../db/client.js'
import { cleanupAuthUsers } from './auth-harness.js'
import { seedTask } from './folders-harness.js'
import { createTestDb, rows } from './helpers.js'
import {
  myDayAddedOn,
  myDayRows,
  reminderRow,
  requireTaskRow,
  seedOffsetReminder,
  stepRows,
} from './tasks-harness.js'

/** 4.11's floating calendar date. */
const DATE = /^\d{4}-\d{2}-\d{2}$/
/** 4.11's floating wall-clock time, rendered at second precision. */
const TIME = /^\d{2}:\d{2}:\d{2}$/
/** A UTC instant keeping all six digits Postgres stores. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

let client: DbClient
let userId: string
let folderId: string
let taskId: string

beforeAll(async () => {
  client = await createTestDb()
  const db = client.db

  userId = String(
    (
      await rows(
        db,
        sql`INSERT INTO users (google_sub, email, display_name)
            VALUES (${`harness-${randomUUID()}`},
                    ${`harness-${randomUUID()}@p3-harness.test`}, ${'Harness'})
            RETURNING id`,
      )
    )[0]?.id,
  )
  folderId = String(
    (
      await rows(
        db,
        sql`INSERT INTO folders (owner_id, name, is_default)
            VALUES (${userId}::uuid, ${'harness'}, ${false}) RETURNING id`,
      )
    )[0]?.id,
  )
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${userId}::uuid)`,
  )
  taskId = await seedTask(db, {
    folderId,
    createdBy: userId,
    assigneeId: userId,
    dueDate: '2026-08-24',
    dueTime: '17:00',
  })
  await seedOffsetReminder(db, taskId, userId, 30)
  await db.execute(
    sql`INSERT INTO steps (task_id, title, position)
        VALUES (${taskId}::uuid, ${'a step'}, ${1})`,
  )
  await db.execute(
    sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
        VALUES (${taskId}::uuid, ${userId}::uuid, ${'2026-08-24'}::date)`,
  )
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await cleanupAuthUsers(client.db, [userId])
  await client.close()
})

describe('the P3 harness reads every temporal column as 4.11 text', () => {
  test('taskRow renders the floating date and time', async () => {
    const row = await requireTaskRow(client.db, taskId)
    expect(
      row.due_date,
      `due_date must reach a test as a 4.11 calendar date on either backend, never a driver Date; got ${JSON.stringify(row.due_date)}`,
    ).toMatch(DATE)
    expect(row.due_date, 'and it is the date that was stored').toBe('2026-08-24')
    expect(
      row.due_time,
      `due_time must reach a test as a 4.11 wall-clock time; got ${JSON.stringify(row.due_time)}`,
    ).toMatch(TIME)
    expect(row.due_time, 'and it is the time that was stored').toBe('17:00:00')
  })

  test('taskRow renders every instant at microsecond precision', async () => {
    const row = await requireTaskRow(client.db, taskId)
    expect(
      row.created_at,
      `created_at must reach a test as a UTC instant with all six digits; got ${JSON.stringify(row.created_at)}`,
    ).toMatch(INSTANT)
    expect(row.updated_at, 'the same for updated_at').toMatch(INSTANT)
    expect(
      Number.isNaN(Date.parse(String(row.created_at))),
      'and the format the readers emit must still parse as a date in JS, which AC-035 and AC-036 rely on',
    ).toBe(false)
  })

  test('a write smaller than a millisecond is visible through the reader', async () => {
    // The point of the whole repair. Date.prototype.toString has one-second
    // resolution and toISOString truncates at the millisecond, so under
    // either an operation that takes microseconds could rewrite a row while
    // every "a no-op wrote nothing" assertion in this package went on
    // passing. Two instants one microsecond apart are the smallest thing
    // those assertions must be able to see.
    const base = '2026-08-05 09:23:13.123456+00'
    const nudged = '2026-08-05 09:23:13.123457+00'
    await client.db.execute(
      sql`UPDATE tasks SET updated_at = ${base}::timestamptz WHERE id = ${taskId}`,
    )
    const before = await requireTaskRow(client.db, taskId)
    await client.db.execute(
      sql`UPDATE tasks SET updated_at = ${nudged}::timestamptz WHERE id = ${taskId}`,
    )
    const after = await requireTaskRow(client.db, taskId)

    expect(
      String(after.updated_at),
      'one microsecond of movement must fail an equality of updated_at, or the no-op assertions of this package assert nothing',
    ).not.toBe(String(before.updated_at))
    expect(before.updated_at, 'and the earlier read is the earlier instant').toBe(
      '2026-08-05T09:23:13.123456Z',
    )
    expect(after.updated_at, 'rendered in UTC whatever the session zone').toBe(
      '2026-08-05T09:23:13.123457Z',
    )
  })

  test('the My Day, step, and reminder readers render theirs too', async () => {
    expect(
      await myDayAddedOn(client.db, taskId, userId),
      'added_on is what AC-044 compares against a 4.11 date it computed itself',
    ).toBe('2026-08-24')

    const entries = await myDayRows(client.db, taskId)
    expect(entries.length, 'the seeded entry is there').toBe(1)
    expect(String(entries[0]?.added_on), 'and it renders the same way').toMatch(
      DATE,
    )

    const steps = await stepRows(client.db, taskId)
    expect(steps.length, 'the seeded step is there').toBe(1)
    expect(
      String(steps[0]?.created_at),
      'a step timestamp is a temporal column like any other',
    ).toMatch(INSTANT)

    const reminder = await reminderRow(client.db, taskId)
    expect(reminder, 'the seeded reminder is there').toBeDefined()
    expect(
      String((reminder as Record<string, unknown>).fire_at),
      'fire_at is the column P7 will read, and it renders now rather than later',
    ).toMatch(INSTANT)
    expect(
      (reminder as Record<string, unknown>).time_of_day,
      'to_char leaves a null column null, so the 4.8 mode check still reads true',
    ).toBeNull()
  })

  test('a null temporal column stays null through every reader', async () => {
    const undatedId = await seedTask(client.db, {
      folderId,
      createdBy: userId,
      assigneeId: userId,
    })
    const row = await requireTaskRow(client.db, undatedId)
    expect(row.due_date, 'to_char(NULL) is NULL, not the string "null"').toBeNull()
    expect(row.due_time, 'the same for the time').toBeNull()
    expect(row.completed_at, 'and for an instant').toBeNull()
  })
})

/*
AC-002: given inserts violating INV-6 (due_time without due_date) or INV-8
(completed without completed_at), when attempted, then the database rejects
them.

Section 4.5 realizes both invariants as CHECK constraints. INV-6 also covers
recurrence_rule, so that leg is exercised alongside due_time, with INV-13's
series requirement as a neighbor probe. INV-8 is a biconditional, so the
reverse direction (completion evidence on a non-completed row) and the
UPDATE path are attacked too: a guard that only screened inserts would let
an update smuggle the same corruption in. Every doomed statement satisfies
all other constraints, so each rejection is attributable to the named guard,
and every rejection is followed by a row count proving nothing persisted.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import { cleanupUsers, createTestDb, expectRejectedBy, rows } from '../support/helpers.js'

let client: DbClient
const userId = randomUUID()
const folderId = randomUUID()

// Cold PGlite instances compile WASM, and parallel workers all do it at
// once, so setup gets far more than the default hook timeout.
beforeAll(async () => {
  client = await createTestDb()
  await client.db.execute(sql`INSERT INTO users (id) VALUES (${userId})`)
  await client.db.execute(sql`
    INSERT INTO folders (id, owner_id, name) VALUES (${folderId}, ${userId}, 'AC-002 fixtures')
  `)
}, 60_000)

afterAll(async () => {
  // Setup can fail before assignment; a missing client must not bury the
  // original failure under a TypeError.
  if ((client as DbClient | undefined) === undefined) return
  await cleanupUsers(client.db, [userId])
  await client.close()
})

async function taskCount(): Promise<number> {
  const result = await rows(
    client.db,
    sql`SELECT count(*)::int AS n FROM tasks WHERE folder_id = ${folderId}`,
  )
  return Number(result[0]?.n)
}

async function expectInsertRejectedBy(
  insert: ReturnType<typeof sql>,
  constraintName: string,
): Promise<void> {
  const before = await taskCount()
  await expectRejectedBy(() => client.db.execute(insert), constraintName)
  expect(await taskCount(), 'a rejected insert must persist nothing').toBe(before)
}

describe('AC-002: the database rejects rows violating INV-6 and INV-8', () => {
  test('AC-002: due_time without due_date is rejected (INV-6)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, due_date, due_time)
        VALUES (${folderId}, 'Timed but dateless', ${userId}, NULL, '09:00')
      `,
      'tasks_due_time_requires_date_check',
    )
  })

  test('AC-002: recurrence_rule without due_date is rejected (INV-6)', async () => {
    // series_id is supplied so the only violated constraint is the date one.
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, due_date, recurrence_rule, series_id)
        VALUES (${folderId}, 'Recurring but dateless', ${userId}, NULL, 'FREQ=DAILY', ${randomUUID()})
      `,
      'tasks_recurrence_requires_date_check',
    )
  })

  test('AC-002 adversarial: recurrence_rule without series_id is rejected (INV-13)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, due_date, recurrence_rule, series_id)
        VALUES (${folderId}, 'Recurring but seriesless', ${userId}, '2026-08-03', 'FREQ=DAILY', NULL)
      `,
      'tasks_recurrence_requires_series_check',
    )
  })

  test('AC-002: completed status without completed_at is rejected (INV-8)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, status, completed_at, completed_by)
        VALUES (${folderId}, 'Completed without instant', ${userId}, 'completed', NULL, ${userId})
      `,
      'tasks_completed_at_check',
    )
  })

  test('AC-002: completed status without completed_by is rejected (INV-8)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, status, completed_at, completed_by)
        VALUES (${folderId}, 'Completed without actor', ${userId}, 'completed', now(), NULL)
      `,
      'tasks_completed_by_check',
    )
  })

  test('AC-002 adversarial: completed_at on a pending row is rejected (INV-8 is a biconditional)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, status, completed_at)
        VALUES (${folderId}, 'Pending with instant', ${userId}, 'pending', now())
      `,
      'tasks_completed_at_check',
    )
  })

  test('AC-002 adversarial: completed_by on a pending row is rejected (INV-8 is a biconditional)', async () => {
    await expectInsertRejectedBy(
      sql`
        INSERT INTO tasks (folder_id, title, created_by, status, completed_by)
        VALUES (${folderId}, 'Pending with actor', ${userId}, 'pending', ${userId})
      `,
      'tasks_completed_by_check',
    )
  })

  test('AC-002 adversarial: the UPDATE path is guarded too', async () => {
    const taskId = randomUUID()
    await client.db.execute(sql`
      INSERT INTO tasks (id, folder_id, title, created_by)
      VALUES (${taskId}, ${folderId}, 'Round trip', ${userId})
    `)
    // Both halves of INV-8 fail at once here, and constraint evaluation
    // order is unspecified, so the fragment names the shared prefix.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`UPDATE tasks SET status = 'completed' WHERE id = ${taskId}`,
        ),
      'tasks_completed_',
    )
    await client.db.execute(sql`
      UPDATE tasks
      SET status = 'completed', completed_at = now(), completed_by = ${userId}
      WHERE id = ${taskId}
    `)
    await client.db.execute(sql`
      UPDATE tasks
      SET status = 'pending', completed_at = NULL, completed_by = NULL
      WHERE id = ${taskId}
    `)
    const final = await rows(
      client.db,
      sql`SELECT status, completed_at, completed_by FROM tasks WHERE id = ${taskId}`,
    )
    expect(final[0]).toEqual({
      status: 'pending',
      completed_at: null,
      completed_by: null,
    })
  })

  test('AC-002 positive control: the legal forms insert', async () => {
    // Proves the rejections above come from the named guards, not from some
    // unrelated breakage that fails every insert: INV-6 is one-directional
    // (a date without a time is fine), and a full completion satisfies both
    // halves of INV-8.
    const before = await taskCount()
    await client.db.execute(sql`
      INSERT INTO tasks (folder_id, title, created_by, due_date)
      VALUES (${folderId}, 'Dated all-day task', ${userId}, '2026-08-03')
    `)
    await client.db.execute(sql`
      INSERT INTO tasks (folder_id, title, created_by, status, completed_at, completed_by)
      VALUES (${folderId}, 'Properly completed', ${userId}, 'completed', now(), ${userId})
    `)
    expect(await taskCount()).toBe(before + 2)
  })
})

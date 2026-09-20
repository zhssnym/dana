/*
5.1's G-SERIES guard, against a real database.

Each of the three branches is built as the state it describes rather than as
a state that resembles it, which is the trap AC-080's header records: an
occurrence whose successor is completed is reachable two ways, and only the
one with no pending row anywhere in the series is the refusal.

The guard writes and refuses; it never transitions. The caller's own guarded
UPDATE does that, after this returns, in the same transaction, so every case
below asserts the statuses are untouched.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import { inTransaction } from '../database.js'

import { applySeriesGuard, SERIES_MOVED_ON } from './series-guard.js'
import type { SeriesGuardOutcome } from './series-guard.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

const RULE = 'FREQ=WEEKLY;BYDAY=MO'

async function seedUser(): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`guard-${randomUUID()}`}, ${`${randomUUID()}@series-guard.test`},
                ${'Guard fixture'})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${'guard'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${folderId}::uuid, ${ownerId}::uuid, 'full_control')`,
  )
  return folderId
}

interface Series {
  ownerId: string
  folderId: string
  seriesId: string | null
}

async function seedSeries(withSeries = true): Promise<Series> {
  const ownerId = await seedUser()
  return {
    ownerId,
    folderId: await seedFolder(ownerId),
    seriesId: withSeries ? randomUUID() : null,
  }
}

interface RowOptions {
  dueDate: string
  status: string
  rule?: string | null
  steps?: readonly string[]
}

async function seedRow(series: Series, options: RowOptions): Promise<string> {
  const completed = options.status === 'completed'
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, due_date, recurrence_rule,
                           series_id, assignee_id, created_by, status,
                           completed_at, completed_by)
        VALUES (${series.folderId}::uuid, ${`occurrence ${options.dueDate}`},
                ${options.dueDate}::date, ${options.rule ?? null},
                ${series.seriesId}::uuid, ${series.ownerId}::uuid,
                ${series.ownerId}::uuid, ${options.status},
                ${completed ? '2026-07-27T09:00:00Z' : null}::timestamptz,
                ${completed ? series.ownerId : null}::uuid)
        RETURNING id`,
  )
  const taskId = String(found[0]?.id)
  let position = 1
  for (const title of options.steps ?? []) {
    await db.execute(
      sql`INSERT INTO steps (task_id, title, position)
          VALUES (${taskId}::uuid, ${title}, ${position})`,
    )
    position += 1
  }
  return taskId
}

async function guard(taskId: string): Promise<SeriesGuardOutcome> {
  return inTransaction(db, async (tx) => applySeriesGuard(tx, taskId))
}

async function readTask(
  id: string,
): Promise<{ status: string; recurrence_rule: string | null } | undefined> {
  const found = await rows(
    db,
    sql`SELECT status, recurrence_rule FROM tasks WHERE id = ${id}::uuid`,
  )
  return found[0] as { status: string; recurrence_rule: string | null } | undefined
}

/** created_at is the ordering 5.1's second branch reads, and a fixture that
 * seeds two rows milliseconds apart is asserting the clock rather than the
 * rule. Setting it makes the order the case's own statement. */
async function setCreatedAt(taskId: string, at: string): Promise<void> {
  await db.execute(
    sql`UPDATE tasks SET created_at = ${at}::timestamptz WHERE id = ${taskId}::uuid`,
  )
}

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  for (const id of seededUsers) {
    await db.execute(sql`DELETE FROM my_day_entries WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
  await client.close()
})

describe('the first branch: a pending successor exists', () => {
  test('it is deleted, and its rule comes back to this row', async () => {
    const series = await seedSeries()
    const closed = await seedRow(series, {
      dueDate: '2026-07-20',
      status: 'completed',
    })
    // The successor carries a rule the closed row never held, which is what
    // makes "copy S.recurrence_rule back" different from "restore what this
    // row used to have": an edit mid-series lives on the successor.
    const successor = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'pending',
      rule: 'FREQ=WEEKLY;BYDAY=TU',
      steps: ['a step of the next occurrence'],
    })
    await setCreatedAt(closed, '2026-07-01T09:00:00Z')
    await setCreatedAt(successor, '2026-07-20T09:00:00Z')

    const outcome = await guard(closed)
    expect(outcome).toEqual({
      kind: 'reclaimed',
      deletedSuccessorId: successor,
      rule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    expect(await readTask(successor), '5.1 deletes it rather than folding it back').toBeUndefined()
    expect(
      await rows(db, sql`SELECT id FROM steps WHERE task_id = ${successor}::uuid`),
      'its steps and reminder cascade with it (4.6, 4.8)',
    ).toEqual([])
    const reopened = await readTask(closed)
    expect(reopened?.recurrence_rule, 'this row is the current occurrence again').toBe(
      'FREQ=WEEKLY;BYDAY=TU',
    )
    expect(
      reopened?.status,
      'the guard never transitions: the caller\'s own guarded UPDATE does that, after this returns',
    ).toBe('completed')
  })

  test('the successor is found across a closed row in between', async () => {
    // 5.1 says S is the pending row of the series, not the next row; the
    // guard reaches over a completed middle row to find it, which is exactly
    // why AC-080's fixture has to exclude this shape to reach the refusal.
    const series = await seedSeries()
    const oldest = await seedRow(series, {
      dueDate: '2026-07-13',
      status: 'completed',
    })
    const middle = await seedRow(series, {
      dueDate: '2026-07-20',
      status: 'completed',
    })
    const pending = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'pending',
      rule: RULE,
    })
    await setCreatedAt(oldest, '2026-07-01T09:00:00Z')
    await setCreatedAt(middle, '2026-07-13T09:00:00Z')
    await setCreatedAt(pending, '2026-07-20T09:00:00Z')

    expect(await guard(oldest)).toEqual({
      kind: 'reclaimed',
      deletedSuccessorId: pending,
      rule: RULE,
    })
    expect(await readTask(middle), 'and nothing else of the series moves').toEqual({
      status: 'completed',
      recurrence_rule: null,
    })
  })
})

describe('the second branch: no pending sibling, and this row is the newest', () => {
  test('an exhausted series reopens on its last occurrence, untouched', async () => {
    const series = await seedSeries()
    const older = await seedRow(series, {
      dueDate: '2026-07-20',
      status: 'completed',
    })
    const newest = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'completed',
      rule: `${RULE};UNTIL=20260727`,
    })
    await setCreatedAt(older, '2026-07-01T09:00:00Z')
    await setCreatedAt(newest, '2026-07-20T09:00:00Z')

    expect(await guard(newest)).toEqual({ kind: 'newest' })
    expect(
      await readTask(newest),
      '5.1: the row returns to pending keeping whatever rule it holds, and the guard writes nothing to get there',
    ).toEqual({
      status: 'completed',
      recurrence_rule: `${RULE};UNTIL=20260727`,
    })
  })

  test('a series of one row is its own newest', async () => {
    const series = await seedSeries()
    const only = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'abandoned',
      rule: RULE,
    })
    expect(await guard(only)).toEqual({ kind: 'newest' })
  })

  test('a tie on created_at is broken by id, so exactly one row is the newest', async () => {
    const series = await seedSeries()
    const first = await seedRow(series, {
      dueDate: '2026-07-20',
      status: 'completed',
    })
    const second = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'completed',
      rule: RULE,
    })
    const shared = '2026-07-20T09:00:00Z'
    await setCreatedAt(first, shared)
    await setCreatedAt(second, shared)

    const [lower, higher] = first < second ? [first, second] : [second, first]
    expect(
      (await guard(higher)).kind,
      'a total order is what keeps a tie from giving a series two current occurrences',
    ).toBe('newest')
    expect((await guard(lower)).kind).toBe('refused')
  })
})

describe('the third branch: refused', () => {
  test('an older occurrence of a series that has moved on answers 409', async () => {
    // The state AC-080 names: the successor is completed and generated
    // nothing, so no pending row exists and this row is not the newest.
    const series = await seedSeries()
    const older = await seedRow(series, {
      dueDate: '2026-07-20',
      status: 'completed',
    })
    const newer = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'completed',
      rule: `${RULE};UNTIL=20260727`,
    })
    await setCreatedAt(older, '2026-07-01T09:00:00Z')
    await setCreatedAt(newer, '2026-07-20T09:00:00Z')

    expect(await guard(older)).toEqual({
      kind: 'refused',
      message: SERIES_MOVED_ON,
    })
    expect(
      await readTask(older),
      '7.0 makes a 409 a state conflict, so a refusal that half-ran would be worse than a 200',
    ).toEqual({ status: 'completed', recurrence_rule: null })
    expect(await readTask(newer)).toEqual({
      status: 'completed',
      recurrence_rule: `${RULE};UNTIL=20260727`,
    })
  })

  test('the copy is 5.1\'s own', () => {
    expect(SERIES_MOVED_ON).toMatch(/already moved on/)
    expect(SERIES_MOVED_ON).toMatch(/latest occurrence/)
  })
})

describe('a row with no series is not guarded at all', () => {
  test('the ordinary task, which is almost every task', async () => {
    const series = await seedSeries(false)
    const plain = await seedRow(series, {
      dueDate: '2026-07-27',
      status: 'completed',
    })
    expect(await guard(plain)).toEqual({ kind: 'not_series' })
    expect(await readTask(plain)).toEqual({
      status: 'completed',
      recurrence_rule: null,
    })
  })

  test('a task that does not exist is a fault rather than a refusal', async () => {
    await expect(guard(randomUUID())).rejects.toThrow(TypeError)
  })

  test('two pending rows in one series are reported, not quietly halved', async () => {
    // Section 3 makes generation and this guard what enforces INV-7, so this
    // is one of the places the invariant lives. The state is seeded directly
    // because no path through the engine can produce it.
    const series = await seedSeries()
    const closed = await seedRow(series, {
      dueDate: '2026-07-13',
      status: 'completed',
    })
    await seedRow(series, { dueDate: '2026-07-20', status: 'pending', rule: RULE })
    await seedRow(series, { dueDate: '2026-07-27', status: 'pending', rule: RULE })
    await expect(guard(closed)).rejects.toThrow(/INV-7/)
  })
})

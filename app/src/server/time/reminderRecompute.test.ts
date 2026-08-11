/*
8.6's five recompute triggers, against a real database.

The acceptance range exercises these through PATCH /tasks/:id, PUT
/tasks/:id/reminder and the auth module's timezone sync, which are the
Collaboration engineer's and the Security engineer's and have since landed on
this branch. This file drives the callable directly, so a defect in the
arithmetic or in the state rules is reported as itself rather than as a wrong
response body two layers up.

8.5's copy is exercised both ways: generation.test.ts reaches it through
generateSuccessor, which is how a real caller reaches it and which discards its
return value, and the last block here calls it directly for the sake of that
return value, which no acceptance test can see and which the third change
control found falsified.

Every case runs inside a transaction, the way every real caller must, and
every zone here is DST-free and long stable except where a case is about a
transition, so a difference this file measures is the trigger's doing rather
than a season's.

The evaluation instant is passed rather than taken from the clock, because
"already past" is the whole of 8.6's state rule and a test that read the real
clock would assert a different sentence depending on when it ran.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/helpers.js'
import { inTransaction } from '../domain/db.js'

import {
  copyReminderToSuccessor,
  planReminder,
  recomputeReminders,
} from './reminderRecompute.js'
import type { ReminderPlan, ReminderTrigger, RecomputeOutcome } from './reminderRecompute.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

/** The moment every case measures "already past" against. */
const AT = new Date('2026-07-27T06:00:00Z')

/** Zones with no DST and rules stable for decades, so a moved instant is the
 * trigger's doing. Karachi +05:00, Honolulu -10:00, Nairobi +03:00. */
const KARACHI = 'Asia/Karachi'
const HONOLULU = 'Pacific/Honolulu'
const NAIROBI = 'Africa/Nairobi'
/** For the one case about a recompute meeting a DST rule. */
const NEW_YORK = 'America/New_York'

async function seedUser(timezone: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name, timezone)
        VALUES (${`rec-${randomUUID()}`}, ${`${randomUUID()}@recompute.test`},
                ${'Recompute fixture'}, ${timezone})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${'recompute'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${ownerId}::uuid)`,
  )
  return folderId
}

async function addMember(folderId: string, userId: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${userId}::uuid)`,
  )
}

interface TaskOptions {
  dueDate: string | null
  dueTime?: string | null
  assigneeId?: string | null
}

async function seedTask(
  folderId: string,
  creatorId: string,
  options: TaskOptions,
): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, due_date, due_time, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'a task'}, ${options.dueDate}::date,
                ${options.dueTime ?? null}::time,
                ${options.assigneeId === undefined ? creatorId : options.assigneeId}::uuid,
                ${creatorId}::uuid)
        RETURNING id`,
  )
  return String(found[0]?.id)
}

interface SeedReminder {
  offsetMinutes?: number
  timeOfDay?: string
  fireAt: string
  state?: 'scheduled' | 'sent' | 'skipped'
  firedAt?: string | null
  createdBy: string
}

async function seedReminder(taskId: string, options: SeedReminder): Promise<void> {
  const firedAt =
    options.firedAt === undefined
      ? options.state === undefined || options.state === 'scheduled'
        ? null
        : '2026-07-20T00:00:00Z'
      : options.firedAt
  await db.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, ${options.offsetMinutes ?? null},
                ${options.timeOfDay ?? null}::time,
                ${options.fireAt}::timestamptz, ${options.state ?? 'scheduled'},
                ${firedAt}::timestamptz, ${options.createdBy}::uuid)`,
  )
}

interface ReminderView {
  offset_minutes: number | null
  time_of_day: string | null
  state: string
  fired_at_set: boolean
  created_by: string
  /** Rendered in UTC rather than compared as a driver value: one backend
   * answers a Date here and the other a string. */
  fire_at: string
}

async function readReminder(taskId: string): Promise<ReminderView | undefined> {
  const found = await rows(
    db,
    sql`SELECT offset_minutes, to_char(time_of_day, 'HH24:MI') AS time_of_day,
               state, (fired_at IS NOT NULL) AS fired_at_set, created_by,
               to_char(fire_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS fire_at
          FROM reminders WHERE task_id = ${taskId}::uuid`,
  )
  return found[0] as unknown as ReminderView | undefined
}

function recompute(
  trigger: ReminderTrigger,
  at: Date = AT,
): Promise<RecomputeOutcome> {
  return inTransaction(db, async (tx) => recomputeReminders(tx, trigger, at))
}

function plan(
  taskId: string,
  createdBy: string,
  mode: { offsetMinutes?: number; timeOfDay?: string },
  at: Date = AT,
): Promise<ReminderPlan> {
  return inTransaction(db, async (tx) =>
    planReminder(tx, {
      taskId,
      offsetMinutes: mode.offsetMinutes ?? null,
      timeOfDay: mode.timeOfDay ?? null,
      createdBy,
      at,
    }),
  )
}

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  for (const id of seededUsers) {
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
  await client.close()
})

/* ------------------------------------------------------------------ *
 * planReminder: what a write path is told before a row can exist
 * ------------------------------------------------------------------ */

describe('planReminder, for the three paths that create a row', () => {
  test('the offset arm, in the assignee zone, with a future instant scheduled', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
    })
    const answer = await plan(taskId, owner, { offsetMinutes: 30 })
    expect(answer.fireAt.toISOString()).toBe('2026-07-28T09:30:00.000Z')
    expect(answer.state, '8.6: scheduled when the new instant is in the future').toBe(
      'scheduled',
    )
    expect(
      answer.firedAt,
      '4.8 sets fired_at only when state leaves scheduled, and this row has never fired',
    ).toBeNull()
  })

  test('the date-only arm', async () => {
    const owner = await seedUser(HONOLULU)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, { dueDate: '2026-07-28' })
    const answer = await plan(taskId, owner, { timeOfDay: '09:00' })
    expect(answer.fireAt.toISOString(), 'Honolulu is UTC-10 and observes no DST').toBe(
      '2026-07-28T19:00:00.000Z',
    )
  })

  test('an instant already past is skipped rather than fired retroactively', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, {
      dueDate: '2026-07-20',
      dueTime: '15:00',
    })
    const answer = await plan(taskId, owner, { offsetMinutes: 30 })
    expect(
      answer.state,
      '8.6, and frozen 7.9 as qualified on 2026-08-10: a PUT computing a past instant answers skipped',
    ).toBe('skipped')
    expect(
      answer.firedAt?.toISOString(),
      "4.8's note requires fired_at when state leaves scheduled, and 8.6 says a recompute that skips sets it",
    ).toBe(AT.toISOString())
  })

  test('an instant exactly now counts as past, matching the loop own poll', async () => {
    const owner = await seedUser('UTC')
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, { dueDate: '2026-07-27' })
    const answer = await plan(taskId, owner, { timeOfDay: '06:00' })
    expect(answer.fireAt.toISOString()).toBe(AT.toISOString())
    expect(
      answer.state,
      "8.6's poll is fire_at <= now(), so an instant equal to now would be delivered by the next tick",
    ).toBe('skipped')
  })

  test('an unassigned task falls back to the reminder creator zone', async () => {
    const owner = await seedUser(KARACHI)
    const traveller = await seedUser(HONOLULU)
    const folderId = await seedFolder(owner)
    await addMember(folderId, traveller)
    const taskId = await seedTask(folderId, traveller, {
      dueDate: '2026-07-28',
      assigneeId: null,
    })
    expect(
      (await plan(taskId, traveller, { timeOfDay: '09:00' })).fireAt.toISOString(),
      "8.6's second arm: the creator's zone when unassigned, which exists only because 4.8 makes fire_at NOT NULL",
    ).toBe('2026-07-28T19:00:00.000Z')
  })

  test('an assigned task ignores the creator zone entirely', async () => {
    const owner = await seedUser(KARACHI)
    const assignee = await seedUser(HONOLULU)
    const folderId = await seedFolder(owner)
    await addMember(folderId, assignee)
    const taskId = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      assigneeId: assignee,
    })
    expect(
      (await plan(taskId, owner, { timeOfDay: '09:00' })).fireAt.toISOString(),
      "8.6 reads the assignee's zone first, and the creator only when there is no assignee",
    ).toBe('2026-07-28T19:00:00.000Z')
  })

  test('a task with no due_date is refused rather than computed', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, { dueDate: null })
    await expect(plan(taskId, owner, { timeOfDay: '09:00' })).rejects.toThrow(
      /no due_date/,
    )
  })

  test('a task that does not exist is refused', async () => {
    const owner = await seedUser(KARACHI)
    await expect(plan(randomUUID(), owner, { timeOfDay: '09:00' })).rejects.toThrow(
      /does not exist/,
    )
  })
})

/* ------------------------------------------------------------------ *
 * The four task-scoped triggers
 * ------------------------------------------------------------------ */

describe('the four task-scoped triggers', () => {
  async function stage(options?: {
    zone?: string
    dueDate?: string
    dueTime?: string | null
    state?: 'scheduled' | 'sent' | 'skipped'
    offsetMinutes?: number
    timeOfDay?: string
  }): Promise<{ owner: string; folderId: string; taskId: string }> {
    const owner = await seedUser(options?.zone ?? KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, {
      dueDate: options?.dueDate ?? '2026-07-28',
      dueTime: options?.dueTime === undefined ? '15:00' : options.dueTime,
    })
    await seedReminder(taskId, {
      offsetMinutes:
        options?.timeOfDay === undefined ? (options?.offsetMinutes ?? 30) : undefined,
      timeOfDay: options?.timeOfDay,
      fireAt: '2020-01-01T00:00:00Z',
      state: options?.state,
      createdBy: owner,
    })
    return { owner, folderId, taskId }
  }

  test('due_date: the instant moves with the date', async () => {
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-08-04'}::date WHERE id = ${taskId}::uuid`,
    )
    const outcome = await recompute({ kind: 'due_date', taskId })
    expect(outcome.recomputed.map((row) => row.taskId)).toEqual([taskId])
    expect((await readReminder(taskId))?.fire_at).toBe('2026-08-04 09:30')
  })

  test('due_time: the instant moves with the time, which 7.6 bullets never mention', async () => {
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE tasks SET due_time = ${'09:00'}::time WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'due_time', taskId })
    expect(
      (await readReminder(taskId))?.fire_at,
      "8.6 names due_time in its trigger list where frozen 7.6's bullets name only due_date",
    ).toBe('2026-07-28 03:30')
  })

  test('reminder: the instant moves with the reminder own value', async () => {
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE reminders SET offset_minutes = ${120} WHERE task_id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'reminder', taskId })
    expect((await readReminder(taskId))?.fire_at).toBe('2026-07-28 08:00')
  })

  test('reminder: a mode change is read from the row rather than taken on trust', async () => {
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE reminders SET offset_minutes = NULL, time_of_day = ${'09:00'}::time
           WHERE task_id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'reminder', taskId })
    expect((await readReminder(taskId))?.fire_at, 'the date-only arm, on a task that also has a due_time').toBe(
      '2026-07-28 04:00',
    )
  })

  test('assignee_id: the instant is recomputed in the new assignee zone', async () => {
    const { owner, folderId, taskId } = await stage()
    const newAssignee = await seedUser(HONOLULU)
    await addMember(folderId, newAssignee)
    expect(owner).not.toBe(newAssignee)
    await db.execute(
      sql`UPDATE tasks SET assignee_id = ${newAssignee}::uuid WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'assignee_id', taskId })
    expect(
      (await readReminder(taskId))?.fire_at,
      'this is the one trigger that changes the zone rather than a local time inside one: 14:30 in Honolulu is fifteen hours from 14:30 in Karachi',
    ).toBe('2026-07-29 00:30')
  })

  test('assignee_id: unassignment falls back to the creator zone', async () => {
    const { folderId, taskId } = await stage()
    const assignee = await seedUser(HONOLULU)
    await addMember(folderId, assignee)
    await db.execute(
      sql`UPDATE tasks SET assignee_id = ${assignee}::uuid WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'assignee_id', taskId })
    expect((await readReminder(taskId))?.fire_at).toBe('2026-07-29 00:30')

    await db.execute(sql`UPDATE tasks SET assignee_id = NULL WHERE id = ${taskId}::uuid`)
    await recompute({ kind: 'assignee_id', taskId })
    expect(
      (await readReminder(taskId))?.fire_at,
      'an implementation that recomputes on assignment and leaves the old zone on unassignment keeps an instant belonging to somebody who can no longer see the task',
    ).toBe('2026-07-28 09:30')
  })

  test('a task carrying no reminder is a no-op, so a caller need not check first', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, { dueDate: '2026-07-28' })
    const outcome = await recompute({ kind: 'due_date', taskId })
    expect(outcome).toEqual({ recomputed: [], unresolved: [] })
  })

  test('one call answers a PATCH that moved several triggering columns', async () => {
    // The call reads the row as it now stands, so it is idempotent and naming
    // a second trigger would compute the same instant twice.
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-08-04'}::date, due_time = ${'09:00'}::time
           WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'due_date', taskId })
    const once = await readReminder(taskId)
    expect(once?.fire_at).toBe('2026-08-04 03:30')
    await recompute({ kind: 'due_time', taskId })
    expect((await readReminder(taskId))?.fire_at, 'and calling again changes nothing').toBe(
      '2026-08-04 03:30',
    )
  })

  test('a recompute landing in the past is skipped, never fired retroactively', async () => {
    const { taskId } = await stage()
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-07-20'}::date WHERE id = ${taskId}::uuid`,
    )
    const outcome = await recompute({ kind: 'due_date', taskId })
    expect(outcome.recomputed[0]?.state).toBe('skipped')
    const row = await readReminder(taskId)
    expect(row?.state).toBe('skipped')
    expect(row?.fired_at_set, "4.8's note: fired_at is set when state leaves scheduled").toBe(
      true,
    )
  })

  test('a delivered row is revived to scheduled, and fired_at is cleared with it', async () => {
    const { taskId } = await stage({ state: 'sent' })
    expect((await readReminder(taskId))?.fired_at_set, 'the fixture is a delivered row').toBe(
      true,
    )
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-08-04'}::date WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'due_date', taskId })
    const row = await readReminder(taskId)
    expect(
      row?.state,
      '8.6: the other four triggers change the occasion the reminder is about, and a new occasion deserves a delivery of its own',
    ).toBe('scheduled')
    expect(
      row?.fired_at_set,
      "8.6 as widened on 2026-08-10: fired_at is cleared with the revival, so 4.8's note stays true of every row",
    ).toBe(false)
  })

  test('a skipped row revives the same way, which is the half the ruling was widened for', async () => {
    const { taskId } = await stage({ state: 'skipped' })
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-08-04'}::date WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'due_date', taskId })
    const row = await readReminder(taskId)
    expect(row?.state).toBe('scheduled')
    expect(
      row?.fired_at_set,
      'a skipped row carries a fired_at like a sent one, and reviving it without clearing that column produces a scheduled row holding one, which is the single row shape the sentence exists to rule out',
    ).toBe(false)
  })

  test('nothing but the three computed columns moves', async () => {
    const { owner, taskId } = await stage()
    await db.execute(
      sql`UPDATE tasks SET due_date = ${'2026-08-04'}::date WHERE id = ${taskId}::uuid`,
    )
    await recompute({ kind: 'due_date', taskId })
    const row = await readReminder(taskId)
    expect({
      offset_minutes: row?.offset_minutes,
      time_of_day: row?.time_of_day,
      created_by: row?.created_by,
    }).toEqual({ offset_minutes: 30, time_of_day: null, created_by: owner })
  })

  test('a recompute meets the DST rules too, not only the create path', async () => {
    // A clamp written into the create path alone answers Luxon's raw shift
    // here, which is AC-151's last case one layer down.
    const { taskId } = await stage({ zone: NEW_YORK, dueDate: '2010-03-14' })
    await db.execute(
      sql`UPDATE tasks SET due_time = ${'03:00'}::time WHERE id = ${taskId}::uuid`,
    )
    const outcome = await recompute(
      { kind: 'due_time', taskId },
      new Date('2010-03-01T00:00:00Z'),
    )
    expect(outcome.recomputed[0]?.kind, '02:30 that morning exists on no instant').toBe('gap')
    expect((await readReminder(taskId))?.fire_at).toBe('2010-03-14 07:00')
  })

  test('an offset reminder whose task lost its due_time is refused, loudly', async () => {
    // 4.8 makes which mode is legal depend on the task's due_time and charges
    // the API with restating it at every write, so this shape is one the write
    // paths are required to prevent. PATCH /tasks/:id clearing due_time alone
    // is the open route to it, and what that call should do is escalated with
    // this session rather than guessed here.
    const { taskId } = await stage()
    await db.execute(sql`UPDATE tasks SET due_time = NULL WHERE id = ${taskId}::uuid`)
    await expect(recompute({ kind: 'due_time', taskId })).rejects.toThrow(
      /requires the task's due_time/,
    )
  })
})

/* ------------------------------------------------------------------ *
 * The timezone trigger, which is the narrow one
 * ------------------------------------------------------------------ */

describe('the assignee timezone trigger', () => {
  test('scheduled reminders on tasks assigned to that user recompute', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
    })
    await seedReminder(taskId, {
      offsetMinutes: 30,
      fireAt: '2026-07-28T09:30:00Z',
      createdBy: owner,
    })

    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${owner}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: owner })
    expect(outcome.recomputed.map((row) => row.taskId)).toEqual([taskId])
    expect(
      (await readReminder(taskId))?.fire_at,
      'the zone is read through the join rather than taken as a parameter, so the caller cannot hand over the value it just replaced',
    ).toBe('2026-07-29 00:30')
  })

  test('a delivered reminder is left entirely untouched', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const delivered = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
    })
    const pending = await seedTask(folderId, owner, {
      dueDate: '2026-07-29',
      dueTime: '15:00',
    })
    await seedReminder(delivered, {
      offsetMinutes: 30,
      fireAt: '2026-07-28T09:30:00Z',
      state: 'sent',
      createdBy: owner,
    })
    await seedReminder(pending, {
      offsetMinutes: 30,
      fireAt: '2026-07-29T09:30:00Z',
      createdBy: owner,
    })

    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${owner}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: owner })
    expect(
      outcome.recomputed.map((row) => row.taskId),
      'the scheduled row proves the trigger ran, which is what makes the untouched row evidence',
    ).toEqual([pending])

    const sentRow = await readReminder(delivered)
    expect(
      { state: sentRow?.state, fire_at: sentRow?.fire_at, fired: sentRow?.fired_at_set },
      '8.6 as ruled on 2026-08-10: a zone change alters neither the deadline nor the recipient, it re-expresses an unchanged occasion on a different wall clock, so reviving the row sends one person the same reminder about the same deadline twice',
    ).toEqual({ state: 'sent', fire_at: '2026-07-28 09:30', fired: true })
  })

  test('a skipped reminder is outside this trigger too', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
    })
    await seedReminder(taskId, {
      offsetMinutes: 30,
      fireAt: '2026-07-28T09:30:00Z',
      state: 'skipped',
      createdBy: owner,
    })
    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${owner}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: owner })
    expect(outcome.recomputed, "that being frozen 7.1's scope taken at its word").toEqual([])
    expect((await readReminder(taskId))?.fire_at).toBe('2026-07-28 09:30')
  })

  test('reminders assigned to somebody else are untouched', async () => {
    const traveller = await seedUser(KARACHI)
    const other = await seedUser(NAIROBI)
    const folderId = await seedFolder(traveller)
    await addMember(folderId, other)
    const theirs = await seedTask(folderId, traveller, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
      assigneeId: other,
    })
    await seedReminder(theirs, {
      offsetMinutes: 30,
      fireAt: '2026-07-28T11:30:00Z',
      createdBy: traveller,
    })

    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${traveller}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: traveller })
    expect(outcome.recomputed).toEqual([])
    expect((await readReminder(theirs))?.fire_at).toBe('2026-07-28 11:30')
  })

  test('a creator who travels moves nothing, the fallback not being a sixth trigger', async () => {
    const creator = await seedUser(KARACHI)
    const folderId = await seedFolder(creator)
    const unassigned = await seedTask(folderId, creator, {
      dueDate: '2026-07-28',
      assigneeId: null,
    })
    await seedReminder(unassigned, {
      timeOfDay: '09:00',
      fireAt: '2026-07-28T04:00:00Z',
      createdBy: creator,
    })

    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${creator}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: creator })
    expect(
      outcome.recomputed,
      "ruled at the P7 kickoff: an unassigned reminder is computed from its creator only to satisfy 4.8's NOT NULL fire_at, the loop skips an unassigned task at fire time, and assignee_id is itself a trigger, so such a row either never fires or is recomputed in the new assignee's zone before it does",
    ).toEqual([])
    expect((await readReminder(unassigned))?.fire_at).toBe('2026-07-28 04:00')
  })

  test('a scheduled row recomputing into the past is skipped', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const taskId = await seedTask(folderId, owner, { dueDate: '2026-07-27' })
    await seedReminder(taskId, {
      timeOfDay: '09:00',
      fireAt: '2026-07-27T04:00:00Z',
      createdBy: owner,
    })
    // Moving far enough east puts 09:00 local before the evaluation instant.
    await db.execute(
      sql`UPDATE users SET timezone = ${'Pacific/Kiritimati'} WHERE id = ${owner}::uuid`,
    )
    await recompute({ kind: 'assignee_timezone', userId: owner })
    const row = await readReminder(taskId)
    expect(row?.state, '8.6 skips rather than firing retroactively, whichever trigger ran').toBe(
      'skipped',
    )
    expect(row?.fired_at_set).toBe(true)
  })

  test('a row it cannot compute is reported and left alone, and the rest still recompute', async () => {
    /*
    The one place a refusal is reported rather than thrown. This trigger fires
    inside sign-in, which frozen 7.1 already refuses to fail over a zone
    problem, so one unwritable reminder row taking down every login for that
    account is a worse outcome than a stale instant on a row that was already
    wrong. The four task-scoped triggers throw instead, because they fire on
    the very write that produced the shape.
    */
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const broken = await seedTask(folderId, owner, {
      dueDate: '2026-07-28',
      dueTime: '15:00',
    })
    const sound = await seedTask(folderId, owner, { dueDate: '2026-07-29' })
    await seedReminder(broken, {
      offsetMinutes: 30,
      fireAt: '2026-07-28T09:30:00Z',
      createdBy: owner,
    })
    await seedReminder(sound, {
      timeOfDay: '09:00',
      fireAt: '2026-07-29T04:00:00Z',
      createdBy: owner,
    })
    await db.execute(sql`UPDATE tasks SET due_time = NULL WHERE id = ${broken}::uuid`)

    await db.execute(
      sql`UPDATE users SET timezone = ${HONOLULU} WHERE id = ${owner}::uuid`,
    )
    const outcome = await recompute({ kind: 'assignee_timezone', userId: owner })
    expect(outcome.unresolved.map((row) => row.taskId)).toEqual([broken])
    expect(outcome.recomputed.map((row) => row.taskId)).toEqual([sound])
    expect((await readReminder(broken))?.fire_at, 'left exactly as it was').toBe(
      '2026-07-28 09:30',
    )
    expect((await readReminder(sound))?.fire_at).toBe('2026-07-29 19:00')
  })
})

/* ------------------------------------------------------------------ *
 * 8.5's copy, and the plan it reports
 * ------------------------------------------------------------------ */

describe("8.5's copy onto a successor", () => {
  /*
  The row this writes is asserted end to end by AC-168 and by AC-150. What is
  asserted here and nowhere else is the value it returns, which the third
  change control recorded as falsified alongside the INSERT: the function
  computed a state, wrote 'scheduled' anyway, and then handed its caller a plan
  amended to match the wrong write. AC-168's own header explains why the
  acceptance range cannot reach it, no response in section 7 carrying a
  reminder's state, and routes it here, which is where protocol section 8 puts
  a module's own return values.

  copyReminderToSuccessor takes no evaluation instant, unlike planReminder and
  recomputeReminders, so these cases reach past and future by choosing the
  successor's due date rather than by moving a clock. They are days out rather
  than the hour AC-168 uses, and deliberately: that file lands its fixtures
  inside the loop's six-hour staleness window because it runs a pass and the
  window is the whole point there. Nothing here runs a pass, so the window is
  not in play and distance from now buys robustness instead.
  */
  function dateDaysFromNow(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  }

  async function stageCopy(
    successorDueDate: string,
  ): Promise<{ owner: string; source: string; successor: string }> {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const source = await seedTask(folderId, owner, { dueDate: '2026-07-20' })
    await seedReminder(source, {
      timeOfDay: '09:00',
      fireAt: '2026-07-20T04:00:00Z',
      createdBy: owner,
    })
    const successor = await seedTask(folderId, owner, {
      dueDate: successorDueDate,
    })
    return { owner, source, successor }
  }

  function copy(source: string, successor: string): Promise<ReminderPlan | null> {
    return inTransaction(db, async (tx) =>
      copyReminderToSuccessor(tx, source, successor),
    )
  }

  test('a past instant is written skipped, and reported skipped', async () => {
    const { source, successor } = await stageCopy(dateDaysFromNow(-3))
    const reported = await copy(source, successor)

    const row = await readReminder(successor)
    expect(
      { state: row?.state, fired: row?.fired_at_set },
      '8.6 defines the state a write earns once, for every path that writes the column: skipped with fired_at set when the instant is already past. 8.5\'s line reads that fire_at and state are both per 8.6',
    ).toEqual({ state: 'skipped', fired: true })
    expect(
      { state: reported?.state, fired: reported?.firedAt !== null },
      'and the returned plan says the same thing. It used to be amended to match the wrong write, so a caller trusting it was misled even where the row was right',
    ).toEqual({ state: 'skipped', fired: true })
    expect(
      row?.state,
      'the two are one answer, not two that happen to agree',
    ).toBe(reported?.state)
  })

  test('a future instant is written scheduled, and reported scheduled', async () => {
    // The control against the opposite mistake: an implementation writing
    // skipped unconditionally satisfies the case above and silences every
    // reminder in the product.
    const { source, successor } = await stageCopy(dateDaysFromNow(30))
    const reported = await copy(source, successor)

    const row = await readReminder(successor)
    expect({ state: row?.state, fired: row?.fired_at_set }).toEqual({
      state: 'scheduled',
      fired: false,
    })
    expect({
      state: reported?.state,
      fired: reported?.firedAt !== null,
    }).toEqual({ state: 'scheduled', fired: false })
    expect(row?.state).toBe(reported?.state)
  })

  test('the mode and value come across, and the instant is the successor\'s own', async () => {
    // Read once rather than per assertion, so a run crossing UTC midnight
    // between two calls cannot compare two different days.
    const successorDue = dateDaysFromNow(30)
    const { owner, source, successor } = await stageCopy(successorDue)
    const reported = await copy(source, successor)
    const row = await readReminder(successor)
    expect({
      offset_minutes: row?.offset_minutes,
      time_of_day: row?.time_of_day,
      created_by: row?.created_by,
    }).toEqual({
      offset_minutes: null,
      time_of_day: '09:00',
      // The creator comes across with the row, the way created_by does on the
      // task itself: a generation is not a person setting a reminder.
      created_by: owner,
    })
    expect(
      row?.fire_at,
      '8.5 says fire_at recomputed, over the successor\'s own due date; 09:00 in Karachi is 04:00Z',
    ).toBe(`${successorDue} 04:00`)
    expect(
      reported?.fireAt.toISOString().slice(0, 16).replace('T', ' '),
      'and the reported instant is the one that was stored',
    ).toBe(`${successorDue} 04:00`)
  })

  test('the source reminder is untouched by the copy', async () => {
    const { source, successor } = await stageCopy(dateDaysFromNow(-3))
    await copy(source, successor)
    const row = await readReminder(source)
    expect(
      { state: row?.state, fire_at: row?.fire_at, fired: row?.fired_at_set },
      '8.5 inserts a row and rewrites nothing; the closing occurrence keeps its own',
    ).toEqual({ state: 'scheduled', fire_at: '2026-07-20 04:00', fired: false })
  })

  test('a source carrying no reminder writes nothing and reports null', async () => {
    const owner = await seedUser(KARACHI)
    const folderId = await seedFolder(owner)
    const source = await seedTask(folderId, owner, { dueDate: '2026-07-20' })
    const successor = await seedTask(folderId, owner, {
      dueDate: dateDaysFromNow(30),
    })
    expect(
      await copy(source, successor),
      '8.5 guards the arm with "if reminder exists on t"',
    ).toBeNull()
    expect(await readReminder(successor)).toBeUndefined()
  })
})

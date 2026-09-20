/*
8.5's generation, against a real database.

The acceptance range exercises this through the two transition endpoints,
which are the Collaboration engineer's and arrive in a later session; this
file drives the function directly, so a defect in what the successor carries
is reported as itself rather than as a wrong response body two layers up.

Every case runs inside a transaction, the way 8.3 requires the real caller to
run it, and reads its dates back through to_char for the reason generation.ts
records: the two drivers disagree about a DATE column, and only one of the
two answers is a floating date.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import { inTransaction } from '../database.js'

import { generateSuccessor } from './generation.js'
import type { GenerationOutcome } from './generation.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

/*
The instant every case reads its today at. Fixed rather than current, because
a cutoff is the one thing in this module that depends on a clock and a test
that took the real one would assert a different sentence every day. 06:00 UTC
on Monday 2026-07-27 is midday in the zone below and lands on a different
calendar date in the two zones the last case uses.
*/
const AT = new Date('2026-07-27T06:00:00Z')
const TZ = 'Europe/Amsterdam'

/** Two zones that read a different calendar date at AT: +14 and -11. */
const ZONE_AHEAD = 'Pacific/Kiritimati'
const ZONE_BEHIND = 'Pacific/Midway'

async function seedUser(): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`gen-${randomUUID()}`}, ${`${randomUUID()}@generation.test`},
                ${'Generation fixture'})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${'generation'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id)
        VALUES (${folderId}::uuid, ${ownerId}::uuid)`,
  )
  return folderId
}

interface Occurrence {
  taskId: string
  seriesId: string
  folderId: string
  ownerId: string
}

interface OccurrenceOptions {
  dueDate: string
  rule: string | null
  dueTime?: string
  notes?: string
  important?: boolean
  steps?: readonly string[]
  status?: string
}

async function seedOccurrence(
  options: OccurrenceOptions,
): Promise<Occurrence> {
  const ownerId = await seedUser()
  const folderId = await seedFolder(ownerId)
  const seriesId = randomUUID()
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                           due_time, recurrence_rule, series_id, assignee_id,
                           created_by, status)
        VALUES (${folderId}::uuid, ${'water the plants'},
                ${options.notes ?? null}, ${options.important ?? false},
                ${options.dueDate}::date, ${options.dueTime ?? null}::time,
                ${options.rule}, ${seriesId}::uuid, ${ownerId}::uuid,
                ${ownerId}::uuid, ${options.status ?? 'pending'})
        RETURNING id`,
  )
  const taskId = String(found[0]?.id)
  let position = 1
  for (const title of options.steps ?? []) {
    await db.execute(
      sql`INSERT INTO steps (task_id, title, position, done)
          VALUES (${taskId}::uuid, ${title}, ${position}, ${true})`,
    )
    position += 1
  }
  return { taskId, seriesId, folderId, ownerId }
}

interface TaskRow {
  id: string
  status: string
  due_date: string | null
  due_time: string | null
  recurrence_rule: string | null
  series_id: string | null
  title: string
  notes: string | null
  important: boolean
  assignee_id: string | null
  created_by: string
  folder_id: string
}

async function readTask(id: string): Promise<TaskRow> {
  const found = await rows(
    db,
    sql`SELECT id, status, to_char(due_date, 'YYYY-MM-DD') AS due_date,
               to_char(due_time, 'HH24:MI') AS due_time, recurrence_rule,
               series_id, title, notes, important, assignee_id, created_by,
               folder_id
          FROM tasks WHERE id = ${id}::uuid`,
  )
  const row = found[0]
  if (row === undefined) throw new Error(`no task ${id}`)
  return row as unknown as TaskRow
}

async function successorsOf(occurrence: Occurrence): Promise<TaskRow[]> {
  const found = await rows(
    db,
    sql`SELECT id FROM tasks
         WHERE series_id = ${occurrence.seriesId}::uuid
           AND id <> ${occurrence.taskId}::uuid
         ORDER BY created_at, id`,
  )
  const all: TaskRow[] = []
  for (const row of found) all.push(await readTask(String(row.id)))
  return all
}

interface ReminderRow {
  offset_minutes: number | null
  time_of_day: string | null
  state: string
  fired_at: string | null
  created_by: string
  /** Rendered in UTC rather than compared as a driver value: one backend
   * answers a Date here and the other a string, and the session timezone is
   * not this file's to assume. */
  fire_at_utc: string
}

async function readReminders(taskId: string): Promise<ReminderRow[]> {
  const found = await rows(
    db,
    sql`SELECT offset_minutes, to_char(time_of_day, 'HH24:MI') AS time_of_day,
               state, fired_at, created_by,
               to_char(fire_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS fire_at_utc
          FROM reminders WHERE task_id = ${taskId}::uuid`,
  )
  return found as unknown as ReminderRow[]
}

async function generate(
  occurrence: Occurrence,
  tz: string = TZ,
  at: Date = AT,
): Promise<GenerationOutcome> {
  return inTransaction(db, async (tx) =>
    generateSuccessor(tx, { taskId: occurrence.taskId, tz, at }),
  )
}

function generatedDue(outcome: GenerationOutcome): string {
  if (outcome.kind !== 'generated') {
    throw new Error(`expected a successor, got ${outcome.kind}`)
  }
  return outcome.dueDate
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

describe('8.5\'s four worked examples, through the function', () => {
  test('on time: due on the day it is completed, next week', async () => {
    // today in TZ at AT is 2026-07-27, and the due date is the same day, so
    // the cutoff is that Monday either way.
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(generatedDue(await generate(occurrence))).toBe('2026-08-03')
  })

  test('late, with the skipped slots skipped', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-20',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(
      generatedDue(await generate(occurrence, TZ, new Date('2026-07-28T10:00:00Z'))),
      'cutoff 07-28, so the 07-27 slot is gone and the calendar shows an honest gap',
    ).toBe('2026-08-03')
  })

  test('early, with the alignment preserved', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(
      generatedDue(await generate(occurrence, TZ, new Date('2026-07-25T10:00:00Z'))),
      'the due date dominates the max, so finishing early does not pull the series forward',
    ).toBe('2026-08-03')
  })

  test('daily and late, without a pile-up', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-20',
      rule: 'FREQ=DAILY',
    })
    expect(
      generatedDue(await generate(occurrence, TZ, new Date('2026-07-24T10:00:00Z'))),
    ).toBe('2026-07-25')
    expect(
      await successorsOf(occurrence),
      'one row per generating transition, never one per missed day',
    ).toHaveLength(1)
  })
})

describe('what the successor carries', () => {
  test('8.5\'s list, and the rule handed on', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
      dueTime: '08:15',
      notes: 'the tall one by the window',
      important: true,
      steps: ['fill the can', 'the fern last'],
    })
    const outcome = await generate(occurrence)
    expect(outcome.kind).toBe('generated')
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')
    const original = await readTask(occurrence.taskId)

    expect(successor.status, '8.5 inserts it pending').toBe('pending')
    expect(successor.due_date).toBe('2026-08-03')
    expect(successor.due_time, 'the time of day rides along').toBe('08:15')
    expect(successor.title).toBe(original.title)
    expect(successor.notes).toBe('the tall one by the window')
    expect(successor.important, 'importance is part of the task, not of the occurrence').toBe(true)
    expect(successor.assignee_id).toBe(original.assignee_id)
    expect(successor.folder_id).toBe(original.folder_id)
    expect(
      successor.created_by,
      '8.5 copies created_by, so the series keeps its author rather than acquiring whoever ticked it off',
    ).toBe(original.created_by)
    expect(successor.series_id, 'the same series, which is what INV-7 and the guards read').toBe(
      occurrence.seriesId,
    )
    expect(successor.recurrence_rule, 'the rule moves to the current occurrence').toBe(
      'FREQ=WEEKLY;BYDAY=MO',
    )
    expect(
      original.recurrence_rule,
      '8.5: the rule lives only on the current occurrence, and this row is now history',
    ).toBeNull()
    expect(
      original.series_id,
      'series_id stays on the closed row, which is what the Done-page trail and the guards walk',
    ).toBe(occurrence.seriesId)
  })

  test('the steps come across unticked, in order', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
      steps: ['fill the can', 'the fern last', 'close the window'],
    })
    await generate(occurrence)
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')
    const steps = await rows(
      db,
      sql`SELECT title, done, position FROM steps
           WHERE task_id = ${successor.id}::uuid ORDER BY position, id`,
    )
    expect(steps.map((step) => step.title)).toEqual([
      'fill the can',
      'the fern last',
      'close the window',
    ])
    expect(
      steps.map((step) => step.done),
      '8.5 copies them with done = false: a fresh occurrence starts fresh, whatever was ticked last time',
    ).toEqual([false, false, false])
  })

  test('My Day entries are never copied', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    await db.execute(
      sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
          VALUES (${occurrence.taskId}::uuid, ${occurrence.ownerId}::uuid,
                  ${'2026-07-27'}::date)`,
    )
    await generate(occurrence)
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')
    expect(
      await rows(
        db,
        sql`SELECT task_id FROM my_day_entries WHERE task_id = ${successor.id}::uuid`,
      ),
      '8.5 says so and 8.2 explains it: a pull is one decision about one occurrence, not a standing subscription',
    ).toEqual([])
  })

  test('the reminder is copied with its mode and value, at its own instant', async () => {
    // The arm P6 deferred with the computation it needed and P7 closed. The
    // seeded fire_at is the source occurrence's own and is deliberately not
    // the successor's: 8.5 says fire_at recomputed, not copied, and a copy
    // would put the successor's reminder at a moment already past.
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
      dueTime: '08:15',
    })
    await db.execute(
      sql`INSERT INTO reminders (task_id, offset_minutes, fire_at, created_by)
          VALUES (${occurrence.taskId}::uuid, ${30},
                  ${'2026-07-27T06:45:00Z'}::timestamptz,
                  ${occurrence.ownerId}::uuid)`,
    )
    await generate(occurrence)
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')

    const [copied] = await readReminders(successor.id)
    expect(
      copied,
      '8.5: if reminder exists on t, insert reminder on s with the same mode and value',
    ).toBeDefined()
    expect({
      offset_minutes: copied?.offset_minutes,
      time_of_day: copied?.time_of_day,
      state: copied?.state,
      fired_at: copied?.fired_at,
      created_by: copied?.created_by,
    }).toEqual({
      offset_minutes: 30,
      time_of_day: null,
      state: 'scheduled',
      fired_at: null,
      // The creator comes across with the row, the way created_by does on the
      // task itself: a generation is not a person setting a reminder.
      created_by: occurrence.ownerId,
    })
    expect(
      copied?.fire_at_utc,
      "8.6 over the successor's own due date: 08:15 minus 30 minutes is 07:45 on 2026-08-03, and the seeded user's zone is 4.1's UTC default",
    ).toBe('2026-08-03 07:45')

    const [source] = await readReminders(occurrence.taskId)
    expect(
      source?.fire_at_utc,
      "the closing occurrence keeps its own reminder untouched; 8.5 inserts a row and rewrites nothing",
    ).toBe('2026-07-27 06:45')
  })

  test("the copy's state is the successor instant's, which 8.6 defines once", async () => {
    /*
    8.6's own worked example, in the module that performs it: a daily task due
    09:00 whose reminder leads by a day, completed at 10:00, puts the
    successor's instant an hour back. The rule makes the successor due
    strictly after the cutoff, so only an offset measured in days can reach
    the past at all, which is why 4.8's 10080 bound is what makes this case
    ordinary rather than exotic.

    Written 'scheduled' flatly, as this arm was until the third change control,
    the row is inside the loop's six-hour staleness window and the next tick
    mails a reminder for a deadline that has not arrived. The case above is the
    other half and is the one that pins `at` reaching this computation at all:
    its successor instant is past on the real clock and future against the
    stated one, so it answers scheduled only where the caller's `at` is honored.
    */
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=DAILY',
      dueTime: '09:00',
    })
    await db.execute(
      sql`INSERT INTO reminders (task_id, offset_minutes, fire_at, created_by)
          VALUES (${occurrence.taskId}::uuid, ${1440},
                  ${'2026-07-26T09:00:00Z'}::timestamptz,
                  ${occurrence.ownerId}::uuid)`,
    )
    await generate(occurrence, 'UTC', new Date('2026-07-27T10:00:00Z'))
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')

    expect(successor.due_date, 'the next daily instance after the cutoff').toBe(
      '2026-07-28',
    )
    const [copied] = await readReminders(successor.id)
    expect(
      copied?.fire_at_utc,
      "a day before 09:00 on the 28th is 09:00 on the 27th, which the completion at 10:00 has already passed",
    ).toBe('2026-07-27 09:00')
    expect(
      { state: copied?.state, fired: copied?.fired_at !== null },
      '8.6: skipped with fired_at set when the instant is already past, never fired retroactively, on every path that writes the column',
    ).toEqual({ state: 'skipped', fired: true })
  })

  test('a successor generated from a task with no reminder gets none', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
      dueTime: '08:15',
    })
    await generate(occurrence)
    const [successor] = await successorsOf(occurrence)
    if (successor === undefined) throw new Error('no successor')
    expect(
      await readReminders(successor.id),
      '8.5 guards the arm with "if reminder exists on t", and 4.8 has no row shape for a reminder nobody asked for',
    ).toEqual([])
  })
})

describe('the outcomes that create nothing', () => {
  test('UNTIL exhausted leaves the rule where it is', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260727',
    })
    expect((await generate(occurrence)).kind).toBe('exhausted')
    expect(await successorsOf(occurrence), 'nothing is inserted').toEqual([])
    expect(
      (await readTask(occurrence.taskId)).recurrence_rule,
      '8.5: the rule stays on the row, and the series may resume through a restore (5.1)',
    ).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260727')
  })

  test('a row with no rule generates nothing and is not an error', async () => {
    const occurrence = await seedOccurrence({ dueDate: '2026-07-27', rule: null })
    expect((await generate(occurrence)).kind).toBe('not_recurring')
    expect(await successorsOf(occurrence)).toEqual([])
  })

  test('an UNTIL the anchor itself satisfies still yields the next instance', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260803',
    })
    expect(
      generatedDue(await generate(occurrence)),
      'UNTIL is inclusive, so an instance equal to it is valid (4.11, RFC 5545)',
    ).toBe('2026-08-03')
  })
})

describe('the cutoff reads the request\'s zone (AC-142)', () => {
  test('two zones a day apart at one instant reach different instances', async () => {
    const ahead = await seedOccurrence({
      dueDate: '2026-07-20',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    const behind = await seedOccurrence({
      dueDate: '2026-07-20',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    // At AT it is already the 27th in Kiritimati and still the 26th in
    // Midway, and the due date is behind both, so the zone alone decides
    // which Monday the series lands on next.
    expect(generatedDue(await generate(ahead, ZONE_AHEAD))).toBe('2026-08-03')
    expect(
      generatedDue(await generate(behind, ZONE_BEHIND)),
      '8.5 takes the zone from the request that made the transition, so a colleague completing a shared chore from the other side of the date line generates against their own day',
    ).toBe('2026-07-27')
  })

  test('a zone that is not an IANA identifier is refused rather than guessed', async () => {
    const occurrence = await seedOccurrence({
      dueDate: '2026-07-27',
      rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    // 11.15: Intl accepts offset identifiers the tzdb does not, and the
    // shared validator's sign guard is what closes that hole. The cutoff
    // would be silently wrong rather than absent.
    await expect(generate(occurrence, '+05:30')).rejects.toThrow(TypeError)
    await expect(generate(occurrence, 'Mars/Olympus')).rejects.toThrow(TypeError)
  })
})

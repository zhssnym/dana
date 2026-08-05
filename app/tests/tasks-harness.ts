/*
Harness for the P3 tasks-core criteria (AC-025 to AC-044), built on the P1
auth harness and the P2 folder layer: the same booted application, stub
identity provider, cookie-jar browsers, lazily signed-in casts, and scoped
invariant sweep, plus what the frozen 7.6, 7.7, and 7.8 surfaces need.

Four decisions worth the words:

**Setup goes through the API wherever the API is in this package.** Tasks
are created with POST /tasks, steps with POST /tasks/:id/steps, and pulls
with POST /tasks/:id/my-day, the P2 precedent: a broken create fails every
file here on one attributable sentence, which is the correct verdict for the
package. Folders and memberships arrive through P2's endpoints, which are
merged.

**Only surfaces later packages own are seeded directly.** Recurrence rules
are P6's and reminders are P7's, and the RFC 0001 P3 row defers both arms of
7.6's body with the computations they need, so the fixtures AC-028 and
AC-040 turn on are written to the database rather than requested through a
body the package does not accept yet. Invite rows are P5's, and AC-042 needs
one only to watch the 5.1 delete cascade null its task_id.

**The 7.0 shapes are restated here, once, and asserted key-exact.** They are
restated rather than imported from app/src/shared/, by the standing Steward
ruling that this suite measures that surface and cannot borrow its
definition of correct. Key-exact because 7.0 enumerates both shapes and 7.0
is frozen: a missing key breaks the client contract and an extra one is
drift the contract cannot absorb, the same reading AC-116 applies to the 7.1
object. Two tolerances are deliberate and recorded at their assertions: the
reminder object, whose "offset_minutes or time_of_day" is a mode rather than
a key list, and pending_invite_email, whose derivation from invites.task_id
belongs to the package that creates those rows.

**Criterion truth is read from the row, contract shape from the wire.** A
criterion that names a stored fact (completed_by is the acting user) is
asserted against the column, so it survives any defensible reading of how
that column is rendered; the rendering is asserted separately, where a
disagreement is attributable to the shape rather than to the behavior.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../db/client.js'
import type { Actor } from './folders-harness.js'
import { expectFolderInvariants, expectStatus } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'

/* ------------------------------------------------------------------ *
 * The 7.0 shapes
 * ------------------------------------------------------------------ */

/** TaskCard, spec 7.0, in full. */
export const TASK_CARD_KEYS = [
  'assignee',
  'created_at',
  'due_date',
  'due_time',
  'folder',
  'id',
  'important',
  'is_recurring',
  'pending_invite_email',
  'pulled',
  'status',
  'steps_done',
  'steps_total',
  'title',
  'updated_at',
] as const

/** What TaskDetail adds to TaskCard, spec 7.0. */
export const TASK_DETAIL_EXTRA_KEYS = [
  'completed_at',
  'completed_by',
  'created_by',
  'notes',
  'recurrence_rule',
  'reminder',
  'series_id',
  'steps',
] as const

export const TASK_DETAIL_KEYS = [
  ...TASK_CARD_KEYS,
  ...TASK_DETAIL_EXTRA_KEYS,
].sort()

export const TASK_STATUSES = ['abandoned', 'completed', 'pending'] as const

function asRecord(value: unknown, source: string): Record<string, unknown> {
  expect(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    `${source} must be a JSON object (spec 7.0)`,
  ).toBe(true)
  return value as Record<string, unknown>
}

function expectExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  source: string,
): void {
  expect(
    Object.keys(value).sort(),
    `${source} must carry exactly the keys frozen 7.0 gives it, nothing extra, nothing missing`,
  ).toEqual([...keys].sort())
}

/** 4.11 stores due_date as a floating calendar date; an instant on the wire
 * would reintroduce the timezone the format exists to remove. */
function expectDateOrNull(value: unknown, source: string): void {
  if (value === null) return
  expect(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    `${source} must be a floating ISO calendar date, YYYY-MM-DD (spec 4.11); got ${JSON.stringify(value)}`,
  ).toBe(true)
}

/** 4.11 stores due_time as a floating wall-clock time at minute precision;
 * Postgres renders TIME with seconds, which is the same value. */
function expectTimeOrNull(value: unknown, source: string): void {
  if (value === null) return
  expect(
    typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(value),
    `${source} must be a floating wall-clock time, HH:MM (spec 4.11); got ${JSON.stringify(value)}`,
  ).toBe(true)
}

function expectInstantOrNull(value: unknown, source: string): void {
  if (value === null) return
  expect(
    typeof value === 'string' && !Number.isNaN(Date.parse(value)),
    `${source} must be a UTC instant as a parseable string (spec 4.5, 4.11); got ${JSON.stringify(value)}`,
  ).toBe(true)
}

function expectUuidOrNull(value: unknown, source: string): void {
  if (value === null) return
  expect(
    typeof value === 'string' && value.length > 0,
    `${source} must be an id string or null (spec 7.0 spells nested person shapes out and leaves plain ids bare); got ${JSON.stringify(value)}`,
  ).toBe(true)
}

function expectStringOrNull(value: unknown, source: string): void {
  if (value === null) return
  expect(
    typeof value,
    `${source} must be a string or null (spec 7.0)`,
  ).toBe('string')
}

/** The person shape 7.0 gives TaskCard's assignee, the same one 7.4's
 * members element carries. */
export function expectPersonOrNull(value: unknown, source: string): void {
  if (value === null) return
  const person = asRecord(value, source)
  expectExactKeys(person, ['avatar_url', 'display_name', 'id'], source)
  expect(typeof person.id, `${source}.id must be a string`).toBe('string')
  expectStringOrNull(person.display_name, `${source}.display_name`)
  expectStringOrNull(person.avatar_url, `${source}.avatar_url`)
}

/** The whole of the 7.0 TaskCard shape, applied to one object. */
export function expectTaskCardShape(value: unknown, source: string): void {
  const card = asRecord(value, source)
  expectExactKeys(card, TASK_CARD_KEYS, source)
  expect(typeof card.id, `${source}.id must be a string`).toBe('string')
  expect(typeof card.title, `${source}.title must be a string`).toBe('string')
  expect(
    TASK_STATUSES as readonly string[],
    `${source}.status must be one of the three 4.5 statuses; got ${JSON.stringify(card.status)}`,
  ).toContain(card.status)
  expect(typeof card.important, `${source}.important must be a boolean`).toBe(
    'boolean',
  )
  expectDateOrNull(card.due_date, `${source}.due_date`)
  expectTimeOrNull(card.due_time, `${source}.due_time`)

  const folder = asRecord(card.folder, `${source}.folder`)
  expectExactKeys(folder, ['id', 'is_default', 'name'], `${source}.folder`)
  expect(typeof folder.id, `${source}.folder.id must be a string`).toBe('string')
  expect(typeof folder.name, `${source}.folder.name must be a string`).toBe(
    'string',
  )
  expect(
    typeof folder.is_default,
    `${source}.folder.is_default must be a boolean`,
  ).toBe('boolean')

  expectPersonOrNull(card.assignee, `${source}.assignee`)
  expect(
    typeof card.is_recurring,
    `${source}.is_recurring must be a boolean`,
  ).toBe('boolean')
  expect(
    Number.isInteger(card.steps_done),
    `${source}.steps_done must be an integer; got ${JSON.stringify(card.steps_done)}`,
  ).toBe(true)
  expect(
    Number.isInteger(card.steps_total),
    `${source}.steps_total must be an integer; got ${JSON.stringify(card.steps_total)}`,
  ).toBe(true)
  expect(typeof card.pulled, `${source}.pulled must be a boolean`).toBe('boolean')
  // The value is P5's: 7.0 derives it from invites.task_id, and no P3
  // criterion reaches invite creation. The key is 7.0's and is asserted.
  expectStringOrNull(card.pending_invite_email, `${source}.pending_invite_email`)
  expectInstantOrNull(card.created_at, `${source}.created_at`)
  expectInstantOrNull(card.updated_at, `${source}.updated_at`)
  expect(card.created_at, `${source}.created_at must not be null`).not.toBeNull()
  expect(card.updated_at, `${source}.updated_at must not be null`).not.toBeNull()
}

export interface TaskDetailBody extends Record<string, unknown> {
  id: string
  status: string
  title: string
}

/** The whole of the 7.0 TaskDetail shape: TaskCard plus its eight. */
export function expectTaskDetailShape(
  value: unknown,
  source: string,
): TaskDetailBody {
  const detail = asRecord(value, source)
  expectExactKeys(detail, TASK_DETAIL_KEYS, source)
  // TaskCard is a strict subset of TaskDetail, so the card check runs
  // against the projection rather than against the whole object.
  const card: Record<string, unknown> = {}
  for (const key of TASK_CARD_KEYS) card[key] = detail[key]
  expectTaskCardShape(card, `${source} (its TaskCard half)`)

  expectStringOrNull(detail.notes, `${source}.notes`)
  expectStringOrNull(detail.recurrence_rule, `${source}.recurrence_rule`)
  expectUuidOrNull(detail.series_id, `${source}.series_id`)
  expectInstantOrNull(detail.completed_at, `${source}.completed_at`)
  expectUuidOrNull(detail.completed_by, `${source}.completed_by`)
  expect(
    typeof detail.created_by,
    `${source}.created_by must be an id string (spec 4.5 makes the column NOT NULL)`,
  ).toBe('string')

  /*
  The one tolerated looseness. 7.0 writes the reminder as
  "{offset_minutes or time_of_day} or null", which names a mode rather than
  a key list (4.8 makes exactly one of the two columns non-null), so both a
  one-key object and a two-key object with one null are faithful renderings.
  Keys outside the pair are not.
  */
  if (detail.reminder !== null) {
    const reminder = asRecord(detail.reminder, `${source}.reminder`)
    const keys = Object.keys(reminder).sort()
    expect(
      keys.every((key) => key === 'offset_minutes' || key === 'time_of_day'),
      `${source}.reminder may carry only offset_minutes and time_of_day (spec 7.0, 4.8); got ${JSON.stringify(keys)}`,
    ).toBe(true)
    expect(
      reminder.offset_minutes !== undefined || reminder.time_of_day !== undefined,
      `${source}.reminder must carry one of the two 4.8 modes`,
    ).toBe(true)
  }

  expect(
    Array.isArray(detail.steps),
    `${source}.steps must be an array (spec 7.0)`,
  ).toBe(true)
  for (const [index, step] of (detail.steps as unknown[]).entries()) {
    const element = asRecord(step, `${source}.steps[${String(index)}]`)
    expectExactKeys(
      element,
      ['done', 'id', 'position', 'title'],
      `${source}.steps[${String(index)}]`,
    )
    expect(
      typeof element.id,
      `${source}.steps[${String(index)}].id must be a string`,
    ).toBe('string')
    expect(
      typeof element.title,
      `${source}.steps[${String(index)}].title must be a string`,
    ).toBe('string')
    expect(
      typeof element.done,
      `${source}.steps[${String(index)}].done must be a boolean`,
    ).toBe('boolean')
    expect(
      Number.isInteger(element.position),
      `${source}.steps[${String(index)}].position must be an integer`,
    ).toBe(true)
  }

  return detail as TaskDetailBody
}

/* ------------------------------------------------------------------ *
 * The 7.6 task surface
 * ------------------------------------------------------------------ */

export function createTask(actor: Actor, body: unknown): Promise<RawResponse> {
  return actor.browser.json('/tasks', 'POST', body)
}

/** POST /tasks asserted: 7.6 answers 201 with the TaskDetail. */
export async function createTaskOk(
  actor: Actor,
  body: unknown,
  why: string,
): Promise<TaskDetailBody> {
  const response = await createTask(actor, body)
  expectStatus(response, 201, why)
  return expectTaskDetailShape(response.json(), 'the POST /tasks body')
}

export function getTask(actor: Actor, taskId: string): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}`)
}

/** GET /tasks/:id asserted: 7.6 answers 200 with the TaskDetail. */
export async function readTask(
  actor: Actor,
  taskId: string,
): Promise<TaskDetailBody> {
  const response = await getTask(actor, taskId)
  expectStatus(
    response,
    200,
    `GET /tasks/${taskId} must answer the TaskDetail to a member (spec 7.6)`,
  )
  return expectTaskDetailShape(response.json(), `the GET /tasks/${taskId} body`)
}

export function patchTask(
  actor: Actor,
  taskId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}`, 'PATCH', body)
}

/** PATCH /tasks/:id asserted: 7.6 answers 200 with the TaskDetail. */
export async function patchTaskOk(
  actor: Actor,
  taskId: string,
  body: unknown,
  why: string,
): Promise<TaskDetailBody> {
  const response = await patchTask(actor, taskId, body)
  expectStatus(response, 200, why)
  return expectTaskDetailShape(response.json(), 'the PATCH /tasks/:id body')
}

export function deleteTask(actor: Actor, taskId: string): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}`, { method: 'DELETE' })
}

export type Transition = 'complete' | 'uncomplete' | 'abandon' | 'restore'

export function transition(
  actor: Actor,
  taskId: string,
  event: Transition,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/${event}`, 'POST', {})
}

export interface TransitionBody {
  task: TaskDetailBody
  generated_task: unknown
  deleted_successor_id: unknown
}

/*
A transition asserted, which is where 7.6's response envelope is judged:
exactly { task, generated_task, deleted_successor_id }, the task a
TaskDetail. Both companions are asserted null here because no task this
package transitions carries a recurrence rule: generation and G-SERIES are
P6's, and the one rule-carrying fixture in the suite (AC-028's) is only ever
PATCHed. A file that transitions a recurring row must judge them itself.
*/
export async function transitionOk(
  actor: Actor,
  taskId: string,
  event: Transition,
  why: string,
): Promise<TransitionBody> {
  const response = await transition(actor, taskId, event)
  expectStatus(response, 200, why)
  const body = asRecord(response.json(), `the POST ${event} body`)
  expectExactKeys(
    body,
    ['deleted_successor_id', 'generated_task', 'task'],
    `the POST /tasks/:id/${event} body`,
  )
  const task = expectTaskDetailShape(
    body.task,
    `the POST /tasks/:id/${event} task`,
  )
  expect(
    body.generated_task,
    `a task with no recurrence_rule generates no successor, so ${event} must answer generated_task null (spec 7.6, 8.5)`,
  ).toBeNull()
  expect(
    body.deleted_successor_id,
    `a task with no series has no successor to delete, so ${event} must answer deleted_successor_id null (spec 7.6, 5.1 G-SERIES)`,
  ).toBeNull()
  return {
    task,
    generated_task: body.generated_task,
    deleted_successor_id: body.deleted_successor_id,
  }
}

/* ------------------------------------------------------------------ *
 * The 7.7 step surface and the 7.8 My Day surface
 * ------------------------------------------------------------------ */

export function addStep(
  actor: Actor,
  taskId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/steps`, 'POST', body)
}

export async function addStepOk(
  actor: Actor,
  taskId: string,
  title: string,
): Promise<void> {
  const response = await addStep(actor, taskId, { title })
  expectStatus(
    response,
    201,
    `POST /tasks/${taskId}/steps must add a step and answer 201 (spec 7.7)`,
  )
}

export function patchStep(
  actor: Actor,
  stepId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(`/steps/${stepId}`, 'PATCH', body)
}

export function deleteStep(actor: Actor, stepId: string): Promise<RawResponse> {
  return actor.browser.api(`/steps/${stepId}`, { method: 'DELETE' })
}

export function pullIntoMyDay(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/my-day`, 'POST', {})
}

export function dropFromMyDay(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}/my-day`, { method: 'DELETE' })
}

/* ------------------------------------------------------------------ *
 * Setup that later packages will own, seeded directly
 * ------------------------------------------------------------------ */

/*
Recurrence is P6's surface: 4.11 requires the subset revalidated
server-side, the RFC 0001 P3 row defers the recurrence_rule arm of 7.6's
body with the validator it needs, and a rule accepted here would be
unvalidated rather than absent. INV-13 makes series_id mandatory beside the
rule, and 4.5's CHECK makes due_date mandatory beside both, so the caller
seeds a dated task first.
*/
export async function seedRecurrence(
  db: Db,
  taskId: string,
  options: { rule?: string; seriesId?: string } = {},
): Promise<string> {
  const seriesId = options.seriesId ?? randomUUID()
  await db.execute(sql`
    UPDATE tasks
       SET recurrence_rule = ${options.rule ?? 'FREQ=WEEKLY;BYDAY=MO'},
           series_id = ${seriesId}::uuid
     WHERE id = ${taskId}::uuid
  `)
  return seriesId
}

/*
Reminders are P7's surface: 4.8 makes fire_at NOT NULL and 8.6 is the only
thing that computes it, which is why the RFC 0001 P3 row defers the reminder
arm of 7.6's body. Offset mode, because 4.8 admits it only beside a
due_time; seedReminder in folders-harness.ts writes the date-only mode for
tasks without one. fire_at is any future instant: the criteria here turn on
the row's existence, its mode, and its value, never on when it would fire.
*/
export async function seedOffsetReminder(
  db: Db,
  taskId: string,
  createdBy: string,
  offsetMinutes = 30,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO reminders (task_id, offset_minutes, fire_at, created_by)
    VALUES (${taskId}::uuid, ${offsetMinutes},
            ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz,
            ${createdBy}::uuid)
  `)
}

/* ------------------------------------------------------------------ *
 * Database truth, scoped to this suite's rows
 * ------------------------------------------------------------------ */

/*
Every temporal column below is rendered by the database, never handed over
by the driver, and the readers in this section are the only place that
choice has to be made.

The two backends disagree about how a temporal column arrives in JS, and
the disagreement is invisible until CI runs the postgres:18 leg, which
11.10 makes the production-fidelity authority. PGlite hands back the string
Postgres printed; node-postgres registers a parser for OID 1082 (date) and
OID 1184 (timestamptz) and hands back a JS Date. Measured on the installed
pg 8.22.0 and postgres-date 1.0.7 rather than recalled, by applying those
parsers to the text a column puts on the wire:

- String() of a parsed date is "Mon Aug 24 2026 00:00:00 GMT+0200 (...)",
  so a reader taking its first ten characters gets "Mon Aug 24" and every
  comparison against a 4.11 date fails on that leg alone.
- String() of a parsed instant has one-second resolution, so two instants
  inside the same second compare equal. That one is worse than a failure:
  it would quietly retire every "a no-op wrote nothing" and "the refusal
  touched nothing" assertion in this package, all of which compare an
  updated_at across an operation that takes microseconds.

to_char answers text (OID 25), which node-postgres passes through
unchanged, so one format reaches the test on either leg and it is 4.11's
own. This is what the domain module already does with every floating date
it serializes, for the same reason.

Formatting on the JS side was considered and rejected. postgres-date builds
a date-only value at local midnight, so toISOString() on it prints the day
before on every machine east of UTC, which is precisely the shift 4.11
stores floating dates to avoid; a helper would have to remember to use the
local getters instead, and remembering is what failed here the first time.
*/
const DATE_FORMAT = 'YYYY-MM-DD'
const TIME_FORMAT = 'HH24:MI:SS'
// Microseconds are kept: an assertion that a no-op wrote nothing is only
// as sharp as the precision it compares at, and Postgres stores six digits.
const INSTANT_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'

// The column names are literals in this file, never anything a test supplies.
function dateColumn(name: string): SQL {
  return sql.raw(`to_char(${name}, '${DATE_FORMAT}') AS ${name}`)
}

function timeColumn(name: string): SQL {
  return sql.raw(`to_char(${name}, '${TIME_FORMAT}') AS ${name}`)
}

function instantColumn(name: string): SQL {
  return sql.raw(
    `to_char(${name} AT TIME ZONE 'UTC', '${INSTANT_FORMAT}') AS ${name}`,
  )
}

export interface TaskRow extends Record<string, unknown> {
  id: string
  folder_id: string
  title: string
  status: string
  assignee_id: string | null
  due_date: string | null
  due_time: string | null
  recurrence_rule: string | null
  series_id: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
  created_by: string
  important: boolean
  notes: string | null
}

/*
Projected explicitly rather than SELECT *, because the point is that every
temporal column is named and rendered. Section 4 is frozen, so the column
list is stable, and a column added to tasks without amending it would be a
change this suite should notice rather than absorb.
*/
export async function taskRow(
  db: Db,
  taskId: string,
): Promise<TaskRow | undefined> {
  const found = await rows(
    db,
    sql`
      SELECT id, folder_id, title, notes, status, important,
             ${dateColumn('due_date')}, ${timeColumn('due_time')},
             recurrence_rule, series_id, assignee_id, created_by, completed_by,
             ${instantColumn('completed_at')},
             ${instantColumn('created_at')},
             ${instantColumn('updated_at')}
        FROM tasks WHERE id = ${taskId}
    `,
  )
  return found[0] as TaskRow | undefined
}

/** The row, asserted present: a criterion about a task's stored state
 * cannot be read off a row that a wrong implementation deleted. */
export async function requireTaskRow(db: Db, taskId: string): Promise<TaskRow> {
  const row = await taskRow(db, taskId)
  expect(row, `task ${taskId} must still exist`).toBeDefined()
  return row as TaskRow
}

export async function reminderRow(
  db: Db,
  taskId: string,
): Promise<Record<string, unknown> | undefined> {
  const found = await rows(
    db,
    sql`
      SELECT task_id, offset_minutes, ${timeColumn('time_of_day')},
             ${instantColumn('fire_at')}, state, ${instantColumn('fired_at')},
             created_by
        FROM reminders WHERE task_id = ${taskId}
    `,
  )
  return found[0]
}

export async function stepRows(
  db: Db,
  taskId: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    db,
    sql`
      SELECT id, task_id, title, done, position, ${instantColumn('created_at')}
        FROM steps WHERE task_id = ${taskId} ORDER BY position, id
    `,
  )
}

export async function myDayRows(
  db: Db,
  taskId: string,
): Promise<Record<string, unknown>[]> {
  return rows(
    db,
    sql`
      SELECT task_id, user_id, ${dateColumn('added_on')}
        FROM my_day_entries WHERE task_id = ${taskId} ORDER BY user_id
    `,
  )
}

/** The pull date, already in 4.11's format because the database printed it:
 * no slicing, because there is nothing left on it to slice off. */
export async function myDayAddedOn(
  db: Db,
  taskId: string,
  userId: string,
): Promise<string | undefined> {
  const found = await rows(
    db,
    sql`
      SELECT ${dateColumn('added_on')} FROM my_day_entries
       WHERE task_id = ${taskId} AND user_id = ${userId}
    `,
  )
  const first = found[0]
  return first === undefined ? undefined : String(first.added_on)
}

/** today in UTC, which is today(V) for every actor in this package: the
 * harness signs in without the 7.1 tz parameter, so 7.1 provisions UTC. */
export function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function yesterdayInUtc(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * The invariant sweep
 * ------------------------------------------------------------------ */

/*
Files whose cases each create their own fixture collect the ids as they go
and sweep them at the end. An empty collection means no case got far enough
to create one, and the sweep would then pass while asserting nothing about
this package, which reads as coverage that is not there. Asserted rather
than tolerated, so the sweep fails with the file it belongs to.
*/
export function expectSweptTasks(taskIds: readonly string[]): void {
  expect(
    taskIds.length,
    'the invariant sweep runs over the rows this file\'s own cases created, and none exist',
  ).toBeGreaterThan(0)
}

/*
The task-scoped half of the sweep the persona requires after mutation-heavy
tests. The folder-scoped half (INV-2, INV-3, INV-4, INV-5, INV-10) is
P2's expectFolderInvariants, delegated to rather than restated. Deleted
tasks are skipped by name: the deleting test asserts the cascade itself, and
section 3 speaks of rows that exist.
*/
export async function expectTaskInvariants(
  db: Db,
  taskIds: readonly string[],
  folderIds: readonly string[],
  userIds: readonly string[],
): Promise<void> {
  for (const taskId of taskIds) {
    const row = await taskRow(db, taskId)
    if (row === undefined) continue

    const folder = await rows(
      db,
      sql`SELECT id FROM folders WHERE id = ${String(row.folder_id)}`,
    )
    expect(
      folder.length,
      `INV-1: task ${taskId} must reference an existing folder`,
    ).toBe(1)

    if (row.due_date === null) {
      expect(
        row.due_time,
        `INV-6: task ${taskId} has no due_date, so due_time must be null`,
      ).toBeNull()
      expect(
        row.recurrence_rule,
        `INV-6: task ${taskId} has no due_date, so recurrence_rule must be null`,
      ).toBeNull()
      expect(
        await reminderRow(db, taskId),
        `INV-6: task ${taskId} has no due_date, so no reminder row may exist`,
      ).toBeUndefined()
    }

    const completed = row.status === 'completed'
    expect(
      row.completed_at !== null,
      `INV-8: task ${taskId} is ${String(row.status)}, so completed_at must ${completed ? 'be set' : 'be null'}`,
    ).toBe(completed)
    expect(
      row.completed_by !== null,
      `INV-8: task ${taskId} is ${String(row.status)}, so completed_by must ${completed ? 'be set' : 'be null'}`,
    ).toBe(completed)

    if (row.recurrence_rule !== null) {
      expect(
        row.series_id,
        `INV-13: task ${taskId} carries a recurrence_rule, so series_id must be set`,
      ).not.toBeNull()
    }

    const entries = await myDayRows(db, taskId)
    const owners = entries.map((entry) => String(entry.user_id))
    expect(
      owners.length,
      `INV-12: at most one My Day entry per (task, user) on task ${taskId}`,
    ).toBe(new Set(owners).size)
  }

  await expectFolderInvariants(db, folderIds, userIds)
}

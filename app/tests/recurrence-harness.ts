/*
Harness for the P6 recurrence criteria (AC-071 to AC-082), built on the P3
task layer and the P4 view layer: the same booted application, lazily
signed-in casts, 7.0 shape judges, database readers that print every
temporal column through to_char, and the zone arithmetic AC-050 and AC-132
already run on.

Five decisions worth the words:

**Rules are seeded, transitions are requested.** No API surface can attach a
recurrence_rule today: the RFC 0001 P3 row deferred that arm of frozen 7.6's
two write bodies with the 4.11 validator it needs, and P6 delivers the
validator in a session that follows this one. So every fixture here creates
its task through POST /tasks, which is merged, and then writes the rule with
the P3 harness's seedRecurrence, the folders-harness precedent for a surface
a later package owns. AC-071 is the exception and the reason the exception is
safe: it is the criterion that asserts the write path itself, so it sends
rules through the two bodies and asserts what they answer.

**Recurring transitions get their own judge.** transitionOk in
tasks-harness.ts asserts generated_task and deleted_successor_id are both
null, correctly, because no row that package transitions carries a rule. A
recurring transition is exactly the case those two assertions were written to
exclude, so it travels transitionRecurringOk below, which judges the same
envelope key-exact and then judges the companions by shape rather than by
nullity, leaving which of them is null to the criterion that knows.

**The tz parameter is explicit at every call site and never defaulted.**
Frozen 7.6 took it on complete and abandon by the owner's ruling of
2026-08-10, and an absent one is a 422 exactly where generation would run. A
harness that quietly supplied a zone would make that refusal unreachable and
would hide, from every file here, which of two rules a call depends on. So
the transport takes tz as a required parameter and a separate transport sends
no query string at all, the shape tasks-harness.ts gave the 7.8 pull for the
same reason: omitting a zone is something a test says on purpose.

**Rule strings are built from a date, never written as constants.** Section
12's ruling of 2026-08-10 asserts AC-072 to AC-075 by their content rather
than at the July 2026 dates they quote, because the completing side of each
worked example is today wherever the suite runs. Every one of those files
therefore needs a weekly rule whose BYDAY matches a computed date's weekday,
and a builder that got that mapping wrong would make four criteria assert the
wrong relationship while still passing or failing for reasons that look like
the engine's. The mapping is one function here, and recurrence-harness.test.ts
pins it against dates whose weekdays are facts.

**UNTIL is written in RFC 5545's DATE form, YYYYMMDD**, which 11.9 records
as a reading of frozen 4.11 rather than a change to it, ruled at the P6
mid-package change control on 2026-08-10. This file derived it before that
ruling and escalated it: 4.11 calls recurrence_rule an RFC 5545 RRULE value
string and calls UNTIL "a date, inclusive per RFC 5545", and within an RRULE
that value type is a DATE or DATE-TIME whose DATE form carries no separators,
while the extended spelling every other date on this contract uses had a
convention line of its own to point at. The derivation had no gap in it, but
it was the one piece of the 4.11 grammar this suite spells rather than quotes,
and the grammar module would have derived it separately. It is settled text
now, and it is the form these builders already emitted.
*/
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../db/client.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import type { RawResponse } from './http-client.js'
import { rows } from './helpers.js'
import {
  asRecord,
  createTaskOk,
  expectExactKeys,
  expectTaskCardShape,
  expectTaskDetailShape,
  requireTaskRow,
  seedRecurrence,
} from './tasks-harness.js'
import type { TaskDetailBody, TaskRow } from './tasks-harness.js'

/* ------------------------------------------------------------------ *
 * The 4.11 grammar, as far as a fixture needs to write it
 * ------------------------------------------------------------------ */

/** BYDAY values, 4.11: MO to SU. Indexed by the JS weekday number so a
 * calendar date maps to the token a rule must carry to match it. */
const BYDAY_BY_WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function assertCalendarDate(date: string, source: string): void {
  expect(
    DATE_ONLY.test(date),
    `${source} needs a 4.11 calendar date, YYYY-MM-DD; got ${JSON.stringify(date)}`,
  ).toBe(true)
}

/**
 * The BYDAY token for a floating calendar date. Parsed at UTC noon rather
 * than through Date.parse of the bare string, which is midnight UTC and one
 * hour from a boundary that a host in a negative offset moves.
 */
export function bydayOf(date: string): string {
  assertCalendarDate(date, 'bydayOf')
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const at = new Date(Date.UTC(year, month - 1, day, 12))
  return BYDAY_BY_WEEKDAY[at.getUTCDay()] as string
}

/** A weekly rule that lands on the given date's own weekday, which is what
 * makes that date an instance of its own series (8.5 anchors evaluation at
 * DTSTART = the current occurrence's due_date). */
export function weeklyRuleOn(date: string): string {
  return `FREQ=WEEKLY;BYDAY=${bydayOf(date)}`
}

/** RFC 5545's DATE form for UNTIL: YYYYMMDD, no separators. See the header. */
export function untilStamp(date: string): string {
  assertCalendarDate(date, 'untilStamp')
  return date.replace(/-/g, '')
}

/** A weekly rule bounded at a date, inclusive per 4.11 and RFC 5545. */
export function weeklyRuleUntil(date: string, until: string): string {
  return `${weeklyRuleOn(date)};UNTIL=${untilStamp(until)}`
}

/* ------------------------------------------------------------------ *
 * The fixture every generation criterion starts from
 * ------------------------------------------------------------------ */

export interface RecurringFixtureOptions {
  folderId: string
  title: string
  dueDate: string
  rule: string
  dueTime?: string
  important?: boolean
  notes?: string
  steps?: readonly string[]
  assigneeId?: string
}

export interface RecurringFixture {
  taskId: string
  seriesId: string
  dueDate: string
  rule: string
}

/*
A pending task that carries a rule: created through POST /tasks, which is
merged, and then given its rule by the P3 harness's direct seed. The split is
the point. Nothing in frozen 7.6's write bodies accepts a rule until this
package's schema arm lands, so a fixture that asked for one would be asserting
AC-071 by accident in twelve files, and every generation criterion would fail
on the validator rather than on the engine it is about. AC-071 owns the write
path; everything else here owns what happens to a row that already carries a
rule, which is what 5.1 and 8.5 are actually about.
*/
export async function seedRecurringTask(
  db: Db,
  actor: Actor,
  options: RecurringFixtureOptions,
): Promise<RecurringFixture> {
  const created = await createTaskOk(
    actor,
    {
      title: options.title,
      folder_id: options.folderId,
      due_date: options.dueDate,
      ...(options.dueTime === undefined ? {} : { due_time: options.dueTime }),
      ...(options.important === undefined
        ? {}
        : { important: options.important }),
      ...(options.notes === undefined ? {} : { notes: options.notes }),
      ...(options.steps === undefined ? {} : { steps: [...options.steps] }),
      ...(options.assigneeId === undefined
        ? {}
        : { assignee_id: options.assigneeId }),
    },
    `the occurrence under test must be creatable before it can carry a rule (spec 7.6); ${options.title}`,
  )
  const seriesId = await seedRecurrence(db, created.id, { rule: options.rule })
  return {
    taskId: created.id,
    seriesId,
    dueDate: options.dueDate,
    rule: options.rule,
  }
}

/* ------------------------------------------------------------------ *
 * The two generating transitions, which carry a zone
 * ------------------------------------------------------------------ */

export type Transition = 'complete' | 'uncomplete' | 'abandon' | 'restore'

/**
 * A transition carrying tz, the shape frozen 7.6 took on complete and
 * abandon by the owner's ruling of 2026-08-10. Unjudged: the refusal cases
 * need the raw response.
 */
export function transitionWithTz(
  actor: Actor,
  taskId: string,
  event: Transition,
  tz: string,
): Promise<RawResponse> {
  return actor.browser.json(
    `/tasks/${taskId}/${event}?tz=${encodeURIComponent(tz)}`,
    'POST',
    {},
  )
}

/**
 * A transition with no tz query parameter at all. Separate from the
 * transport above so an omitted zone is always deliberate, and used by both
 * kinds of call the ruling distinguishes: the refusal on a rule-carrying
 * pending row, and the untouched call on everything else.
 */
export function transitionWithoutTz(
  actor: Actor,
  taskId: string,
  event: Transition,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/${event}`, 'POST', {})
}

export interface RecurringTransitionBody {
  task: TaskDetailBody
  /** 7.6: TaskCard or null. Shape-judged when present, never null-judged. */
  generated: Record<string, unknown> | null
  deletedSuccessorId: string | null
}

/*
The 7.6 envelope judged for a row that may carry a rule. Everything
transitionOk asserts about the envelope is asserted here, except the two
sentences that make it P3's: that generated_task and deleted_successor_id are
null. Those are the values under test in this package, so this judge takes
them as far as their declared types and hands them back.
*/
function judgeTransitionBody(
  response: RawResponse,
  event: Transition,
): RecurringTransitionBody {
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
  if (body.generated_task !== null) {
    expectTaskCardShape(
      body.generated_task,
      `the POST /tasks/:id/${event} generated_task`,
    )
  }
  if (body.deleted_successor_id !== null) {
    expect(
      typeof body.deleted_successor_id,
      `the POST /tasks/:id/${event} deleted_successor_id must be an id string or null (spec 7.6)`,
    ).toBe('string')
  }
  return {
    task,
    generated: body.generated_task as Record<string, unknown> | null,
    deletedSuccessorId: body.deleted_successor_id as string | null,
  }
}

/** A generating transition asserted: 200 and the 7.6 envelope. */
export async function transitionRecurringOk(
  actor: Actor,
  taskId: string,
  event: Transition,
  tz: string,
  why: string,
): Promise<RecurringTransitionBody> {
  const response = await transitionWithTz(actor, taskId, event, tz)
  expectStatus(response, 200, why)
  return judgeTransitionBody(response, event)
}

/** A G-SERIES transition asserted: 200 and the 7.6 envelope, sent with no
 * zone, which is the whole shape uncomplete and restore have. */
export async function transitionSeriesOk(
  actor: Actor,
  taskId: string,
  event: 'uncomplete' | 'restore',
  why: string,
): Promise<RecurringTransitionBody> {
  const response = await transitionWithoutTz(actor, taskId, event)
  expectStatus(response, 200, why)
  return judgeTransitionBody(response, event)
}

/** The successor the envelope reported, asserted present. A criterion that
 * reads a generated row cannot read it off a null. */
export function requireGenerated(
  body: RecurringTransitionBody,
  why: string,
): Record<string, unknown> {
  expect(
    body.generated,
    `${why} (spec 7.6: generated_task carries the TaskCard generation created; spec 8.5)`,
  ).not.toBeNull()
  return body.generated as Record<string, unknown>
}

/**
 * A series_id on a row that carries no rule: the shape every closed
 * occurrence has once generation moved the rule on. seedRecurrence writes
 * both columns together, correctly, because a rule without a series breaks
 * INV-13; history needs the other half on its own.
 */
export async function seedSeriesMembership(
  db: Db,
  taskId: string,
  seriesId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE tasks SET series_id = ${seriesId}::uuid WHERE id = ${taskId}::uuid
  `)
}

/* ------------------------------------------------------------------ *
 * Reading a series
 * ------------------------------------------------------------------ */

/** Every row of a series, oldest first. created_at then id, because two
 * rows of one series can share an instant only if something wrote them in
 * one statement, and the order still has to be total. */
export async function seriesRows(
  db: Db,
  seriesId: string,
): Promise<TaskRow[]> {
  const found = await rows(
    db,
    sql`
      SELECT id FROM tasks WHERE series_id = ${seriesId}::uuid
       ORDER BY created_at, id
    `,
  )
  const ordered: TaskRow[] = []
  for (const row of found) {
    ordered.push(await requireTaskRow(db, String(row.id)))
  }
  return ordered
}

/** The rows of a series other than the one named: what generation added,
 * read from the database rather than from the response that claims it. */
export async function successorsOf(
  db: Db,
  seriesId: string,
  originalId: string,
): Promise<TaskRow[]> {
  return (await seriesRows(db, seriesId)).filter((row) => row.id !== originalId)
}

/** Exactly one successor, asserted, and returned. The count is the
 * assertion: 8.5 inserts one row per generating transition, and a
 * pile-up is the failure AC-074 and AC-077 both exist to catch. */
export async function requireOneSuccessor(
  db: Db,
  seriesId: string,
  originalId: string,
  why: string,
): Promise<TaskRow> {
  const found = await successorsOf(db, seriesId, originalId)
  expect(
    found.map((row) => `${row.id} ${String(row.status)} due ${String(row.due_date)}`),
    `${why}; the series must hold exactly one row besides the closed one (spec 8.5)`,
  ).toHaveLength(1)
  return found[0] as TaskRow
}

/* ------------------------------------------------------------------ *
 * The 7.10 virtual instance
 * ------------------------------------------------------------------ */

export interface VirtualInstance extends Record<string, unknown> {
  task_id: string
  title: string
  date: string
  due_time: string | null
  folder_id: string
}

/*
7.10 enumerates this element's keys, so they are judged key-exact, the same
reading the P3 harness applies to the two 7.0 shapes. The P4 layer asserted
only that the array exists, deliberately, because nothing could draw in it
until this package; that file's comment routes the element's shape here.
*/
export function expectVirtualInstances(
  value: readonly unknown[],
  source: string,
): VirtualInstance[] {
  return value.map((element, index) => {
    const where = `${source}[${String(index)}]`
    const instance = asRecord(element, where)
    expectExactKeys(
      instance,
      ['date', 'due_time', 'folder_id', 'task_id', 'title'],
      where,
    )
    expect(typeof instance.task_id, `${where}.task_id must be a string`).toBe(
      'string',
    )
    expect(typeof instance.title, `${where}.title must be a string`).toBe(
      'string',
    )
    expect(
      typeof instance.folder_id,
      `${where}.folder_id must be a string`,
    ).toBe('string')
    expect(
      typeof instance.date === 'string' && DATE_ONLY.test(instance.date),
      `${where}.date must be a floating ISO calendar date (spec 4.11, 7.0's reading of how floating values ride the wire); got ${JSON.stringify(instance.date)}`,
    ).toBe(true)
    if (instance.due_time !== null) {
      expect(
        typeof instance.due_time === 'string' &&
          /^\d{2}:\d{2}$/.test(instance.due_time),
        `${where}.due_time must be HH:MM or null (spec 7.0 as ruled at the P3 shape review); got ${JSON.stringify(instance.due_time)}`,
      ).toBe(true)
    }
    return instance as VirtualInstance
  })
}

/** The projected dates for one task, in the order the response gave them. */
export function ghostDatesFor(
  instances: readonly VirtualInstance[],
  taskId: string,
): string[] {
  return instances
    .filter((instance) => instance.task_id === taskId)
    .map((instance) => instance.date)
}

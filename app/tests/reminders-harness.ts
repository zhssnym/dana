/*
Harness for the P7 reminder criteria (AC-083 to AC-090, and the numbers this
package's change control appends), built on the P2 to P6 layers: the same
booted application, stub identity provider, cookie-jar browsers, task
transports and invariant sweep, plus what 8.6's computation, frozen 7.9's two
endpoints, and 11.7's delivery loop need.

Six decisions worth the words.

**Every actor here names its zone.** 8.6 computes a fire instant in the
assignee's stored users.timezone, or the creator's when the task is
unassigned, so a P7 actor whose zone was never stated is a fixture whose
expected answer cannot be written down. `ZoneCast` signs each one in through
7.1's tz parameter, which is the write path 8.1 gives that column and the one
AC-007 already pins; nothing here writes users.timezone with SQL.

**The computation criteria go through the write path; the delivery criteria
seed their rows.** This is P6's split (rules seeded, transitions requested)
applied to the other half of the same problem. AC-083 to AC-086 and the
recompute numbers are about what a write path computes, so they create their
reminders through frozen 7.9's PUT or 7.6's create body. AC-087 to AC-090 and
the pass criteria are about the loop, so their rows are seeded with a chosen
mode, value, fire_at and state, and their failures stay attributable to the
loop rather than to a PUT that has not been written yet. `setFireAt` reaches a
timed boundary without waiting at it, which is AC-113's precedent and P5's
last_sent_at backdater.

**Expected instants are computed here through Intl, never imported, and the
two DST policy rules are not computed at all.** The standing rule is the
suite's: a helper imported from the module under test would agree with itself.
Intl is admissible for the ordinary case, an unambiguous local time whose
offset is a lookup, and `instantAtWallTime` guards itself by reading its
answer back, which catches a gap and, measured rather than assumed, does not
catch a fold. It is not admissible for the two rules of 8.6, and section 13
item 25 says why: Intl is Luxon's own engine, so comparing the module against
it would be circular, and a gap has no correct answer and a fold has two, both
being Dana policy rather than tzdb arithmetic. Those two expected instants are
therefore written as literal constants derived by hand from the transition,
beside the instant Luxon's raw behavior would produce, so each case
discriminates against exactly the answer 11.9 records as wrong.

**Every DST fixture is a historical transition in a zone whose rules have been
stable for decades, and each one asserts it still is.** Item 25's reason is
that the Node runtime and the embedded engine of 11.10 carry tzdb copies that
move independently, so a fixture on a future transition is a flake waiting for
an upstream release. `expectGapFixture` and `expectFoldFixture` read the
transition off this runtime before anything depends on it, so a tzdb that
moved fails as "this is no longer a gap" rather than as a wrong fire instant.

**Sends are counted through the ratified 11.10 sink**, the shape AC-024 has
used since P2, matched by word (/remind/i) the way the share-grant convention
matches its own template. No verified sending domain is involved anywhere, and
none is needed: 11.8 forbids real sending under test.

**The pass is reached through one seam, ratified into 11.7 and stated once
here.** 11.7 makes the delivery loop a plain callable rather than a route, and
frozen section 7 offers no endpoint that runs one pass, so the acceptance
suite cannot reach it over HTTP the way 11.10 reaches everything else. The
seam below was this file's proposal and is now that section's own text, taken
whole at the P7 mid-package change control on 2026-08-10, exactly as
options.notifications was ratified into 11.10 at P1: the module path and the
two dependencies are fixed, the tolerance over the export name is kept
deliberately so the choice stays the implementing session's, and nothing about
the pass's internals is fixed by any of it. It is loaded through a computed
specifier so that
its absence is one named assertion failure rather than a module-load crash
that would take a whole file's coverage with it, the loader shape 11.15
records and src/server/auth/router.ts already uses.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db, DbClient } from '../db/client.js'
import { cleanupAuthSubs, signIn, userForSub } from './auth-harness.js'
import type { AuthTestApp, OutboundEmail, UserRow } from './auth-harness.js'
import { expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { rows } from './helpers.js'
import type { RawResponse } from './http-client.js'
import { expectAffectedTask, reminderRow } from './tasks-harness.js'
import type { TaskDetailBody } from './tasks-harness.js'

/* ------------------------------------------------------------------ *
 * Zones, and the wall-clock arithmetic that turns one into an instant
 * ------------------------------------------------------------------ */

/** No DST since 2009, and the zone AC-083 names. */
export const KARACHI = 'Asia/Karachi'
/** US rule, unchanged since the 2007 Energy Policy Act took effect. */
export const NEW_YORK = 'America/New_York'
/** EU rule, unchanged since 1996. */
export const LONDON = 'Europe/London'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const TIME_ONLY = /^\d{2}:\d{2}$/

interface WallClock {
  date: string
  time: string
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The civil date and wall-clock time in a zone at an instant, assembled from
 * formatToParts rather than from a locale's ordering. views-harness.ts does
 * the same for its date half; the minute is needed here because a fire instant
 * is a minute-precision value (4.8).
 */
export function wallClockIn(zone: string, at: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const found: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }
  const year = found.year ?? Number.NaN
  return {
    date: `${String(year).padStart(4, '0')}-${two(found.month ?? 0)}-${two(found.day ?? 0)}`,
    time: `${two((found.hour ?? 0) % 24)}:${two(found.minute ?? 0)}`,
  }
}

/** Minutes the zone is ahead of UTC at an instant. */
export function offsetAt(zone: string, at: Date): number {
  const clock = wallClockIn(zone, at)
  const [year, month, day] = clock.date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [hour, minute] = clock.time.split(':').map(Number) as [number, number]
  return (Date.UTC(year, month - 1, day, hour, minute) - at.getTime()) / 60_000
}

/**
 * The UTC instant at which a chosen wall clock reads in a zone.
 *
 * Two passes, because the offset to subtract is the offset at the answer
 * rather than at the guess. Then the answer is read back and asserted to be
 * the wall clock that was asked for.
 *
 * That read-back catches a gap, where no instant carries the requested wall
 * clock, and it deliberately does not catch a fold, where two do and both read
 * back correctly: measured in reminders-harness.test.ts rather than claimed,
 * and what this helper reaches there is the later instant, which is the one
 * 8.6 refuses. So the guard is a guard against one of the two, and the rule
 * for both is the same: neither GAP nor FOLD takes its expected instant from
 * here. They are hand-derived constants below, because section 13 item 25
 * makes Intl a circular oracle for exactly these two cases.
 */
export function instantAtWallTime(
  zone: string,
  date: string,
  time: string,
): Date {
  expect(
    DATE_ONLY.test(date),
    `instantAtWallTime needs a 4.11 calendar date; got ${JSON.stringify(date)}`,
  ).toBe(true)
  expect(
    TIME_ONLY.test(time),
    `instantAtWallTime needs an HH:MM wall time; got ${JSON.stringify(time)}`,
  ).toBe(true)
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const naive = Date.UTC(year, month - 1, day, hour, minute)

  let answer = new Date(naive - offsetAt(zone, new Date(naive)) * 60_000)
  answer = new Date(naive - offsetAt(zone, answer) * 60_000)

  const readBack = wallClockIn(zone, answer)
  expect(
    `${readBack.date} ${readBack.time}`,
    `instantAtWallTime is exact only where a local time exists exactly once. ${date} ${time} in ${zone} is a gap or a fold on this runtime's tzdb, and 8.6 resolves those by policy rather than by arithmetic (section 13 item 25), so its instant is written by hand rather than computed here`,
  ).toBe(`${date} ${time}`)
  return answer
}

/** Whole days added to a floating calendar date, anchored at UTC noon so no
 * shift lands on a boundary the host's own zone would move. */
export function shiftDay(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const at = new Date(Date.UTC(year, month - 1, day, 12))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Local wall time minus a 4.8 offset, as a wall clock on the same or an
 * earlier date. The two-field answer is what 8.6's offset arm computes before
 * the zone is applied. */
export function wallTimeMinus(
  date: string,
  time: string,
  offsetMinutes: number,
): WallClock {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const at = new Date(
    Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000,
  )
  return {
    date: at.toISOString().slice(0, 10),
    time: at.toISOString().slice(11, 16),
  }
}

/**
 * 8.6's offset arm, computed here: local = datetime(due_date, due_time) minus
 * offset_minutes, then that local time in the zone. Written as the
 * specification writes it, in two steps, so a failure says which step is
 * wrong.
 */
export function offsetFireInstant(
  zone: string,
  dueDate: string,
  dueTime: string,
  offsetMinutes: number,
): Date {
  const local = wallTimeMinus(dueDate, dueTime, offsetMinutes)
  return instantAtWallTime(zone, local.date, local.time)
}

/** 8.6's date-only arm: local = datetime(due_date, time_of_day). */
export function dateOnlyFireInstant(
  zone: string,
  dueDate: string,
  timeOfDay: string,
): Date {
  return instantAtWallTime(zone, dueDate, timeOfDay)
}

/* ------------------------------------------------------------------ *
 * The two DST fixtures, and the assertion that they are still what they were
 * ------------------------------------------------------------------ */

/*
America/New_York, 2010-03-14. The clock jumps 02:00 to 03:00 local, so every
local time in [02:00, 03:00) exists on no instant at all. 8.6 resolves a
nonexistent local time to the first valid instant after the gap, which is the
transition instant itself, 07:00Z, reading 03:00 local. 11.9 records what
Luxon does instead: it advances by the gap length, turning 02:30 into 03:30
local, which is 07:30Z. Both are written here so the criterion can assert the
first and refuse the second by name.
*/
export const GAP = {
  zone: NEW_YORK,
  date: '2010-03-14',
  /** A local time inside the gap. */
  localTime: '02:30',
  /** 8.6: the first valid instant after the gap, 03:00 local. */
  resolved: new Date('2010-03-14T07:00:00Z'),
  /** 11.9: what raw Luxon answers, 03:30 local, one gap length on. */
  luxonRaw: new Date('2010-03-14T07:30:00Z'),
  /** The last instant before the transition, 01:59 local. */
  beforeGap: new Date('2010-03-14T06:59:00Z'),
} as const

/*
Europe/London, 2010-10-31. The clock falls back 02:00 BST to 01:00 GMT, so
every local time in [01:00, 02:00) happens twice: once at UTC+01:00 and again
an hour later at UTC+00:00. 8.6 resolves an ambiguous local time to the
earlier instant, 00:30Z. Luxon's documentation declares the choice undefined
(11.9), and the wrong answer available is the later one, 01:30Z.
*/
export const FOLD = {
  zone: LONDON,
  date: '2010-10-31',
  /** A local time inside the overlap. */
  localTime: '01:30',
  /** 8.6: the earlier of the two instants, still on BST. */
  resolved: new Date('2010-10-31T00:30:00Z'),
  /** The later of the two, already on GMT: the answer 8.6 refuses. */
  later: new Date('2010-10-31T01:30:00Z'),
} as const

/** The gap is a gap on this runtime: the local hour before the transition is
 * 01, the local hour at it is 03, and the offsets either side differ by the
 * hour that went missing. Asserted before anything depends on it, because a
 * tzdb that moved should fail as a fixture rather than as arithmetic. */
export function expectGapFixture(): void {
  expect(
    wallClockIn(GAP.zone, GAP.beforeGap),
    `${GAP.zone} must still read 01:59 local at ${GAP.beforeGap.toISOString()}, the minute before the 2010 spring-forward (section 13 item 25: historical transitions, asserted rather than assumed)`,
  ).toEqual({ date: GAP.date, time: '01:59' })
  expect(
    wallClockIn(GAP.zone, GAP.resolved),
    `and 03:00 local at ${GAP.resolved.toISOString()}, so every local time from 02:00 to 02:59 on ${GAP.date} exists on no instant`,
  ).toEqual({ date: GAP.date, time: '03:00' })
  expect(
    offsetAt(GAP.zone, GAP.resolved) - offsetAt(GAP.zone, GAP.beforeGap),
    'the transition must still be exactly one hour wide',
  ).toBe(60)
}

/** The fold is a fold on this runtime: two instants an hour apart read the
 * same wall clock, and the earlier one is still on the summer offset. */
export function expectFoldFixture(): void {
  expect(
    wallClockIn(FOLD.zone, FOLD.resolved),
    `${FOLD.zone} must still read ${FOLD.localTime} local at ${FOLD.resolved.toISOString()}, the earlier of the two (section 13 item 25)`,
  ).toEqual({ date: FOLD.date, time: FOLD.localTime })
  expect(
    wallClockIn(FOLD.zone, FOLD.later),
    `and the same wall clock again an hour later at ${FOLD.later.toISOString()}, which is what makes the local time ambiguous`,
  ).toEqual({ date: FOLD.date, time: FOLD.localTime })
  expect(
    offsetAt(FOLD.zone, FOLD.resolved) - offsetAt(FOLD.zone, FOLD.later),
    'the earlier instant must still be the one on the summer offset',
  ).toBe(60)
}

/* ------------------------------------------------------------------ *
 * Actors whose zone is stated
 * ------------------------------------------------------------------ */

/**
 * Signed-in actors created with a chosen users.timezone, through the 7.1 tz
 * parameter that 8.1 makes the write path for that column. Lazily created by
 * each case, the Cast pattern: a failure in beforeAll reports the whole file
 * as one error and marks its tests skipped, which hides which criterion was
 * being asserted.
 */
export class ZoneCast {
  private readonly created: Actor[] = []

  constructor(private readonly prefix = 'p7') {}

  /** Everyone this file has signed in, which is what scopes its recorded
   * emails to rows it owns. See reminderEmailsOf. */
  actors(): readonly Actor[] {
    return [...this.created]
  }

  async signIn(
    app: AuthTestApp,
    slug: string,
    zone: string,
  ): Promise<Actor> {
    const sub = `${this.prefix}-${slug}-${randomUUID()}`
    const email = `${slug}-${randomUUID()}@${this.prefix}-reminders.test`
    app.stub.nextIdentity({
      sub,
      email,
      email_verified: true,
      name: `${this.prefix.toUpperCase()} ${slug}`,
    })
    const { browser } = await signIn(app, { tz: zone })
    const row = await userForSub(app.db, sub)
    expect(
      row,
      `sign-in must provision a user row for ${slug} (spec 7.1; P1 is merged, so this is expected to hold)`,
    ).toBeDefined()
    expect(
      (row as UserRow).timezone,
      `7.1 provisions users.timezone from the reported tz, and 8.6 computes every fire instant in it, so a P7 fixture whose zone did not take has no expected answer`,
    ).toBe(zone)
    const actor: Actor = { sub, email, id: (row as UserRow).id, browser }
    this.created.push(actor)
    return actor
  }

  /**
   * A returning login for an existing actor from a device in another zone,
   * which is the trigger AC-086 names. A fresh browser, because a second
   * device is what the criterion describes.
   */
  async reLogin(
    app: AuthTestApp,
    actor: Actor,
    zone: string,
  ): Promise<void> {
    app.stub.nextIdentity({
      sub: actor.sub,
      email: actor.email,
      email_verified: true,
      name: `${this.prefix.toUpperCase()} returning`,
    })
    await signIn(app, { tz: zone })
  }

  async cleanup(db: Db): Promise<void> {
    await cleanupAuthSubs(
      db,
      this.created.map((actor) => actor.sub),
    )
  }
}

/** The stored zone, read from the column 8.6 computes in. */
export async function storedZone(db: Db, userId: string): Promise<string> {
  const found = await rows(
    db,
    sql`SELECT timezone FROM users WHERE id = ${userId}`,
  )
  expect(found.length, `no user row for ${userId}`).toBe(1)
  return String(found[0]?.timezone)
}

/* ------------------------------------------------------------------ *
 * The frozen 7.9 surface
 * ------------------------------------------------------------------ */

export function putReminder(
  actor: Actor,
  taskId: string,
  body: unknown,
): Promise<RawResponse> {
  return actor.browser.json(`/tasks/${taskId}/reminder`, 'PUT', body)
}

/*
The ruled 7.9 response body is judged here, once, the way patchSettingsOk
judges the ruled 7.2 body and expectAffectedTask judges the ruled 7.7 and 7.8
ones. Frozen 7.9's bullet named a status and no body; the human owner ruled on
2026-08-10, escalated at the P7 kickoff, that PUT answers 200 with the
affected TaskDetail, because 7.0 gives the reminder no object of its own, this
section offers no GET for one, and TaskDetail already carries a reminder
field. So the success is judged twice over, the fresh-GET convention: a whole
TaskDetail, equal to what a fresh GET /tasks/:id then answers.

Refusals stay on the unjudged transport above, because a refusal answers the
7.0 envelope rather than a task. The DELETE keeps 7.9's own 204 and carries no
body at all, which is the half of the ruling that did not move.
*/
export async function putReminderOk(
  actor: Actor,
  taskId: string,
  body: unknown,
  why: string,
): Promise<TaskDetailBody> {
  return expectAffectedTask(
    actor,
    taskId,
    await putReminder(actor, taskId, body),
    200,
    `${why}, which must answer 200 with the affected TaskDetail (spec 7.9 as ruled on 2026-08-10)`,
  )
}

export function deleteReminder(
  actor: Actor,
  taskId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/tasks/${taskId}/reminder`, { method: 'DELETE' })
}

/** DELETE /tasks/:id/reminder asserted: 7.9's 204, and no body with it. */
export async function deleteReminderOk(
  actor: Actor,
  taskId: string,
  why: string,
): Promise<void> {
  const response = await deleteReminder(actor, taskId)
  expectStatus(response, 204, why)
  expect(
    response.body,
    '7.9 spells this 204, and a 204 carries no body; the ruling that gave PUT a body left this bullet alone',
  ).toBe('')
}

/* ------------------------------------------------------------------ *
 * The 4.8 row, seeded and read
 * ------------------------------------------------------------------ */

export interface ReminderRow extends Record<string, unknown> {
  task_id: string
  offset_minutes: number | null
  time_of_day: string | null
  fire_at: string
  state: string
  fired_at: string | null
  created_by: string
}

export async function requireReminderRow(
  db: Db,
  taskId: string,
  why: string,
): Promise<ReminderRow> {
  const row = await reminderRow(db, taskId)
  expect(row, `${why}; no reminder row exists on task ${taskId}`).toBeDefined()
  return row as ReminderRow
}

export async function expectNoReminderRow(
  db: Db,
  taskId: string,
  why: string,
): Promise<void> {
  expect(await reminderRow(db, taskId), why).toBeUndefined()
}

export interface SeedReminderOptions {
  taskId: string
  createdBy: string
  offsetMinutes?: number
  timeOfDay?: string
  /** 4.8 makes this NOT NULL, so a seed always names one. */
  fireAt: Date
  state?: 'scheduled' | 'sent' | 'skipped'
  firedAt?: Date
}

/*
A 4.8 row written directly, for the criteria that are about the delivery loop
rather than about the write path. The mode columns are 4.8's exclusive-or and
the caller names exactly one; nothing here computes a fire instant, which is
the point: a loop criterion that depended on 8.6 having been implemented
correctly would fail for the wrong package's reason.
*/
export async function seedReminderRow(
  db: Db,
  options: SeedReminderOptions,
): Promise<void> {
  expect(
    (options.offsetMinutes === undefined) !== (options.timeOfDay === undefined),
    'a seeded reminder names exactly one 4.8 mode, offset_minutes or time_of_day',
  ).toBe(true)
  await db.execute(sql`
    INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                           state, fired_at, created_by)
    VALUES (${options.taskId}::uuid, ${options.offsetMinutes ?? null},
            ${options.timeOfDay ?? null}::time,
            ${options.fireAt.toISOString()}::timestamptz,
            ${options.state ?? 'scheduled'},
            ${options.firedAt === undefined ? null : options.firedAt.toISOString()}::timestamptz,
            ${options.createdBy}::uuid)
  `)
}

/**
 * Moves a reminder's fire instant, which is how a delivery case reaches a
 * timed boundary without waiting at it: AC-113 moves a session's expiry and
 * P5 moves last_sent_at for the same reason. The value written here is never
 * what a criterion asserts; 8.6's arithmetic is asserted where it is computed.
 */
export async function setFireAt(
  db: Db,
  taskId: string,
  at: Date,
): Promise<void> {
  await db.execute(sql`
    UPDATE reminders SET fire_at = ${at.toISOString()}::timestamptz
     WHERE task_id = ${taskId}::uuid
  `)
}

/**
 * Moves a reminder into a terminal 4.8 state without running a pass, which is
 * how a case reaches "this row has already been delivered" as a precondition
 * rather than as an outcome. fired_at follows the state, since 4.8 sets it
 * whenever state leaves scheduled and a seed that ignored it would be a row
 * the loop could never have produced.
 */
export async function setReminderState(
  db: Db,
  taskId: string,
  state: 'scheduled' | 'sent' | 'skipped',
): Promise<void> {
  await db.execute(sql`
    UPDATE reminders
       SET state = ${state},
           fired_at = ${state === 'scheduled' ? null : new Date().toISOString()}::timestamptz
     WHERE task_id = ${taskId}::uuid
  `)
}

export function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000)
}

export function minutesAhead(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}

/* ------------------------------------------------------------------ *
 * Instants as the database renders them
 * ------------------------------------------------------------------ */

/*
tasks-harness.ts projects every temporal column through to_char so one format
reaches the test on both backends, and its instant format keeps all six
microsecond digits. An expected instant is formatted into that shape rather
than the row being parsed back into a Date: Date.parse on a six-digit fraction
is outside the ECMA-262 Date Time String Format and works only by engine
tolerance, and comparing strings keeps the failure message readable.
*/
export function formatInstant(at: Date): string {
  return at.toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
}

export function expectFireAt(row: ReminderRow, expected: Date, why: string): void {
  expect(
    String(row.fire_at),
    `${why}; expected ${expected.toISOString()}`,
  ).toBe(formatInstant(expected))
}

export function expectNotFireAt(
  row: ReminderRow,
  refused: Date,
  why: string,
): void {
  expect(String(row.fire_at), why).not.toBe(formatInstant(refused))
}

/* ------------------------------------------------------------------ *
 * Outbound reminder emails, through the ratified 11.10 sink
 * ------------------------------------------------------------------ */

/** 11.8's third template. Matched by word, the share-grant convention: the
 * seam fixes that a message identifies its template, not how it spells it. */
export function isReminderTemplate(template: string): boolean {
  return /remind/i.test(template)
}

/** Every reminder message the sink recorded, from any file sharing this
 * database. Deliberately not exported: see reminderEmailsOf below, which is
 * the only reading of it a criterion may count. */
function reminderEmails(app: AuthTestApp): readonly OutboundEmail[] {
  return app.emails.sent().filter((email) => isReminderTemplate(email.template))
}

/*
The reminder messages addressed to one file's own actors, and the only counter
the delivery criteria use.

Why a total is the wrong number to count, reasoned from 8.6 rather than
measured, because this machine has neither Docker nor a TEST_DATABASE_URL. A
pass polls every due row in the database: that is 8.6's poll, which scopes by
state and instant and by nothing else, and an implementation that scoped it to
one file's rows would be wrong rather than considerate. Under the default
PGlite backend each test file gets its own in-memory database, so a pass can
only ever see its own file's rows and a total is a file-local number by
accident of the backend. Under TEST_DATABASE_URL every file shares one
database and vitest sets no fileParallelism, so AC-087's pass can claim
AC-088's due rows, deliver them through this same sink and mark them sent,
which reddens both files at once and neither for its own reason.

The scope is the recipient address because 11.10 gives a message a template
and a recipient and nothing else to key on, and every actor's address carries
a fresh uuid, so no two files can collide. It weakens nothing: a broadcast to
a folder is a broadcast to that file's own members, which is what AC-088 and
AC-090 assert against, and no criterion here asserts anything about a stranger
who was never in the fixture.

Two alternatives were considered and are recorded so they are not re-derived.
Scoping the poll itself is not available: it is the specification. Disabling
file parallelism is a whole-suite cost paid for six files, and it would leave
the totals correct by scheduling rather than by construction.
*/
export function reminderEmailsOf(
  app: AuthTestApp,
  cast: ZoneCast,
): readonly OutboundEmail[] {
  return reminderEmailsFor(app, cast.actors())
}

/**
 * The same filter over a chosen few rather than over a whole file's cast, for
 * a file whose cases must not see each other's deliveries.
 *
 * A file-wide scope is enough while every case leaves the database quiet, and
 * it is not enough for a file written red: a case that fails at its first
 * assertion abandons whatever rows it had already created, and a later case
 * running a pass then delivers them and counts them as its own. Scoping each
 * case to its own actor makes the cases independent of the order they ran in
 * and of whether an earlier one got that far, which is what a red file needs
 * if its later failures are to mean anything.
 */
export function reminderEmailsFor(
  app: AuthTestApp,
  actors: readonly Actor[],
): readonly OutboundEmail[] {
  const mine = new Set(actors.map((actor) => actor.email))
  return reminderEmails(app).filter((email) => mine.has(email.to))
}

/** The addresses of the above, sorted, for the cases that assert who was
 * reached rather than how many were. */
export function reminderRecipientsOf(
  app: AuthTestApp,
  cast: ZoneCast,
): string[] {
  return reminderEmailsOf(app, cast)
    .map((email) => email.to)
    .sort()
}

/* ------------------------------------------------------------------ *
 * The 11.7 pass: one ratified seam, stated once
 * ------------------------------------------------------------------ */

/*
Built from pieces so no resolvable import names the module, which is what lets
this file typecheck and load while app/src/server/scheduler/ does not exist:
11.15 records the same mechanism for the dev-login loader, and a literal
specifier here would fail the typecheck gate for every session on this branch
until Platform's session lands.

What 11.7 now fixes, in the words this file proposed and that section took
whole: a module at app/src/server/scheduler/index.ts exporting either
createReminderPass(deps), a factory answering the callable, or
runReminderPass(deps), the callable itself; deps being { dbClient,
notifications } with the option names 11.10 already gives createApp, since the
pass needs the same database handle and the same sink and 11.8 routes every
send through the same module. Either name, deliberately: the tolerance costs
nothing because this loader accepts both, so no drift is possible in the suite
and the choice belongs to the implementing session. One pass per call, no
interval: 11.7's own sentence that the pass is a plain callable is what makes
an acceptance test of the loop possible at all.
*/
const SCHEDULER_MODULE = ['../src/server/schedu', 'ler/index.js'].join('')

interface PassDeps {
  dbClient: DbClient
  notifications: { send(message: unknown): void | Promise<void> }
}

type Pass = () => Promise<unknown>

const passes = new WeakMap<AuthTestApp, Pass>()

async function loadPass(app: AuthTestApp): Promise<Pass> {
  const cached = passes.get(app)
  if (cached !== undefined) return cached

  let module: Record<string, unknown> | undefined
  let failure = ''
  try {
    module = (await import(SCHEDULER_MODULE)) as Record<string, unknown>
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  expect(
    failure,
    `no reminder scheduler module could be loaded from app/src/server/scheduler/index.ts. 11.7 makes the 8.6 delivery loop a plain callable rather than a route, and frozen section 7 offers no endpoint that runs one pass, so that section names this module and these two dependencies as the acceptance suite's only way in, ratified at the P7 change control on the options.notifications precedent`,
  ).toBe('')

  const record = module ?? {}
  const factory = record.createReminderPass
  const direct = record.runReminderPass
  expect(
    app.emailSink,
    'the pass must be handed the same 11.10 sink the application holds, or a send it makes lands in a recorder nothing reads',
  ).toBeDefined()
  const deps: PassDeps = {
    dbClient: app.dbClient,
    notifications: app.emailSink as PassDeps['notifications'],
  }

  expect(
    typeof factory === 'function' || typeof direct === 'function',
    'the scheduler module must export createReminderPass(deps), answering the callable, or runReminderPass(deps), the callable itself (spec 11.7; the seam is escalated)',
  ).toBe(true)

  let pass: Pass
  if (typeof factory === 'function') {
    const produced = await (factory as (deps: PassDeps) => unknown)(deps)
    expect(
      typeof produced,
      'createReminderPass must answer the pass callable itself (spec 11.7)',
    ).toBe('function')
    pass = produced as Pass
  } else {
    // Decided by name rather than by probing the return value: calling the
    // direct export to learn its shape would already have run a pass, and
    // every criterion here turns on running exactly the passes it asks for.
    pass = () => (direct as (deps: PassDeps) => Promise<unknown>)(deps)
  }
  passes.set(app, pass)
  return pass
}

/** Exactly one cycle of the 11.7 loop, awaited to completion. */
export async function runPass(app: AuthTestApp): Promise<void> {
  const pass = await loadPass(app)
  await pass()
}

/** Two cycles issued together, for the case 11.7's SELECT ... FOR UPDATE SKIP
 * LOCKED exists to decide. What each backend can show is stated at the
 * assertion, not here: 11.15 makes PGlite single-connection, so the pair
 * queues locally and overlaps only on CI's postgres:18 leg. */
export async function runTwoPassesTogether(app: AuthTestApp): Promise<void> {
  const pass = await loadPass(app)
  await Promise.all([pass(), pass()])
}

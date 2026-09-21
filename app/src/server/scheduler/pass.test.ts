/*
The 11.7 pass against a real database, for the parts of it the acceptance
range cannot see.

AC-087 to AC-090 and AC-153 drive this same callable over the whole loop, and
they are the contract; nothing here duplicates them. What is left over is
three things they do not reach and one they reach only through a send.

The pass's second duty is invisible to them: 11.7 has one scheduled process
with two duties, and pruning expired sessions produces no email, no row a
criterion reads, and no response. AC-112 is about revocation, which 11.6 says
explicitly is not this.

A refused send is nobody's criterion either. 8.6 tolerates a duplicate from a
crash between send and mark and says nothing about a provider that answers
429, so what happens to the rest of a batch when one message fails is this
module's decision, and it is asserted here because it is a decision: the row
stays scheduled for the next tick, and the deliveries that already happened
are kept rather than rolled back into a second copy of themselves.

The two liveness signals are the third: /api/health's age since the last
completed pass (11.12) has answered null since P0, and the heartbeat is an
outbound call to a monitor. Neither is a row.

And the reminder template's payload is asserted at the message rather than at
the sink's count, because the suite's recorder normalizes a message down to
its template and recipient by design (11.10 fixes only those two), so the
fields that make an email usable are only visible from here.

**The delivery cases below assert no total**, and the reason is half stale.
A pass polls every due row in the database, which is 8.6's poll and not a thing
to scope, and this paragraph went on to say that "on the postgres:18 leg of
11.10 every file in the suite shares one database" — **which stopped being true
on 2026-09-03 with issue #32**: each vitest pool slot now gets a database of
its own and `postgres-leg-setup.ts` empties it before every file, so the only
rows a case can meet are this file's. The habit those cases keep is still the
right one for them and is unchanged: each asserts the rows it seeded, by task
id, reads the sink filtered the same way, and treats the outcome counts as
floors. **The purge-cap cases at the foot of this file do assert exact totals**
(issue #276), which is sound for the reason above and is the only way to stand
at a boundary of exactly two hundred; they say so where they stand, and they
scope every read back to their own folder or owner so that a case added between
them cannot make one of them lie.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import type { OutboundMessage } from '../notify/index.js'
import { secondsSinceLastPass } from '../routes/health.js'
import { createReminderPass } from './pass.js'
import type { SchedulerLogger } from './pass.js'

let client: DbClient
let db: Db

/*
Read before any pass runs, because recordSchedulerPass writes a module global
that only moves forward: capturing it at load rather than inside a test keeps
the assertion true whatever order the cases run in.
*/
const AGE_BEFORE_ANY_PASS = secondsSinceLastPass()

const KARACHI = 'Asia/Karachi'

interface CapturedLine {
  fields: Record<string, unknown>
  message: string
}

function capturingLogger(): SchedulerLogger & { lines: CapturedLine[] } {
  const lines: CapturedLine[] = []
  return {
    lines,
    info: (fields, message) => lines.push({ fields, message }),
    warn: (fields, message) => lines.push({ fields, message }),
    error: (fields, message) => lines.push({ fields, message }),
  }
}

function recordingSink(refuse: (message: OutboundMessage) => boolean = () => false): {
  send(message: OutboundMessage): void
  received: OutboundMessage[]
  /** The messages this case's own rows produced, which is the only slice of
   * the recorder a shared database makes an assertion about. */
  forTasks(taskIds: readonly string[]): OutboundMessage[]
} {
  const received: OutboundMessage[] = []
  return {
    received,
    forTasks: (taskIds) =>
      received.filter(
        (message) =>
          message.template === 'reminder' &&
          taskIds.includes(message.reminder.taskId),
      ),
    send(message: OutboundMessage): void {
      if (refuse(message)) {
        throw new Error('the email provider refused a reminder message')
      }
      received.push(message)
    },
  }
}

async function seedUser(): Promise<{ id: string; email: string }> {
  const email = `${randomUUID()}@pass.test`
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name, timezone)
        VALUES (${`pass-${randomUUID()}`}, ${email}, ${'Pass fixture'},
                ${KARACHI})
        RETURNING id`,
  )
  return { id: String(found[0]?.id), email }
}

/** The one folder every case here seeds, named so the reminder template's
 * context line can be asserted against it. */
const FOLDER_NAME = 'pass'

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${FOLDER_NAME})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${folderId}::uuid, ${ownerId}::uuid, 'full_control')`,
  )
  return folderId
}

interface TaskSeed {
  folderId: string
  creatorId: string
  assigneeId?: string | null
  title?: string
  dueDate?: string
  dueTime?: string | null
  status?: 'pending' | 'completed' | 'abandoned'
}

async function seedTask(options: TaskSeed): Promise<string> {
  const found = await rows(
    db,
    // 4.4 pairs status = 'completed' with both completed_at and completed_by,
    // by two checks each written as an equivalence, so a completed fixture
    // names its actor or the row is refused.
    sql`INSERT INTO tasks (folder_id, title, due_date, due_time, assignee_id,
                           created_by, status, completed_at, completed_by)
        VALUES (${options.folderId}::uuid, ${options.title ?? 'a reminded task'},
                ${options.dueDate ?? '2026-08-20'}::date,
                ${options.dueTime === undefined ? '12:00' : options.dueTime}::time,
                ${options.assigneeId === undefined ? options.creatorId : options.assigneeId}::uuid,
                ${options.creatorId}::uuid,
                ${options.status ?? 'pending'},
                ${options.status === 'completed' ? new Date().toISOString() : null}::timestamptz,
                ${options.status === 'completed' ? options.creatorId : null}::uuid)
        RETURNING id`,
  )
  return String(found[0]?.id)
}

/** Minutes before or after now, as an instant the poll compares against. */
function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function seedReminder(
  taskId: string,
  createdBy: string,
  fireAt: string,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, ${30}, ${null}::time, ${fireAt}::timestamptz,
                ${'scheduled'}, ${null}::timestamptz, ${createdBy}::uuid)`,
  )
}

interface ReminderView {
  state: string
  firedAtSet: boolean
}

async function reminderView(taskId: string): Promise<ReminderView> {
  const found = await rows(
    db,
    sql`SELECT state, fired_at IS NOT NULL AS fired_at_set
          FROM reminders WHERE task_id = ${taskId}::uuid`,
  )
  const row = found[0]
  return {
    state: String(row?.state),
    firedAtSet: row?.fired_at_set === true || row?.fired_at_set === 't',
  }
}

async function seedSession(userId: string, expiresAt: string): Promise<string> {
  const tokenHash = randomUUID().replaceAll('-', '').repeat(2)
  await db.execute(
    sql`INSERT INTO sessions (token_hash, user_id, expires_at)
        VALUES (${tokenHash}, ${userId}::uuid, ${expiresAt}::timestamptz)`,
  )
  return tokenHash
}

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  await client.close()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the 11.7 pass over its rows', () => {
  test('a due reminder on a pending assigned task is delivered, marked, and logged', async () => {
    const owner = await seedUser()
    const folderId = await seedFolder(owner.id)
    const taskId = await seedTask({
      folderId,
      creatorId: owner.id,
      title: 'file the quarterly return',
      dueDate: '2026-08-20',
      dueTime: '12:00',
    })
    await seedReminder(taskId, owner.id, minutesFromNow(-1))

    const sink = recordingSink()
    const logger = capturingLogger()
    const outcome = await createReminderPass({
      dbClient: client,
      notifications: sink,
      logger,
    })()

    expect(outcome.sent, 'one row was due and deliverable').toBeGreaterThanOrEqual(1)
    expect(await reminderView(taskId)).toEqual({ state: 'sent', firedAtSet: true })

    // 11.10 fixes that a message identifies its template and its recipient and
    // leaves the rest to this module; 10.7 asks each template for content and
    // one action link, which a body cannot have without these.
    expect(sink.forTasks([taskId])).toEqual([
      {
        template: 'reminder',
        to: owner.email,
        reminder: {
          taskId,
          title: 'file the quarterly return',
          dueDate: '2026-08-20',
          dueTime: '12:00',
          // Item 32 gives this template a context line naming the folder,
          // and the claim statement already joins folders for 8.6's
          // deleted-folder skip, so it costs no read.
          folderName: FOLDER_NAME,
        },
      },
    ])

    const emitted = JSON.stringify(logger.lines)
    expect(
      logger.lines.map((line) => line.fields.event),
      '10.5 puts reminder sends on the logged list',
    ).toContain('reminder_sent')
    expect(
      emitted.includes(owner.email),
      '10.5 keeps recipient addresses out of every log line, in this module as in the notifier',
    ).toBe(false)
    expect(
      emitted.includes('file the quarterly return'),
      'and task titles, which the email carries and the log does not',
    ).toBe(false)
  })

  test('8.6 three skips settle in one pass and send nothing', async () => {
    const owner = await seedUser()
    const second = await seedUser()
    const folderId = await seedFolder(owner.id)
    await db.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${second.id}::uuid, 'full_control')`,
    )

    const completed = await seedTask({
      folderId,
      creatorId: owner.id,
      status: 'completed',
    })
    const unassigned = await seedTask({
      folderId,
      creatorId: owner.id,
      assigneeId: null,
    })
    const stale = await seedTask({ folderId, creatorId: owner.id })
    await seedReminder(completed, owner.id, minutesFromNow(-1))
    await seedReminder(unassigned, owner.id, minutesFromNow(-1))
    await seedReminder(stale, owner.id, minutesFromNow(-(6 * 60 + 1)))

    const sink = recordingSink()
    const logger = capturingLogger()
    const outcome = await createReminderPass({
      dbClient: client,
      notifications: sink,
      logger,
    })()

    expect(outcome.skipped).toBeGreaterThanOrEqual(3)
    expect(
      sink.forTasks([completed, unassigned, stale]),
      'a skip is not a send',
    ).toEqual([])
    for (const taskId of [completed, unassigned, stale]) {
      expect(await reminderView(taskId), `the reminder on ${taskId}`).toEqual({
        state: 'skipped',
        firedAtSet: true,
      })
    }
    expect(
      logger.lines
        .filter((line) => line.fields.event === 'reminder_skipped')
        .map((line) => line.fields.reason)
        .sort(),
      '10.5 puts reminder skips on the logged list, and the reason is what makes the line worth having',
    ).toEqual(['stale', 'task_not_pending', 'unassigned'])
  })

  test('a refused send keeps its row scheduled and keeps the batch it was in', async () => {
    const refused = await seedUser()
    const delivered = await seedUser()
    const folderId = await seedFolder(refused.id)
    await db.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${delivered.id}::uuid, 'full_control')`,
    )
    const refusedTask = await seedTask({ folderId, creatorId: refused.id })
    const deliveredTask = await seedTask({
      folderId,
      creatorId: refused.id,
      assigneeId: delivered.id,
    })
    // Older, so it is claimed first and the failure happens ahead of the
    // success rather than after it: the case is about what survives a refusal,
    // and a refusal at the end of a batch would prove nothing.
    await seedReminder(refusedTask, refused.id, minutesFromNow(-5))
    await seedReminder(deliveredTask, refused.id, minutesFromNow(-1))

    const sink = recordingSink((message) => message.to === refused.email)
    const logger = capturingLogger()
    const outcome = await createReminderPass({
      dbClient: client,
      notifications: sink,
      logger,
    })()

    expect(outcome.failed, 'the refusal is counted as one').toBeGreaterThanOrEqual(1)
    expect(
      sink.forTasks([refusedTask, deliveredTask]).map((message) => message.to),
      'the batch delivered the one it could',
    ).toEqual([delivered.email])
    expect(
      await reminderView(refusedTask),
      'the refused row is left exactly as the pass found it, so the next tick retries it and 8.6 six hour window eventually settles it honestly',
    ).toEqual({ state: 'scheduled', firedAtSet: false })
    expect(
      await reminderView(deliveredTask),
      'and the delivery that did happen is kept: rolling the transaction back would send this one a second time on the next tick',
    ).toEqual({ state: 'sent', firedAtSet: true })
    expect(
      logger.lines.map((line) => line.fields.event),
    ).toContain('reminder_send_failed')
  })
})

describe('the pass second duty and its liveness signals (11.7, 11.12)', () => {
  test('expired session rows are pruned and live ones are left alone', async () => {
    const user = await seedUser()
    const expired = await seedSession(user.id, minutesFromNow(-60))
    const live = await seedSession(user.id, minutesFromNow(60))

    const outcome = await createReminderPass({
      dbClient: client,
      logger: capturingLogger(),
    })()

    expect(
      outcome.prunedSessions,
      '11.7 gives the pass two duties and this is the second one; other files in this suite may seed sessions too, so the assertion is that at least this one went',
    ).toBeGreaterThanOrEqual(1)
    const survivors = await rows(
      db,
      sql`SELECT token_hash FROM sessions
           WHERE token_hash IN (${expired}, ${live})`,
    )
    expect(
      survivors.map((row) => String(row.token_hash)),
      'pruning is hygiene over rows that have already expired (11.6): a live session is never touched by it',
    ).toEqual([live])
  })

  test('a completed cycle records its age and pings the heartbeat once', async () => {
    const calls: { url: string; method: string | undefined }[] = []
    vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
      calls.push({ url: String(url), method: init?.method })
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    expect(
      AGE_BEFORE_ANY_PASS,
      'health has answered null since P0, which is what this pass is for',
    ).toBeNull()

    await createReminderPass({
      dbClient: client,
      logger: capturingLogger(),
      heartbeatUrl: 'https://uptime.example/heartbeat/opaque-token',
    })()

    expect(
      secondsSinceLastPass(),
      '11.12: /api/health reports seconds since the last completed pass',
    ).not.toBeNull()
    expect(calls).toEqual([
      { url: 'https://uptime.example/heartbeat/opaque-token', method: 'POST' },
    ])
  })

  test('no heartbeat is configured, no call is made', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await createReminderPass({ dbClient: client, logger: capturingLogger() })()

    expect(
      calls,
      'every environment but production leaves the url unset, and an unset url is not an address to call',
    ).toEqual([])
  })

  test('a heartbeat that cannot be reached is logged, and the pass still succeeds', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')))
    const logger = capturingLogger()

    const outcome = await createReminderPass({
      dbClient: client,
      logger,
      heartbeatUrl: 'https://uptime.example/heartbeat/opaque-token',
    })()

    expect(
      outcome,
      'the monitor being unreachable is not a delivery failure, and 11.12 alerts on the silence it produces anyway',
    ).toMatchObject({ failed: 0 })
    const emitted = JSON.stringify(logger.lines)
    expect(emitted).toMatch(/heartbeat/)
    expect(
      emitted.includes('opaque-token'),
      'the heartbeat url is a credential in url form and is never logged',
    ).toBe(false)
  })
})

/*
The cap on the three purge claims this module writes (issue #276), which the
acceptance range cannot see.

**AC-810 pins the reclaim's cap and nothing else's**, and that is the whole
reason these two cases exist. The same LIMIT was added to four statements in
that change: the reclaim's delete arm, the folder Trash purge, the task Trash
purge and the ninety-day events purge. The reclaim's is proved by AC-810's
third case; the folder purge is at least driven by every criterion that deletes
a folder and runs a pass. **The task purge and the events purge were driven by
nothing at all** — the adversarial review of #276 grepped the suite and found no
test that ages a task's `deleted_at` or an event's `created_at` and then runs a
pass — so a LIMIT on either could have named the wrong thing, dropped rows
rather than deferring them, or interacted badly with the claim's FOR UPDATE
SKIP LOCKED, and the whole suite would have been green.

**What each case asserts is that the surplus is deferred and not lost**, which
is the only interesting way a cap goes wrong: the first pass takes exactly the
cap, the second takes the remainder, and a row inside the window is untouched
throughout.

The database is this file's own — `postgres-leg-setup.ts` empties it before
every file — and nothing else here writes a row old enough for either purge to
claim, so the surplus that survives a pass is this case's own row and not
somebody else's. Each count is read back scoped to the case's own folder for
the same reason the file's header gives for asserting by task id.
*/

/** `SWEEP_BATCH` in `src/server/database.ts` is 200. Stated here rather than
 * imported, for the reason `tests/support/reclaim-harness.ts` gives about
 * `RECLAIM_WINDOW_DAYS`: a test that imported the constant would agree with
 * whatever it became and would pin nothing. If the number is deliberately
 * changed, this line moves with that decision. */
const CAP = 200
const OVER_THE_CAP = CAP + 1

describe('the 11.7 purge claims are capped (issue #276)', () => {
  test('the ninety-day events purge takes the cap and defers the rest', async () => {
    const actor = await seedUser()
    const folderId = await seedFolder(actor.id)
    const seeded = await rows(
      db,
      sql`INSERT INTO events (actor_id, verb, subject_kind, subject_id,
                              subject_name, folder_id, created_at)
          SELECT ${actor.id}::uuid, 'created', 'task', ${actor.id}::uuid,
                 'an aged event', ${folderId}::uuid,
                 now() - interval '91 days'
            FROM generate_series(1, ${OVER_THE_CAP}) AS s(n)
          RETURNING id`,
    )
    expect(seeded.length, 'the fixture must seed one more than the cap').toBe(
      OVER_THE_CAP,
    )
    const young = await rows(
      db,
      sql`INSERT INTO events (actor_id, verb, subject_kind, subject_id,
                              subject_name, folder_id, created_at)
          VALUES (${actor.id}::uuid, 'created', 'task', ${actor.id}::uuid,
                  'a recent event', ${folderId}::uuid, now() - interval '89 days')
          RETURNING id`,
    )
    const aged = async (): Promise<number> =>
      (
        await rows(
          db,
          sql`SELECT id FROM events
               WHERE folder_id = ${folderId}::uuid
                 AND created_at < now() - interval '90 days'`,
        )
      ).length

    const pass = createReminderPass({
      dbClient: client,
      logger: capturingLogger(),
    })
    const first = await pass()
    expect(
      first.purgedEvents,
      '4.13 purges events past ninety days, and the claim takes at most the cap in one tick',
    ).toBe(CAP)
    expect(
      await aged(),
      "so exactly one of this case's aged events is still there: a cap that dropped the surplus instead of deferring it would leave none",
    ).toBe(1)

    const second = await pass()
    expect(
      second.purgedEvents,
      'and the next tick takes the remainder, which is what makes truncating a pass safe (spec 11.7)',
    ).toBe(1)
    expect(await aged(), 'nothing aged is left').toBe(0)

    expect(
      (
        await rows(
          db,
          sql`SELECT id FROM events WHERE id = ${String(young[0]?.id)}::uuid`,
        )
      ).length,
      'an event inside the ninety days is untouched by either pass, the cap being on how many the claim takes and not on what it is allowed to take',
    ).toBe(1)
  })

  test('the thirty-day Trash purge takes the cap of tasks and defers the rest', async () => {
    const owner = await seedUser()
    const folderId = await seedFolder(owner.id)
    const seeded = await rows(
      db,
      sql`INSERT INTO tasks (folder_id, title, created_by, status, deleted_at)
          SELECT ${folderId}::uuid, 'an aged trashed task', ${owner.id}::uuid,
                 'pending', now() - interval '31 days'
            FROM generate_series(1, ${OVER_THE_CAP}) AS s(n)
          RETURNING id`,
    )
    expect(seeded.length, 'the fixture must seed one more than the cap').toBe(
      OVER_THE_CAP,
    )
    const recent = await seedTask({ folderId, creatorId: owner.id })
    await db.execute(
      sql`UPDATE tasks SET deleted_at = now() - interval '29 days'
           WHERE id = ${recent}::uuid`,
    )
    const aged = async (): Promise<number> =>
      (
        await rows(
          db,
          sql`SELECT id FROM tasks
               WHERE folder_id = ${folderId}::uuid
                 AND deleted_at < now() - interval '30 days'`,
        )
      ).length

    const pass = createReminderPass({
      dbClient: client,
      logger: capturingLogger(),
    })
    const first = await pass()
    expect(
      first.purgedTrash,
      '7.13 destroys a trashed row after thirty days, and the claim takes at most the cap of tasks in one tick',
    ).toBe(CAP)
    expect(
      await aged(),
      'so one of them is still in the Trash rather than gone: the cap defers, it does not drop',
    ).toBe(1)

    const second = await pass()
    expect(second.purgedTrash, 'and the next tick takes it').toBe(1)
    expect(await aged(), 'nothing aged is left').toBe(0)

    expect(
      (await rows(db, sql`SELECT id FROM tasks WHERE id = ${recent}::uuid`))
        .length,
      'a task trashed twenty-nine days ago is untouched, which is the line the cap must not have moved',
    ).toBe(1)
  })

  test('the thirty-day Trash purge takes the cap of folders and defers the rest', async () => {
    const owner = await seedUser()
    const seeded = await rows(
      db,
      sql`INSERT INTO folders (owner_id, name, deleted_at)
          SELECT ${owner.id}::uuid, 'an aged trashed folder',
                 now() - interval '31 days'
            FROM generate_series(1, ${OVER_THE_CAP}) AS s(n)
          RETURNING id`,
    )
    expect(seeded.length, 'the fixture must seed one more than the cap').toBe(
      OVER_THE_CAP,
    )
    const recent = await seedFolder(owner.id)
    await db.execute(
      sql`UPDATE folders SET deleted_at = now() - interval '29 days'
           WHERE id = ${recent}::uuid`,
    )
    /* Scoped to this owner because the folder purge is the one duty of the
       four whose claim this file's other cases also feed — every `seedFolder`
       here makes a folder — and only the rows this case aged can be claimed
       by it. */
    const aged = async (): Promise<number> =>
      (
        await rows(
          db,
          sql`SELECT id FROM folders
               WHERE owner_id = ${owner.id}::uuid
                 AND deleted_at < now() - interval '30 days'`,
        )
      ).length

    const pass = createReminderPass({
      dbClient: client,
      logger: capturingLogger(),
    })
    const first = await pass()
    expect(
      first.purgedTrash,
      "7.13 destroys a trashed folder after thirty days, and the claim takes at most the cap of folders in one tick. This case's folders hold no tasks, so nothing else contributes to the count",
    ).toBe(CAP)
    expect(
      await aged(),
      'one is left in the Trash rather than gone, the cap deferring rather than dropping. And the bound is on folders rather than on rows: each one cascades an unbounded number away with it, which is why database.ts says so at the constant',
    ).toBe(1)

    const second = await pass()
    expect(second.purgedTrash, 'and the next tick takes it').toBe(1)
    expect(await aged(), 'nothing aged is left').toBe(0)

    expect(
      (await rows(db, sql`SELECT id FROM folders WHERE id = ${recent}::uuid`))
        .length,
      'a folder trashed twenty-nine days ago is untouched, which is the line the cap must not have moved',
    ).toBe(1)
  })
})

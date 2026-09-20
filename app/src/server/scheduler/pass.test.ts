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

**Nothing below asserts a total.** A pass polls every due row in the database,
which is 8.6's poll and not a thing to scope, and on the postgres:18 leg of
11.10 every file in the suite shares one database. So each case asserts the
rows it seeded, by task id, and reads the sink filtered the same way; the
outcome counts are asserted as floors rather than as equalities. An exact
count here would be an assertion about what the rest of the suite happened to
be doing.
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

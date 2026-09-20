/*
The 7.6, 7.7 and 7.8 contract as code, checked against the surface that
answers: the sibling of contract.test.ts and folders-contract.test.ts, same
skeleton, scoped to the task shapes the P3 shape review settled. The real
createApp boots against the stub issuer with the routers mounted, and every
response parses with the shared schemas themselves, so the promise in
src/shared/tasks.ts and the answer on the wire cannot drift silently.

That binding is this file's whole reason. The acceptance suite restates the
7.0 shapes rather than importing them, by the standing ruling that it cannot
borrow its subject's definition of correct, so nothing in app/tests can notice
the two definitions disagreeing. Here they are compared directly.

Scope: shapes, the four response bodies the review settled, the two wire
formats it pinned, and envelope conformance on this surface's refusals. The
behaviors behind them are AC-025 to AC-044's, and nothing here duplicates a
criterion; where a behavior is exercised, a completion or a pull, it exists to
produce a body worth parsing.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import type { RawRequestOptions, RawResponse } from '../../../tests/support/http-client.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import type { OidcStub } from '../../../tests/support/oidc-stub.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import {
  deleteTaskMyDayResponse,
  getTaskResponse,
  patchStepResponse,
  patchTaskResponse,
  postTaskMyDayResponse,
  postTaskStepsResponse,
  postTasksResponse,
  putTaskReminderResponse,
  taskTransitionResponse,
} from '../../shared/tasks.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `tasks-contract-${randomUUID()}.test`

interface Person {
  jar: TestBrowser
  id: string
  email: string
}

beforeAll(async () => {
  dbClient = await createTestDb()
  stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  server.on(
    'request',
    createApp({
      dbClient,
      auth: {
        issuerUrl: stub.issuerUrl,
        clientId: stub.clientId,
        clientSecret: stub.clientSecret,
        appOrigin: origin,
        allowInsecureRequests: true,
      },
    }),
  )
}, 60_000)

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await stub.close()
  for (const id of created) {
    await dbClient.db.execute(
      sql`DELETE FROM folder_members WHERE user_id = ${id}`,
    )
  }
  await cleanupUsers(dbClient.db, created)
  await dbClient.close()
})

async function signIn(name: string): Promise<Person> {
  const sub = `tasks-contract-${randomUUID()}`
  const email = `${sub}@${domain}`
  stub.nextIdentity({ sub, email, email_verified: true, name })
  const jar = new TestBrowser(origin)
  const begun = await jar.request(`${origin}/api/v1/auth/google`)
  const provider = await fetch(new URL(begun.location ?? ''), {
    redirect: 'manual',
  })
  await jar.request(provider.headers.get('location') ?? '')

  const found = await rows(
    dbClient.db,
    sql`SELECT id FROM users WHERE google_sub = ${sub}`,
  )
  const id = String(found[0]?.id)
  created.push(id)
  return { jar, id, email }
}

type Init = RawRequestOptions & { csrf?: 'auto' | 'omit' | string }

function api(person: Person, path: string, init?: Init): Promise<RawResponse> {
  return person.jar.request(`${origin}/api/v1${path}`, init)
}

function jsonInit(method: string, body: unknown): RawRequestOptions {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/* ------------------------------------------------------------------ *
 * The 7.0 key lists, transcribed from the frozen text
 * ------------------------------------------------------------------ */

/* RFC 0005 unit 12a replaces 7.0's TaskCard line, so section_block_id and
 * created_by are transcribed from that unit and left the detail's extras.
 * `labels` is issue #226's, transcribed from 7.0's amendment of 2026-09-20;
 * it moved ahead of that amendment for the reason `ac-001`'s
 * SECTION_4_TABLES carries beside itself, and the amendment has since
 * landed. */
const TASK_CARD_KEYS = [
  'assignee',
  'created_at',
  'created_by',
  'due_date',
  'due_time',
  'folder',
  'id',
  'important',
  'is_recurring',
  'labels',
  'pending_invite_email',
  'pulled',
  'section_block_id',
  'start_date',
  'status',
  'steps_done',
  'steps_total',
  'title',
  'updated_at',
]
const TASK_DETAIL_KEYS = [
  ...TASK_CARD_KEYS,
  'completed_at',
  'completed_by',
  'notes',
  'recurrence_rule',
  'reminder',
  'series_id',
  'steps',
].sort()

const FOLDER_CHIP_KEYS = ['id', 'is_default', 'name']
const PERSON_KEYS = ['avatar_url', 'display_name', 'id']
const STEP_KEYS = ['done', 'id', 'position', 'title']
const REMINDER_KEYS = ['offset_minutes', 'time_of_day']
const TRANSITION_KEYS = ['deleted_successor_id', 'generated_task', 'task']

function issuesOf(parsed: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): string[] {
  return parsed.success
    ? []
    : (parsed.error?.issues ?? []).map(
        (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
      )
}

/*
Key-exactness reads the raw body, never the parsed one: z.object strips, so a
parse would hide exactly the extra key this check exists to refuse, which is
the lesson the P2 review learned on the members element. The nested objects
are checked too, because 7.0 enumerates each of them.
*/
function expectTaskDetailExact(body: unknown, where: string): Record<string, unknown> {
  const record = body as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${where} must carry exactly the 25 keys 7.0 gives TaskDetail, as unit 12a leaves them`,
  ).toEqual(TASK_DETAIL_KEYS)
  expect(
    Object.keys(record.folder as Record<string, unknown>).sort(),
    `${where}.folder is 7.0's three-field chip`,
  ).toEqual(FOLDER_CHIP_KEYS)
  if (record.assignee !== null) {
    expect(
      Object.keys(record.assignee as Record<string, unknown>).sort(),
      `${where}.assignee is the person shape, the same one 7.4's members carry`,
    ).toEqual(PERSON_KEYS)
  }
  for (const step of record.steps as Record<string, unknown>[]) {
    expect(
      Object.keys(step).sort(),
      `${where}.steps carries 7.0's four-field element`,
    ).toEqual(STEP_KEYS)
  }
  return record
}

/*
The card, judged the same way. Nothing on this surface answered a TaskCard
until P6: 7.6's generated_task has been null since the envelope first
answered, so the 15 keys below were a promise no response on this router had
ever been measured against. Generation is what makes them measurable, and a
card is where a per-endpoint variant would appear first, being the one shape
this file's own module builds twice (taskView's detail, less 7.0's eight).
*/
function expectTaskCardExact(body: unknown, where: string): Record<string, unknown> {
  const record = body as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${where} must carry exactly the 15 keys 7.0 gives TaskCard`,
  ).toEqual(TASK_CARD_KEYS)
  expect(
    Object.keys(record.folder as Record<string, unknown>).sort(),
    `${where}.folder is 7.0's three-field chip`,
  ).toEqual(FOLDER_CHIP_KEYS)
  if (record.assignee !== null) {
    expect(
      Object.keys(record.assignee as Record<string, unknown>).sort(),
      `${where}.assignee is the person shape, the same one 7.4's members carry`,
    ).toEqual(PERSON_KEYS)
  }
  return record
}

/** A TaskDetail with 7.0's eight detail keys dropped, which is 7.0's own
 * definition of TaskCard read backwards. What it is for: comparing the card a
 * transition answers against the detail a fresh GET of the same row answers,
 * so "one object rather than a per-endpoint variant" is measured rather than
 * asserted. */
function cardPartOf(detail: Record<string, unknown>): Record<string, unknown> {
  const card: Record<string, unknown> = {}
  for (const key of TASK_CARD_KEYS) card[key] = detail[key]
  return card
}

/**
 * A calendar date a fixed number of days ahead of today, in UTC.
 *
 * Every generating probe below completes a task dated ahead of today, so
 * 8.5's cutoff, max(due_date, current_date(tz)), is the due date itself and
 * the successor's date is a fact about the rule rather than about the day the
 * suite runs. A constant would be a date that stops being in the future,
 * which is a false green with a fuse in it; the acceptance harness builds its
 * dates this way for the same reason. Noon rather than midnight, so a host in
 * a negative offset cannot move the day.
 */
function daysAhead(days: number): string {
  const at = new Date()
  at.setUTCHours(12, 0, 0, 0)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** RFC 5545's DATE form for UNTIL, YYYYMMDD, which 11.9 rules is the only
 * spelling frozen 4.11 admits. */
function untilStamp(date: string): string {
  return date.replaceAll('-', '')
}

/* ------------------------------------------------------------------ *
 * The fixture
 * ------------------------------------------------------------------ */

interface Stage {
  owner: Person
  stranger: Person
  /** A dated and timed task of the owner's, in their single-member Inbox. */
  taskId: string
  /** A task of the stranger's, which the owner may never see (10.2). */
  strangerTaskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const owner = await signIn('Contract Owner')
    const stranger = await signIn('Contract Stranger')
    const created = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract fixture',
        due_date: '2026-09-14',
        due_time: '09:30',
        notes: 'noted',
        steps: ['first'],
      }),
    )
    expect(created.status, 'staging POST /tasks must answer 201').toBe(201)
    const strangers = await api(
      stranger,
      '/tasks',
      jsonInit('POST', { title: 'contract out of reach' }),
    )
    expect(strangers.status, 'the stranger stages their own task').toBe(201)
    staged = {
      owner,
      stranger,
      taskId: String((created.json() as { id?: unknown }).id),
      strangerTaskId: String((strangers.json() as { id?: unknown }).id),
    }
  }
  return staged
}

/** A task of the owner's, made fresh where a probe mutates one. */
async function freshTask(label: string, body: object = {}): Promise<string> {
  const { owner } = await stage()
  const response = await api(
    owner,
    '/tasks',
    jsonInit('POST', { title: `contract ${label}`, ...body }),
  )
  expect(response.status, `staging ${label} must answer 201`).toBe(201)
  return String((response.json() as { id?: unknown }).id)
}

describe('the 7.6 shapes against the mounted application', () => {
  test('POST /tasks answers the TaskDetail, key-exact and parsing with the shared schema', async () => {
    const { owner, taskId } = await stage()
    const response = await api(owner, `/tasks/${taskId}`)
    expect(response.status).toBe(200)
    const body = response.json()
    expect(
      issuesOf(getTaskResponse.safeParse(body)),
      'the GET body does not match the shared TaskDetail schema',
    ).toEqual([])
    expectTaskDetailExact(body, 'the GET /tasks/:id body')

    const patched = await api(
      owner,
      `/tasks/${taskId}`,
      jsonInit('PATCH', { title: 'contract fixture renamed' }),
    )
    expect(patched.status).toBe(200)
    expect(issuesOf(patchTaskResponse.safeParse(patched.json()))).toEqual([])
    expectTaskDetailExact(patched.json(), 'the PATCH /tasks/:id body')

    const another = await freshTask('created body')
    const readBack = await api(owner, `/tasks/${another}`)
    expect(
      issuesOf(postTasksResponse.safeParse(readBack.json())),
      'the create and the read answer one shape, not two',
    ).toEqual([])
  })

  /*
  The fresh-GET convention read literally, which is the strongest form the
  claim has: an empty partial changes nothing, so the body it answers and the
  body a GET answers must be the same object, field for field. The P2 review's
  tester pinned 7.4's mutations the same way, by deep equality rather than by
  spot checks.
  */
  test('an empty PATCH answers exactly what a fresh GET answers', async () => {
    const { owner, taskId } = await stage()
    const patched = await api(owner, `/tasks/${taskId}`, jsonInit('PATCH', {}))
    expect(
      patched.status,
      'an empty subset is a subset, the reading the P2S merge ratified for every section 7 PATCH',
    ).toBe(200)
    expect(
      patched.json(),
      'a PATCH answers what a fresh GET would, which for a no-op means the identical object',
    ).toEqual((await api(owner, `/tasks/${taskId}`)).json())
  })

  test('the floating values ride the wire in their 4.11 formats, never as instants', async () => {
    const { owner, taskId } = await stage()
    const body = (await api(owner, `/tasks/${taskId}`)).json() as Record<
      string,
      unknown
    >
    expect(
      body.due_date,
      'a floating calendar date is YYYY-MM-DD (4.11); an instant would reintroduce the zone the format exists to remove',
    ).toBe('2026-09-14')
    expect(
      body.due_time,
      'a floating wall clock is HH:MM at 4.11 minute precision, seconds and all trimmed by the server',
    ).toBe('09:30')
    expect(
      typeof body.created_at === 'string' && body.created_at.endsWith('Z'),
      'an event instant is a UTC ISO string (4.11), which is the other half of the same rule',
    ).toBe(true)
  })

  test('TaskDetail carries the reminder as both 4.8 columns, exactly one non-null', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder', {
      due_date: '2026-09-20',
      due_time: '17:00',
    })
    // Reminders are P7's surface; the row is seeded because only its
    // rendering is under test here (the harness seeds it for AC-028 too).
    await dbClient.db.execute(sql`
      INSERT INTO reminders (task_id, offset_minutes, fire_at, created_by)
      VALUES (${taskId}::uuid, 30,
              ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz,
              ${owner.id}::uuid)
    `)
    const body = (await api(owner, `/tasks/${taskId}`)).json() as Record<
      string,
      unknown
    >
    const reminder = body.reminder as Record<string, unknown>
    expect(
      Object.keys(reminder).sort(),
      'the settled rendering is the projection of the 4.8 row, both columns always',
    ).toEqual(REMINDER_KEYS)
    expect(reminder.offset_minutes, 'the mode this row carries').toBe(30)
    expect(
      reminder.time_of_day,
      '4.8 admits exactly one mode, so the other column reads null rather than absent',
    ).toBeNull()
    expect(
      issuesOf(getTaskResponse.safeParse(body)),
      'and the shared schema refuses both-or-neither, which is that CHECK restated',
    ).toEqual([])
  })

  test('the four transitions answer 7.6\'s envelope, key-exact', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('transition')
    const response = await api(owner, `/tasks/${taskId}/complete`, {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const body = response.json() as Record<string, unknown>
    expect(
      Object.keys(body).sort(),
      '7.6 writes the envelope out: task, generated_task, deleted_successor_id',
    ).toEqual(TRANSITION_KEYS)
    expect(
      issuesOf(taskTransitionResponse.safeParse(body)),
      'the envelope does not match the shared schema',
    ).toEqual([])
    expectTaskDetailExact(body.task, 'the transition body\'s task')
    expect(
      body.generated_task,
      'no rule means no successor: 8.5 generation arrives with P6, and the key answers null until then',
    ).toBeNull()
    expect(body.deleted_successor_id).toBeNull()

    const repeat = await api(owner, `/tasks/${taskId}/complete`, {
      method: 'POST',
    })
    expect(repeat.status, '5.1 makes the same-state repeat a 200 no-op').toBe(200)
    expect(
      Object.keys(repeat.json() as Record<string, unknown>).sort(),
      'and the no-op answers the same envelope as the transition',
    ).toEqual(TRANSITION_KEYS)
  })
})

/*
P6's three arms, which are the same surface answering something for the first
time rather than a surface that grew.

Nothing below is a new endpoint. The recurrence_rule arm of 7.6's two write
bodies was deferred at P3 with the 4.11 validator it needs, and the two
companions of the transition envelope have answered null since the envelope
first answered, so what this block measures is whether the shapes those keys
promised are the shapes now on the wire. That is exactly the class of drift a
key list cannot catch while every value is null.

The acceptance suite pins the behavior (AC-071 to AC-082, AC-142, AC-143) and
restates the shapes rather than importing them, by the standing ruling that it
cannot borrow its subject's definition of correct. Here the shared schemas are
the judge, so the promise in src/shared/tasks.ts and the answer on the wire
are compared directly, which is the one comparison neither side can make
alone.
*/
describe('the P6 arms of 7.6, on the wire', () => {
  test('the two write bodies take a 4.11 rule, and the response reports the series it joined', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const rule = 'FREQ=WEEKLY;BYDAY=MO,WE'

    const created = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract rule create',
        due_date: due,
        recurrence_rule: rule,
      }),
    )
    expect(
      created.status,
      '7.6 admits recurrence_rule on the create body, and P6 is where it stops being an ignored unknown field',
    ).toBe(201)
    expect(
      issuesOf(postTasksResponse.safeParse(created.json())),
      'the created body does not match the shared TaskDetail schema',
    ).toEqual([])
    const body = expectTaskDetailExact(created.json(), 'the recurring create')
    expect(
      body.recurrence_rule,
      'the rule rides back byte for byte: 4.11 stores an RRULE value string, and a server that normalized one would answer a string the caller never sent',
    ).toBe(rule)
    expect(
      typeof body.series_id === 'string' && body.series_id.length > 0,
      '7.6: a created rule "gets a fresh series_id", which this response is the only way a client learns',
    ).toBe(true)
    expect(
      body.is_recurring,
      '7.0 makes is_recurring report the rule the row holds, so it and recurrence_rule agree on every body',
    ).toBe(true)

    /*
    The three PATCH arms 7.6 spells out, each answering the same TaskDetail,
    and the series identity is what tells them apart. Set on a task without a
    rule mints one; changed on a current occurrence leaves it, because the
    series is the one the row is already in; set null ends the series.
    */
    const plain = await freshTask('rule patch', { due_date: due })
    const first = await api(
      owner,
      `/tasks/${plain}`,
      jsonInit('PATCH', { recurrence_rule: rule }),
    )
    expect(first.status).toBe(200)
    expect(issuesOf(patchTaskResponse.safeParse(first.json()))).toEqual([])
    const firstBody = expectTaskDetailExact(first.json(), 'the rule-setting PATCH')
    const seriesId = firstBody.series_id
    expect(
      typeof seriesId === 'string' && seriesId.length > 0,
      '7.6: a rule set on a task without one "assigns a new series_id"',
    ).toBe(true)
    expect(
      seriesId,
      'and fresh means fresh: two tasks that each acquired a rule are two series',
    ).not.toBe(body.series_id)

    const changed = await api(
      owner,
      `/tasks/${plain}`,
      jsonInit('PATCH', { recurrence_rule: 'FREQ=DAILY;INTERVAL=3' }),
    )
    expect(changed.status).toBe(200)
    const changedBody = expectTaskDetailExact(
      changed.json(),
      'the rule-replacing PATCH',
    )
    expect(changedBody.recurrence_rule).toBe('FREQ=DAILY;INTERVAL=3')
    expect(
      changedBody.series_id,
      '7.6 replaces the rule "from now on" on a current occurrence, which is the same series continuing rather than a new one',
    ).toBe(seriesId)

    /*
    Setting the rule null, and the one shape question this arm leaves open.
    7.6 says the series ends and the row stays a normal task, and says nothing
    about series_id; the row keeps it. Ruled at this review and recorded in
    src/shared/tasks.ts: series_id reports which series a row belongs to and
    is_recurring reports whether the row is repeating now, so a settled or
    ended row reads series_id non-null and is_recurring false. The same pair
    is what every generation leaves behind on the completed row below, so one
    reading serves both or the surface carries two.
    */
    const ended = await api(
      owner,
      `/tasks/${plain}`,
      jsonInit('PATCH', { recurrence_rule: null }),
    )
    expect(ended.status).toBe(200)
    const endedBody = expectTaskDetailExact(ended.json(), 'the rule-ending PATCH')
    expect(endedBody.recurrence_rule).toBeNull()
    expect(
      endedBody.is_recurring,
      'the row is a normal dated task again, and is_recurring is what says so',
    ).toBe(false)
    expect(
      endedBody.series_id,
      'while series_id stays: it names the series this row belonged to, which is history rather than a live rule',
    ).toBe(seriesId)
  })

  test('the rule is refused by the schema and by the row, and a caller cannot tell which (10.3)', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const rule = 'FREQ=DAILY'

    /*
    The line the wiring session drew between the two layers, checked where it
    is judged. A body that states its own contradiction is the schema's; a
    body that is legal until a row is read is the domain's. Both answer 422
    naming recurrence_rule, in one grammar, which is what makes the line an
    implementation detail rather than something a client has to learn.
    */
    const undatedCreate = await api(
      owner,
      '/tasks',
      jsonInit('POST', { title: 'contract undated rule', recurrence_rule: rule }),
    )
    const clearingPatch = await api(
      owner,
      `/tasks/${await freshTask('rule and clear', { due_date: due })}`,
      jsonInit('PATCH', { due_date: null, recurrence_rule: rule }),
    )
    const undatedPatch = await api(
      owner,
      `/tasks/${await freshTask('undated patch')}`,
      jsonInit('PATCH', { recurrence_rule: rule }),
    )

    const refusals: readonly [string, RawResponse][] = [
      [
        '7.6\'s dependency check on the create body, which a body answers alone',
        undatedCreate,
      ],
      [
        '8.4\'s cascade contradicted in one body, which a body also answers alone',
        clearingPatch,
      ],
      [
        '7.6\'s "requires due_date" on a PATCH, which only the row can answer',
        undatedPatch,
      ],
    ]
    for (const [what, response] of refusals) {
      expect(response.status, `${what} must answer 422`).toBe(422)
      expect(
        issuesOf(errorEnvelope.safeParse(response.json())),
        `${what} must carry the 7.0 envelope`,
      ).toEqual([])
      expect(
        response.body,
        `${what} must name the field the caller sent, in the one 10.3 grammar`,
      ).toContain('recurrence_rule:')
    }

    /*
    The two checks the recurrenceRule primitive holds, and neither replaces
    the other: 4.11 bounds the grammar and 4.5 bounds the column at 200
    characters. A rule can be grammatical and too long, because BYDAY admits a
    repeated day list, so the long one below is inside the subset and outside
    the column.
    */
    const grammatical = `FREQ=WEEKLY;BYDAY=${Array<string>(70).fill('MO').join(',')}`
    expect(grammatical.length > 200).toBe(true)
    const tooLong = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract long rule',
        due_date: due,
        recurrence_rule: grammatical,
      }),
    )
    expect(
      tooLong.status,
      '4.5 bounds the column at 200 characters and 10.3 makes that server-enforced, so a grammatical rule that cannot be stored is a 422 and never a constraint error wearing a 500',
    ).toBe(422)
    expect(tooLong.body).toContain('recurrence_rule:')

    const outsideSubset = await api(
      owner,
      `/tasks/${await freshTask('subset patch', { due_date: due })}`,
      jsonInit('PATCH', { recurrence_rule: 'FREQ=WEEKLY;BYMONTHDAY=3' }),
    )
    expect(
      outsideSubset.status,
      '4.11 admits BYMONTHDAY only with FREQ=MONTHLY, and requires the subset revalidated server-side',
    ).toBe(422)
    expect(outsideSubset.body).toContain('recurrence_rule:')
  })

  test('generation fills generated_task with 7.0\'s TaskCard, and it is the successor\'s own object', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const taskId = await freshTask('generating complete', {
      due_date: due,
      due_time: '08:00',
      recurrence_rule: 'FREQ=DAILY',
    })

    const done = await api(owner, `/tasks/${taskId}/complete?tz=UTC`, {
      method: 'POST',
    })
    expect(done.status).toBe(200)
    const envelope = done.json() as Record<string, unknown>
    expect(
      Object.keys(envelope).sort(),
      'the envelope is the same three keys whether or not the companions carry values',
    ).toEqual(TRANSITION_KEYS)
    expect(
      issuesOf(taskTransitionResponse.safeParse(envelope)),
      'the first non-null generated_task this surface has ever answered must still parse with the shared envelope',
    ).toEqual([])

    const card = expectTaskCardExact(
      envelope.generated_task,
      'the generated_task',
    )
    expect(
      card.due_date,
      '8.5 anchors at the current occurrence and takes the first instance strictly after the cutoff, which for a future-dated daily rule is the next day',
    ).toBe(daysAhead(31))
    expect(
      card.is_recurring,
      '8.5 copies the rule onto the successor, which is the row the series now lives on',
    ).toBe(true)
    expect(
      card.pulled,
      '8.5: "My Day entries are never copied", and pulled is the viewer\'s own entry',
    ).toBe(false)

    /*
    The strongest form of this role's own rule, that one object has one shape:
    the card the transition answered and the card inside a fresh GET of the
    same row must be equal field for field. A second producer that drifted by
    a single value would pass every key check above and fail here.
    */
    const fresh = await api(owner, `/tasks/${String(card.id)}`)
    expect(fresh.status).toBe(200)
    expect(
      card,
      'generated_task is TaskDetail less 7.0\'s eight, not a per-endpoint variant of it',
    ).toEqual(cardPartOf(fresh.json() as Record<string, unknown>))

    const settled = expectTaskDetailExact(envelope.task, 'the completed row')
    expect(
      settled.recurrence_rule,
      '8.5: "the rule lives only on the current occurrence", so the row that was completed no longer carries it',
    ).toBeNull()
    expect(settled.is_recurring).toBe(false)
    expect(
      settled.series_id,
      'while both rows name one series, which is what series_id is for and why the completed row keeps it',
    ).toBe((fresh.json() as Record<string, unknown>).series_id)
    expect(envelope.deleted_successor_id).toBeNull()
  })

  test('the guard fills deleted_successor_id with the id generation answered', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)

    /*
    The two companions are one fact read twice, so they are checked against
    each other rather than against a shape apiece: the id the guard reports
    removing is the id generation reported creating. Both pairs of endpoints
    are exercised, because 5.1 gives generation to complete and abandon and
    the guard to uncomplete and restore, and a wiring that crossed them would
    be invisible from either pair alone.
    */
    const pairs: readonly [string, string][] = [
      ['complete', 'uncomplete'],
      ['abandon', 'restore'],
    ]
    for (const [forward, back] of pairs) {
      const taskId = await freshTask(`${forward} then ${back}`, {
        due_date: due,
        recurrence_rule: 'FREQ=DAILY',
      })
      const out = await api(owner, `/tasks/${taskId}/${forward}?tz=UTC`, {
        method: 'POST',
      })
      expect(out.status, `${forward} on a repeating task must answer 200`).toBe(200)
      const successorId = String(
        (out.json() as { generated_task: { id: string } }).generated_task.id,
      )

      const returned = await api(owner, `/tasks/${taskId}/${back}`, {
        method: 'POST',
      })
      expect(returned.status).toBe(200)
      const body = returned.json() as Record<string, unknown>
      expect(
        issuesOf(taskTransitionResponse.safeParse(body)),
        `the ${back} envelope does not match the shared schema`,
      ).toEqual([])
      expect(
        body.deleted_successor_id,
        `5.1's G-SERIES deletes the pending successor and reclaims the rule, and 7.6 makes deleted_successor_id what ${back} reports removing`,
      ).toBe(successorId)
      expect(
        body.generated_task,
        'and the two companions are never both filled: 5.1 puts generation on one pair of endpoints and the guard on the other',
      ).toBeNull()
      expect(
        (await api(owner, `/tasks/${successorId}`)).status,
        'the id is reported because the row is gone, which is the only reason a client needs it',
      ).toBe(404)
      expect(
        expectTaskDetailExact(body.task, `the ${back} body's task`)
          .recurrence_rule,
        'and the rule came back to this row, which is what reclaiming means',
      ).toBe('FREQ=DAILY')
    }
  })

  /*
  The tz ruling of 2026-08-10 on frozen 7.6, sentence by sentence, because it
  is two rules rather than one and the difference between them is only visible
  on the wire. The present-value half is the route's and holds whatever the
  row is; the absent-value half is the row's and holds exactly where 8.5 would
  evaluate a calendar date.
  */
  test('a present tz that is not a zone is 422 on both generating transitions, whatever the row holds', async () => {
    const { owner, strangerTaskId } = await stage()
    const due = daysAhead(30)
    const repeating = await freshTask('bad zone repeating', {
      due_date: due,
      recurrence_rule: 'FREQ=DAILY',
    })
    const plain = await freshTask('bad zone plain')

    const probes: readonly [string, string][] = [
      ['a repeating task, where generation would read the zone', repeating],
      ['a task with no rule, where nothing reads it at all', plain],
      ['a task the caller cannot see, which must answer the same as the rest', strangerTaskId],
    ]
    for (const event of ['complete', 'abandon']) {
      for (const [what, id] of probes) {
        const response = await api(owner, `/tasks/${id}/${event}?tz=Mars/Olympus`, {
          method: 'POST',
        })
        expect(
          response.status,
          `7.0 refuses a value outside what a parameter admits rather than narrowing it to a default, so ${event} on ${what} answers 422`,
        ).toBe(422)
        expect(
          response.body,
          'naming tz, which is what tells a client what to fix',
        ).toContain('tz:')
      }
    }

    /*
    The inaccessible row is in that list on purpose. The refusal is judged
    before the task is resolved, which is 7.8's ordering and the same reason:
    an accessible task and one the caller cannot see answer the identical 422,
    so the parameter check discriminates nothing about which rows exist. The
    reversed order would answer 404 there and 422 here, which is an existence
    probe (10.2).
    */
    expect(
      (await api(owner, `/tasks/${strangerTaskId}/complete`, { method: 'POST' }))
        .status,
      'and with no parameter at all the same inaccessible task is 404, because then nothing was refused before the row was read',
    ).toBe(404)
  })

  test('an absent tz refuses exactly the transition that would evaluate a date, and writes nothing', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const taskId = await freshTask('absent zone', {
      due_date: due,
      recurrence_rule: 'FREQ=DAILY',
    })

    const refused = await api(owner, `/tasks/${taskId}/complete`, {
      method: 'POST',
    })
    expect(
      refused.status,
      'frozen 7.6 as ruled: the winning update would land on a pending row carrying a rule, which is exactly where 8.5 computes cutoff from current_date(actor.tz)',
    ).toBe(422)
    expect(refused.body).toContain('tz:')

    const unmoved = expectTaskDetailExact(
      (await api(owner, `/tasks/${taskId}`)).json(),
      'the row the refusal did not move',
    )
    expect(
      unmoved.status,
      'the ruling\'s second sentence: the transaction changes nothing, so the row does not transition',
    ).toBe('pending')
    expect(
      unmoved.recurrence_rule,
      'and no successor was created, which is what leaving the rule here proves',
    ).toBe('FREQ=DAILY')

    const retried = await api(owner, `/tasks/${taskId}/complete?tz=UTC`, {
      method: 'POST',
    })
    expect(
      retried.status,
      'and the same call retried with a zone gets the transition it asked for',
    ).toBe(200)
    expect(
      (retried.json() as Record<string, unknown>).generated_task,
      'which is the transition it always meant, successor and all',
    ).not.toBeNull()

    const plain = await freshTask('absent zone no rule')
    expect(
      (await api(owner, `/tasks/${plain}/complete`, { method: 'POST' })).status,
      'a row with no rule evaluates no date, so every other call these two endpoints serve is untouched',
    ).toBe(200)
  })

  test('a no-op and a conflict answer what they always answered, rule or no rule', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    /*
    The ruling's third sentence needs the one row that is settled and still
    carries a rule, which only an exhausted series produces: 8.5 returns null
    when UNTIL bounds the next instance out, and the rule stays on the row
    rather than moving to a successor that was never created. Without such a
    fixture the sentence is unfalsifiable, because every other settled row
    carries no rule and would pass whatever the condition was written as.
    */
    const exhausted = `FREQ=DAILY;UNTIL=${untilStamp(due)}`
    const completedId = await freshTask('exhausted complete', {
      due_date: due,
      recurrence_rule: exhausted,
    })
    const first = await api(owner, `/tasks/${completedId}/complete?tz=UTC`, {
      method: 'POST',
    })
    expect(first.status).toBe(200)
    expect(
      (first.json() as Record<string, unknown>).generated_task,
      '8.5: UNTIL exhausted returns null, and the rule stays on the row it was completed from',
    ).toBeNull()
    expect(
      expectTaskDetailExact(
        (first.json() as Record<string, unknown>).task,
        'the exhausted completion',
      ).recurrence_rule,
      'which is what makes the next two probes measure the condition rather than the absence of a rule',
    ).toBe(exhausted)

    const repeat = await api(owner, `/tasks/${completedId}/complete`, {
      method: 'POST',
    })
    expect(
      repeat.status,
      '5.1\'s no-op is not a transition and evaluates no date, so a repeat complete on a settled row answers what it always answered, with no zone',
    ).toBe(200)
    expect(
      Object.keys(repeat.json() as Record<string, unknown>).sort(),
    ).toEqual(TRANSITION_KEYS)

    const abandonedId = await freshTask('exhausted abandon', {
      due_date: due,
      recurrence_rule: exhausted,
    })
    expect(
      (await api(owner, `/tasks/${abandonedId}/abandon?tz=UTC`, { method: 'POST' }))
        .status,
    ).toBe(200)
    const conflict = await api(owner, `/tasks/${abandonedId}/complete`, {
      method: 'POST',
    })
    expect(
      conflict.status,
      'and 5.1\'s conflict is not a transition either: a complete on an abandoned row is 409 whether or not it carries a rule, and never a 422 for a zone it would never have read',
    ).toBe(409)
  })

  test('uncomplete and restore gain nothing from tz, so a wrong one is a tolerated unknown parameter', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const taskId = await freshTask('guard ignores tz', {
      due_date: due,
      recurrence_rule: 'FREQ=DAILY',
    })
    expect(
      (await api(owner, `/tasks/${taskId}/complete?tz=UTC`, { method: 'POST' }))
        .status,
    ).toBe(200)

    const back = await api(owner, `/tasks/${taskId}/uncomplete?tz=Mars/Olympus`, {
      method: 'POST',
    })
    expect(
      back.status,
      'frozen 7.6 gives these two no parameter, because G-SERIES reads the shape of a series and evaluates no calendar date, so a tz here is an unknown query parameter and 7.0 tolerates it',
    ).toBe(200)
    expect(
      issuesOf(taskTransitionResponse.safeParse(back.json())),
      'and the call it tolerated is the ordinary one, envelope and all',
    ).toEqual([])
  })
})

/*
P7's arms: frozen 7.9's two endpoints, which are new on this router, and the
reminder object written rather than only read.

Everything here is a first measurement. The probe above seeds a reminder row
with an INSERT because until this package no request could create one, so
TaskDetail's reminder key has been a rendering of a fixture rather than of
anything the API did; and the date-only mode has never ridden this wire at
all, in either direction. Frozen 7.9's own text is measured clause by clause,
because two of its three paragraphs were written during this package and this
is their first read by a role that did not write them.

The acceptance range covers the behavior (AC-090, AC-146 to AC-151, AC-164).
What is checked here is what that range cannot see: the shapes, judged against
the shared schemas themselves, and the one grammar the refusals speak.
*/
describe('the 7.9 endpoints and the reminder arms, on the wire', () => {
  test('PUT answers the affected TaskDetail, key-exact and equal to a fresh GET', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder put', {
      due_date: daysAhead(30),
      due_time: '09:30',
    })

    const written = await api(
      owner,
      `/tasks/${taskId}/reminder`,
      jsonInit('PUT', { offset_minutes: 30 }),
    )
    expect(
      written.status,
      'frozen 7.9 fixes the status at 200, and the owner\'s ruling of 2026-08-10 fills the silence beside it with the affected TaskDetail',
    ).toBe(200)
    expect(
      issuesOf(putTaskReminderResponse.safeParse(written.json())),
      'the PUT body does not match the shape the ruling bound it to',
    ).toEqual([])
    const body = expectTaskDetailExact(written.json(), 'the PUT reminder body')
    expect(
      body.reminder,
      '7.0\'s reminder is the projection of the 4.8 row: both keys always, exactly one non-null, which is what lets a client read the mode off the values',
    ).toEqual({ offset_minutes: 30, time_of_day: null })

    expect(
      written.json(),
      'and the ruling\'s own ground, that the parent task is the object a fresh GET would give: the two bodies are the same object, field for field',
    ).toEqual((await api(owner, `/tasks/${taskId}`)).json())
  })

  /*
  4.8's other mode, which no response on this surface has ever carried. The
  seeded probe earlier in this file writes an offset row, so time_of_day has
  been a null in every body this API has answered since P3, and the read
  primitive was chosen for a rendering nobody had seen.
  */
  test('the date-only arm rides the wire as HH:MM, the form 4.11 gives due_time', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder date only', {
      due_date: daysAhead(30),
    })

    const written = await api(
      owner,
      `/tasks/${taskId}/reminder`,
      jsonInit('PUT', { time_of_day: '09:00' }),
    )
    expect(written.status).toBe(200)
    expect(issuesOf(putTaskReminderResponse.safeParse(written.json()))).toEqual([])
    expect(
      expectTaskDetailExact(written.json(), 'the date-only PUT body').reminder,
      '4.11 is minute precision on both sides of the wire, so the column rides back as HH:MM the way due_time does and never as the HH:MM:SS the storage renders',
    ).toEqual({ offset_minutes: null, time_of_day: '09:00' })

    const spelled = await api(
      owner,
      `/tasks/${taskId}/reminder`,
      jsonInit('PUT', { time_of_day: '09:00:00' }),
    )
    expect(
      spelled.status,
      'the write form admits a zero seconds field, which names the same minute rather than a second value',
    ).toBe(200)
    expect(
      (spelled.json() as Record<string, unknown>).reminder,
      'and the answer is the same reminder, so a spelling the caller chose is not a value the row holds',
    ).toEqual({ offset_minutes: null, time_of_day: '09:00' })
  })

  test('PUT is idempotent and upserts the one row 4.8 keys by task (7.0, 7.9)', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder upsert', {
      due_date: daysAhead(30),
      due_time: '17:00',
    })
    const path = `/tasks/${taskId}/reminder`

    const first = await api(owner, path, jsonInit('PUT', { offset_minutes: 30 }))
    const second = await api(owner, path, jsonInit('PUT', { offset_minutes: 30 }))
    expect(
      [first.status, second.status],
      '7.0: PUT is idempotent, so the same body twice is the same call twice',
    ).toEqual([200, 200])
    expect(
      second.json(),
      'and the same answer: the response reports the reminder the request states, never a history of how the row got there',
    ).toEqual(first.json())

    const replaced = await api(owner, path, jsonInit('PUT', { offset_minutes: 60 }))
    expect(replaced.status).toBe(200)
    expect(
      (replaced.json() as Record<string, unknown>).reminder,
      '7.9 upserts the single row rather than adding one, so a second value replaces the first instead of conflicting with it',
    ).toEqual({ offset_minutes: 60, time_of_day: null })
  })

  test('7.9\'s two 422s name the mode the caller sent, and the body rule speaks for itself', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const dateless = await freshTask('reminder dateless')
    const dateOnly = await freshTask('reminder mode date only', { due_date: due })
    const timed = await freshTask('reminder mode timed', {
      due_date: due,
      due_time: '09:30',
    })

    const named: readonly [string, string, unknown, string][] = [
      [
        '7.9\'s second refusal, INV-6, which covers both modes rather than the offset one alone: with no date the date-only arm has nothing to attach its wall time to',
        dateless,
        { offset_minutes: 30 },
        'offset_minutes',
      ],
      ['the same refusal reached through the other mode', dateless, { time_of_day: '09:00' }, 'time_of_day'],
      [
        '4.8\'s cross-table rule: offset is the mode for a task with a due_time',
        dateOnly,
        { offset_minutes: 30 },
        'offset_minutes',
      ],
      [
        'and its converse, time_of_day being the mode for a task without one',
        timed,
        { time_of_day: '09:00' },
        'time_of_day',
      ],
      [
        '10.3\'s reminder offset row, 0 to 10080 minutes, which is the one refusal here a body answers alone',
        timed,
        { offset_minutes: 10_081 },
        'offset_minutes',
      ],
    ]
    for (const [what, taskId, body, field] of named) {
      const response = await api(
        owner,
        `/tasks/${taskId}/reminder`,
        jsonInit('PUT', body),
      )
      expect(response.status, `${what} must answer 422`).toBe(422)
      expect(
        issuesOf(errorEnvelope.safeParse(response.json())),
        `${what} must carry the 7.0 envelope`,
      ).toEqual([])
      expect(
        (response.json() as { error: { code: string } }).error.code,
        `${what} must carry the one code this status has`,
      ).toBe('validation_failed')
      expect(
        response.body,
        `${what} must name ${field}, the mode the caller sent, in the one 10.3 grammar; naming the pair would say something is wrong without saying which half`,
      ).toContain(`${field}:`)
    }

    /*
    The rule that is about the body rather than about a field, which frozen
    7.9's PUT is the first body in this contract to carry: its two modes are
    one exclusive-or and neither field is the wrong one. errors.ts answers it
    in the schema author's words, because nothing prefixes a pathless issue
    and the alternative told a caller who sent a JSON object that a JSON
    object is required.
    */
    const bodyRules: readonly [string, unknown][] = [
      ['neither mode', {}],
      ['both modes', { offset_minutes: 30, time_of_day: '09:00' }],
      ['both keys present and neither carrying a value', { offset_minutes: null, time_of_day: null }],
    ]
    for (const [what, body] of bodyRules) {
      const response = await api(
        owner,
        `/tasks/${timed}/reminder`,
        jsonInit('PUT', body),
      )
      expect(response.status, `${what} must answer 422`).toBe(422)
      expect(
        (response.json() as { error: { message: string } }).error.message,
        `${what} is 4.8's CHECK read as a rule about the whole body, so it reaches the caller as its author wrote it`,
      ).toBe('Exactly one of offset_minutes and time_of_day is required.')
    }
  })

  /*
  Which refusal comes first, measured as a pair rather than asserted. The
  schema is judged before the task is resolved, the ordering 7.6's status 409
  and 7.8's tz already use: a refusal that reads no row answers the same for a
  task the caller owns and one they cannot see, so it discriminates nothing.
  The refusals that do read a row come after access, which is what AC-147's
  last case means by a 422 confirming the task exists.
  */
  test('the body is judged before the row and the row before its own refusals (10.2)', async () => {
    const { owner, strangerTaskId } = await stage()
    const mine = await freshTask('reminder ordering', { due_date: daysAhead(30) })
    const dateless = await freshTask('reminder ordering dateless')

    const onMine = await api(owner, `/tasks/${mine}/reminder`, jsonInit('PUT', {}))
    const onStranger = await api(
      owner,
      `/tasks/${strangerTaskId}/reminder`,
      jsonInit('PUT', {}),
    )
    expect(
      [onMine.status, onStranger.status],
      'a body that states its own contradiction is refused for every id, so the ordering leaks nothing',
    ).toEqual([422, 422])

    expect(
      (
        await api(
          owner,
          `/tasks/${strangerTaskId}/reminder`,
          jsonInit('PUT', { offset_minutes: 30 }),
        )
      ).status,
      'while a legal body against a task the caller cannot see is 404, never the 422 that would confirm the row exists',
    ).toBe(404)
    expect(
      (
        await api(
          owner,
          `/tasks/${dateless}/reminder`,
          jsonInit('PUT', { offset_minutes: 30 }),
        )
      ).status,
      'and the same body against a task they can see reaches the row-dependent refusal, which is the difference the leak rule turns on',
    ).toBe(422)
    expect(
      (await api(owner, `/tasks/${strangerTaskId}/reminder`, { method: 'DELETE' }))
        .status,
      'the DELETE reads the task the same way: an inaccessible one is nonexistent',
    ).toBe(404)
  })

  test('DELETE is 204 and idempotent, and is emphatically not 8.4\'s cascade', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const taskId = await freshTask('reminder delete', {
      due_date: due,
      due_time: '09:30',
      recurrence_rule: 'FREQ=DAILY',
    })
    expect(
      (
        await api(
          owner,
          `/tasks/${taskId}/reminder`,
          jsonInit('PUT', { offset_minutes: 30 }),
        )
      ).status,
      'staging the row the delete removes',
    ).toBe(200)

    const removed = await api(owner, `/tasks/${taskId}/reminder`, {
      method: 'DELETE',
    })
    expect(removed.status, '7.9 fixes this one at 204').toBe(204)
    expect(
      removed.body,
      'a 204 carries no body, and the ruling that gave the PUT one left this bullet alone: the endpoint carrying the most sits beside the endpoint carrying the least',
    ).toBe('')

    const after = expectTaskDetailExact(
      (await api(owner, `/tasks/${taskId}`)).json(),
      'the task the delete left behind',
    )
    expect(after.reminder, 'the row is gone').toBeNull()
    expect(
      [after.due_date, after.due_time, after.recurrence_rule],
      '8.6 lists reminder removal one line from the clear-date cascade, and they are not the same thing: this one takes the reminder and leaves the date, the time and the rule exactly where they are',
    ).toEqual([due, '09:30', 'FREQ=DAILY'])

    expect(
      (await api(owner, `/tasks/${taskId}/reminder`, { method: 'DELETE' })).status,
      '7.9 says idempotent, so a second call is 204 rather than the 404 a second DELETE /tasks/:id answers',
    ).toBe(204)
    expect(
      (
        await api(
          owner,
          `/tasks/${await freshTask('reminder never had one')}/reminder`,
          { method: 'DELETE' },
        )
      ).status,
      'and a task that never carried one answers the same, the 404 on this endpoint being the task\'s alone',
    ).toBe(204)
  })

  /*
  The rule this role exists to enforce, on the first object in this contract
  that three endpoints write. 7.9's PUT, 7.6's create body and 7.6's PATCH
  body all reach the one row 4.8 keys by task_id, and a per-endpoint variant
  would appear here first, since each door builds its answer through its own
  handler. They are compared against each other rather than each against a
  shape, which is the only comparison that catches a door that drifted by a
  value while satisfying every key list.
  */
  test('the three write paths to one row answer one object, not three', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const dated = { due_date: due, due_time: '09:30' }

    const created = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract reminder create',
        ...dated,
        reminder: { offset_minutes: 45 },
      }),
    )
    expect(
      created.status,
      '7.6 names reminder in its create body, and P7 is where the arm stops falling to 7.0\'s tolerated-unknown rule',
    ).toBe(201)
    expect(
      issuesOf(postTasksResponse.safeParse(created.json())),
      'the created body does not match the shared TaskDetail schema',
    ).toEqual([])
    const fromCreate = expectTaskDetailExact(created.json(), 'the create body')

    const patched = await api(
      owner,
      `/tasks/${await freshTask('reminder patch arm', dated)}`,
      jsonInit('PATCH', { reminder: { offset_minutes: 45 } }),
    )
    expect(
      patched.status,
      '7.6\'s PATCH takes the fields its create body names, which is how recurrence_rule arrived at P6',
    ).toBe(200)
    expect(issuesOf(patchTaskResponse.safeParse(patched.json()))).toEqual([])
    const fromPatch = expectTaskDetailExact(patched.json(), 'the PATCH body')

    const put = await api(
      owner,
      `/tasks/${await freshTask('reminder put arm', dated)}/reminder`,
      jsonInit('PUT', { offset_minutes: 45 }),
    )
    expect(put.status).toBe(200)
    const fromPut = expectTaskDetailExact(put.json(), 'the PUT body')

    expect(
      [fromCreate.reminder, fromPatch.reminder],
      'one request, three doors, one object: a door that assembled its own reminder would pass every key check above and fail here',
    ).toEqual([fromPut.reminder, fromPut.reminder])
  })

  /*
  The one shape question frozen 7.6 leaves open on the field it gained here,
  settled at this review and recorded with its grounds in
  src/shared/tasks.ts. The wire is where it is worth pinning, because the
  narrow reading is only defensible if the refusal tells the caller where the
  removal lives: 7.9 opened one door for it and this endpoint is not it.
  */
  test('the PATCH admits a reminder and refuses a null, 7.9 owning the removal', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder patch null', {
      due_date: daysAhead(30),
      due_time: '09:30',
    })
    expect(
      (
        await api(
          owner,
          `/tasks/${taskId}`,
          jsonInit('PATCH', { reminder: { offset_minutes: 15 } }),
        )
      ).status,
    ).toBe(200)

    const cleared = await api(
      owner,
      `/tasks/${taskId}`,
      jsonInit('PATCH', { reminder: null }),
    )
    expect(
      cleared.status,
      'a reminder is a row of 4.8 rather than a column of 4.5, so its absence is the row not existing and null is not a value the field holds',
    ).toBe(422)
    expect(issuesOf(errorEnvelope.safeParse(cleared.json()))).toEqual([])
    expect(
      cleared.body,
      'naming the field, in the one 10.3 grammar',
    ).toContain('reminder:')
    expect(
      cleared.body,
      'and pointing at the door frozen 7.9 opened, which is what makes a refusal something a client can act on rather than a type complaint',
    ).toContain('DELETE /tasks/:id/reminder')

    expect(
      expectTaskDetailExact(
        (await api(owner, `/tasks/${taskId}`)).json(),
        'the task the refusal did not move',
      ).reminder,
      'a refused body applies none of itself, so the reminder the caller meant to clear is still there',
    ).toEqual({ offset_minutes: 15, time_of_day: null })

    expect(
      (await api(owner, `/tasks/${taskId}/reminder`, { method: 'DELETE' })).status,
      'and the door that does clear it answers 204',
    ).toBe(204)
  })

  /*
  8.5's copy, which is the fourth write path to the one 4.8 row and the only
  one that is not a request body. It reaches this surface through the
  transition envelope, where 7.6 gives generated_task a TaskCard: 7.0's card
  carries no reminder key, so nothing in the response reports that the
  successor acquired one and a client learns it from a GET or not at all. That
  is the frozen shape rather than a gap this review may close, and it is
  measured here so it is a fact rather than an assumption.
  */
  test('a generated successor carries the reminder, and only its own GET says so', async () => {
    const { owner } = await stage()
    const due = daysAhead(30)
    const taskId = await freshTask('reminder successor', {
      due_date: due,
      due_time: '09:30',
      recurrence_rule: 'FREQ=DAILY',
      reminder: { offset_minutes: 45 },
    })

    const done = await api(owner, `/tasks/${taskId}/complete?tz=UTC`, {
      method: 'POST',
    })
    expect(done.status).toBe(200)
    const envelope = done.json() as Record<string, unknown>
    const card = expectTaskCardExact(envelope.generated_task, 'the successor card')
    expect(
      'reminder' in card,
      '7.0 gives the card no reminder key, so 8.5\'s copy is invisible in the envelope by the shape frozen 7.6 chose',
    ).toBe(false)

    const successor = expectTaskDetailExact(
      (await api(owner, `/tasks/${String(card.id)}`)).json(),
      'the successor read fresh',
    )
    expect(
      successor.reminder,
      '8.5 copies the mode and the value onto the successor, so the row the client fetches carries a legal 4.8 pair rather than the both-null shape a half-copy would leave',
    ).toEqual({ offset_minutes: 45, time_of_day: null })
    expect(
      (envelope.task as Record<string, unknown>).reminder,
      'and the completed occurrence keeps its own, 8.6 saying a reminder survives completion untouched',
    ).toEqual({ offset_minutes: 45, time_of_day: null })
  })

  /*
  8.6: a reminder "survives completion and abandonment untouched", and frozen
  7.9 names no status guard on the write either. Worth a probe because the
  guard a reader expects to find is the one somebody eventually adds: nothing
  in the acceptance range writes a reminder onto a settled task.
  */
  test('7.9 carries no status guard, which is 8.6 read forward', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('reminder on a settled task', {
      due_date: daysAhead(30),
      due_time: '09:30',
    })
    expect(
      (await api(owner, `/tasks/${taskId}/complete?tz=UTC`, { method: 'POST' }))
        .status,
    ).toBe(200)

    const written = await api(
      owner,
      `/tasks/${taskId}/reminder`,
      jsonInit('PUT', { offset_minutes: 30 }),
    )
    expect(
      written.status,
      '8.6 keeps a reminder through completion and lets un-completing before the instant fire it, so a completed task is not a 409 here',
    ).toBe(200)
    expect(
      expectTaskDetailExact(written.json(), 'the settled task\'s PUT body').status,
      'and the row is answered as it stands, completed and carrying a reminder',
    ).toBe('completed')
  })
})

describe('the 7.7 and 7.8 response bodies the review settled', () => {
  test('both step mutations answer the parent TaskDetail a fresh GET would give', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('steps')

    const added = await api(
      owner,
      `/tasks/${taskId}/steps`,
      jsonInit('POST', { title: 'a step' }),
    )
    expect(added.status, '7.7 fixes the status at 201').toBe(201)
    expect(
      issuesOf(postTaskStepsResponse.safeParse(added.json())),
      'the 201 body does not match the settled shape',
    ).toEqual([])
    const addedBody = expectTaskDetailExact(added.json(), 'the POST steps body')
    expect(
      addedBody.steps_total,
      'the parent is what changed: the counts a card renders move with the array',
    ).toBe(1)
    const step = (addedBody.steps as Record<string, unknown>[])[0]
    expect(
      step?.position,
      '7.7 defaults the position to max plus 1, which the caller could not know without this body',
    ).toBe(1)

    const stepId = String(step?.id)
    const patched = await api(
      owner,
      `/steps/${stepId}`,
      jsonInit('PATCH', { done: true }),
    )
    expect(patched.status, '7.7 fixes the status at 200').toBe(200)
    expect(
      issuesOf(patchStepResponse.safeParse(patched.json())),
      'the 200 body does not match the settled shape',
    ).toEqual([])
    const patchedBody = expectTaskDetailExact(
      patched.json(),
      'the PATCH /steps/:id body',
    )
    expect(patchedBody.steps_done, 'and steps_done moved with it').toBe(1)
    expect(
      patchedBody.status,
      '7.7: a step never touches the task status, in either direction',
    ).toBe('pending')

    const removed = await api(owner, `/steps/${stepId}`, { method: 'DELETE' })
    expect(removed.status, '7.7 fixes this one at 204').toBe(204)
    expect(
      removed.body,
      'a 204 carries no body; the asymmetry with the PATCH is the protocol\'s, not the review\'s',
    ).toBe('')
  })

  test('both My Day calls answer the TaskDetail, and pulled follows the entry', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('my day')

    // ?tz by the owner's ruling of 2026-08-08: the pull dates added_on from
    // today(V), so it reads the zone the caller is in. The drop below takes
    // none, evaluating no date, which is why only the POSTs carry it here.
    const pulled = await api(owner, `/tasks/${taskId}/my-day?tz=UTC`, {
      method: 'POST',
    })
    expect(pulled.status, '7.8 makes the pull an insert-or-nothing at 200').toBe(
      200,
    )
    expect(
      issuesOf(postTaskMyDayResponse.safeParse(pulled.json())),
      'the pull body does not match the settled shape',
    ).toEqual([])
    expect(
      expectTaskDetailExact(pulled.json(), 'the POST my-day body').pulled,
      'pulled is a field of the task, which is why the task is what answers',
    ).toBe(true)

    const dropped = await api(owner, `/tasks/${taskId}/my-day`, {
      method: 'DELETE',
    })
    expect(dropped.status, '7.8 states this one outright: 200, not 204').toBe(200)
    expect(
      issuesOf(deleteTaskMyDayResponse.safeParse(dropped.json())),
      'the drop body does not match the settled shape',
    ).toEqual([])
    expect(
      expectTaskDetailExact(dropped.json(), 'the DELETE my-day body').pulled,
      'and the flag came back with it',
    ).toBe(false)

    const again = await api(owner, `/tasks/${taskId}/my-day`, {
      method: 'DELETE',
    })
    expect(
      again.status,
      '7.8 is idempotent: an absent entry is nothing to remove, not a missing resource',
    ).toBe(200)
    expect(issuesOf(deleteTaskMyDayResponse.safeParse(again.json()))).toEqual([])
  })
})

describe('the 7.0 taxonomy on the 7.6 to 7.8 surface', () => {
  test('every refusal carries the envelope, and its code agrees with its status', async () => {
    const { owner, stranger, taskId, strangerTaskId } = await stage()
    void stranger
    const completedId = await freshTask('conflict')
    expect(
      (await api(owner, `/tasks/${completedId}/complete`, { method: 'POST' }))
        .status,
      'staging the completion the abandon then conflicts with',
    ).toBe(200)
    const inboxTaskId = await freshTask('inbox guard')

    const refusals: readonly [number, string, RawResponse, string][] = [
      [
        400,
        'bad_request',
        await api(owner, '/tasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '[]',
        }),
        'a body that parses to something other than an object (7.0)',
      ],
      [
        401,
        'unauthenticated',
        await new TestBrowser(origin).request(`${origin}/api/v1/tasks/${taskId}`),
        'a request with no session at all',
      ],
      [
        403,
        'forbidden',
        await api(owner, `/tasks/${taskId}`, {
          ...jsonInit('PATCH', { title: 'no token' }),
          csrf: 'omit',
        }),
        'a mutation with no CSRF token (11.6), which comes after the 401',
      ],
      [
        404,
        'not_found',
        await api(owner, '/tasks/not-a-uuid'),
        'a non-uuid path id, which must never surface as a cast error',
      ],
      [
        404,
        'not_found',
        await api(owner, `/tasks/${strangerTaskId}`),
        'a task in a folder the caller is not a member of (10.2)',
      ],
      [
        409,
        'conflict',
        await api(owner, `/tasks/${completedId}/abandon`, { method: 'POST' }),
        'a transition 5.1 marks never',
      ],
      [
        409,
        'conflict',
        await api(
          owner,
          `/tasks/${inboxTaskId}`,
          jsonInit('PATCH', { assignee_id: null }),
        ),
        'the INV-5 unassign guard in a single-member folder',
      ],
      [
        422,
        'validation_failed',
        await api(owner, '/tasks', jsonInit('POST', { title: '' })),
        'a title outside 10.3\'s range',
      ],
      [
        422,
        'validation_failed',
        await api(
          owner,
          `/tasks/${taskId}`,
          jsonInit('PATCH', { assignee_id: '00000000-0000-4000-8000-000000000000' }),
        ),
        'an assignee who is not a member, the composite FK surfaced (7.6)',
      ],
    ]

    for (const [status, code, response, what] of refusals) {
      expect(response.status, `${what} must answer ${String(status)}`).toBe(status)
      const parsed = errorEnvelope.safeParse(response.json())
      expect(
        issuesOf(parsed),
        `${what} must carry the 7.0 envelope`,
      ).toEqual([])
      expect(
        (response.json() as { error: { code: string } }).error.code,
        `${what} must carry the one code this status has`,
      ).toBe(code)
    }
  })

  test('5.1\'s two normative refusals carry the copy 5.1 writes', async () => {
    const { owner } = await stage()
    const completedId = await freshTask('copy completed')
    await api(owner, `/tasks/${completedId}/complete`, { method: 'POST' })
    const abandoned = await api(owner, `/tasks/${completedId}/abandon`, {
      method: 'POST',
    })
    expect(
      abandoned.body.toLowerCase(),
      '5.1: complete tasks cannot be abandoned; un-complete first',
    ).toContain('un-complete first')

    const abandonedId = await freshTask('copy abandoned')
    await api(owner, `/tasks/${abandonedId}/abandon`, { method: 'POST' })
    const completed = await api(owner, `/tasks/${abandonedId}/complete`, {
      method: 'POST',
    })
    expect(
      completed.body.toLowerCase(),
      '5.1: restore the task first',
    ).toContain('restore the task first')
  })

  test('AC-102: an inaccessible task is indistinguishable from a nonexistent one', async () => {
    const { owner, strangerTaskId } = await stage()
    const probes: readonly [string, RawResponse][] = [
      ['GET /tasks/:id', await api(owner, `/tasks/${strangerTaskId}`)],
      [
        'PATCH /tasks/:id',
        await api(owner, `/tasks/${strangerTaskId}`, jsonInit('PATCH', { title: 'x' })),
      ],
      [
        'DELETE /tasks/:id',
        await api(owner, `/tasks/${strangerTaskId}`, { method: 'DELETE' }),
      ],
      [
        'POST /tasks/:id/complete',
        await api(owner, `/tasks/${strangerTaskId}/complete`, { method: 'POST' }),
      ],
      [
        'POST /tasks/:id/steps',
        await api(
          owner,
          `/tasks/${strangerTaskId}/steps`,
          jsonInit('POST', { title: 'trespass' }),
        ),
      ],
      [
        'POST /tasks/:id/my-day',
        // A valid tz, or this probe measures the 422 the ruling added rather
        // than the 404 it is about: 7.8's parameter is validated before the
        // task is resolved, which is the non-leaking order (the P4 views
        // router does the same on the folder page) and is asserted on its own
        // below rather than left to be discovered here.
        await api(owner, `/tasks/${strangerTaskId}/my-day?tz=UTC`, {
          method: 'POST',
        }),
      ],
      [
        'DELETE /tasks/:id/my-day',
        await api(owner, `/tasks/${strangerTaskId}/my-day`, { method: 'DELETE' }),
      ],
      [
        'PUT /tasks/:id/reminder',
        // A legal body, for the reason the pull carries a valid tz above: a
        // body the schema refuses answers 422 for every id, so this probe
        // would measure that refusal rather than the 404 it is about.
        await api(
          owner,
          `/tasks/${strangerTaskId}/reminder`,
          jsonInit('PUT', { offset_minutes: 30 }),
        ),
      ],
      [
        'DELETE /tasks/:id/reminder',
        await api(owner, `/tasks/${strangerTaskId}/reminder`, { method: 'DELETE' }),
      ],
    ]
    for (const [what, response] of probes) {
      expect(
        response.status,
        `${what} on a task the caller cannot see must read as nonexistent, never 403 (10.2)`,
      ).toBe(404)
    }
    const nonexistent = await api(owner, `/tasks/${randomUUID()}`)
    expect(nonexistent.status).toBe(404)
    expect(nonexistent.json()).toEqual(probes[0]?.[1].json())
  })

  test("the pull's tz is judged before the task is, and leaks nothing by it", async () => {
    /*
    The ordering the probe above has to work around, asserted here so it is a
    contract fact rather than something a reader infers from a ?tz=UTC in a
    404 case. 7.8's parameter is validated first, which is the order the P4
    views router already uses on the folder page.

    What makes that the right order is the pair below rather than either half
    alone: an accessible task and one the caller cannot see answer the *same*
    422 when the zone is missing, so the refusal discriminates nothing about
    existence. The reversed order would answer 404 here and 422 there, which
    is a probe for whether a task id is real.
    */
    const { owner, strangerTaskId } = await stage()
    const mine = await freshTask('tz before resolution')

    const onMine = await api(owner, `/tasks/${mine}/my-day`, { method: 'POST' })
    const onStranger = await api(owner, `/tasks/${strangerTaskId}/my-day`, {
      method: 'POST',
    })

    expect(
      [onMine.status, onStranger.status],
      '7.8 as ruled 2026-08-08: an absent tz is 422 whoever owns the task',
    ).toEqual([422, 422])
    expect(
      errorEnvelope.safeParse(onMine.json()).success,
      'and it is the 7.0 envelope like every other refusal on this surface',
    ).toBe(true)
    expect(
      JSON.stringify(onMine.json()),
      'naming the field, which is what tells a client what to fix (7.0). The empty-path trap this avoids is real: a bare viewTz.safeParse would raise an issue sendValidationError drops, and the caller would read "A JSON object body is required." on a query parameter',
    ).toMatch(/tz/)
    expect(
      (await api(owner, `/tasks/${mine}/my-day?tz=Mars/Olympus`, { method: 'POST' }))
        .status,
      'an invalid zone is refused like an absent one',
    ).toBe(422)
  })

  /*
  The 11.3 order on every mutation of the surface rather than on a sample of
  it. A missing link is invisible from the endpoint beside it, and 7.0 makes
  the session and CSRF requirements a property of the surface, not of a route.
  AC-111 pins the 401-before-403 ordering itself, on 7.1; what is checked here
  is that no endpoint of this package was left off the chain.
  */
  test('every mutation on the surface is behind a session and a CSRF token', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('middleware sweep')
    const stepId = String(
      (
        (
          await api(
            owner,
            `/tasks/${taskId}/steps`,
            jsonInit('POST', { title: 'swept' }),
          )
        ).json() as { steps: { id: string }[] }
      ).steps[0]?.id,
    )

    const mutations: readonly [string, Init][] = [
      ['POST /tasks', jsonInit('POST', { title: 'no session' })],
      [`PATCH /tasks/${taskId}`, jsonInit('PATCH', { title: 'no session' })],
      [`DELETE /tasks/${taskId}`, { method: 'DELETE' }],
      [`POST /tasks/${taskId}/complete`, { method: 'POST' }],
      [`POST /tasks/${taskId}/uncomplete`, { method: 'POST' }],
      [`POST /tasks/${taskId}/abandon`, { method: 'POST' }],
      [`POST /tasks/${taskId}/restore`, { method: 'POST' }],
      [`POST /tasks/${taskId}/steps`, jsonInit('POST', { title: 'no session' })],
      [`PATCH /steps/${stepId}`, jsonInit('PATCH', { done: true })],
      [`DELETE /steps/${stepId}`, { method: 'DELETE' }],
      [`POST /tasks/${taskId}/my-day`, { method: 'POST' }],
      [`DELETE /tasks/${taskId}/my-day`, { method: 'DELETE' }],
      // 7.9's two, which this package added to the surface after the sweep
      // was written. A missing link is invisible from the endpoint beside it,
      // which is the whole reason this list is exhaustive rather than a
      // sample.
      [
        `PUT /tasks/${taskId}/reminder`,
        jsonInit('PUT', { offset_minutes: 30 }),
      ],
      [`DELETE /tasks/${taskId}/reminder`, { method: 'DELETE' }],
    ]

    for (const [what, init] of mutations) {
      const path = what.slice(what.indexOf('/'))
      const anonymous = await new TestBrowser(origin).request(
        `${origin}/api/v1${path}`,
        init,
      )
      expect(
        anonymous.status,
        `${what} with no session must answer 401, never the 403 that would tell a stranger a token was all they lacked`,
      ).toBe(401)

      const tokenless = await api(owner, path, { ...init, csrf: 'omit' })
      expect(
        tokenless.status,
        `${what} with a session and no CSRF token must answer 403 (11.6)`,
      ).toBe(403)
    }

    expect(
      (await api(owner, `/tasks/${taskId}`)).status,
      'and the safe read stays reachable, so the sweep refused mutations rather than the surface',
    ).toBe(200)
  })

  /*
  7.0's amended first bullet, on the one surface that carries both kinds of
  endpoint: one that needs a body and several that need none. The ruling is
  that a request claiming no JSON content type presents nothing to parse, so
  the endpoint needing a body answers 422 for the body it did not receive.
  The mirror half has no criterion anywhere, because 7.1 has no bodyless
  mutation: an endpoint that needs no body has nothing to miss, and a bodyless
  call to it is simply a legal call.
  */
  test('a missing JSON body is 422 where one is needed and no answer at all where none is', async () => {
    const { owner } = await stage()
    const taskId = await freshTask('content type')

    const needsOne = await api(owner, '/tasks', { method: 'POST' })
    expect(
      needsOne.status,
      'POST /tasks needs a body, so a request that presents none answers 422 and not 400 (7.0)',
    ).toBe(422)
    expect(errorEnvelope.safeParse(needsOne.json()).success).toBe(true)

    const needsNone = await api(owner, `/tasks/${taskId}/complete`, {
      method: 'POST',
    })
    expect(
      needsNone.status,
      '7.6 names no body for a transition, so a bodyless call is the ordinary call',
    ).toBe(200)

    // tz rides the query string, not a body, so this still measures what it
    // is about: 7.8 names no body, and a bodyless call is the ordinary call.
    // Without the parameter the probe would answer 422 for the missing zone
    // and pass this describe block's subject for the wrong reason.
    const pulled = await api(owner, `/tasks/${taskId}/my-day?tz=UTC`, {
      method: 'POST',
    })
    expect(
      pulled.status,
      'and the same for 7.8, whose two calls are the task and the session alone',
    ).toBe(200)
  })

  test('unknown fields are tolerated and wrong-typed known ones are not (7.0)', async () => {
    const { owner } = await stage()
    const tolerated = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract tolerance',
        nonsense: 'ignored',
      }),
    )
    expect(tolerated.status, 'an unknown field is ignored').toBe(201)
    const body = expectTaskDetailExact(
      tolerated.json(),
      'the tolerant create body',
    )
    expect(
      body.reminder,
      'and a create that sends no reminder gets none, which is the state this case measured through the tolerated arm until P7',
    ).toBeNull()

    /*
    reminder was the last field in the tolerated list, and it has left it: P7
    delivers the 8.6 instant 4.8's NOT NULL fire_at demands, so the field is a
    field of the body now. A body carrying one without the due_date 7.6's
    dependency check requires is a 422 naming it rather than an unknown key
    answering 201, which is exactly what happened to recurrence_rule at P6.
    */
    const refusedReminder = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract reminder',
        reminder: { offset_minutes: 30 },
      }),
    )
    expect(
      refusedReminder.status,
      '7.6 names the dependency in one breath: due_time, recurrence_rule and reminder require due_date, 422 (INV-6, AC-149)',
    ).toBe(422)
    expect(errorEnvelope.safeParse(refusedReminder.json()).success).toBe(true)
    expect(
      refusedReminder.body.toLowerCase(),
      'and the message names the field the caller sent',
    ).toContain('reminder')

    /*
    recurrence_rule was in the tolerated list until P6, and this file's own
    comment named the package that would move it. It has moved: 4.11 requires
    the subset revalidated server-side, so the field is a field of the body
    now and a rule outside the subset is a 422 naming it rather than an
    unknown key answering 201.
    */
    const refusedRule = await api(
      owner,
      '/tasks',
      jsonInit('POST', {
        title: 'contract rule',
        due_date: '2026-08-20',
        recurrence_rule: 'FREQ=DAILY;COUNT=5',
      }),
    )
    expect(
      refusedRule.status,
      '4.11 excludes COUNT, and 10.3 answers 422 with the field named (AC-071)',
    ).toBe(422)
    expect(errorEnvelope.safeParse(refusedRule.json()).success).toBe(true)
    expect(
      refusedRule.body.toLowerCase(),
      'and the message names the field the caller sent',
    ).toContain('recurrence_rule')

    const refused = await api(owner, '/tasks', jsonInit('POST', { title: 42 }))
    expect(refused.status, 'a wrong-typed known field is 422').toBe(422)
    expect(
      refused.body.toLowerCase(),
      '10.3: the 422 names the field it refused',
    ).toContain('title')

    const dependency = await api(
      owner,
      '/tasks',
      jsonInit('POST', { title: 'contract dependency', due_time: '09:30' }),
    )
    expect(dependency.status, '7.6\'s dependency check answers 422').toBe(422)
    expect(
      dependency.body.toLowerCase(),
      'and names the field the caller sent, or the one it needed',
    ).toMatch(/due_time|due_date/)
  })

  test('a PATCH carrying status answers 409 for every id, so the refusal reads no row', async () => {
    const { owner, taskId, strangerTaskId } = await stage()
    const nowhere = '00000000-0000-4000-8000-000000000404'
    const bodies: readonly [string, string][] = [
      ['a task the caller owns', taskId],
      ['a task the caller cannot see', strangerTaskId],
      ['an id that names nothing', nowhere],
    ]
    for (const [what, id] of bodies) {
      const response = await api(
        owner,
        `/tasks/${id}`,
        jsonInit('PATCH', { status: 'pending' }),
      )
      expect(
        response.status,
        `7.6 refuses status by presence, and ${what} gets the same answer, which is what keeps the ordering leak-free`,
      ).toBe(409)
    }
  })
})

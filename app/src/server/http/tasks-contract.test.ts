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
import { cleanupUsers, createTestDb, rows } from '../../../tests/helpers.js'
import { TestBrowser } from '../../../tests/http-client.js'
import type { RawRequestOptions, RawResponse } from '../../../tests/http-client.js'
import { startOidcStub } from '../../../tests/oidc-stub.js'
import type { OidcStub } from '../../../tests/oidc-stub.js'
import { errorEnvelope } from '../../shared/error-envelope.js'
import {
  deleteTaskMyDayResponse,
  getTaskResponse,
  patchStepResponse,
  patchTaskResponse,
  postTaskMyDayResponse,
  postTaskStepsResponse,
  postTasksResponse,
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

const TASK_CARD_KEYS = [
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
]
const TASK_DETAIL_KEYS = [
  ...TASK_CARD_KEYS,
  'completed_at',
  'completed_by',
  'created_by',
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
    `${where} must carry exactly the 23 keys 7.0 gives TaskDetail`,
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

    const pulled = await api(owner, `/tasks/${taskId}/my-day`, {
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

  test('an inaccessible task reads as 404 on every endpoint of the surface', async () => {
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
        await api(owner, `/tasks/${strangerTaskId}/my-day`, { method: 'POST' }),
      ],
      [
        'DELETE /tasks/:id/my-day',
        await api(owner, `/tasks/${strangerTaskId}/my-day`, { method: 'DELETE' }),
      ],
    ]
    for (const [what, response] of probes) {
      expect(
        response.status,
        `${what} on a task the caller cannot see must read as nonexistent, never 403 (10.2)`,
      ).toBe(404)
    }
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

    const pulled = await api(owner, `/tasks/${taskId}/my-day`, {
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
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      }),
    )
    expect(
      tolerated.status,
      'an unknown field is ignored, which is also how the two arms P6 and P7 own read at P3',
    ).toBe(201)
    const body = expectTaskDetailExact(
      tolerated.json(),
      'the tolerant create body',
    )
    expect(
      body.recurrence_rule,
      'and ignored means stored nowhere: an unvalidated rule is not a rule (4.11)',
    ).toBeNull()

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

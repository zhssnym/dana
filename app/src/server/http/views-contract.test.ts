/*
The 7.10 contract as code, checked against the surface that answers: the
sibling of contract.test.ts, tasks-contract.test.ts and the other three, same
skeleton, scoped at P6 to the one element of that section whose shape had
never been measured.

Why the file starts here rather than at P4, which wrote the nine bodies. Every
7.10 row is the 7.0 TaskCard, and tasks-contract.test.ts already binds that
shape to the wire on the surface that produces it a row at a time, while
src/shared/views.test.ts binds the query parameters and the cursor's codec.
The one shape neither of those can reach is Q3C's ghost: it is not a card, it
is produced only by the projection of 8.5, and its array answered empty on
every request from P4 until this package. A key list nothing has ever filled
is a promise, not a fact, and this is where it becomes one.

Scope, therefore: the calendar body and its virtual element, parsed with the
shared schemas themselves. The behavior behind them is the acceptance suite's
(AC-082, AC-126, AC-143), which restates the shapes rather than importing them
by the standing ruling that it cannot borrow its subject's definition of
correct. Here the two definitions are compared directly, which is the one
comparison neither side can make alone. Later packages add their own 7.10
questions here as they gain them.
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
import { taskCard } from '../../shared/tasks.js'
import { getPlannedCalendarResponse, virtualInstance } from '../../shared/views.js'
import { createApp } from '../index.js'

let dbClient: DbClient
let stub: OidcStub
let server: Server
let origin: string
const created: string[] = []
const domain = `views-contract-${randomUUID()}.test`

interface Person {
  jar: TestBrowser
  id: string
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
  const sub = `views-contract-${randomUUID()}`
  stub.nextIdentity({
    sub,
    email: `${sub}@${domain}`,
    email_verified: true,
    name,
  })
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
  return { jar, id }
}

function api(person: Person, path: string, init?: RawRequestOptions): Promise<RawResponse> {
  return person.jar.request(`${origin}/api/v1${path}`, init)
}

function jsonInit(method: string, body: unknown): RawRequestOptions {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function issuesOf(parsed: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}): string[] {
  return parsed.success
    ? []
    : (parsed.error?.issues ?? []).map(
        (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
      )
}

/** See tasks-contract.test.ts for why every date here is computed: a ghost
 * is drawn strictly after the current occurrence and inside the requested
 * range, so a constant would be a fixture that stops being in the future. */
function daysAhead(days: number): string {
  const at = new Date()
  at.setUTCHours(12, 0, 0, 0)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** 7.10's virtual element, its five keys transcribed from the frozen text
 * rather than read off the schema this file is judging. */
const VIRTUAL_KEYS = ['date', 'due_time', 'folder_id', 'task_id', 'title']

/** Key-exactness reads the raw body, never the parsed one: z.object strips,
 * so a parse would hide exactly the extra key this check exists to refuse
 * (the lesson the P2 review learned on the members element). */
function expectVirtualExact(body: unknown, where: string): Record<string, unknown> {
  const record = body as Record<string, unknown>
  expect(
    Object.keys(record).sort(),
    `${where} must carry exactly the five keys 7.10 enumerates`,
  ).toEqual(VIRTUAL_KEYS)
  return record
}

async function createTask(person: Person, body: object): Promise<Record<string, unknown>> {
  const response = await api(person, '/tasks', jsonInit('POST', body))
  expect(response.status, 'staging a task must answer 201').toBe(201)
  return response.json() as Record<string, unknown>
}

function calendar(person: Person, start: string, end: string): Promise<RawResponse> {
  return api(person, `/views/planned/calendar?tz=UTC&start=${start}&end=${end}`)
}

describe("Q3C's ghosts, the shape 7.10 declared and P6 filled", () => {
  test('the virtual element is 7.10\'s five keys and parses with the shared schema', async () => {
    const viewer = await signIn('Calendar Viewer')
    const anchor = daysAhead(10)
    const task = await createTask(viewer, {
      title: 'contract ghosts',
      due_date: anchor,
      due_time: '08:00',
      recurrence_rule: 'FREQ=DAILY',
    })

    const response = await calendar(viewer, anchor, daysAhead(13))
    expect(response.status).toBe(200)
    const body = response.json() as Record<string, unknown>

    expect(
      Object.keys(body).sort(),
      '7.10 gives this body two keys and no truncated flag: it is bounded by its 62 days rather than by a row count',
    ).toEqual(['real', 'virtual'])
    expect(
      issuesOf(getPlannedCalendarResponse.safeParse(body)),
      'the calendar body does not match the shared schema',
    ).toEqual([])

    const virtual = body.virtual as Record<string, unknown>[]
    expect(
      virtual.map((ghost) => ghost.date),
      '8.5 projects strictly after the current occurrence and inside the requested range, both ends inclusive',
    ).toEqual([daysAhead(11), daysAhead(12), daysAhead(13)])

    for (const [index, ghost] of virtual.entries()) {
      const where = `virtual[${String(index)}]`
      expectVirtualExact(ghost, where)
      expect(
        issuesOf(virtualInstance.safeParse(ghost)),
        `${where} does not match the shared virtualInstance schema`,
      ).toEqual([])
      expect(
        ghost.task_id,
        'Q3C: "clicking a ghost opens the current occurrence", so the id it carries is the real row\'s and never a synthesized one',
      ).toBe(task.id)
      expect(
        ghost.title,
        'and the three fields it takes from the row are that row\'s own',
      ).toBe(task.title)
      expect(ghost.folder_id).toBe((task.folder as Record<string, unknown>).id)
      expect(
        ghost.due_time,
        '4.11 puts a floating wall-clock time on the wire as HH:MM, here as everywhere else',
      ).toBe('08:00')
    }

    /*
    The other half of the body, which P4 filled and P6 must not have moved:
    the real row draws on its own date in the same response, so a client
    reading one array against the other sees one series once per date.
    */
    const real = body.real as Record<string, unknown>[]
    expect(real.map((row) => row.id)).toEqual([task.id])
    expect(issuesOf(taskCard.safeParse(real[0]))).toEqual([])
    expect(
      virtual.some((ghost) => ghost.date === anchor),
      '8.5: ghosts appear only after the current occurrence\'s date, so no date shows the same series twice',
    ).toBe(false)
  })

  test('a ghost of an all-day series carries due_time null, which the shape admits', async () => {
    const viewer = await signIn('Calendar All Day')
    const anchor = daysAhead(10)
    await createTask(viewer, {
      title: 'contract all-day ghosts',
      due_date: anchor,
      recurrence_rule: 'FREQ=DAILY',
    })

    const body = (
      await calendar(viewer, anchor, daysAhead(11))
    ).json() as Record<string, unknown>
    const virtual = body.virtual as Record<string, unknown>[]
    expect(virtual.length, 'one ghost, the day after the anchor').toBe(1)
    const ghost = expectVirtualExact(virtual[0], 'the all-day ghost')
    expect(
      ghost.due_time,
      'due_time is the parent\'s and is null for an all-day rule, which is why the key is nullable rather than absent',
    ).toBeNull()
    expect(
      issuesOf(getPlannedCalendarResponse.safeParse(body)),
      'and the body still parses whole, so the nullable key is the schema\'s reading and not this file\'s',
    ).toEqual([])
  })
})

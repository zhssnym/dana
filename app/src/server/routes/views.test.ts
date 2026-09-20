/*
In-session proof of the 7.10 surface, the P1, P2 and P3 idiom: the boot file
mounts routers by Platform's hand only, so AC-045 to AC-058, AC-070 and
AC-125 to AC-130 stay red until that wiring touch, and this file is how the
router proves itself before it. A bare express application assembles the same
pieces the requested wiring names (auth router ahead, folders and tasks
routers for the setup the harness does through 7.4 and 7.6, views router
behind them), and the acceptance harness's own stub, HTTP client and helpers
drive it unchanged.

Two duties, and the second is this package's own.

**One probe per behavior**, because the authoritative versions are the
criteria and this file must never become a second acceptance suite.

**The contract test RFC 0001's P4 row asks for by name.** taskView in
domain/tasks.ts produces a card one task at a time and no list endpoint can
call it per row, so this package necessarily writes a second producer of one
frozen shape. The guard is the shared taskCard schema, and the check below
parses every row of all nine bodies through the shared response schemas,
which is where taskCard is embedded. It needs no reach into another role's
paths: the schema is the contract, and both producers answer to it. The
acceptance harness asserts the same shape key-exact on the wire, from its own
restatement; this asserts it against src/shared itself, which the harness
deliberately cannot.
*/
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../../db/client.js'
import type { AuthTestApp, EmailRecorder } from '../../../tests/support/auth-harness.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
  expectStatus,
} from '../../../tests/support/folders-harness.js'
import type { Actor } from '../../../tests/support/folders-harness.js'
import { createTestDb } from '../../../tests/support/helpers.js'
import { TestBrowser } from '../../../tests/support/http-client.js'
import { startOidcStub } from '../../../tests/support/oidc-stub.js'
import {
  getView,
  middayZone,
  seedViewTask,
  shiftDate,
  todayIn,
} from '../../../tests/support/views-harness.js'
import {
  getAllResponse,
  getDoneResponse,
  getFolderTasksOpenResponse,
  getImportantResponse,
  getMyDayResponse,
  getPlannedCalendarResponse,
  getPlannedResponse,
  getSearchResponse,
  getTasksViewResponse,
} from '../../shared/views.js'
import { createAuthRouter } from '../auth/index.js'
import type { AuthConfig } from '../auth/index.js'
import { attachNotifier, createNotifier } from '../notify/index.js'
import type { OutboundMessage } from '../notify/index.js'
import { createFoldersRouter } from './folders.js'
import { createTasksRouter } from './tasks.js'
import { createViewsRouter } from './views.js'

let app: AuthTestApp
let server: Server
const delivered: OutboundMessage[] = []
const cast = new Cast(['owner', 'stranger'], 'p4proof')

const tz = middayZone()

const recorder: EmailRecorder = {
  sent: () => delivered.map((m) => ({ template: m.template, to: m.to, raw: m })),
  shareGrants: () =>
    delivered
      .filter((m) => m.template === 'share_grant')
      .map((m) => ({ template: m.template, to: m.to, raw: m })),
  clear: () => {
    delivered.length = 0
  },
}

beforeAll(async () => {
  const dbClient: DbClient = await createTestDb()
  const stub = await startOidcStub()

  server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${String(port)}`
  const auth: AuthConfig = {
    issuerUrl: stub.issuerUrl,
    clientId: stub.clientId,
    clientSecret: stub.clientSecret,
    appOrigin: origin,
    allowInsecureRequests: true,
  }

  const application = express()
  application.use(express.json())
  attachNotifier(
    application,
    createNotifier({
      sink: {
        send(message: OutboundMessage): void {
          delivered.push(message)
        },
      },
      logger: { info: () => undefined },
    }),
  )
  application.use('/api/v1', createAuthRouter({ dbClient, auth }))
  application.use('/api/v1', createFoldersRouter({ dbClient }))
  application.use('/api/v1', createTasksRouter({ dbClient }))
  application.use('/api/v1', createViewsRouter({ dbClient }))
  server.on('request', application)

  app = {
    origin,
    dbClient,
    db: dbClient.db,
    stub,
    emails: recorder,
    browser: () => new TestBrowser(origin),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await stub.close()
      await dbClient.close()
    },
  }
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  owner: Actor
  stranger: Actor
  inboxId: string
  workId: string
  today: string
}
let staged: Stage | undefined

/** One row of every kind the nine bodies can carry: dated and undated, open
 * and completed, in the default folder and in a custom one, so no body is
 * judged empty. */
async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, stranger] = await cast.of(app)
    if (owner === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, owner.id)
    const workId = await createFolder(owner, 'p4proof work')
    const today = todayIn(tz)
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, { ...options, assigneeId: owner.id })

    await seed({
      folderId: inboxId,
      createdBy: owner.id,
      title: 'p4proof needle due today',
      dueDate: today,
      important: true,
    })
    await seed({
      folderId: workId,
      createdBy: owner.id,
      title: 'p4proof needle undated',
    })
    await seed({
      folderId: workId,
      createdBy: owner.id,
      title: 'p4proof needle completed',
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy: owner.id,
    })
    staged = { owner, stranger, inboxId, workId, today }
  }
  return staged
}

describe('the 7.10 router answers the nine bodies src/shared declares', () => {
  test('every body parses through its shared schema, rows included', async () => {
    const { owner, workId, today } = await stage()
    const cases: {
      path: string
      query: Record<string, string>
      parse: (body: unknown) => { success: boolean; error?: unknown }
    }[] = [
      { path: '/views/my-day', query: {}, parse: (b) => getMyDayResponse.safeParse(b) },
      { path: '/views/tasks', query: {}, parse: (b) => getTasksViewResponse.safeParse(b) },
      { path: '/views/planned', query: {}, parse: (b) => getPlannedResponse.safeParse(b) },
      {
        path: '/views/planned/calendar',
        query: { start: shiftDate(today, -1), end: shiftDate(today, 1) },
        parse: (b) => getPlannedCalendarResponse.safeParse(b),
      },
      { path: '/views/important', query: {}, parse: (b) => getImportantResponse.safeParse(b) },
      { path: '/views/all', query: {}, parse: (b) => getAllResponse.safeParse(b) },
      { path: '/views/done', query: {}, parse: (b) => getDoneResponse.safeParse(b) },
      {
        path: `/folders/${workId}/tasks`,
        query: { section: 'open' },
        parse: (b) => getFolderTasksOpenResponse.safeParse(b),
      },
      {
        path: `/folders/${workId}/tasks`,
        query: { section: 'completed' },
        parse: (b) => getDoneResponse.safeParse(b),
      },
      { path: '/search', query: { q: 'needle' }, parse: (b) => getSearchResponse.safeParse(b) },
    ]

    const rejected: string[] = []
    for (const probe of cases) {
      const response = await getView(owner, probe.path, { ...probe.query, tz })
      expectStatus(response, 200, `${probe.path} must answer its body`)
      const parsed = probe.parse(response.json())
      if (!parsed.success) {
        rejected.push(`${probe.path}: ${JSON.stringify(parsed.error)}`)
      }
    }
    expect(
      rejected,
      'every row of every 7.10 body is the 7.0 TaskCard that src/shared/tasks.ts declares. This package writes a second producer of that shape, taskView being the first, and the shared schema is what keeps the two honest (RFC 0001 P4 row)',
    ).toEqual([])
  })

  test('a body carries rows, so the parse above is not vacuous', async () => {
    const { owner } = await stage()
    const response = await getView(owner, '/views/all', { tz })
    const body = response.json() as { planned: unknown[]; tasks_groups: unknown[] }
    expect(
      body.planned.length + body.tasks_groups.length,
      'the fixture puts a dated row in Planned and an undated one under a folder heading',
    ).toBeGreaterThan(1)
  })
})

describe('the refusals of 7.0 on this surface', () => {
  test('no session is 401 on every endpoint', async () => {
    const anonymous = { browser: app.browser() } as Actor
    const response = await getView(anonymous, '/views/my-day', { tz })
    expectStatus(response, 401, '7.0: every endpoint here requires a session')
  })

  test('an absent tz is 422 naming the field', async () => {
    const { owner } = await stage()
    const response = await getView(owner, '/views/planned', {})
    expectStatus(response, 422, '7.0 as ruled on 2026-08-07')
    expect(
      JSON.stringify(response.json()),
      'the field is named, which is what tells a client what to fix',
    ).toMatch(/tz/)
  })

  test('a section outside the enumeration is 422, not the open default', async () => {
    const { owner, workId } = await stage()
    const response = await getView(owner, `/folders/${workId}/tasks`, {
      tz,
      section: 'abandoned',
    })
    expectStatus(
      response,
      422,
      '7.10 enumerates section as open or completed; absent means open, and a wrong value is not absent',
    )
  })

  test('a cursor this endpoint did not issue is 422, not a silent first page', async () => {
    const { owner } = await stage()
    const response = await getView(owner, '/views/done', { tz, cursor: 'nonsense' })
    expectStatus(
      response,
      422,
      'a cursor is opaque and is sent back as it was received; anything else is a client bug rather than a page',
    )
  })

  test('a search cursor presented to Done is refused', async () => {
    const { owner } = await stage()
    const search = await getView(owner, '/search', { tz, q: 'needle' })
    const body = search.json() as { next_cursor: string | null }
    // The fixture is one page, so there is no live cursor to borrow; the
    // encoding is what is under test, and an arbitrary base64 payload of the
    // other kind is refused the same way.
    expect(body.next_cursor, 'one page of matches offers no cursor').toBeNull()
    const foreign = Buffer.from(
      JSON.stringify({ v: 1, k: 'search', p: {} }),
      'utf8',
    ).toString('base64url')
    expectStatus(
      await getView(owner, '/views/done', { tz, cursor: foreign }),
      422,
      "a cursor carries the kind of the order it names, so one endpoint's cursor cannot resume another's",
    )
  })

  test('a folder the viewer is not a member of is 404, like one that does not exist', async () => {
    const { stranger, workId } = await stage()
    expectStatus(
      await getView(stranger, `/folders/${workId}/tasks`, { tz, section: 'open' }),
      404,
      '6 Q7 is member only, else 404 (10.2, and 7.0 forbids the 403 that would leak existence)',
    )
    expectStatus(
      await getView(stranger, '/folders/not-a-uuid/tasks', { tz, section: 'open' }),
      404,
      'a path id that is not a uuid names nothing that exists, and must not reach a cast error',
    )
  })

  test('the calendar refuses both of Q3C\'s range failures', async () => {
    const { owner, today } = await stage()
    expectStatus(
      await getView(owner, '/views/planned/calendar', {
        tz,
        start: today,
        end: shiftDate(today, 63),
      }),
      422,
      '6 Q3C: end minus start at most 62 days',
    )
    expectStatus(
      await getView(owner, '/views/planned/calendar', {
        tz,
        start: shiftDate(today, 5),
        end: today,
      }),
      422,
      '6 Q3C as ruled on 2026-08-07: start must not be after end',
    )
    expectStatus(
      await getView(owner, '/views/planned/calendar', {
        tz,
        start: today,
        end: shiftDate(today, 62),
      }),
      200,
      'and the range at the limit is legal',
    )
  })
})

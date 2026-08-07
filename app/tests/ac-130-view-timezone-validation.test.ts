/*
AC-130 (proposed): given any view endpoint called with a tz that is not a
valid IANA identifier, then 422; given a valid one, then 200.

The number is proposed, not assigned; numbering section 12 is the human
owner's, and the criterion text above is the transcription an amendment would
take. This one is not on the RFC 0001 P4 row's list of three, and it is
offered under the sentence that made the list a floor. Frozen 7.0 states it
of every endpoint this package delivers, "every view endpoint takes tz, an
IANA identifier, 422 if invalid", 10.3 lists the timezone among the numbers
it calls server-enforced, and 7.11 makes today evaluation given tz
server-authoritative. Nothing asserts it. AC-007 pins the tz of 7.1, which is
the opposite rule: an unparseable zone there is treated as absent rather than
refused, a deviation 7.1 records deliberately so a stale zone database cannot
lock anyone out of signing in. So the one place the suite does test a tz
parameter teaches the wrong lesson about this one.

The case that makes this worth a criterion rather than a note is 11.15's.
Intl.DateTimeFormat accepts ECMA-402 offset identifiers like +05:30 that are
not IANA names, and an implementation validating with bare Intl therefore
accepts a value the 11.9 zone math cannot use. That hazard is already
recorded, the shared validator already carries the sign guard that closes it,
and this suite already refuses leading signs in its own oracle for the same
reason. What is missing is anything asserting that the view endpoints go
through that guard, which is exactly the shape of defect the hazard list
exists to catch.

Every endpoint is asserted rather than one, because 7.0 states the rule of
every view endpoint and there are nine of them, each mounted by hand.

One silence is recorded rather than pinned. 7.0 says what an invalid tz gets
and not what an absent one gets, and 8.1 says every request that evaluates
dates carries tz without saying what happens when one does not. Routed to the
Integration Steward with this file; nothing here asserts the absent case.

Spec: 7.0 (the rule), 10.3, 11.15 (the offset hole), 11.9, 7.11.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  getView,
  middayZone,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()

interface Endpoint {
  path: string
  query: Record<string, string>
}

let endpoints: Endpoint[] = []

/*
Values that are not IANA names. The first two are the ECMA-402 offset
identifiers 11.15 names, which bare Intl accepts and the shared validator
refuses through its sign guard; the rest are the ordinary shapes a client
sends when something upstream went wrong.
*/
const NOT_IANA = [
  '+05:30',
  '-08:00',
  'Not/AZone',
  'Europe/Atlantis',
  'UTC+2',
  'Etc/GMT+99',
  '',
]

interface Stage {
  viewer: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac130 folder')
    await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac130 zonecheck needle',
      dueDate: todayIn(tz),
    })
    const today = todayIn(tz)
    endpoints = [
      { path: '/views/my-day', query: {} },
      { path: '/views/tasks', query: {} },
      { path: '/views/planned', query: {} },
      {
        path: '/views/planned/calendar',
        query: { start: today, end: shiftDate(today, 7) },
      },
      { path: '/views/important', query: {} },
      { path: '/views/all', query: {} },
      { path: '/views/done', query: {} },
      { path: `/folders/${folderId}/tasks`, query: { section: 'open' } },
      { path: `/folders/${folderId}/tasks`, query: { section: 'completed' } },
      { path: '/search', query: { q: 'zonecheck' } },
    ]
    staged = { viewer, folderId }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-130: every view endpoint validates tz as an IANA identifier', () => {
  test('AC-130: every endpoint answers 200 to a valid zone', async () => {
    const { viewer } = await stage()
    const answered: Record<string, number> = {}
    for (const endpoint of endpoints) {
      const response = await getView(viewer, endpoint.path, {
        ...endpoint.query,
        tz,
      })
      answered[`${endpoint.path} ${JSON.stringify(endpoint.query)}`] =
        response.status
    }
    expect(
      Object.values(answered).filter((status) => status !== 200),
      `all ten calls of 7.10's nine endpoints must accept ${tz}; this is asserted first because the refusals below would otherwise pass against routes that are not mounted at all, which is today's state: ${JSON.stringify(answered)}`,
    ).toEqual([])
  })

  test('AC-130: every endpoint answers 422 to an ECMA-402 offset identifier', async () => {
    const { viewer } = await stage()
    const answered: Record<string, number> = {}
    for (const endpoint of endpoints) {
      const response = await getView(viewer, endpoint.path, {
        ...endpoint.query,
        tz: '+05:30',
      })
      answered[`${endpoint.path} ${JSON.stringify(endpoint.query)}`] =
        response.status
    }
    expect(
      Object.values(answered).filter((status) => status !== 422),
      `11.15: Intl.DateTimeFormat accepts offset identifiers like +05:30 that are not IANA names and would break the 11.9 zone math, which is why every IANA validation goes through the shared validator and its sign guard. An endpoint validating with bare Intl answers 200 here: ${JSON.stringify(answered)}`,
    ).toEqual([])
  })

  test('AC-130: every shape that is not an IANA name is refused, on one endpoint', async () => {
    const { viewer } = await stage()
    const answered: Record<string, number> = {}
    for (const value of NOT_IANA) {
      const response = await getView(viewer, '/views/my-day', { tz: value })
      answered[JSON.stringify(value)] = response.status
    }
    expect(
      Object.values(answered).filter((status) => status !== 422),
      `7.0: every view endpoint takes tz, an IANA identifier, 422 if invalid. The offsets are 11.15's hole, and the rest are what a client sends when something upstream went wrong: ${JSON.stringify(answered)}`,
    ).toEqual([])
  })

  test('AC-130: a tzdb alias is a valid zone, not an invalid one', async () => {
    const { viewer } = await stage()
    const response = await getView(viewer, '/views/my-day', {
      tz: 'US/Eastern',
    })
    expectStatus(
      response,
      200,
      '8.1 counts US/Eastern and America/New_York as one zone, and the shared validator admits aliases deliberately. A validator tightened into a whitelist of canonical names would refuse a zone real browsers report',
    )
  })

  test('AC-130: the refusal carries the 7.0 envelope naming the field', async () => {
    const { viewer } = await stage()
    const refused = await getView(viewer, '/views/my-day', { tz: '+05:30' })
    expectStatus(refused, 422, 'the offset identifier is refused')
    const envelope = refused.json() as {
      error?: { code?: unknown; message?: unknown }
    }
    expect(
      typeof envelope.error?.code === 'string' &&
        (envelope.error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } } with both non-empty (AC-117)',
    ).toBe(true)
    expect(
      JSON.stringify(refused.json()).toLowerCase(),
      '10.3 returns its limits as 422 with the field named',
    ).toMatch(/\btz\b|timezone|time_zone|zone/)
  })

  test('AC-130: a refused request evaluates nothing', async () => {
    const { viewer } = await stage()
    const refused = await getView(viewer, '/views/my-day', { tz: 'Not/AZone' })
    expectStatus(refused, 422, 'the invalid zone is refused')
    expect(
      Object.keys(refused.json() as Record<string, unknown>),
      '7.11 makes today evaluation given tz server-authoritative, so a request with no usable tz has no today to evaluate against and must answer the envelope rather than a page computed in some fallback zone',
    ).toEqual(['error'])
  })
})

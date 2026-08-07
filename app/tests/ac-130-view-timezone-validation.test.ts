/*
AC-130: Given any view endpoint called with a tz that is not a valid IANA
identifier, or with no tz at all, then 422 naming the field; given a valid
one, then 200.

Numbered by the Integration Steward on 2026-08-07 and now section 12's own
text; ac-125's header records why the numbering was the Steward's and not the
owner's, this file having proposed the opposite. This one is not on the RFC
0001 P4 row's list of three, and it was offered under the sentence that made
the list a floor. Frozen 7.0 states it of every endpoint this package
delivers, 10.3 lists the timezone among the numbers it calls server-enforced,
and 7.11 makes today evaluation given tz server-authoritative. AC-007 pins
the tz of 7.1, which is
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

The silence this file routed is closed, and it is the reason the criterion
grew rather than gained a neighbour. 7.0 said what an invalid tz gets and not
what an absent one gets; the human owner ruled on 2026-08-07 that an absent
tz answers 422 naming the field too, and 7.0 now says so. A view endpoint
called without tz is missing a required parameter rather than accepting a
default: 8.1 makes tz an input of every request that evaluates dates, and
UTC, the only plausible default, would hand most of the world the wrong day
with nothing on the wire to say it had been substituted.

The Steward widened AC-130 with the ruling instead of appending a number, and
gave the reason this file must now act on: an implementation reading tz
through a schema with a UTC default satisfies the invalid half exactly,
because a present wrong value still reaches the validator while an absent one
never does. So the defect the ruling exists to prevent was invisible to the
criterion as first written, and to this file, which asserted the invalid half
alone. The absent half is asserted below on every endpoint, and it is the
sharper of the two: the wrong-value cases fail an implementation that has no
validator, and the absent case fails one that has a good validator wired
behind a default.

Spec: 7.0 (the rule, both halves), 8.1, 10.3, 11.15 (the offset hole), 11.9,
7.11.
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
sends when something upstream went wrong. The empty string was in this list
and has a case of its own now, because what it discriminates is not whether a
value is an IANA name but whether an implementation folds it into the absent
path and defaults it.
*/
const NOT_IANA = [
  '+05:30',
  '-08:00',
  'Not/AZone',
  'Europe/Atlantis',
  'UTC+2',
  'Etc/GMT+99',
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

describe('AC-130: every view endpoint requires tz and validates it as IANA', () => {
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

  test('AC-130: every endpoint answers 422 when tz is absent', async () => {
    const { viewer } = await stage()
    const answered: Record<string, number> = {}
    for (const endpoint of endpoints) {
      const response = await getView(viewer, endpoint.path, endpoint.query)
      answered[`${endpoint.path} ${JSON.stringify(endpoint.query)}`] =
        response.status
    }
    expect(
      Object.values(answered).filter((status) => status !== 422),
      `7.0 as ruled on 2026-08-07: a view endpoint called without tz answers 422 naming the field, the same as one called with a bad tz. This is the half the criterion gained and the sharper of the two: the wrong-value cases fail an implementation with no validator, while this one fails an implementation whose validator is correct and sits behind a schema default, since a present wrong value reaches it and an absent one never does. UTC is the only plausible default and would hand most of the world the wrong day with nothing on the wire to say so: ${JSON.stringify(answered)}`,
    ).toEqual([])
  })

  test('AC-130: an absent tz is refused rather than defaulted, on the page that would hide it', async () => {
    const { viewer } = await stage()
    const bare = await getView(viewer, '/views/my-day', {})
    expectStatus(
      bare,
      422,
      'My Day is where a substituted zone does the most damage and shows the least: 8.2 groups on today(V), so a UTC default silently files a viewer\'s Carried rows under Today, or the reverse, on a page that looks entirely normal',
    )
    expect(
      Object.keys(bare.json() as Record<string, unknown>),
      'and it answers the envelope rather than a page computed in the substituted zone, which is what makes the refusal observable at all',
    ).toEqual(['error'])
  })

  test('AC-130: an empty tz parameter is refused like an absent one', async () => {
    const { viewer } = await stage()
    expectStatus(
      await getView(viewer, '/views/my-day', { tz: '' }),
      422,
      'tz= present and empty is neither a valid identifier nor an absent parameter, and both of 7.0\'s halves answer 422; an implementation treating the empty string as unset and defaulting it would pass the absent case by accident and fail here',
    )
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

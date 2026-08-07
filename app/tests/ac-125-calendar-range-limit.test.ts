/*
AC-125: Given GET /views/planned/calendar with end minus start greater than
62 days, then 422 naming the range; given exactly 62 days, then 200.

Numbered by the Integration Steward on 2026-08-07 and now section 12's own
text. This file proposed it with the number left open on the belief that
numbering is the human owner's, cited to the AC-124 amendment; the Steward
ruled otherwise, and the correction is worth keeping rather than merely
applying. That amendment records only that AC-124 was appended additively,
and AC-116 to AC-118, AC-119 to AC-123 and AC-124 were each numbered on the
Steward's authority. An appended number changes no existing number and so
invalidates no criterion, which is what places it there; what is the owner's
is the frozen text of sections 4 and 7, and none of these six moves any.

The RFC 0001 P4 row names this surface as one of three the package delivers
that no criterion in any range covered.

The surface is real and it is numbered elsewhere. Frozen 7.10 states the
refusal on the endpoint ("422 when the range exceeds 62 days"), 6 Q3C states
the rule ("end minus start at most 62 days"), and 10.3 lists the number in
the table it calls server-enforced and returned as 422 with the field named.
Three statements of one limit, and no test.

The boundary is asserted from both sides in one case, because a limit tested
only where it refuses is satisfied by an endpoint that refuses everything,
and this endpoint currently does: before the routes land every path answers
404. So the accepted range is asserted first, and the refusal after it.

62 is read as the spec's own arithmetic, end minus start, which admits a
range of 63 inclusive dates. That reading is stated here rather than assumed
because the other one is available and would put the boundary one day out.

Spec: 7.10, 6 Q3C, 10.3, 7.0 (the 422 envelope with the field named).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  calendar,
  daysBetween,
  getView,
  middayZone,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()
const LIMIT_DAYS = 62

interface Stage {
  viewer: Actor
  folderId: string
  start: string
  inRange: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac125 calendar')
    const start = shiftDate(todayIn(tz), -1)
    const inRange = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac125 a row inside every range below',
      dueDate: start,
    })
    staged = { viewer, folderId, start, inRange }
  }
  return staged
}

function errorBody(body: unknown): { code?: unknown; message?: unknown } {
  const envelope = body as { error?: { code?: unknown; message?: unknown } }
  return envelope.error ?? {}
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-125: the calendar range stops at 62 days', () => {
  test('AC-125: exactly 62 days is accepted, and 63 is refused', async () => {
    const { viewer, start, inRange } = await stage()
    const atLimit = shiftDate(start, LIMIT_DAYS)
    const overLimit = shiftDate(start, LIMIT_DAYS + 1)
    expect(
      [daysBetween(start, atLimit), daysBetween(start, overLimit)],
      '6 Q3C bounds end minus start at 62, which is the arithmetic this case reads; the other available reading counts inclusive dates and would put the boundary one day out',
    ).toEqual([LIMIT_DAYS, LIMIT_DAYS + 1])

    // Asserted first and deliberately: a limit tested only where it refuses
    // is satisfied by an endpoint that refuses everything, which is what an
    // unmounted route does.
    const accepted = await calendar(viewer, tz, start, atLimit)
    expect(
      accepted.real.map((row) => row.id),
      'the range at the limit is a legal range and answers Q3C\'s rows',
    ).toContain(inRange)

    const refused = await getView(viewer, '/views/planned/calendar', {
      tz,
      start,
      end: overLimit,
    })
    expectStatus(
      refused,
      422,
      '7.10: 422 when the range exceeds 62 days, and 10.3 calls that number server-enforced',
    )
  })

  test('AC-125: the refusal carries the 7.0 envelope naming the field', async () => {
    const { viewer, start } = await stage()
    const refused = await getView(viewer, '/views/planned/calendar', {
      tz,
      start,
      end: shiftDate(start, LIMIT_DAYS + 1),
    })
    expectStatus(refused, 422, 'the over-long range is refused')
    const error = errorBody(refused.json())
    expect(
      typeof error.code === 'string' && (error.code as string).length > 0,
      '7.0 gives every 4xx the envelope { error: { code, message } }, both non-empty strings (AC-117 pins that for the mounted surface)',
    ).toBe(true)
    expect(
      JSON.stringify(refused.json()).toLowerCase(),
      '10.3 returns its limits as 422 with the field named, and the fields this endpoint takes are start and end',
    ).toMatch(/start|end|range/)
  })

  test('AC-125 adversarial: a range far past the limit is refused the same way', async () => {
    const { viewer, start } = await stage()
    const refused = await getView(viewer, '/views/planned/calendar', {
      tz,
      start,
      end: shiftDate(start, 400),
    })
    expectStatus(
      refused,
      422,
      'a year is not a zoom level: 6 Q3C cuts year zoom for v1 because projecting a daily rule at that scale has no designed density rendering, and the range limit is what enforces the cut',
    )
  })

  /*
  An inverted range satisfies "end minus start at most 62" arithmetically
  while naming no dates at all, and section 6 said nothing about it. This file
  therefore asserted only what held under both available readings, refuse it
  or answer the bare grid, and routed the silence. The Steward ruled at the P4
  change control on 2026-08-07: Q3C now says start must not be after end and
  an inverted range answers 422 naming the pair, chosen because a malformed
  request would otherwise be indistinguishable from a legitimately empty
  month. The case is pinned to that answer now.
  */
  test('AC-125: an inverted range is refused, not answered with an empty grid', async () => {
    const { viewer, start } = await stage()
    const response = await getView(viewer, '/views/planned/calendar', {
      tz,
      start: shiftDate(start, 10),
      end: start,
    })
    expectStatus(
      response,
      422,
      '6 Q3C as ruled on 2026-08-07: start must not be after end. The alternative reading answered the bare grid, which would make a malformed request indistinguishable from a legitimately empty month, and 7.0 already gives every endpoint 422 for a validation failure with the field named, so refusing adds no status to the frozen surface',
    )
    const body = response.json() as { real?: { id?: string }[] }
    expect(
      (body.real ?? []).map((row) => row.id),
      'and it carries no rows: an implementation that fell back to some default window would fail here even under the reading the ruling declined',
    ).toEqual([])
  })
})

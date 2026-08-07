/*
AC-125 (proposed): given GET /views/planned/calendar with end minus start
greater than 62 days, then 422 naming the range; given exactly 62 days, then
200.

The number is proposed, not assigned. Numbering section 12 is the human
owner's, as the AC-124 amendment records, so this file carries the next
additive number and the criterion text above is the transcription the
amendment would take. The RFC 0001 P4 row names this surface as one of three
that the package delivers and no criterion in any range covers, and the P2
and P2S precedent for an amendment appending to a package's range is what it
points at.

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
  while naming no dates at all, and section 6 does not say which of the two
  defensible answers it gets: refuse it as invalid, or answer the bare grid
  it describes. That silence is routed to the Integration Steward rather than
  decided here, so this case asserts only what holds under both readings, and
  asserts it without a branch: whatever the status, no row comes back, since
  no date satisfies the bounds.
  */
  test('AC-125 adversarial: an inverted range answers no other range\'s rows', async () => {
    const { viewer, start } = await stage()
    const response = await getView(viewer, '/views/planned/calendar', {
      tz,
      start: shiftDate(start, 10),
      end: start,
    })
    const body = response.json() as { real?: { id?: string }[] }
    expect(
      (body.real ?? []).map((row) => row.id),
      'no date satisfies start + 10 <= d <= start, so a 200 here is the empty grid and a 422 carries no rows at all; either way an implementation that fell back to some default window fails',
    ).toEqual([])
    expect(
      [200, 422],
      'and the endpoint answers one of the two readings section 6 leaves open rather than erroring: this half is the record of which was taken, and it is routed for a ruling rather than pinned',
    ).toContain(response.status)
  })
})

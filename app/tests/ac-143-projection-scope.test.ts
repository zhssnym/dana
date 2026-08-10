/*
AC-143: Given an accessible pending rule-carrying task whose current
occurrence is due before the requested calendar range, then its instances
inside the range are projected even though the task itself draws no real row
there; given one whose current occurrence is due after the range, then
nothing is projected.

Proposed here with its test and numbered by the Integration Steward at P6's
mid-package change control on 2026-08-10, so the sentence above is section
12's own text now; it is transcribed unchanged, the P4 and P5 precedent.

**This is the surface the RFC 0001 P6 row routed to this session to judge.**
Q3C's virtual sentence scopes projection by three things, accessible, pending
and rule-carrying, and by nothing else. In particular it does not scope by
the task's own due_date lying inside the range, and section 12 records that
reading beside AC-082 as the second of its two fixture facts. No criterion in
any range asserted it. The judgment returned was that it needed one, for
three reasons, and the change control took them as this criterion's grounds.

It is reachable and ordinary rather than exotic. A weekly chore whose current
occurrence is due on the 28th of a month, viewed on the next month's grid, is
this case exactly, and so is every series a user looks ahead at. The
month-ahead view is where a repeating task is most worth seeing and is
precisely where this defect empties the calendar.

The wrong implementation is the natural one. The endpoint already fetches
real rows with due_date BETWEEN start AND end, and projecting from that
result set is one line shorter than fetching what it projects from
separately. An engine written that way is correct on every date AC-082
examines, because AC-082's current occurrence is the 27th and its grid starts
on 2026-06-28, so its series is inside its own range. The whole existing
range therefore cannot distinguish the two implementations.

And the failure is silent. Nothing errors, no row is wrong, the array is
simply shorter than it should be, which is the class of defect that reaches
production because the page looks fine.

The second half of the criterion is what keeps the first from being read as
"project everything". 8.5 bounds the projection at both ends: lo =
max(range_start, due_date + 1 day) and instances no later than range_end. A
series whose current occurrence is after the range has no instance inside it,
and an implementation that dropped the range bound to fix the first half
would paint ghosts for it.

Spec: 6 Q3C (the virtual sentence and its three scopes; the real-row
predicate, which is the one bounded by the range), 8.5 (virtual_instances and
its two bounds), 7.10, 10.2 (accessibility), 4.11.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants, seedRecurrence } from './tasks-harness.js'
import {
  expectVirtualInstances,
  ghostDatesFor,
} from './recurrence-harness.js'
import { calendar, idsOf, seedViewTask } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p6')

/*
July 2026 again, and for the same reason AC-082 uses it: these fixtures are
history and a projection that evaluates no today can be asserted at literal
dates. The 6th, 13th, 20th and 27th are the Mondays of the month.
*/
const RANGE_START = '2026-07-01'
const RANGE_END = '2026-07-31'
const BEFORE_RANGE = '2026-06-15'
const AFTER_RANGE = '2026-09-07'
const JULY_MONDAYS = ['2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27']

const tz = 'Europe/Amsterdam'

interface Stage {
  viewer: Actor
  folderId: string
  beforeId: string
  afterId: string
  dailyId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p6 ac143 projection scope')

    const here = (title: string, dueDate: string) =>
      seedViewTask(app.db, {
        folderId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
        dueDate,
      })

    // The case: a current occurrence a fortnight before the range, on a
    // weekly rule whose instances land inside it.
    const beforeId = await here(
      'p6 ac143 anchored before the range',
      BEFORE_RANGE,
    )
    await seedRecurrence(app.db, beforeId, { rule: 'FREQ=WEEKLY;BYDAY=MO' })

    // The other side of 8.5's bounds: a series that has not started yet.
    const afterId = await here('p6 ac143 anchored after the range', AFTER_RANGE)
    await seedRecurrence(app.db, afterId, { rule: 'FREQ=WEEKLY;BYDAY=MO' })

    // A daily rule anchored before the range, whose instances fill it: the
    // range_end bound is what stops it, not the anchor.
    const dailyId = await here('p6 ac143 daily before the range', BEFORE_RANGE)
    await seedRecurrence(app.db, dailyId, { rule: 'FREQ=DAILY' })

    staged = { viewer, folderId, beforeId, afterId, dailyId }
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

describe('AC-143: projection is scoped by the series, not by the range', () => {
  test('AC-143: a series anchored before the range projects into it', async () => {
    const { viewer, beforeId } = await stage()
    const view = await calendar(viewer, tz, RANGE_START, RANGE_END)

    expect(
      idsOf(view.real.filter((card) => card.id === beforeId)),
      `the premise: the task's own row is due ${BEFORE_RANGE} and Q3C's real-row predicate is bounded by the range, so it draws no real row here. That is what makes this case the one a range-bounded projection loses entirely`,
    ).toEqual([])
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        beforeId,
      ),
      'Q3C projects for every accessible pending rule-carrying task, and 8.5 runs the projection from max(range_start, due_date + 1 day) to range_end. Fetching what it projects from is a separate question from fetching the real rows, and an implementation that projects off the BETWEEN-bounded result set answers an empty array here while passing AC-082',
    ).toEqual(JULY_MONDAYS)
  })

  test('AC-143: a series anchored after the range projects nothing', async () => {
    const { viewer, afterId, beforeId } = await stage()
    const view = await calendar(viewer, tz, RANGE_START, RANGE_END)
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        beforeId,
      ).length,
      'the control: the projection is running in this response, so the absence below is the bound rather than the feature',
    ).toBeGreaterThan(0)
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        afterId,
      ),
      `8.5: lo = max(range_start, due_date + 1 day) is ${AFTER_RANGE} plus a day, which is past range_end, so the intersection is empty. Unbounded by the range means the fetch, not the projection`,
    ).toEqual([])
    expect(
      idsOf(view.real.filter((card) => card.id === afterId)),
      'and its real row is outside the range too',
    ).toEqual([])
  })

  test('AC-143: the range bounds the instances, at both ends', async () => {
    const { viewer, dailyId } = await stage()
    const view = await calendar(viewer, tz, RANGE_START, RANGE_END)
    const dates = ghostDatesFor(
      expectVirtualInstances(view.virtual, 'calendar virtual'),
      dailyId,
    )
    expect(
      dates.length,
      'a daily rule anchored before the range fills every day of July: 31 instances, intersected with the requested range and no further',
    ).toBe(31)
    expect(
      [dates[0], dates[dates.length - 1]],
      'inclusive at both ends, which is what Q3C says of the range and 8.5 of the intersection',
    ).toEqual([RANGE_START, RANGE_END])
  })

  test('AC-143: invariants hold afterwards', async () => {
    const { viewer, folderId, beforeId, afterId, dailyId } = await stage()
    await expectTaskInvariants(
      app.db,
      [beforeId, afterId, dailyId],
      [folderId],
      [viewer.id],
    )
  })
})

/*
AC-082: given a July 2026 month view with completed occurrences on the 13th
and 20th and the current occurrence due the 27th, then each of those dates
draws exactly one row, ghosts appear only after the 27th, and the 6th shows
nothing.

This criterion runs literally, at the dates it names, and it is the only one
in P6's range that does. Section 12's ruling of 2026-08-10 excluded it from
the treatment AC-072 to AC-075 take, and gave the reason: its occurrences are
history, seeded directly rather than produced by a transition, and 8.5's
projection reads stored dates against a requested range while evaluating no
today at all. So there is no clock in this file, and July 2026 is a fact
rather than an approximation. That the projection reads no clock is asserted
rather than assumed, by requesting the same range from two zones a full day
apart and requiring the same answer.

**The range is the padded month grid a month view actually requests.** Two
fixture facts were recorded in section 12 with the criterion so that its
shape review would not be where they were first noticed, and the first is
this one: within a range of exactly 2026-07-01 to 2026-07-31 the series
projects nothing, because the first instance after the 27th is 2026-08-03 and
that is outside it. The ghost clause therefore bites only on the grid a month
zoom draws. What that grid is was named nowhere when this file was written,
so the range below was stated as the request under test rather than derived
from a convention the suite would then depend on, and the silence was
escalated. 9.5 settled it at the P6 change control on 2026-08-10: a month
zoom requests six whole weeks, 42 days, never near Q3C's 62, and the week the
grid starts on is deliberately left to the designer.

The week count is what the criterion turns on and the week start is not, which
is worth stating because this header first had it the other way round. For
July 2026 the next instance falls on 2026-08-03: neither five-week grid
reaches it and both six-week grids do, whichever day they start on. The
constants below are the Sunday-start six weeks, 2026-06-28 to 2026-08-08; the
Monday-start six weeks, 2026-06-29 to 2026-08-09, carries the same ghost, so
nothing here depends on the half 9.5 left open. The exactly-July range is
asserted beside it as its own case.

**Three properties, one fixture.** 8.5's closing sentences are the reason the
criterion names three dates rather than one. Real rows draw on their own
dates in any status, and ghosts start strictly after the current occurrence,
so no date can ever show the same series twice, which is what the 13th, 20th
and 27th are for; and no past date shows an occurrence that never existed,
which is what the 6th is for. The 6th is the sharp one: it is a Monday, the
rule matches it, and it precedes the series, so an implementation that
projects the rule across the whole range instead of forward from the current
occurrence draws a ghost there for a task that did not exist yet.

The adversarial companions are the scopes Q3C's virtual sentence names and an
implementation can each lose separately: a pending rule-carrying series in a
folder the viewer cannot see must not project, and an abandoned current
occurrence must not project though its real row still draws.

**Every case that asserts an absence asserts a presence beside it, in the
same response.** Most of this criterion is negative, the 6th empty, July
empty, the abandoned series absent, the stranger's series absent, and the
7.10 virtual array has answered empty on every request since P4, when the key
was enumerated and the projection deferred to this package. So each of those
cases would pass against an endpoint that returns an empty array
unconditionally, which is exactly the endpoint that exists while this file is
being written and would assert nothing about the one that replaces it. The
positive control is the ghost on the 3rd: it is required in the same
response, or on the grid request the July case is compared against, so no
case here can be satisfied by a projection that does not run.

Spec: 8.5 (virtual_instances, and the three closing sentences), 6 Q3C (the
virtual clause, the real-row predicate, cell order), 7.10 (the endpoint, the
virtual element's keys, the 62-day range), 10.2, 4.11.
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
  seedSeriesMembership,
} from './recurrence-harness.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  calendar,
  daysBetween,
  idsOf,
  seedViewTask,
} from './views-harness.js'
import type { CalendarBody } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'stranger'], 'p6')

/*
July 2026, as the criterion writes it. The 13th, 20th and 27th are Mondays
and so is the 6th, which is what makes the 6th a date the rule matches and
the series does not reach.
*/
const FIRST_CLOSED = '2026-07-13'
const SECOND_CLOSED = '2026-07-20'
const CURRENT = '2026-07-27'
const NOTHING_DAY = '2026-07-06'
const FIRST_GHOST = '2026-08-03'
const RULE = 'FREQ=WEEKLY;BYDAY=MO'

/** The padded month grid, weeks starting Sunday. See the header. */
const GRID_START = '2026-06-28'
const GRID_END = '2026-08-08'

/** The month itself, which the criterion's first recorded fixture fact says
 * projects nothing. */
const MONTH_START = '2026-07-01'
const MONTH_END = '2026-07-31'

const tz = 'Europe/Amsterdam'

interface Stage {
  viewer: Actor
  stranger: Actor
  folderId: string
  hiddenFolderId: string
  firstClosedId: string
  secondClosedId: string
  currentId: string
  abandonedId: string
  hiddenId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, stranger] = await cast.of(app)
    if (viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const folderId = await createFolder(viewer, 'p6 ac082 calendar')
    const hiddenFolderId = await createFolder(stranger, 'p6 ac082 hidden')

    const here = (title: string, extra: Record<string, unknown>) =>
      seedViewTask(app.db, {
        folderId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
        ...extra,
      })

    // The series: two closed occurrences and the current one. The closed
    // rows carry the series and no rule, which is the shape 8.5 leaves
    // behind it; the current one carries both.
    const firstClosedId = await here('p6 ac082 the 13th', {
      dueDate: FIRST_CLOSED,
      status: 'completed',
    })
    const secondClosedId = await here('p6 ac082 the 20th', {
      dueDate: SECOND_CLOSED,
      status: 'completed',
    })
    const currentId = await here('p6 ac082 the current occurrence', {
      dueDate: CURRENT,
      dueTime: '08:15',
    })
    const seriesId = await seedRecurrence(app.db, currentId, { rule: RULE })
    await seedSeriesMembership(app.db, firstClosedId, seriesId)
    await seedSeriesMembership(app.db, secondClosedId, seriesId)

    // A second series whose current occurrence is abandoned: its real row
    // draws, its ghosts must not.
    const abandonedId = await here('p6 ac082 an abandoned occurrence', {
      dueDate: '2026-07-08',
      status: 'abandoned',
    })
    await seedRecurrence(app.db, abandonedId, { rule: 'FREQ=WEEKLY;BYDAY=WE' })

    // And a pending rule-carrying series the viewer cannot see at all.
    const hiddenId = await seedViewTask(app.db, {
      folderId: hiddenFolderId,
      createdBy: stranger.id,
      assigneeId: stranger.id,
      title: 'p6 ac082 someone else\'s series',
      dueDate: '2026-07-02',
    })
    await seedRecurrence(app.db, hiddenId, { rule: 'FREQ=DAILY' })

    staged = {
      viewer,
      stranger,
      folderId,
      hiddenFolderId,
      firstClosedId,
      secondClosedId,
      currentId,
      abandonedId,
      hiddenId,
    }
  }
  return staged
}

/**
 * The positive control every negative case here runs first. The fixture puts
 * exactly one ghost on the grid, so a response with none is a projection that
 * did not run, and every absence this file asserts would be satisfied by it
 * for the wrong reason.
 */
function expectProjectionRan(view: CalendarBody, why: string): void {
  expect(
    expectVirtualInstances(view.virtual, 'calendar virtual').length,
    `${why}: the grid must carry the ${FIRST_GHOST} ghost, or this case is asserting an absence against an endpoint that projects nothing at all (spec 8.5, 7.10)`,
  ).toBeGreaterThan(0)
}

/** Everything drawn on one date by the series under test: real rows first,
 * then ghosts, which is the cell Q3C describes. */
function drawnOn(
  view: CalendarBody,
  date: string,
  ids: readonly string[],
): string[] {
  const real = view.real
    .filter((card) => card.due_date === date && ids.includes(card.id))
    .map((card) => `real ${card.id}`)
  const ghosts = expectVirtualInstances(view.virtual, 'calendar virtual')
    .filter(
      (instance) => instance.date === date && ids.includes(instance.task_id),
    )
    .map((instance) => `ghost ${instance.task_id}`)
  return [...real, ...ghosts]
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-082: a July 2026 month view draws the series once per date', () => {
  test('AC-082: the grid this criterion needs is a legal range', async () => {
    expect(
      daysBetween(GRID_START, GRID_END),
      '10.3 and 7.10 cap a calendar request at 62 days, and the padded month grid must fit inside it or the criterion is unaskable',
    ).toBeLessThanOrEqual(62)
    expect(
      daysBetween(GRID_START, GRID_END),
      'six whole weeks, which is what a month zoom pads July 2026 to',
    ).toBe(41)
  })

  test('AC-082: each occurrence date draws exactly one row', async () => {
    const { viewer, firstClosedId, secondClosedId, currentId } = await stage()
    const ids = [firstClosedId, secondClosedId, currentId]
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    expectProjectionRan(view, '"exactly one row" is a count of real rows plus ghosts')

    expect(
      drawnOn(view, FIRST_CLOSED, ids),
      '8.5: real rows draw on their own dates in any status, and ghosts start strictly after the current occurrence, so a past occurrence draws once and is never doubled by a projection of the rule that produced it',
    ).toEqual([`real ${firstClosedId}`])
    expect(drawnOn(view, SECOND_CLOSED, ids), 'the same on the 20th').toEqual([
      `real ${secondClosedId}`,
    ])
    expect(
      drawnOn(view, CURRENT, ids),
      'and on the 27th, where the real row is the current occurrence itself: lo = max(range_start, due_date + 1 day) excludes its own date, so no date can ever show the same series twice',
    ).toEqual([`real ${currentId}`])
    expect(
      view.real.filter((card) => ids.includes(card.id)).length,
      'Q3C draws all three statuses, so the two completed occurrences are on the grid beside the pending one: the calendar is a record',
    ).toBe(3)
  })

  test('AC-082: ghosts appear only after the 27th', async () => {
    const { viewer, currentId } = await stage()
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    const ghosts = ghostDatesFor(
      expectVirtualInstances(view.virtual, 'calendar virtual'),
      currentId,
    )
    expect(
      ghosts,
      `8.5: the projection runs from max(range_start, due_date + 1 day) to range_end, so on a grid reaching ${GRID_END} the weekly series shows exactly one ghost, on ${FIRST_GHOST}`,
    ).toEqual([FIRST_GHOST])
    expect(
      ghosts.every((date) => date > CURRENT),
      'every ghost is strictly after the current occurrence (spec 8.5)',
    ).toBe(true)
  })

  test('AC-082: the 6th shows nothing', async () => {
    const { viewer, firstClosedId, secondClosedId, currentId } = await stage()
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    expectProjectionRan(view, 'an empty date means nothing if every date is empty')
    expect(
      drawnOn(view, NOTHING_DAY, [firstClosedId, secondClosedId, currentId]),
      `${NOTHING_DAY} is a Monday and the rule matches it, but the series had not started: 8.5 projects forward from the current occurrence, never across the whole range, so no past date shows an occurrence that never existed`,
    ).toEqual([])
    expect(
      view.real.filter((card) => card.due_date === NOTHING_DAY),
      'and nothing else of the viewer\'s is on that date either',
    ).toEqual([])
  })

  test('AC-082: within July alone the series projects nothing', async () => {
    const { viewer, currentId, firstClosedId, secondClosedId } = await stage()
    // The first fixture fact recorded in section 12 with this criterion. The
    // control is the grid request beside it: the same series, the same rule,
    // one range that reaches the 3rd and one that stops short of it, so what
    // is asserted is the range bound rather than a projection that never ran.
    expectProjectionRan(
      await calendar(viewer, tz, GRID_START, GRID_END),
      'the same series projects on the padded grid',
    )
    const view = await calendar(viewer, tz, MONTH_START, MONTH_END)
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        currentId,
      ),
      `the first instance after the 27th is ${FIRST_GHOST}, outside a range ending ${MONTH_END}: the intersection with the requested range is empty and the endpoint says so rather than projecting past its bounds`,
    ).toEqual([])
    expect(
      idsOf(
        view.real.filter((card) =>
          [firstClosedId, secondClosedId, currentId].includes(card.id),
        ),
      ).sort(),
      'while the three real rows are all inside July and all drawn',
    ).toEqual([firstClosedId, secondClosedId, currentId].sort())
  })

  test('AC-082: the ghost carries the current occurrence, in 7.10\'s shape', async () => {
    const { viewer, folderId, currentId } = await stage()
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    const ghosts = expectVirtualInstances(
      view.virtual,
      'calendar virtual',
    ).filter((instance) => instance.task_id === currentId)
    expect(ghosts, 'one ghost in this grid').toHaveLength(1)
    const ghost = ghosts[0] as {
      task_id: string
      title: string
      date: string
      due_time: string | null
      folder_id: string
    }
    expect(
      ghost.task_id,
      '6 Q3C: clicking a ghost opens the current occurrence, so the id it carries is that row\'s and not a synthesized one',
    ).toBe(currentId)
    expect(ghost.date, 'on the projected date').toBe(FIRST_GHOST)
    expect(ghost.title, '7.10 gives the element a title').toBe(
      'p6 ac082 the current occurrence',
    )
    expect(
      ghost.due_time,
      '7.10 gives it a due_time, which Q3C\'s cell order sorts timed rows by',
    ).toBe('08:15')
    expect(ghost.folder_id, '7.10 gives it a folder_id').toBe(folderId)
  })

  test('AC-082: the projection reads no clock', async () => {
    const { viewer, currentId } = await stage()
    // Two zones a full calendar day apart at every instant (AC-050's pair).
    // The projection evaluates no today, which section 12 gives as the
    // reason this criterion runs literally, so both must answer identically.
    const ahead = await calendar(viewer, ZONE_AHEAD, GRID_START, GRID_END)
    const behind = await calendar(viewer, ZONE_BEHIND, GRID_START, GRID_END)
    expectProjectionRan(ahead, 'two empty arrays are equal and prove nothing')
    expectProjectionRan(behind, 'the same, from the other side of the date line')
    expect(
      ghostDatesFor(
        expectVirtualInstances(behind.virtual, 'calendar virtual'),
        currentId,
      ),
      '8.5\'s projection reads stored dates against a requested range and computes no current date, so a viewer\'s zone cannot move a ghost',
    ).toEqual(
      ghostDatesFor(
        expectVirtualInstances(ahead.virtual, 'calendar virtual'),
        currentId,
      ),
    )
    expect(
      idsOf(behind.real).sort(),
      'and the real rows are the same rows too, the range being dates rather than instants (spec 4.11)',
    ).toEqual(idsOf(ahead.real).sort())
  })

  test('AC-082 adversarial: an abandoned current occurrence draws but does not project', async () => {
    const { viewer, abandonedId } = await stage()
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    expectProjectionRan(
      view,
      'the pending series in the same folder must project, or status is not what excluded this one',
    )
    expect(
      idsOf(view.real.filter((card) => card.id === abandonedId)),
      'Q3C draws abandoned rows faded and struck, so the row itself is on the grid',
    ).toEqual([abandonedId])
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        abandonedId,
      ),
      '8.5: virtual_instances returns nothing unless the task is pending, and Q3C scopes projection to accessible pending rule-carrying tasks. An abandoned series has stopped, and drawing its future would promise occurrences that will never be generated',
    ).toEqual([])
  })

  test('AC-082 adversarial: a series in an inaccessible folder projects nothing', async () => {
    const { viewer, hiddenId } = await stage()
    const view = await calendar(viewer, tz, GRID_START, GRID_END)
    expectProjectionRan(
      view,
      'the viewer\'s own series must project, or accessibility is not what excluded the stranger\'s',
    )
    expect(
      idsOf(view.real.filter((card) => card.id === hiddenId)),
      '10.2: a folder the viewer is not a member of is invisible, real rows included',
    ).toEqual([])
    expect(
      ghostDatesFor(
        expectVirtualInstances(view.virtual, 'calendar virtual'),
        hiddenId,
      ),
      'and the projection is scoped by ACCESSIBLE(V) too: a daily rule in someone else\'s folder would otherwise paint a stranger\'s month across the grid without a single readable row to explain it',
    ).toEqual([])
  })

  test('AC-082: invariants hold afterwards', async () => {
    const {
      viewer,
      stranger,
      folderId,
      hiddenFolderId,
      firstClosedId,
      secondClosedId,
      currentId,
      abandonedId,
      hiddenId,
    } = await stage()
    await expectTaskInvariants(
      app.db,
      [firstClosedId, secondClosedId, currentId, abandonedId, hiddenId],
      [folderId, hiddenFolderId],
      [viewer.id, stranger.id],
    )
  })
})

/*
AC-452: given the Scheduled calendar and a range, then a task reaches it when
its Schedule overlaps that range rather than when its Due Date falls inside
it, the overlap is inclusive at both ends, a Start-and-Due pair arrives once
carrying both of its dates rather than as two events, and a task whose
Schedule lies wholly outside the range does not arrive at all.

Issue #216, the calendar half. Q3C selected `due_date BETWEEN start AND end`
while a task had one date. **The failure that predicate produces once a task
has a span is invisible from inside any one month**: a task starting 28
September and due 3 October is absent from September, because its due date is
in October, and absent from the part of October its bar does not reach a due
date in. The bar disappears on one screen and reappears on another, and every
assertion written about a task whose whole Schedule sits inside one grid still
passes. So the fixture here is built out of spans that cross the range's ends
in each direction, and the rows one day short of each end are seeded beside
them, because an overlap written with `<` instead of `<=` passes every case
that does not sit exactly on a boundary.

**The response carries one row per task and both of that task's dates.** That
is what "one continuous spanning bar" needs from a server and it is all of it:
the grid draws the bar from the pair. A row per day covered would be the
duplication #216 refuses by name, and the count below is what separates the
two - a set-size assertion rather than a containment, because an
implementation emitting a row per covered day contains everything it should.

**What this criterion does not assert is the bar.** Drawing a span across
cells, and splitting it at week boundaries, is the client slice #216 hands to
the frontend after this contract. What `components/calendar/order.ts` draws is
one chip: on the row's due date where the grid holds that day, on its start
date where the grid holds that one instead, and on the grid's first day where
the span encloses the whole range and holds neither end - which is the last
case below, and the case a placement reading the due date alone put in a cell
that does not exist. That is stated here rather than implied, so the next
reader knows this file proves the data and not the picture.

(It read "places a real row on its due date where it has one and on its start
date otherwise" until 2026-09-20. That was the client at the moment this file
was written and it is what made the row this criterion had just delivered
vanish from the screen: a grid holding only the start end of a span placed the
chip on a day it was not drawing. `components/calendar/order.test.ts` carries
the client half.)

**Q3C's order leads on the first day of the Schedule, which is the opposite
of Q3's choice, and the fixture makes the two disagree.** The rows below are
spread so that every activation date is distinct but the due dates are not in
the same sequence; an implementation that left this ORDER BY on `due_date`
produces a different list. The one deliberate tie is at the range's last day,
where an all-day span and a timed due-only row share an activation date and
Q3C's timed flag separates them.

Spec: 6 Q3C (the real-row predicate, the cell order and the 62-day range),
4.5 (start_date), 7.10, AC-126 (the inclusive bounds this keeps).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  createFolder,
  defaultFolderOf,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { expectTaskInvariants } from '../support/tasks-harness.js'
import type { SeedViewTaskOptions } from '../support/views-harness.js'
import {
  calendar,
  expectStillSameDay,
  idsOf,
  middayZone,
  requireCard,
  seedViewTask,
  shiftDate,
  todayIn,
} from '../support/views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'ac452')

const tz = middayZone()

interface Stage {
  viewer: Actor
  inboxId: string
  workId: string
  today: string
  /** The requested range, inclusive: today through today + 6. */
  rangeStart: string
  rangeEnd: string

  /** Span -3 to 0: ends exactly on the range's first day. In. */
  endsOnFirstDay: string
  /** Span -3 to -1: ends one day short of it. Out. */
  endsOneDayShort: string
  /** Span -2 to +9: covers the whole range and both its ends. In. */
  coversEverything: string
  /** Due on the range's first day, nothing else. In. */
  dueOnFirstDay: string
  /** Due one day before the range. Out. */
  dueOneDayShort: string
  /** Completed, due inside: the calendar is a record. In. */
  completedInside: string
  /** Due inside, nothing else. In. */
  dueInside: string
  /** Start inside, nothing else. In. */
  startsInside: string
  /** Span +6 to +9: starts exactly on the range's last day. In. */
  startsOnLastDay: string
  /** Due on the range's last day, at a time. In, and after the span above. */
  dueOnLastDayTimed: string
  /** Span +7 to +9: starts one day past it. Out. */
  startsOneDayPast: string
  /** Due one day past the range. Out. */
  dueOneDayPast: string
  /** Neither date: no span, so nothing to overlap. Out. */
  neither: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const workId = await createFolder(viewer, 'ac452 work')
    const today = todayIn(tz)
    const day = (offset: number) => shiftDate(today, offset)
    const seed = (
      options: Omit<SeedViewTaskOptions, 'folderId' | 'createdBy'>,
    ) =>
      seedViewTask(app.db, {
        folderId: workId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        ...options,
      })

    staged = {
      viewer,
      inboxId,
      workId,
      today,
      rangeStart: day(0),
      rangeEnd: day(6),

      endsOnFirstDay: await seed({
        title: 'ac452 span ending on the first day',
        startDate: day(-3),
        dueDate: day(0),
      }),
      endsOneDayShort: await seed({
        title: 'ac452 span ending one day short',
        startDate: day(-3),
        dueDate: day(-1),
      }),
      coversEverything: await seed({
        title: 'ac452 span covering the whole range',
        startDate: day(-2),
        dueDate: day(9),
      }),
      dueOnFirstDay: await seed({
        title: 'ac452 due on the first day',
        dueDate: day(0),
      }),
      dueOneDayShort: await seed({
        title: 'ac452 due one day short',
        dueDate: day(-1),
      }),
      completedInside: await seed({
        title: 'ac452 completed inside',
        dueDate: day(1),
        status: 'completed',
      }),
      dueInside: await seed({
        title: 'ac452 due inside',
        dueDate: day(2),
      }),
      startsInside: await seed({
        title: 'ac452 starts inside',
        startDate: day(3),
      }),
      startsOnLastDay: await seed({
        title: 'ac452 span starting on the last day',
        startDate: day(6),
        dueDate: day(9),
      }),
      /* Timed on purpose. It shares an activation date with the row above,
         and Q3C puts all-day banners ahead of timed rows, so the tie is
         broken by the rule rather than by a random uuid. */
      dueOnLastDayTimed: await seed({
        title: 'ac452 due on the last day at nine',
        dueDate: day(6),
        dueTime: '09:00',
      }),
      startsOneDayPast: await seed({
        title: 'ac452 span starting one day past',
        startDate: day(7),
        dueDate: day(9),
      }),
      dueOneDayPast: await seed({
        title: 'ac452 due one day past',
        dueDate: day(7),
      }),
      neither: await seed({ title: 'ac452 no dates at all' }),
    }
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

describe('AC-452: the calendar carries a Schedule that overlaps its range', () => {
  test('AC-452: the fixture satisfies section 3, so a red below is a result', async () => {
    const stage_ = await stage()
    await expectTaskInvariants(
      app.db,
      [
        stage_.endsOnFirstDay,
        stage_.endsOneDayShort,
        stage_.coversEverything,
        stage_.dueOnFirstDay,
        stage_.dueOneDayShort,
        stage_.completedInside,
        stage_.dueInside,
        stage_.startsInside,
        stage_.startsOnLastDay,
        stage_.dueOnLastDayTimed,
        stage_.startsOneDayPast,
        stage_.dueOneDayPast,
        stage_.neither,
      ],
      [stage_.inboxId, stage_.workId],
      [stage_.viewer.id],
    )
  })

  test('AC-452: every overlapping Schedule is present, once, in Q3C\'s order', async () => {
    const stage_ = await stage()
    const body = await calendar(
      stage_.viewer,
      tz,
      stage_.rangeStart,
      stage_.rangeEnd,
    )
    expectStillSameDay(tz, stage_.today, 'AC-452')
    expect(
      idsOf(body.real),
      "Q3C's real rows are the accessible tasks whose Schedule overlaps the range, in all three statuses, ordered by the first day of that Schedule and then by Q3C's timed flag: the span ending on the first day, the span covering everything, the two rows on the first day, the completed row, the row due inside, the row starting inside, and at the last day the all-day span ahead of the timed due row",
    ).toEqual([
      stage_.endsOnFirstDay,
      stage_.coversEverything,
      stage_.dueOnFirstDay,
      stage_.completedInside,
      stage_.dueInside,
      stage_.startsInside,
      stage_.startsOnLastDay,
      stage_.dueOnLastDayTimed,
    ])
    expect(
      new Set(idsOf(body.real)).size,
      '"Do not create duplicate list rows for the same Task" (issue #216). A row per day a span covers contains every id this criterion names and is still the wrong answer, so the count is what is asserted',
    ).toBe(body.real.length)
  })

  test('AC-452: a Schedule wholly outside the range is absent, one day out included', async () => {
    const stage_ = await stage()
    const body = await calendar(
      stage_.viewer,
      tz,
      stage_.rangeStart,
      stage_.rangeEnd,
    )
    expectStillSameDay(tz, stage_.today, 'AC-452')
    const present = idsOf(body.real)
    for (const [id, why] of [
      [
        stage_.endsOneDayShort,
        'a span ending the day before the range begins overlaps nothing in it, and it is the row an overlap written with a strict comparison would let through',
      ],
      [
        stage_.dueOneDayShort,
        "AC-126's inclusive lower bound from the outside: one day before start is out",
      ],
      [
        stage_.startsOneDayPast,
        'a span beginning the day after the range ends overlaps nothing in it',
      ],
      [
        stage_.dueOneDayPast,
        "AC-126's inclusive upper bound from the outside: one day past end is out",
      ],
      [
        stage_.neither,
        'a task with no Schedule has no span, so there is nothing for a range to overlap',
      ],
    ] as const) {
      expect(present, why).not.toContain(id)
    }
  })

  test('AC-452: a spanning row carries both of its dates, which is what a bar is drawn from', async () => {
    const stage_ = await stage()
    const body = await calendar(
      stage_.viewer,
      tz,
      stage_.rangeStart,
      stage_.rangeEnd,
    )
    expectStillSameDay(tz, stage_.today, 'AC-452')
    const crossing = requireCard(
      body.real,
      stage_.coversEverything,
      'the span covering the whole range reaches this grid even though neither of its ends is inside it, which is the case the old due-only predicate lost',
    )
    expect(
      { start_date: crossing.start_date, due_date: crossing.due_date },
      'one row carrying both ends is how a Start+Due pair is expressed as one continuous span rather than as two events (issue #216); the grid draws the bar from the pair, and the range is inclusive at the day level',
    ).toEqual({
      start_date: shiftDate(stage_.today, -2),
      due_date: shiftDate(stage_.today, 9),
    })
    const startOnly = requireCard(
      body.real,
      stage_.startsInside,
      'a start-only task is a one-day start event on its Start Date (issue #216)',
    )
    expect(
      { start_date: startOnly.start_date, due_date: startOnly.due_date },
      'and it carries no deadline, so nothing draws it as one',
    ).toEqual({ start_date: shiftDate(stage_.today, 3), due_date: null })
  })

  test('AC-452: a range that touches only the middle of a span still carries it', async () => {
    const stage_ = await stage()
    const middle = shiftDate(stage_.today, 4)
    const body = await calendar(stage_.viewer, tz, middle, middle)
    expectStillSameDay(tz, stage_.today, 'AC-452')
    expect(
      idsOf(body.real),
      'a single-day range inside a span holds that span and nothing whose Schedule misses that day. This is the case a BETWEEN over one date can never answer: neither end of the span is in the range, and the bar is drawn across it all the same',
    ).toEqual([stage_.coversEverything])
  })
})

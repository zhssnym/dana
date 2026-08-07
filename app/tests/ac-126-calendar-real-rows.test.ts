/*
AC-126: Given tasks due inside and outside an accepted calendar range in all
three statuses, when GET /views/planned/calendar, then real carries exactly
the accessible rows due within the inclusive bounds, in all three statuses,
ordered all-day banners before timed rows within each date.

Numbered by the Integration Steward on 2026-08-07 and now section 12's own
text; ac-125's header records why the numbering was the Steward's and not the
owner's, this file having proposed the opposite. This one is not on the RFC
0001 P4 row's list of three, and it was offered under the same sentence that
made the list a floor rather than a ceiling. The case for it is arithmetic:
7.10 has nine endpoints, and after
AC-045 to AC-058 eight of them have criteria. The calendar has none. AC-082
draws ghosts on a July 2026 month view and belongs to P6, which delivers the
projection; the real rows this package answers at P4 are asserted nowhere.

Three things are pinned that nothing else reaches. The range is inclusive at
both ends, which an implementation writing a half-open window gets wrong on
exactly one date and on no other. All three statuses appear, because 6 Q3C
says the calendar is a record while every other list view in section 6 drops
at least one status, so the calendar is the one place an over-copied status
filter is invisible until a completed row goes missing from a past date. And
the cell order is Q3C's own, which is not Q3's: the list puts status_rank
above the timed flag, the cell puts the timed flag above status_rank, so an
implementation reusing the Planned comparator here orders a mixed date wrong.

One silence this file routed is closed, and the assertion tightens with it.
The section 6 preamble defined status_rank for pending and abandoned only,
Q8 extended the scale locally to completed = 2, and Q3C used status_rank bare
over a result admitting all three, which left a completed row's position
inside a cell undefined; this file therefore ordered the two defined ranks
and asserted only presence for the third. The Steward ruled at the P4 change
control on 2026-08-07 and lifted Q8's number into the preamble, so one
definition now serves every query. The all-day banners of a date are
therefore a full sequence here, pending then abandoned then completed, which
is what the file could not ask for before.

The virtual arm is P6's. 7.10 enumerates the key, so this file asserts that
the key is an array and nothing else about it, which is the treatment P3 gave
7.0's recurrence_rule and reminder keys while their computations were
deferred.

Spec: 6 Q3C, 7.10, 8.5 (the projection, at P6), 10.2.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  calendar,
  idsOf,
  middayZone,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'stranger'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  stranger: Actor
  folderId: string
  hiddenFolderId: string
  start: string
  end: string
  cellDate: string
  onStart: string
  onEnd: string
  beforeStart: string
  afterEnd: string
  undated: string
  hidden: string
  cellPendingAllDay: string
  cellAbandonedAllDay: string
  cellCompletedAllDay: string
  cellTimedEarly: string
  cellTimedLate: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, stranger] = await cast.of(app)
    if (viewer === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const folderId = await createFolder(viewer, 'p4 ac126 calendar')
    const hiddenFolderId = await createFolder(stranger, 'p4 ac126 hidden')
    const today = todayIn(tz)
    const start = shiftDate(today, -10)
    const end = shiftDate(today, 10)
    const cellDate = today

    const here = (title: string, extra: Record<string, unknown>) =>
      seedViewTask(app.db, {
        folderId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
        ...extra,
      })

    // The two bounds themselves, which a half-open window loses one of.
    const onStart = await here('p4 ac126 on the start date', {
      dueDate: start,
      status: 'completed',
    })
    const onEnd = await here('p4 ac126 on the end date', { dueDate: end })
    const beforeStart = await here('p4 ac126 the day before start', {
      dueDate: shiftDate(start, -1),
    })
    const afterEnd = await here('p4 ac126 the day after end', {
      dueDate: shiftDate(end, 1),
    })
    const undated = await here('p4 ac126 undated', {})

    // One date carrying five rows, which is where Q3C's cell order is
    // distinguishable from Q3's list order.
    const cellPendingAllDay = await here('p4 ac126 cell pending all-day', {
      dueDate: cellDate,
    })
    const cellAbandonedAllDay = await here('p4 ac126 cell abandoned all-day', {
      dueDate: cellDate,
      status: 'abandoned',
    })
    const cellCompletedAllDay = await here('p4 ac126 cell completed all-day', {
      dueDate: cellDate,
      status: 'completed',
    })
    // Timed, and earlier in the day than nothing else is: the list order of
    // Q3 would place the abandoned timed row after every all-day row of its
    // own status, while the cell order places both timed rows after every
    // all-day row whatever their statuses.
    const cellTimedEarly = await here('p4 ac126 cell abandoned 07:00', {
      dueDate: cellDate,
      dueTime: '07:00',
      status: 'abandoned',
    })
    const cellTimedLate = await here('p4 ac126 cell pending 19:00', {
      dueDate: cellDate,
      dueTime: '19:00',
    })

    const hidden = await seedViewTask(app.db, {
      folderId: hiddenFolderId,
      createdBy: stranger.id,
      assigneeId: stranger.id,
      title: 'p4 ac126 in a folder the viewer cannot see',
      dueDate: cellDate,
    })

    staged = {
      viewer,
      stranger,
      folderId,
      hiddenFolderId,
      start,
      end,
      cellDate,
      onStart,
      onEnd,
      beforeStart,
      afterEnd,
      undated,
      hidden,
      cellPendingAllDay,
      cellAbandonedAllDay,
      cellCompletedAllDay,
      cellTimedEarly,
      cellTimedLate,
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

describe('AC-126: the calendar is a record of the range, inclusive and in every status', () => {
  test('AC-126: both bounds are inside the range', async () => {
    const { viewer, start, end, onStart, onEnd } = await stage()
    const body = await calendar(viewer, tz, start, end)
    const ids = idsOf(body.real)
    expect(
      ids,
      `6 Q3C takes due_date BETWEEN start AND end with the bounds inclusive, so the row due ${start} is in the range that starts there; a half-open window loses exactly this row and no other`,
    ).toContain(onStart)
    expect(
      ids,
      `and the row due ${end} likewise, which the other half-open window loses`,
    ).toContain(onEnd)
  })

  test('AC-126: neighbouring dates outside the range are excluded', async () => {
    const { viewer, start, end, beforeStart, afterEnd, undated } = await stage()
    const ids = idsOf((await calendar(viewer, tz, start, end)).real)
    expect(ids, 'the day before start is outside it').not.toContain(beforeStart)
    expect(ids, 'and the day after end').not.toContain(afterEnd)
    expect(
      ids,
      'an undated task has no cell to draw in: Q3C\'s predicate is a BETWEEN over due_date',
    ).not.toContain(undated)
  })

  test('AC-126: all three statuses draw as real rows', async () => {
    const { viewer, start, end, cellDate } = await stage()
    const body = await calendar(viewer, tz, start, end)
    const onCell = body.real.filter((row) => row.due_date === cellDate)
    expect(
      [...new Set(onCell.map((row) => row.status))].sort(),
      '6 Q3C: real rows are all three statuses, pending normal, completed faded and checked, abandoned faded and struck, because the calendar is a record. Every other list view of section 6 drops at least one status, so this is where an over-copied filter hides',
    ).toEqual(['abandoned', 'completed', 'pending'])
  })

  test('AC-126: within a date, all-day rows precede timed rows', async () => {
    const { viewer, start, end, cellDate } = await stage()
    const body = await calendar(viewer, tz, start, end)
    const onCell = body.real.filter((row) => row.due_date === cellDate)
    const firstTimed = onCell.findIndex((row) => row.due_time !== null)
    const lastAllDay = onCell.map((row) => row.due_time).lastIndexOf(null)
    expect(
      firstTimed,
      '6 Q3C orders a cell as all-day banners first, then timed rows. This is not Q3\'s order: the list puts status_rank above the timed flag, the cell puts the timed flag above status_rank, so an implementation reusing the Planned comparator puts the abandoned 07:00 row after the pending all-day one and before the abandoned all-day one',
    ).toBeGreaterThan(lastAllDay)
    expect(
      onCell.length,
      'and the cell holds all five of its rows',
    ).toBe(5)
  })

  test('AC-126: timed rows within a date are ordered by due_time', async () => {
    const { viewer, start, end, cellDate, cellTimedEarly, cellTimedLate } =
      await stage()
    const body = await calendar(viewer, tz, start, end)
    const timed = body.real.filter(
      (row) => row.due_date === cellDate && row.due_time !== null,
    )
    expect(
      idsOf(timed),
      '6 Q3C orders timed rows by due_time before status_rank, so the abandoned 07:00 row precedes the pending 19:00 one. Q3\'s list order would reverse them, status_rank ranking above the clock there',
    ).toEqual([cellTimedEarly, cellTimedLate])
  })

  test('AC-126: all-day rows are ordered by all three status ranks', async () => {
    const { viewer, start, end, cellDate, cellPendingAllDay, cellAbandonedAllDay, cellCompletedAllDay } =
      await stage()
    const body = await calendar(viewer, tz, start, end)
    const allDay = idsOf(
      body.real.filter(
        (row) => row.due_date === cellDate && row.due_time === null,
      ),
    )
    expect(
      allDay,
      '6 Q3C orders all-day banners by status_rank, id, and the section 6 preamble now defines that rank over all three statuses, pending = 0, abandoned = 1, completed = 2. The third number was Q8\'s alone when this file was written, which left a completed banner\'s position undefined and this assertion able to ask only whether it was present; the Steward lifted it into the preamble at the P4 change control on 2026-08-07, so the sequence is asked for in full',
    ).toEqual([cellPendingAllDay, cellAbandonedAllDay, cellCompletedAllDay])
  })

  test('AC-126: rows are ordered by date across the whole range', async () => {
    const { viewer, start, end } = await stage()
    const body = await calendar(viewer, tz, start, end)
    const dates = body.real.map((row) => row.due_date)
    expect(
      [...dates].sort(),
      '7.10 says every view returns rows fully ordered per section 6 and that ordering is server work, and 6 Q3C orders by cell; a flat array whose dates ran out of order would leave a client sorting, which 6 forbids in the same sentence',
    ).toEqual(dates)
  })

  test('AC-126: an inaccessible row never draws, whatever its date', async () => {
    const { viewer, stranger, start, end, hidden } = await stage()
    const mine = await calendar(viewer, tz, start, end)
    expect(
      idsOf(mine.real),
      'Q3C opens with folder_id IN ACCESSIBLE(V) exactly as every other query of section 6 does',
    ).not.toContain(hidden)
    const theirs = await calendar(stranger, tz, start, end)
    expect(
      idsOf(theirs.real),
      'and it is drawn for the account that owns it, so the exclusion above is about scope rather than about an empty grid',
    ).toContain(hidden)
  })

  test('AC-126: the virtual arm is an array, and P6 fills it', async () => {
    const { viewer, start, end } = await stage()
    const body = await calendar(viewer, tz, start, end)
    expect(
      body.virtual,
      '7.10 enumerates the key, so P4 answers it; what draws in it is 8.5\'s projection over the 4.11 iterator that P6 delivers, and AC-082 pins that in P6\'s range. No task in this fixture carries a recurrence_rule, so the array is empty under either package',
    ).toEqual([])
  })

  test('AC-126: the fixture satisfies section 3', async () => {
    const { viewer, stranger, folderId, hiddenFolderId, onStart, onEnd, undated } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [onStart, onEnd, undated],
      [folderId, hiddenFolderId],
      [viewer.id, stranger.id],
    )
  })
})

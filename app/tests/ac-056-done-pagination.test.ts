/*
AC-056: given 120 completed tasks, then Done pages by 50 using the
(completed_at, id) cursor, grouped by completion day in the viewer's
timezone.

Three clauses, and the middle one is the only one an implementation can
satisfy by accident. Page sizes of 50 and a total of 120 fall out of OFFSET
as readily as out of a keyset, and both answer the same three pages against a
still dataset. What separates them is a dataset that moves: insert a row that
sorts ahead of page one between the two fetches, and OFFSET shifts every
later page by one, silently skipping a real row, while a keyset resumes
exactly where it stopped because its cursor names a position in the data
rather than a count of rows. That case is the reason this file exists in the
shape it does, and it is the one an implementation gets wrong while passing
everything else here.

The grouping clause is asserted in two zones. The rows are seeded at local
noon of three consecutive days in one zone, which is what makes their day
buckets predictable at all; then the same completed_at values are read under
a zone exactly one calendar day ahead, where every bucket must be labelled
one day later. A grouping that used the server's zone, or UTC, answers both
requests identically.

Volume is seeded in one statement rather than through 7.6. There is no way to
ask the API for a completed_at, and 120 transitions through the clock would
give one bucket rather than three.

Spec: 6 Q6 (predicate, keyset, page size, grouping), 4.12 (the partial index
the keyset rides), 7.10, 8.1.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  completedOrderIn,
  daysBetween,
  done,
  doneRows,
  idsOf,
  instantAtLocal,
  localDateIn,
  seedManyTasks,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

/** The zone the fixture is built in; the ahead zone is exactly one calendar
 * day past it at every instant, which is what the grouping case turns on. */
const tz = ZONE_BEHIND
const PAGE = 50
const PER_DAY = 40
const TOTAL = 120

interface Stage {
  viewer: Actor
  folderId: string
  /** Two days back, one day back, today, in the fixture's own zone. */
  days: [string, string, string]
  abandoned: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac056 history')
    const today = todayIn(tz)
    // Three consecutive local days, seeded at local noon so the forty rows
    // of each day (forty minutes apart at most) cannot spill into the next.
    const days: [string, string, string] = [
      shiftDate(today, -2),
      shiftDate(today, -1),
      today,
    ]

    for (const day of days) {
      await seedManyTasks(app.db, {
        folderId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        count: PER_DAY,
        titlePrefix: `p4 ac056 ${day}`,
        status: 'completed',
        completedFrom: instantAtLocal(tz, day, 12).toISOString(),
        completedStepMinutes: 1,
      })
    }

    // Abandoned, in the same folder, so its absence is about Q6's predicate
    // rather than about the folder being out of scope.
    const abandoned = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac056 abandoned, never in Done',
      status: 'abandoned',
    })

    staged = { viewer, folderId, days, abandoned }
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

describe('AC-056: Done pages by 50 on a keyset over (completed_at, id)', () => {
  test('AC-056: the three pages are 50, 50 and 20, and the last carries no cursor', async () => {
    const { viewer } = await stage()
    const { pages } = await doneRows(viewer, tz)
    expect(
      pages.map((page) => page.rows.length),
      `6 Q6 sets the page size at 50, so ${String(TOTAL)} completed rows are three pages`,
    ).toEqual([PAGE, PAGE, TOTAL - 2 * PAGE])
    expect(
      pages.map((page) => page.cursor === null),
      'every page but the last offers a cursor, and the last says there is nothing after it',
    ).toEqual([false, false, true])
  })

  test('AC-056: the pages cover every completed row exactly once', async () => {
    const { viewer } = await stage()
    const { rows } = await doneRows(viewer, tz)
    const ids = idsOf(rows)
    expect(ids.length, 'no gap: every seeded row is reachable').toBe(TOTAL)
    expect(
      new Set(ids).size,
      'and no overlap: paging a keyset visits each row once',
    ).toBe(TOTAL)
  })

  test('AC-056: the whole sequence is completed_at descending, id descending', async () => {
    const { viewer, folderId } = await stage()
    const { rows } = await doneRows(viewer, tz)
    expect(
      idsOf(rows),
      '6 Q6 keys the page on (completed_at descending, id descending). The expected sequence is read from the fixture\'s own rows in SQL, so that the id tie-break is compared under the same uuid ordering on both sides, and it spans the page boundaries: a per-page sort that reset at each cursor would still fail here',
    ).toEqual(await completedOrderIn(app.db, folderId))
  })

  test('AC-056: rows are grouped by their completion day in the viewer\'s zone', async () => {
    const { viewer, days } = await stage()
    const first = await done(viewer, tz)
    expect(
      first.days.map((day) => day.date),
      `6 Q6 groups by the completed_at date in V's timezone, most recent day first. The fifty rows of page one are the whole of ${days[2]} and ten of ${days[1]}`,
    ).toEqual([days[2], days[1]])
    expect(
      first.days.map((day) => day.rows.length),
      'and the buckets partition the page rather than repeating or dropping rows',
    ).toEqual([PER_DAY, PAGE - PER_DAY])
  })

  test('AC-056: the same rows regroup under a zone one day ahead', async () => {
    const { viewer, days } = await stage()
    const here = await done(viewer, tz)
    const there = await done(viewer, ZONE_AHEAD)

    expect(
      daysBetween(String(here.days[0]?.date), String(there.days[0]?.date)),
      `the two requests differ in nothing but tz. ${ZONE_AHEAD} is exactly one calendar day ahead of ${ZONE_BEHIND} at every instant, so every bucket label moves by one; an implementation grouping by the server's zone or by UTC answers these two identically`,
    ).toBe(1)
    expect(
      there.days.map((day) => day.rows.length),
      'the labels move and the membership does not: local noon is nowhere near either zone\'s midnight, so no row changes bucket',
    ).toEqual(here.days.map((day) => day.rows.length))
    expect(
      idsOf(there.days.flatMap((day) => day.rows)),
      'and the order within the page is the same, since neither the keyset nor the sort mentions tz',
    ).toEqual(idsOf(here.days.flatMap((day) => day.rows)))
    expect(
      there.days[0]?.date,
      'stated as the value rather than the difference, so a failure names both dates',
    ).toBe(localDateIn(ZONE_AHEAD, instantAtLocal(tz, days[2], 12)))
  })

  test('AC-056: the cursor is a keyset, not an offset', async () => {
    const { viewer, folderId } = await stage()
    const first = await done(viewer, tz)
    const firstIds = idsOf(first.days.flatMap((day) => day.rows))
    expect(first.next_cursor, 'page one must offer a cursor').not.toBeNull()

    // A row completed now sorts ahead of everything seeded, so under OFFSET
    // it takes a slot on page one and pushes page one's last row into the
    // position page two's cursor was about to skip.
    const intruder = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac056 completed between the two fetches',
      status: 'completed',
      completedAt: new Date().toISOString(),
    })

    const second = await done(viewer, tz, first.next_cursor as string)
    const secondIds = idsOf(second.days.flatMap((day) => day.rows))

    expect(
      secondIds,
      '6 Q6 makes the cursor the last row\'s (completed_at, id), which names a position in the data. An OFFSET of 50 would now start one row later and skip the row that page one ended just above; the keyset resumes exactly where it stopped',
    ).not.toContain(intruder)
    expect(
      secondIds.filter((id) => firstIds.includes(id)),
      'and it does not repeat page one either',
    ).toEqual([])

    const { rows } = await doneRows(viewer, tz)
    expect(
      idsOf(rows).length,
      'a fresh full pass now sees the intruder as well, so the row was reachable all along and only the resumed page declined to move for it',
    ).toBe(TOTAL + 1)
  })

  test('AC-056 adversarial: an abandoned row never appears', async () => {
    const { viewer, abandoned } = await stage()
    const { rows } = await doneRows(viewer, tz)
    expect(
      idsOf(rows),
      '6 Q6 says abandoned rows never appear here, and INV-8 gives completed_at only to completed tasks, so the partial index of 4.12 does not even carry it',
    ).not.toContain(abandoned)
  })

  test('AC-056 adversarial: every row on the page is completed and carries an instant', async () => {
    const { viewer } = await stage()
    const first = await done(viewer, tz)
    const rows = first.days.flatMap((day) => day.rows)
    expect(
      rows.map((row) => row.status),
      'Q6\'s predicate is status = completed and nothing else',
    ).toEqual(rows.map(() => 'completed'))
    expect(
      rows.length,
      'and the page is not empty, which the assertion above would otherwise satisfy vacuously',
    ).toBe(PAGE)
  })
})

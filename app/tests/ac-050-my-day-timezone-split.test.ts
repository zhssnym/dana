/*
AC-050: given the instant 2026-07-23 20:30 UTC and a task due 2026-07-23
assigned to the viewer, then with tz Asia/Karachi it is Carried (local
2026-07-24) and with tz Europe/London it is Today (local 2026-07-23).

The criterion names an instant, and no test here can be at it. Faking the
process clock would decide, on the implementer's behalf, that today(V) is
read from the process clock rather than from the database, and 8.1's "the
server computes it" admits both readings; the test would then be a false red
against half of the correct implementations, which is the one kind of failure
this role must never manufacture. So the instant is given up and the content
of the criterion is kept.

That content is exact: one task, one instant, two zones, two different
answers, because Karachi is on 2026-07-24 while London is still on
2026-07-23. Two zones reproduce that relationship at every instant instead of
in the four-hour window each UTC day when Karachi and London happen to
differ. Pacific/Kiritimati is UTC+14 and Pacific/Honolulu is UTC-10, neither
observes DST, so their offsets differ by exactly 24 hours and the ahead zone
is exactly one calendar day ahead of the behind zone always. Measured, not
recalled: every hour of 2026, 8760 samples, no exception. The count read 8784
here until the Steward noticed that is a leap year's hours and 2026 has 8760;
the sampling loop had run 366 days from 1 January and spilled one day into
2027. Corrected by measuring the stated window rather than by restating the
window, because a measured claim whose number does not match its window
forfeits exactly the standing this paragraph asks for. And at the criterion's
own instant those two zones read 2026-07-24 and 2026-07-23, which are the
criterion's own two local dates.

The named pair is asserted too, in both directions available without the
clock. Unconditionally: a task due each zone's own today is in that zone's
Today group, for Karachi and for London alike. And relationally: one task due
London's today, read under Karachi, lands in the group the two independently
computed dates say it must, which is the criterion verbatim whenever the run
falls inside the window where Karachi has rolled and London has not.

Spec: 8.1 (today(V) from the request's tz; the day boundary is local
midnight), 6 Q1, 7.0 (every view endpoint takes tz), 7.10, 7.11 (today
evaluation given tz is server-authoritative).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  ZONE_AHEAD,
  ZONE_BEHIND,
  daysBetween,
  expectStillSameDay,
  idsOf,
  myDay,
  seedViewTask,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const KARACHI = 'Asia/Karachi'
const LONDON = 'Europe/London'

interface Stage {
  viewer: Actor
  inboxId: string
  behindToday: string
  aheadToday: string
  londonToday: string
  karachiToday: string
  /** Due today in the behind zone, which is yesterday in the ahead zone. */
  split: string
  /** Due today in London. */
  londonRow: string
  /** Due today in Karachi. */
  karachiRow: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)

    const behindToday = todayIn(ZONE_BEHIND)
    const aheadToday = todayIn(ZONE_AHEAD)
    const londonToday = todayIn(LONDON)
    const karachiToday = todayIn(KARACHI)

    const seed = (title: string, dueDate: string) =>
      seedViewTask(app.db, {
        folderId: inboxId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title,
        dueDate,
      })

    const split = await seed('p4 ac050 the split row', behindToday)
    const londonRow = await seed('p4 ac050 due London today', londonToday)
    const karachiRow = await seed('p4 ac050 due Karachi today', karachiToday)

    staged = {
      viewer,
      inboxId,
      behindToday,
      aheadToday,
      londonToday,
      karachiToday,
      split,
      londonRow,
      karachiRow,
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

describe('AC-050: one instant, one task, two zones, two groups', () => {
  test('AC-050: the measured zone pair is exactly one calendar day apart right now', async () => {
    const { behindToday, aheadToday } = await stage()
    expect(
      daysBetween(behindToday, aheadToday),
      `${ZONE_AHEAD} is UTC+14 and ${ZONE_BEHIND} is UTC-10, neither observing DST, so the ahead zone's civil date is the behind zone's plus one at every instant. This case exists so that a tzdb change would fail here, naming the premise, rather than somewhere below naming a view`,
    ).toBe(1)
  })

  test('AC-050: with the behind zone the row is Today', async () => {
    const { viewer, behindToday, split } = await stage()
    const body = await myDay(viewer, ZONE_BEHIND)
    expectStillSameDay(ZONE_BEHIND, behindToday, 'AC-050')
    expect(
      idsOf(body.today),
      `due_date equals today(V) in ${ZONE_BEHIND} (${behindToday}), which 8.1 calls due today and Q1 puts in the Today group. This is the criterion's Europe/London half`,
    ).toContain(split)
    expect(
      idsOf(body.carried),
      'and it is not Carried in that zone',
    ).not.toContain(split)
  })

  test('AC-050: with the ahead zone the same row is Carried', async () => {
    const { viewer, aheadToday, split } = await stage()
    const body = await myDay(viewer, ZONE_AHEAD)
    expectStillSameDay(ZONE_AHEAD, aheadToday, 'AC-050')
    expect(
      idsOf(body.carried),
      `the same task, the same instant, and a different answer: today(V) in ${ZONE_AHEAD} is ${aheadToday}, one day later, so the row is overdue there and 8.1 calls it overdue when D < today(V). This is the criterion's Asia/Karachi half`,
    ).toContain(split)
    expect(
      idsOf(body.today),
      'and it is not Today in that zone: the two groups are exclusive on qualify_date',
    ).not.toContain(split)
  })

  test('AC-050: the tz parameter is what moves it, not the server\'s own zone', async () => {
    const { viewer, split } = await stage()
    const behind = await myDay(viewer, ZONE_BEHIND)
    const ahead = await myDay(viewer, ZONE_AHEAD)
    expect(
      [idsOf(behind.today).includes(split), idsOf(ahead.today).includes(split)],
      '7.11 makes today evaluation given tz server-authoritative, and the two requests differ in nothing but tz: an implementation reading the process zone, the database zone, or the stored users.timezone would answer these two identically',
    ).toEqual([true, false])
  })

  test('AC-050: the named zones each put their own today in Today', async () => {
    const { viewer, londonToday, karachiToday, londonRow, karachiRow } =
      await stage()

    const london = await myDay(viewer, LONDON)
    expectStillSameDay(LONDON, londonToday, 'AC-050')
    expect(
      idsOf(london.today),
      `the criterion's own zone, asserted in the one direction that needs no clock: due ${londonToday} is Today in ${LONDON}`,
    ).toContain(londonRow)

    const karachi = await myDay(viewer, KARACHI)
    expectStillSameDay(KARACHI, karachiToday, 'AC-050')
    expect(
      idsOf(karachi.today),
      `and due ${karachiToday} is Today in ${KARACHI}`,
    ).toContain(karachiRow)
  })

  test('AC-050: read under Karachi, London\'s row lands where the two dates say', async () => {
    const { viewer, londonToday, karachiToday, londonRow } = await stage()
    const gap = daysBetween(londonToday, karachiToday)
    expect(
      gap,
      `${KARACHI} is UTC+5 and ${LONDON} is UTC+0 or UTC+1, so Karachi is on London's date or exactly one day past it, never further and never behind`,
    ).toBeGreaterThanOrEqual(0)
    expect(gap, 'and never more than one day past').toBeLessThanOrEqual(1)

    const karachi = await myDay(viewer, KARACHI)
    expectStillSameDay(KARACHI, karachiToday, 'AC-050')
    const carried = idsOf(karachi.carried).includes(londonRow)
    const today = idsOf(karachi.today).includes(londonRow)
    expect(
      { carried, today },
      `this run is in the ${gap === 1 ? 'window the criterion names, where Karachi has rolled past London: the row due London today is Carried under Karachi, which is the criterion verbatim' : 'part of the UTC day where Karachi and London share a date, so the row due London today is also due Karachi today and belongs to the Today group'} (London ${londonToday}, Karachi ${karachiToday})`,
    ).toEqual({ carried: gap === 1, today: gap === 0 })
  })

  test('AC-050: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, split, londonRow, karachiRow } = await stage()
    await expectTaskInvariants(
      app.db,
      [split, londonRow, karachiRow],
      [inboxId],
      [viewer.id],
    )
  })
})

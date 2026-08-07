/*
AC-046: given a pending task due three days ago assigned to the viewer, then
it is in the Carried group on every subsequent day.

One clause of this criterion cannot be tested as written and is stated here
rather than skipped silently. "On every subsequent day" is a claim about the
passage of time, and this suite cannot advance the clock: faking it would
decide for the implementer that today is read from the process clock rather
than from the database, and 8.1's "the server computes it" admits both. What
stands in for it is the property the clause is a consequence of. Q1's
predicate contains no upper bound on how far past a due_date may be, so a row
three days over and a row thirty days over are the same row to it; both are
asserted, and 8.2 names the consequence outright, that nothing ever leaves
this page by time passing.

The sharp case is the interaction the min() in 8.2 decides. Pulling an
overdue task sets added_on = today, and a reader that took the pull date as
the qualify_date would move the row into Today, quietly retiring the snowball
the page exists for. qualify_date is the least of the two, so the row stays
Carried, and the pull changes nothing about where it renders.

Spec: 6 Q1 (grouping and sort), 8.1, 8.2 (the qualify_date minimum and the
snowball consequence), 7.8, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  expectTaskInvariants,
  myDayAddedOn,
  pullIntoMyDay,
} from './tasks-harness.js'
import {
  expectStillSameDay,
  idsOf,
  middayZone,
  myDay,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  inboxId: string
  today: string
  threeDaysOver: string
  thirtyDaysOver: string
  yesterdayTimed: string
  yesterdayAllDay: string
  dueToday: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const today = todayIn(tz)
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, options)

    const thirtyDaysOver = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac046 thirty days over',
      dueDate: shiftDate(today, -30),
    })
    const threeDaysOver = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac046 three days over',
      dueDate: shiftDate(today, -3),
    })
    // Q1 sorts inside a group by due_date, then due_time ascending nulls
    // first: on one date the all-day row precedes the timed one.
    const yesterdayTimed = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac046 yesterday 09:00',
      dueDate: shiftDate(today, -1),
      dueTime: '09:00',
    })
    const yesterdayAllDay = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac046 yesterday all day',
      dueDate: shiftDate(today, -1),
    })
    const dueToday = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac046 due today',
      dueDate: today,
    })

    staged = {
      viewer,
      inboxId,
      today,
      threeDaysOver,
      thirtyDaysOver,
      yesterdayTimed,
      yesterdayAllDay,
      dueToday,
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

describe('AC-046: an overdue assigned task is Carried, and stays there', () => {
  test('AC-046: the task due three days ago is in the Carried group', async () => {
    const { viewer, today, threeDaysOver } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-046')
    expect(
      idsOf(body.carried),
      `Q1 puts qualify_date < today in Carried, and Carried renders above Today (tz ${tz}, today ${today})`,
    ).toContain(threeDaysOver)
    expect(
      idsOf(body.today),
      'a row three days over cannot also be a row qualifying on today itself',
    ).not.toContain(threeDaysOver)
  })

  test('AC-046: a row thirty days over is Carried by the same predicate', async () => {
    const { viewer, today, thirtyDaysOver } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-046')
    expect(
      idsOf(body.carried),
      'Q1 bounds how far past a due_date may be nowhere at all, which is why 8.2 can say nothing ever leaves this page by time passing; three days and thirty are the same row to the predicate, and this stands in for the clause about every subsequent day, which no test can advance the clock to reach',
    ).toContain(thirtyDaysOver)
  })

  test('AC-046: Carried is ordered by due_date, then due_time nulls first, then id', async () => {
    const { viewer, today, threeDaysOver, thirtyDaysOver, yesterdayTimed, yesterdayAllDay } =
      await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-046')
    expect(
      idsOf(body.carried),
      'Q1 sorts inside each group by due_date ascending nulls last, due_time ascending nulls first, id: the oldest date leads, and on the shared date the all-day row precedes the 09:00 one',
    ).toEqual([
      thirtyDaysOver,
      threeDaysOver,
      yesterdayAllDay,
      yesterdayTimed,
    ])
  })

  test('AC-046: the Today group holds only the row qualifying on today', async () => {
    const { viewer, today, dueToday } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-046')
    expect(
      idsOf(body.today),
      'the two groups partition the open list on qualify_date against today (spec 6 Q1)',
    ).toEqual([dueToday])
  })

  test('AC-046 adversarial: pulling an overdue task leaves it Carried', async () => {
    const { viewer, today, threeDaysOver } = await stage()
    const response = await pullIntoMyDay(viewer, threeDaysOver)
    expectStatus(
      response,
      200,
      'the pull the case needs must be accepted (spec 7.8; P3 is merged)',
    )
    expect(
      await myDayAddedOn(app.db, threeDaysOver, viewer.id),
      'the pull writes added_on = today(V), which is what makes this case sharp (INV-12)',
    ).toBe(today)

    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-046')
    expect(
      idsOf(body.carried),
      '8.2 takes qualify_date as the least of the automatic due_date and the pull\'s added_on, so a pull today cannot promote a row three days overdue into Today; a reader taking the pull date instead would retire the snowball the page exists for',
    ).toContain(threeDaysOver)
    expect(
      idsOf(body.today),
      'and it is not in both groups either: the two are exclusive on qualify_date',
    ).not.toContain(threeDaysOver)
  })

  test('AC-046: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, threeDaysOver, thirtyDaysOver, dueToday } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [threeDaysOver, thirtyDaysOver, dueToday],
      [inboxId],
      [viewer.id],
    )
  })
})

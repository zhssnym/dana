/*
AC-049: given a task assigned to the viewer due next week completed today,
then it appears in the recap section today.

The criterion's fixture is chosen to separate two things an implementation
can easily fuse. The task is due next week, so nothing about its due_date
qualifies it for this page: Q1's open groups admit due_date <= today and this
row is a week out. What puts it in the recap is Q1R, whose predicate names
completed_at and never mentions due_date at all. An implementation that
filtered the recap by the same date it filters the open list would lose this
row entirely, and only a fixture whose due_date is on the wrong side of today
can tell the two apart.

Q1R's third conjunct is a three-way OR, assignee_id = V or completed_by = V
or an entry exists, and each arm is given a row here. The arm most likely to
be dropped is completed_by: it is the one that makes "completing from
anywhere surfaces it in the recap" true for a task that was never yours.

The timezone clause is asserted with a zone that has crossed local midnight
in the last few hours, chosen from the measured DST-free list at run time.
"completed_at falls on today in V's timezone" is a window in UTC that moves
with the zone, so the same completed row is in the recap for one viewer and
out of it for another at the same instant, which is the whole content of the
phrase and is invisible to a test that only ever asks in one zone.

Spec: 6 Q1R, 8.2, 4.5, 7.10.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf, seedMyDayEntry } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  expectStillSameDay,
  idsOf,
  localDateIn,
  middayZone,
  myDay,
  seedViewTask,
  sharedFolder,
  shiftDate,
  todayIn,
  zoneRolledBetween,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'colleague'], 'p4')

const tz = middayZone()

/** Far enough back that the chosen zone's rollover is an hour in the past by
 * the time any case runs, so nothing here races the boundary it depends on. */
const THREE_HOURS_AGO = new Date(Date.now() - 3 * 3_600_000)
const ONE_HOUR_AGO = new Date(Date.now() - 3_600_000)
const rolledZone = zoneRolledBetween(THREE_HOURS_AGO, ONE_HOUR_AGO)

interface Stage {
  viewer: Actor
  colleague: Actor
  inboxId: string
  folderId: string
  today: string
  /** The criterion's own row: due next week, assigned to and completed by V. */
  dueNextWeek: string
  /** Completed yesterday, so out of today's recap. */
  yesterday: string
  /** Theirs, completed by V: the completed_by arm. */
  completedByViewer: string
  /** Theirs, completed by them, no entry: no arm holds. */
  theirsEntirely: string
  /** Theirs, completed by them, pulled by V: the entry arm. */
  pulledByViewer: string
  /** Abandoned, which is not a completion. */
  abandoned: string
  /** Completed three hours ago: today in tz, yesterday in rolledZone. */
  threeHoursAgo: string
  /** Two rows sharing one completed_at, to force the id tie-break. */
  tieLowerId: string
  tieHigherId: string
}
let staged: Stage | undefined

const MINUTE = 60_000

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, colleague] = await cast.of(app)
    if (viewer === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const folderId = await sharedFolder(
      app.db,
      viewer,
      colleague,
      'p4 ac049 shared',
    )
    const today = todayIn(tz)
    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, options)

    const dueNextWeek = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac049 due next week, completed today',
      dueDate: shiftDate(today, 7),
      status: 'completed',
      completedAt: at(10),
      completedBy: viewer.id,
    })
    const yesterday = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac049 completed yesterday',
      status: 'completed',
      completedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      completedBy: viewer.id,
    })
    const completedByViewer = await seed({
      folderId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac049 theirs, completed by the viewer',
      status: 'completed',
      completedAt: at(5),
      completedBy: viewer.id,
    })
    const theirsEntirely = await seed({
      folderId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac049 theirs entirely',
      status: 'completed',
      completedAt: at(4),
      completedBy: colleague.id,
    })
    const pulledByViewer = await seed({
      folderId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac049 theirs, pulled by the viewer',
      status: 'completed',
      completedAt: at(1),
      completedBy: colleague.id,
    })
    // The entry is written directly because the row is seeded completed and
    // this arm of Q1R only needs the entry to exist, not the 7.8 call that
    // would normally have made it.
    await seedMyDayEntry(app.db, pulledByViewer, viewer.id)

    const abandoned = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac049 abandoned today',
      status: 'abandoned',
    })
    const threeHoursAgo = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac049 completed three hours ago',
      status: 'completed',
      completedAt: THREE_HOURS_AGO.toISOString(),
      completedBy: viewer.id,
    })

    // Section 6 ends every order in id so that any two agents produce the
    // same sequence; the recap's is descending, so of two rows completed at
    // one instant the higher id renders first.
    const [tieLowerId, tieHigherId] = [randomUUID(), randomUUID()].sort() as [
      string,
      string,
    ]
    for (const id of [tieLowerId, tieHigherId]) {
      await seed({
        id,
        folderId: inboxId,
        createdBy: viewer.id,
        assigneeId: viewer.id,
        title: `p4 ac049 tie ${id.slice(0, 8)}`,
        status: 'completed',
        completedAt: at(2),
        completedBy: viewer.id,
      })
    }

    staged = {
      viewer,
      colleague,
      inboxId,
      folderId,
      today,
      dueNextWeek,
      yesterday,
      completedByViewer,
      theirsEntirely,
      pulledByViewer,
      abandoned,
      threeHoursAgo,
      tieLowerId,
      tieHigherId,
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

describe('AC-049: the recap holds what was completed today, whatever it was due', () => {
  test('AC-049: a task due next week completed today is in the recap', async () => {
    const { viewer, today, dueNextWeek } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    expect(
      idsOf(body.recap),
      `Q1R names completed_at and never due_date, so a row due a week out belongs here the moment it is completed (tz ${tz}, today ${today})`,
    ).toContain(dueNextWeek)
  })

  test('AC-049: and it is in neither open group, which is what the due date proves', async () => {
    const { viewer, today, dueNextWeek } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    expect(
      [...idsOf(body.today), ...idsOf(body.carried)],
      'Q1 filters on status = pending and admits due_date <= today; this row fails both, so an implementation that filtered the recap by the open list\'s date would have lost it',
    ).not.toContain(dueNextWeek)
  })

  test('AC-049 adversarial: the recap holds today\'s completions and not yesterday\'s', async () => {
    const { viewer, today, yesterday } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    expect(
      idsOf(body.recap),
      'Q1R is a same-day window, not a history: Done is where the history lives (spec 6 Q6)',
    ).not.toContain(yesterday)
  })

  test('AC-049 adversarial: each arm of Q1R\'s three-way OR is honored', async () => {
    const { viewer, today, completedByViewer, pulledByViewer, theirsEntirely } =
      await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    const recap = idsOf(body.recap)
    expect(
      recap,
      'completed_by = V: 8.2 says completing from anywhere surfaces it in the recap, and this row was never the viewer\'s to begin with',
    ).toContain(completedByViewer)
    expect(
      recap,
      'an entry exists: a task the viewer took on stays accounted for once finished, whoever finished it',
    ).toContain(pulledByViewer)
    expect(
      recap,
      'and none of the three arms holds for a task that is theirs, was completed by them, and was never pulled',
    ).not.toContain(theirsEntirely)
  })

  test('AC-049 adversarial: an abandoned task is not a completion', async () => {
    const { viewer, today, abandoned } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    expect(
      idsOf(body.recap),
      'Q1R filters on status = completed, and 8.2 states the consequence: abandoning removes a task from the open groups and keeps it out of the recap',
    ).not.toContain(abandoned)
  })

  test('AC-049 adversarial: the recap is ordered by completed_at descending, id descending', async () => {
    const {
      viewer,
      today,
      dueNextWeek,
      completedByViewer,
      pulledByViewer,
      threeHoursAgo,
      tieLowerId,
      tieHigherId,
    } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-049')
    expect(
      idsOf(body.recap),
      'Q1R sorts by completed_at descending, id descending: most recent first, and of the two rows sharing an instant the higher id leads, which is the tie-break section 6 ends every order with so any two agents produce the same sequence',
    ).toEqual([
      pulledByViewer,
      tieHigherId,
      tieLowerId,
      completedByViewer,
      dueNextWeek,
      threeHoursAgo,
    ])
  })

  test('AC-049: "falls on today in V\'s timezone" moves with the viewer\'s zone', async () => {
    const { viewer, threeHoursAgo, dueNextWeek } = await stage()

    const here = await myDay(viewer, tz)
    expect(
      idsOf(here.recap),
      `completed three hours ago is today in ${tz}, whose local time is near midday`,
    ).toContain(threeHoursAgo)

    const there = await myDay(viewer, rolledZone)
    expect(
      idsOf(there.recap),
      `${rolledZone} crossed local midnight between three and one hours ago, so the same completed_at fell on yesterday there: the recap window is the viewer's zone, not the server's, and the same row is in for one viewer and out for another at one instant (${localDateIn(rolledZone, THREE_HOURS_AGO)} against ${localDateIn(rolledZone, new Date())})`,
    ).not.toContain(threeHoursAgo)
    expect(
      idsOf(there.recap),
      'and the zone is not simply answering an empty recap: a row completed after that rollover is in it',
    ).toContain(dueNextWeek)
  })

  test('AC-049: the fixture satisfies section 3', async () => {
    const { viewer, colleague, inboxId, folderId, dueNextWeek, pulledByViewer } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [dueNextWeek, pulledByViewer],
      [inboxId, folderId],
      [viewer.id, colleague.id],
    )
  })
})

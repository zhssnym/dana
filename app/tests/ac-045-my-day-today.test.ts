/*
AC-045: given a task due today assigned to the viewer, when GET
/views/my-day, then it is in the Today group.

The criterion is one row of Q1's automatic clause, and the clause has four
conjuncts (accessible folder, status pending, assignee is the viewer, a
due_date at or before today). A test that seeded the row and looked for it in
the Today group would pass against an implementation that dropped any of the
other three, so each is attacked here with a row that satisfies everything
except it.

The grouping itself is 8.1's boundary statement rather than a preference:
due_date D is due today when D = today(V), future when D > today(V). Q1 puts
qualify_date = today in Today and qualify_date < today in Carried, and admits
D <= today(V) only. So a task due tomorrow is in neither group, which is the
sharpest of the four attacks and the one an implementation using a >= or a
BETWEEN gets wrong.

The fixture anchors on a zone whose local time is near midday, so it cannot
be seeded on one side of a local midnight and read on the other; the residual
is asserted by expectStillSameDay rather than tolerated.

Spec: 6 Q1, 8.1 (the boundary statement), 8.2, 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  idsOf,
  middayZone,
  myDay,
  expectStillSameDay,
  seedViewTask,
  sharedFolder,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer', 'colleague'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  colleague: Actor
  inboxId: string
  sharedId: string
  today: string
  dueToday: string
  dueTomorrow: string
  completedToday: string
  abandonedToday: string
  colleaguesToday: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer, colleague] = await cast.of(app)
    if (viewer === undefined || colleague === undefined) {
      throw new Error('cast must produce two actors')
    }
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const sharedId = await sharedFolder(
      app.db,
      viewer,
      colleague,
      'p4 ac045 shared',
    )
    const today = todayIn(tz)

    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, options)

    const dueToday = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac045 due today',
      dueDate: today,
    })
    // D > today(V): Q1 admits due_date <= today only, so this row is in
    // neither group. An implementation comparing with >= puts it in Today.
    const dueTomorrow = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac045 due tomorrow',
      dueDate: shiftDate(today, 1),
    })
    // status = 'pending' is a conjunct of Q1: the completed row belongs to
    // the recap and the abandoned row to nothing on this page.
    const completedToday = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac045 completed today',
      dueDate: today,
      status: 'completed',
    })
    const abandonedToday = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: 'p4 ac045 abandoned today',
      dueDate: today,
      status: 'abandoned',
    })
    // assignee_id = V is a conjunct too: a folder the viewer can see is not
    // a reason for another member's task to enter the viewer's day.
    const colleaguesToday = await seed({
      folderId: sharedId,
      createdBy: viewer.id,
      assigneeId: colleague.id,
      title: 'p4 ac045 colleague due today',
      dueDate: today,
    })

    staged = {
      viewer,
      colleague,
      inboxId,
      sharedId,
      today,
      dueToday,
      dueTomorrow,
      completedToday,
      abandonedToday,
      colleaguesToday,
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

describe('AC-045: a task due today assigned to the viewer is in Today', () => {
  test('AC-045: the row is in the Today group', async () => {
    const { viewer, today, dueToday } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-045')
    expect(
      idsOf(body.today),
      `8.1: due_date equal to today(V) is due today, and Q1 puts qualify_date = today in the Today group (tz ${tz}, today ${today})`,
    ).toEqual([dueToday])
  })

  test('AC-045: and in neither of the page\'s other two sections', async () => {
    const { viewer, today } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-045')
    expect(
      idsOf(body.carried),
      'Carried holds qualify_date < today, and this row qualifies on today itself (spec 6 Q1)',
    ).toEqual([])
    expect(
      body.recap.map((row) => row.status),
      'every recap row is completed: Q1R filters on that status alone',
    ).toEqual(body.recap.map(() => 'completed'))
  })

  test('AC-045 adversarial: a task due tomorrow is in neither group', async () => {
    const { viewer, today, dueTomorrow } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-045')
    expect(
      [...idsOf(body.today), ...idsOf(body.carried)],
      'Q1 admits due_date <= today(V); 8.1 calls D > today(V) future, and nothing puts a future task on this page until its date arrives or someone pulls it',
    ).not.toContain(dueTomorrow)
  })

  test('AC-045 adversarial: completed and abandoned rows due today are not in the open groups', async () => {
    const { viewer, today, completedToday, abandonedToday } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-045')
    const open = [...idsOf(body.today), ...idsOf(body.carried)]
    expect(
      open,
      'Q1 filters on status = pending, so a completed row is out of the open groups (it belongs to the recap)',
    ).not.toContain(completedToday)
    expect(
      open,
      'Q1 says outright that abandoned tasks never match',
    ).not.toContain(abandonedToday)
    expect(
      idsOf(body.recap),
      'the completed row is what the recap is for (spec 6 Q1R)',
    ).toContain(completedToday)
    expect(
      idsOf(body.recap),
      'and an abandoned row is kept out of the recap too: 8.2 says abandoning keeps it out',
    ).not.toContain(abandonedToday)
  })

  test('AC-045 adversarial: another member\'s task due today is not on this page', async () => {
    const { viewer, today, colleaguesToday } = await stage()
    const body = await myDay(viewer, tz)
    expectStillSameDay(tz, today, 'AC-045')
    expect(
      [...idsOf(body.today), ...idsOf(body.carried), ...idsOf(body.recap)],
      'Q1\'s automatic clause requires assignee_id = V; access to the folder is a different conjunct and does not stand in for it',
    ).not.toContain(colleaguesToday)
  })

  test('AC-045 adversarial: the colleague sees it in their own Today group', async () => {
    const { colleague, today, colleaguesToday, dueToday } = await stage()
    const body = await myDay(colleague, tz)
    expectStillSameDay(tz, today, 'AC-045')
    expect(
      idsOf(body.today),
      'the same rule read from the other side: the assignee of a task due today has it in Today, and the viewer\'s own Inbox row is invisible to them',
    ).toEqual([colleaguesToday])
    expect(
      idsOf(body.today),
      'ACCESSIBLE(V) is per viewer; a default folder is never shared (INV-3)',
    ).not.toContain(dueToday)
  })

  test('AC-045: the fixture satisfies section 3', async () => {
    const { viewer, colleague, inboxId, sharedId, dueToday, dueTomorrow } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [dueToday, dueTomorrow],
      [inboxId, sharedId],
      [viewer.id, colleague.id],
    )
  })
})

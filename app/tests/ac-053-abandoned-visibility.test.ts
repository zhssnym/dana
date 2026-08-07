/*
AC-053: given an abandoned undated task, then it renders faded in Tasks and
All, and is absent from My Day and Done.

The clause about fading is section 9's and arrives with P8, where AC-097 pins
the faded row and its Restore control. This package's half is the one already
recorded in this suite's README when AC-039 routed the split here: presence
in Tasks and All, absence from My Day and Done. That is not a lesser half. An
abandoned task is the one row in Dana that has to be visible in exactly two
places and invisible in two others, and every one of the four is a different
predicate, so the four assertions below are four chances for an
implementation to be wrong.

The adversarial cases are the pages the criterion does not name, because the
instinct that produces the two absences also produces two wrong absences.
Q4 admits status IN (pending, abandoned), so a starred abandoned row is in
Important; Q3 admits the same pair, so a dated abandoned row is in Planned;
Q3C admits all three statuses, so it is in the calendar as a real row; and Q8
admits all three, so it is findable by search. An implementation reading
"abandoned is hidden" as a global rule passes the criterion as written and
fails all four.

Spec: 6 Q1, Q2, Q3, Q3C, Q4, Q5, Q6, Q8, 5.1 (abandon), 9 (the fading, at
P8), 7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, defaultFolderOf, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants, pullIntoMyDay } from './tasks-harness.js'
import {
  allRowsOf,
  allView,
  calendar,
  done,
  idsOf,
  important,
  middayZone,
  myDay,
  planned,
  requireCard,
  search,
  seedViewTask,
  shiftDate,
  tasksRowsOf,
  tasksView,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()

interface Stage {
  viewer: Actor
  inboxId: string
  workId: string
  today: string
  /** The criterion's own row. */
  abandonedUndated: string
  abandonedDated: string
  abandonedStarred: string
  pendingUndated: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const workId = await createFolder(viewer, 'p4 ac053 work')
    const today = todayIn(tz)
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, { ...options, assigneeId: viewer.id })

    const abandonedUndated = await seed({
      folderId: workId,
      createdBy: viewer.id,
      title: 'p4 ac053 abandoned undated needle',
      notes: 'p4 ac053 needle in the notes',
      status: 'abandoned',
    })
    const abandonedDated = await seed({
      folderId: workId,
      createdBy: viewer.id,
      title: 'p4 ac053 abandoned dated needle',
      status: 'abandoned',
      dueDate: today,
    })
    const abandonedStarred = await seed({
      folderId: workId,
      createdBy: viewer.id,
      title: 'p4 ac053 abandoned starred needle',
      status: 'abandoned',
      important: true,
    })
    const pendingUndated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac053 pending undated',
    })

    staged = {
      viewer,
      inboxId,
      workId,
      today,
      abandonedUndated,
      abandonedDated,
      abandonedStarred,
      pendingUndated,
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

describe('AC-053: an abandoned task is visible in exactly two places', () => {
  test('AC-053: it is in Tasks, under its folder heading', async () => {
    const { viewer, workId, abandonedUndated } = await stage()
    const body = await tasksView(viewer, tz)
    expect(
      idsOf(tasksRowsOf(body)),
      'Q2 admits status IN (pending, abandoned), so an undated abandoned row has its home here. Its faded rendering is section 9\'s and arrives with P8, pinned by AC-097; what this package owes is that the row is on the page to be faded',
    ).toContain(abandonedUndated)
    const group = body.groups.find((entry) => entry.folder.id === workId)
    expect(
      group === undefined ? [] : idsOf(group.rows),
      'and it sits under its own folder rather than being folded into the Inbox section',
    ).toContain(abandonedUndated)
  })

  test('AC-053: it is in All', async () => {
    const { viewer, abandonedUndated } = await stage()
    const body = await allView(viewer, tz)
    expect(
      idsOf(allRowsOf(body)),
      'Q5\'s predicate is the shared scope plus status IN (pending, abandoned) and no other condition, and 6.1 makes All the union of Tasks and Planned',
    ).toContain(abandonedUndated)
    expect(
      idsOf(tasksRowsOf(body)),
      'and specifically in All\'s Tasks half, which 6 Q5 renders exactly as Q2 groups it',
    ).toContain(abandonedUndated)
  })

  test('AC-053: it is absent from My Day, in all three sections', async () => {
    const { viewer, abandonedUndated } = await stage()
    const body = await myDay(viewer, tz)
    expect(
      [...idsOf(body.today), ...idsOf(body.carried), ...idsOf(body.recap)],
      'Q1 says outright that abandoned tasks never match, and Q1R filters on completed; 8.2 states the consequence, that abandoning removes it from the open groups instantly and keeps it out of the recap',
    ).not.toContain(abandonedUndated)
  })

  test('AC-053 adversarial: not even a pull puts an abandoned task in My Day', async () => {
    const { viewer, abandonedUndated } = await stage()
    const response = await pullIntoMyDay(viewer, abandonedUndated, tz)
    expectStatus(
      response,
      200,
      '7.8 guards on accessibility alone, so the pull itself is accepted whatever the status',
    )
    const body = await myDay(viewer, tz)
    expect(
      [...idsOf(body.today), ...idsOf(body.carried)],
      'the entry now exists and the row still does not appear: Q1\'s status filter is conjunctive with the OR, not one of its arms, so an entry cannot readmit an abandoned task',
    ).not.toContain(abandonedUndated)
  })

  test('AC-053: it is absent from Done', async () => {
    const { viewer, abandonedUndated } = await stage()
    const body = await done(viewer, tz)
    expect(
      body.days.flatMap((day) => idsOf(day.rows)),
      '6 Q6 says abandoned rows never appear here, and INV-8 gives completed_at only to completed tasks, so the page it is keyed on has nothing to key this row by',
    ).not.toContain(abandonedUndated)
  })

  test('AC-053 adversarial: a starred abandoned task is in Important', async () => {
    const { viewer, abandonedStarred } = await stage()
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q4 admits status IN (pending, abandoned): an implementation reading "abandoned is hidden" as a global rule passes the criterion as written and loses this row',
    ).toContain(abandonedStarred)
  })

  test('AC-053 adversarial: a dated abandoned task is in Planned and on the calendar', async () => {
    const { viewer, today, abandonedDated } = await stage()
    const list = await planned(viewer, tz)
    expect(
      idsOf(list.rows),
      'Q3 admits the same open pair as Q2, so a dated abandoned row belongs to Planned exactly as an undated one belongs to Tasks',
    ).toContain(abandonedDated)

    const grid = await calendar(
      viewer,
      tz,
      shiftDate(today, -1),
      shiftDate(today, 1),
    )
    const card = requireCard(
      grid.real,
      abandonedDated,
      '6 Q3C takes real rows in all three statuses, because the calendar is a record; the abandoned row draws faded and struck at P8, and this package owes the row',
    )
    expect(card.status, 'and it arrives with its own status').toBe('abandoned')
  })

  test('AC-053 adversarial: an abandoned task is still findable by search', async () => {
    const { viewer, abandonedUndated } = await stage()
    const body = await search(viewer, tz, 'ac053 abandoned undated needle')
    expect(
      idsOf(body.rows),
      'Q8 takes all three statuses: a task being abandoned is a reason to fade it, never a reason to make it unfindable',
    ).toContain(abandonedUndated)
  })

  test('AC-053: the pending control row is on the same pages, unfaded', async () => {
    const { viewer, pendingUndated } = await stage()
    const tasks = await tasksView(viewer, tz)
    expect(
      idsOf(tasksRowsOf(tasks)),
      'without this the absences above would pass against an implementation whose pages are empty for every reason',
    ).toContain(pendingUndated)
  })

  test('AC-053: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, workId, abandonedUndated, abandonedDated, abandonedStarred, pendingUndated } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [abandonedUndated, abandonedDated, abandonedStarred, pendingUndated],
      [inboxId, workId],
      [viewer.id],
    )
  })
})

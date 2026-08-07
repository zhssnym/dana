/*
AC-058: given a folder page, then it renders Scheduled, Unscheduled, and
collapsed Completed sections and the 8.11 ratio.

Four things, owned by three surfaces, and the file says which is which rather
than folding them together. The three sections are GET /folders/:id/tasks,
this package's endpoint. The ratio is 8.11's counts, which ride the Folder
object of the merged 7.4 detail endpoint, because 7.0 puts them there and no
7.10 body repeats them. "Collapsed" is section 9's rendering and arrives with
P8; what P4 owes is that the completed section is a separate, paginated
request rather than rows folded into the open response, which is the shape
that makes collapsing possible at all.

This is the one 7.10 body frozen 7.10 does not enumerate. The human owner
ruled it at the P4 kickoff on the kickoff's recommendation, the key names the
section's other eight bodies already use for the same things: scheduled,
unscheduled and truncated on section=open, days with next_cursor on
section=completed. It is written here as settled.

Q7 defines its three sections by reference, and the references are the point:
Scheduled is Q3's predicate and order narrowed to one folder, Unscheduled is
Q2's row order with no folder grouping, and Completed is Q6 entire. So the
orders are asserted in full here too, because a folder-scoped implementation
is a second producer of each and free to differ from the first.

Q7 opens with "member only, else 404", which is 10.2's chokepoint and the
leak rule of 7.0: an inaccessible folder must be indistinguishable from a
nonexistent one.

Spec: 6 Q7 (its three sections and their references), 6 Q2, Q3, Q6, 8.11,
7.4, 7.10 as ruled at the P4 kickoff, 10.2.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  completedOrderIn,
  folderCompleted,
  folderOpen,
  getView,
  idsOf,
  instantAtLocal,
  seedViewTask,
  shiftDate,
  todayIn,
  ZONE_BEHIND,
} from './views-harness.js'
import type { SeedViewTaskOptions } from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'stranger'], 'p4')

/** The completed rows are anchored at local noon in this zone, so their day
 * buckets are predictable; the open sections do not read tz at all. */
const tz = ZONE_BEHIND
const MINUTE = 60_000

interface Stage {
  owner: Actor
  stranger: Actor
  folderId: string
  otherFolderId: string
  scheduled: string[]
  unscheduled: string[]
  completedDay: string
  abandonedDated: string
  outsideFolder: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [owner, stranger] = await cast.of(app)
    if (owner === undefined || stranger === undefined) {
      throw new Error('cast must produce two actors')
    }
    const folderId = await createFolder(owner, 'p4 ac058 folder')
    const otherFolderId = await createFolder(owner, 'p4 ac058 elsewhere')
    const today = todayIn(tz)
    const completedDay = shiftDate(today, -1)

    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const here = (
      options: Omit<SeedViewTaskOptions, 'folderId' | 'createdBy'>,
    ) =>
      seedViewTask(app.db, {
        ...options,
        folderId,
        createdBy: owner.id,
        assigneeId: owner.id,
      })

    // Scheduled, in Q3's order: due_date, status_rank, timed flag, due_time.
    const soonAllDay = await here({
      title: 'p4 ac058 due tomorrow, all day',
      dueDate: shiftDate(today, 1),
    })
    const soonTimed = await here({
      title: 'p4 ac058 due tomorrow, 16:00',
      dueDate: shiftDate(today, 1),
      dueTime: '16:00',
    })
    const abandonedDated = await here({
      title: 'p4 ac058 due tomorrow, abandoned',
      dueDate: shiftDate(today, 1),
      status: 'abandoned',
    })
    const laterRow = await here({
      title: 'p4 ac058 due in three days',
      dueDate: shiftDate(today, 3),
    })

    // Unscheduled, in Q2's row order: status_rank, created_at descending.
    const undatedNewer = await here({
      title: 'p4 ac058 undated, made second',
      createdAt: at(10),
    })
    const undatedOlder = await here({
      title: 'p4 ac058 undated, made first',
      createdAt: at(60),
    })
    const undatedAbandoned = await here({
      title: 'p4 ac058 undated abandoned, newest of all',
      status: 'abandoned',
      createdAt: at(1),
    })

    // Completed, all on one local day, one minute apart.
    for (let index = 0; index < 3; index += 1) {
      await here({
        title: `p4 ac058 completed ${String(index)}`,
        status: 'completed',
        completedAt: instantAtLocal(
          tz,
          completedDay,
          12,
          index,
        ).toISOString(),
      })
    }

    // In an accessible folder, but not this one: the section predicates are
    // narrowed by folder_id = F, not merely by the viewer's access.
    const outsideFolder = await seedViewTask(app.db, {
      folderId: otherFolderId,
      createdBy: owner.id,
      assigneeId: owner.id,
      title: 'p4 ac058 in the other folder',
      dueDate: shiftDate(today, 1),
    })

    staged = {
      owner,
      stranger,
      folderId,
      otherFolderId,
      scheduled: [soonAllDay, soonTimed, abandonedDated, laterRow],
      unscheduled: [undatedNewer, undatedOlder, undatedAbandoned],
      completedDay,
      abandonedDated,
      outsideFolder,
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

describe('AC-058: a folder page is three sections and a ratio', () => {
  test('AC-058: the Scheduled section is Q3\'s order narrowed to the folder', async () => {
    const { owner, folderId, scheduled } = await stage()
    const body = await folderOpen(owner, folderId, tz)
    expect(
      idsOf(body.scheduled),
      '6 Q7 section 1 is Q3\'s predicate and order with folder_id = F, so due_date ascending then status_rank then the timed flag: the abandoned row shares its date with two pending rows and follows both, whatever its time',
    ).toEqual(scheduled)
  })

  test('AC-058: the Unscheduled section is Q2\'s row order with no grouping', async () => {
    const { owner, folderId, unscheduled } = await stage()
    const body = await folderOpen(owner, folderId, tz)
    expect(
      idsOf(body.unscheduled),
      '6 Q7 section 2 is Q2\'s row order, folder_id = F, no folder grouping: status_rank then created_at descending, id descending. The abandoned row is the newest of the three, so an implementation ordering by recency alone leads with it where status_rank puts it last',
    ).toEqual(unscheduled)
  })

  test('AC-058: the two open sections partition the folder\'s open rows', async () => {
    const { owner, folderId, scheduled, unscheduled } = await stage()
    const body = await folderOpen(owner, folderId, tz)
    const both = [...idsOf(body.scheduled), ...idsOf(body.unscheduled)]
    expect(
      new Set(both).size,
      'the two sections split on due_date being null exactly as Q2 and Q3 split All, so no row is in both',
    ).toBe(both.length)
    expect(
      both.length,
      'and between them they hold every open row of the folder',
    ).toBe(scheduled.length + unscheduled.length)
    expect(
      body.scheduled.map((row) => row.due_date === null),
      'every scheduled row is dated',
    ).toEqual(body.scheduled.map(() => false))
    expect(
      body.unscheduled.map((row) => row.due_date),
      'and every unscheduled row is not',
    ).toEqual(body.unscheduled.map(() => null))
  })

  test('AC-058: completed rows are a separate section, paginated like Done', async () => {
    const { owner, folderId, completedDay } = await stage()
    const open = await folderOpen(owner, folderId, tz)
    const openIds = [...idsOf(open.scheduled), ...idsOf(open.unscheduled)]
    const completed = await folderCompleted(owner, folderId, tz)
    const completedIds = completed.days.flatMap((day) => idsOf(day.rows))

    expect(
      completedIds.filter((id) => openIds.includes(id)),
      'the open request carries no completed rows: the section is collapsed at P8, and what makes collapsing possible is that its rows are a request of their own',
    ).toEqual([])
    expect(
      completedIds,
      '6 Q7 section 3 is Q6\'s predicate, order and pagination with folder_id = F, and the expected sequence is read from the fixture\'s own rows',
    ).toEqual(await completedOrderIn(app.db, folderId))
    expect(
      completed.days.map((day) => day.date),
      `and grouped by completion day in the viewer's zone, most recent first, which for this fixture is the single day ${completedDay}`,
    ).toEqual([completedDay])
    expect(
      completed.next_cursor,
      'three rows are one page, so there is nothing after it',
    ).toBeNull()
  })

  test('AC-058: the 8.11 ratio is on the folder object, and abandoned counts on neither side', async () => {
    const { owner, folderId } = await stage()
    const response = await owner.browser.api(`/folders/${folderId}`)
    expectStatus(
      response,
      200,
      'GET /folders/:id must answer the folder detail to a member (spec 7.4; P2 is merged)',
    )
    const body = response.json() as { counts?: { pending?: unknown; completed?: unknown } }
    // The folder holds five pending, three completed and two abandoned, so
    // the ratio counts eight of its ten rows: 8.11 says abandoned rows count
    // on neither side, and this is the assertion that shows it.
    expect(
      body.counts,
      '8.11 defines the header ratio as completed over pending plus completed, and 7.0 carries it on the Folder object rather than on any 7.10 body. The folder holds two abandoned rows besides, and they appear in neither number',
    ).toEqual({ pending: 5, completed: 3 })
  })

  test('AC-058 adversarial: rows in another accessible folder are not in these sections', async () => {
    const { owner, folderId, outsideFolder } = await stage()
    const body = await folderOpen(owner, folderId, tz)
    expect(
      [...idsOf(body.scheduled), ...idsOf(body.unscheduled)],
      'Q7 narrows every section by folder_id = F; the viewer can see this row on Planned, and that is a different page',
    ).not.toContain(outsideFolder)
  })

  /*
  Both refusals below are asserted beside a request that must succeed on the
  same URL, and the successes are asserted first. Before the routes land
  every path answers 404, so a refusal case on its own would pass today
  without discriminating anything, and it would go on passing against an
  implementation that never mounted the endpoint at all.
  */
  test('AC-058: a non-member gets 404, not 403, on both sections', async () => {
    const { owner, stranger, folderId } = await stage()
    for (const section of ['open', 'completed']) {
      const mine = await getView(owner, `/folders/${folderId}/tasks`, {
        tz,
        section,
      })
      expectStatus(
        mine,
        200,
        `the member's own request must succeed first, or the refusal below proves only that nothing is mounted (section=${section})`,
      )
      const theirs = await getView(stranger, `/folders/${folderId}/tasks`, {
        tz,
        section,
      })
      expectStatus(
        theirs,
        404,
        `6 Q7 is member only, else 404, and 7.0 makes inaccessible read as 404 rather than 403 so nothing leaks that the folder exists (section=${section})`,
      )
    }
  })

  test('AC-058: a folder id that exists nowhere answers the same 404', async () => {
    const { owner, stranger, folderId } = await stage()
    const real = await getView(owner, `/folders/${folderId}/tasks`, {
      tz,
      section: 'open',
    })
    expectStatus(real, 200, 'the same control: a real folder answers first')

    const inaccessible = await getView(
      stranger,
      `/folders/${folderId}/tasks`,
      { tz, section: 'open' },
    )
    const nonexistent = await getView(
      owner,
      `/folders/${randomUUID()}/tasks`,
      { tz, section: 'open' },
    )
    expect(
      [inaccessible.status, nonexistent.status],
      'the leak rule is only worth anything if the two cases are indistinguishable, so the nonexistent id is asserted against the inaccessible one rather than against a number',
    ).toEqual([404, 404])
  })

  test('AC-058: truncated is false well under the 1000-row cap', async () => {
    const { owner, folderId } = await stage()
    const body = await folderOpen(owner, folderId, tz)
    expect(
      body.truncated,
      'section 6 caps folder open sections at 1000 rows and sets the flag beyond it',
    ).toBe(false)
  })

  test('AC-058: the fixture satisfies section 3', async () => {
    const { owner, stranger, folderId, otherFolderId, scheduled, unscheduled } =
      await stage()
    await expectTaskInvariants(
      app.db,
      [...scheduled, ...unscheduled],
      [folderId, otherFolderId],
      [owner.id, stranger.id],
    )
  })
})

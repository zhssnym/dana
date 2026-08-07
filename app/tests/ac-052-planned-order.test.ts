/*
AC-052: given dated tasks including an all-day and a timed task on one date,
then Planned lists by date ascending with the all-day row first.

Q3's sort has six keys and the criterion names two of them. Asserting only
those two would leave four free, so the fixture pins the whole sequence: due
date ascending, then status_rank, then the timed flag (all-day first, because
due_time IS NOT NULL sorts after IS NULL), then due_time ascending, then
created_at ascending, then id.

The key order is the part an implementation reorders without noticing, and
the fixture is built so each swap is visible. status_rank sits above the
timed flag, so the shared date carries an abandoned row timed 08:00, earlier
than either pending timed row: an implementation that sorted by time before
status would lead the afternoon with it. created_at is ascending here and
descending in Q2, which is the one place the two orders disagree, so the
shared date carries two all-day pending rows whose only difference is when
they were made.

Note also what the criterion's phrase does not mean. "By date ascending"
includes dates already past: Q3 admits every non-null due_date, and 6 Q3 says
overdue pending rows appear first naturally by date rather than by a rule of
their own. The fixture opens with one, so an implementation filtering to
today and later fails on the first element.

Spec: 6 Q3 (predicate, sort, what never appears), 8.1, 7.10.
*/
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  idsOf,
  middayZone,
  planned,
  seedViewTask,
  shiftDate,
  tieKeysOf,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()
const MINUTE = 60_000

interface Stage {
  viewer: Actor
  inboxId: string
  today: string
  /** In the order Q3 must produce. */
  expected: string[]
  /** The two rows alike in every Q3 key but id, lower id first. */
  tiePair: [string, string]
  undated: string
  completedDated: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const today = todayIn(tz)
    const overdue = shiftDate(today, -4)
    const shared = shiftDate(today, 1)
    const later = shiftDate(today, 2)

    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, { ...options, assigneeId: viewer.id })

    const overduePending = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 overdue, four days back',
      dueDate: overdue,
    })

    // The shared date, in the order Q3's six keys demand.
    const sharedAllDayOlder = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 shared all-day, made first',
      dueDate: shared,
      createdAt: at(60),
    })
    const sharedAllDayNewer = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 shared all-day, made second',
      dueDate: shared,
      createdAt: at(30),
    })
    // Two rows alike in every key but id, so the final tie-break is asserted
    // rather than assumed; section 6 ends every order in id ascending.
    const [tieLowerId, tieHigherId] = [randomUUID(), randomUUID()].sort() as [
      string,
      string,
    ]
    // One stamp for both rows, read before the loop rather than inside it.
    // at() reads the clock, so a call per iteration made these two differ by
    // the milliseconds the first insert took, and Q3 settles created_at
    // before it reaches id: the pair sorted by the accident of insertion
    // order and the tie-break this case exists to reach was never tested.
    // Sharing one value is what makes them tie, and the higher id is seeded
    // first so that insertion order and expected order disagree.
    const tieCreatedAt = at(20)
    for (const id of [tieHigherId, tieLowerId]) {
      await seed({
        id,
        folderId: inboxId,
        createdBy: viewer.id,
        title: `p4 ac052 shared 09:00 tie ${id.slice(0, 8)}`,
        dueDate: shared,
        dueTime: '09:00',
        createdAt: tieCreatedAt,
      })
    }
    const sharedTimedLate = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 shared 14:00',
      dueDate: shared,
      dueTime: '14:00',
      createdAt: at(20),
    })
    // Abandoned, and timed earlier than both pending timed rows: status_rank
    // sits above the timed flag and above due_time, so this is last on the
    // date despite the clock saying otherwise.
    const sharedAbandonedTimed = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 shared abandoned 08:00',
      dueDate: shared,
      dueTime: '08:00',
      status: 'abandoned',
      createdAt: at(20),
    })
    const sharedAbandonedAllDay = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 shared abandoned all-day',
      dueDate: shared,
      status: 'abandoned',
      createdAt: at(20),
    })

    const laterPending = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 two days out',
      dueDate: later,
    })

    // Neither belongs on this page: Q3 needs a non-null due_date and an open
    // status, and 6 Q3 says the look-back lives in calendar mode only.
    const undated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 undated',
    })
    const completedDated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac052 completed but dated',
      dueDate: shared,
      status: 'completed',
    })

    staged = {
      viewer,
      inboxId,
      today,
      expected: [
        overduePending,
        sharedAllDayOlder,
        sharedAllDayNewer,
        tieLowerId,
        tieHigherId,
        sharedTimedLate,
        sharedAbandonedAllDay,
        sharedAbandonedTimed,
        laterPending,
      ],
      tiePair: [tieLowerId, tieHigherId],
      undated,
      completedDated,
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

describe('AC-052: Planned lists by date, all-day before timed', () => {
  test('AC-052: the whole sequence is Q3\'s six keys in Q3\'s order', async () => {
    const { viewer, expected } = await stage()
    const body = await planned(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q3 sorts by due_date ascending, status_rank, the timed flag with all-day first, due_time ascending, created_at ascending, id. Every adjacent pair here differs on exactly one key, so a reordering of the keys moves exactly one pair and this sequence names which',
    ).toEqual(expected)
  })

  test('AC-052: on the shared date the all-day row precedes the timed one', async () => {
    const { viewer } = await stage()
    const body = await planned(viewer, tz)
    const rows = body.rows.filter((row) => row.status === 'pending')
    const firstTimed = rows.findIndex((row) => row.due_time !== null)
    const lastAllDay = rows.map((row) => row.due_time).lastIndexOf(null)
    expect(
      firstTimed,
      'the criterion\'s own clause, stated as an index: among pending rows every all-day row precedes every timed row, because due_time IS NOT NULL sorts after IS NULL (spec 6 Q3)',
    ).toBeGreaterThan(lastAllDay)
  })

  test('AC-052 adversarial: an overdue row opens the list rather than being filtered out', async () => {
    const { viewer, today, expected } = await stage()
    const body = await planned(viewer, tz)
    const first = body.rows[0]
    expect(first, 'the list must not be empty').toBeDefined()
    expect(
      first?.id,
      `6 Q3 says overdue pending rows appear first naturally by date, which means by the same sort and not by a rule of their own; an implementation filtering to ${today} and later loses this row entirely`,
    ).toBe(expected[0])
    expect(
      (first as { due_date: string }).due_date < today,
      'and the row leading the list really is in the past',
    ).toBe(true)
  })

  test('AC-052 adversarial: undated and completed rows are absent', async () => {
    const { viewer, undated, completedDated } = await stage()
    const body = await planned(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q3 adds due_date IS NOT NULL to the shared scope; the undated row is Tasks\', and 6.1 proves the two never overlap',
    ).not.toContain(undated)
    expect(
      idsOf(body.rows),
      '6 Q3: completed rows never appear in list mode, the look-back living in calendar mode only',
    ).not.toContain(completedDated)
  })

  test('AC-052: truncated is false well under the 1000-row cap', async () => {
    const { viewer } = await stage()
    const body = await planned(viewer, tz)
    expect(
      body.truncated,
      'section 6 caps this list at 1000 rows and sets the flag beyond it',
    ).toBe(false)
  })

  test('AC-052: the tie rows really tie, and their ids sort as claimed', async () => {
    const { tiePair } = await stage()
    const found = await tieKeysOf(app.db, tiePair)
    expect(found.length, 'both tie rows must exist').toBe(2)
    expect(
      found[0]?.keys,
      'the two rows must agree on every Q3 key above id (due_date, the timed flag and due_time, status, created_at), or the sequence above is settled by the key they differ on and the id tie-break it exists to reach is never reached. This failed once: the fixture read the clock once per row, so the pair differed by the milliseconds the first insert took',
    ).toBe(found[1]?.keys)
    expect(
      found.map((row) => row.id),
      'and Postgres must order the pair the way the fixture named it, since the expected sequence is built from a JavaScript sort of the two uuids while the response is ordered by Postgres uuid comparison; the two agree on lowercase canonical text, and this is the assertion that says so rather than the assumption',
    ).toEqual(tiePair)
  })

  test('AC-052: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, expected } = await stage()
    await expectTaskInvariants(app.db, expected, [inboxId], [viewer.id])
  })
})

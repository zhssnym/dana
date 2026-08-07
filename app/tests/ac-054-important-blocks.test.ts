/*
AC-054: given important tasks with and without dates, then Important shows
the dated block first (soonest first) and undated after (newest first).

Q4 is the one query in section 6 that borrows both other orders, and it is
deliberately not two lists: "exactly one list", says the section, with dated
rows ordered by the Q3 keys and undated rows by the Q2 keys, the two blocks
falling out of due_date ascending nulls last rather than being assembled. So
the assertion is one sequence across the boundary, not two sequences either
side of it.

The two borrowed orders disagree with each other on created_at, ascending in
Q3 and descending in Q2, which is exactly what the criterion's own phrasing
says: soonest first among the dated rows, newest first among the undated
ones. An implementation that reached for one comparator and applied it to the
whole list gets one block right and the other backwards, and only a fixture
carrying two rows in each block can see it.

Spec: 6 Q4 (predicate, sort, un-starring), 6 Q2 and Q3 (the borrowed keys),
7.10.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, defaultFolderOf } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import { expectTaskInvariants } from './tasks-harness.js'
import {
  important,
  idsOf,
  middayZone,
  seedViewTask,
  shiftDate,
  todayIn,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()
const MINUTE = 60_000

interface Stage {
  viewer: Actor
  inboxId: string
  expected: string[]
  datedCount: number
  notImportant: string
  importantCompleted: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, viewer.id)
    const today = todayIn(tz)

    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * MINUTE).toISOString()
    const seed = (options: Parameters<typeof seedViewTask>[1]) =>
      seedViewTask(app.db, {
        ...options,
        assigneeId: viewer.id,
        important: options.important ?? true,
      })

    // Dated block, by the Q3 keys: due_date ascending, status_rank, the
    // timed flag, due_time, created_at ascending, id.
    const soonest = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 dated tomorrow',
      dueDate: shiftDate(today, 1),
      createdAt: at(10),
    })
    const laterAllDay = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 dated in a week, all day',
      dueDate: shiftDate(today, 7),
      createdAt: at(50),
    })
    const laterTimed = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 dated in a week, 08:00',
      dueDate: shiftDate(today, 7),
      dueTime: '08:00',
      createdAt: at(50),
    })
    // Abandoned and dated soonest of all: status_rank sits above every key
    // below it inside the dated block, so it follows all three pending rows
    // sharing its date and precedes nothing that is dated earlier.
    const abandonedDated = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 dated in a week, abandoned',
      dueDate: shiftDate(today, 7),
      status: 'abandoned',
      createdAt: at(50),
    })

    // Undated block, by the Q2 keys: status_rank, created_at descending, id
    // descending. Newest first, which is the opposite of the block above.
    const undatedNewest = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 undated, made last',
      createdAt: at(5),
    })
    const undatedOldest = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 undated, made first',
      createdAt: at(90),
    })

    // Neither belongs here: Q4 needs important = true and an open status.
    const notImportant = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 unstarred',
      important: false,
      createdAt: at(1),
    })
    const importantCompleted = await seed({
      folderId: inboxId,
      createdBy: viewer.id,
      title: 'p4 ac054 starred but completed',
      status: 'completed',
      createdAt: at(1),
    })

    staged = {
      viewer,
      inboxId,
      expected: [
        soonest,
        laterAllDay,
        laterTimed,
        abandonedDated,
        undatedNewest,
        undatedOldest,
      ],
      datedCount: 4,
      notImportant,
      importantCompleted,
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

describe('AC-054: Important is one list with a dated block and an undated one', () => {
  test('AC-054: the whole sequence is Q4\'s order across the boundary', async () => {
    const { viewer, expected } = await stage()
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q4 sorts by due_date ascending nulls last, then the Q3 keys within dated rows and the Q2 keys within undated ones, and calls the effect exactly one list. Soonest first above the boundary, newest first below it, which are opposite comparators on created_at: an implementation reaching for one and applying it throughout gets one block backwards',
    ).toEqual(expected)
  })

  test('AC-054: the dated block comes first and every dated row is in it', async () => {
    const { viewer, datedCount } = await stage()
    const body = await important(viewer, tz)
    const lastDated = body.rows
      .map((row) => row.due_date)
      .reduce(
        (last, due, index) => (due === null ? last : index),
        -1,
      )
    const firstUndated = body.rows.findIndex((row) => row.due_date === null)
    expect(
      lastDated,
      'nulls last on due_date means the boundary is crossed exactly once: no dated row appears after an undated one',
    ).toBeLessThan(firstUndated)
    expect(
      firstUndated,
      'and the fixture puts four dated rows above it',
    ).toBe(datedCount)
  })

  test('AC-054 adversarial: an unstarred row is not on the page', async () => {
    const { viewer, notImportant } = await stage()
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q4\'s predicate is important = true; this is the newest undated row in the folder, so an implementation ordering correctly but filtering loosely puts it at the top of the second block',
    ).not.toContain(notImportant)
  })

  test('AC-054 adversarial: a completed starred row is not on the page', async () => {
    const { viewer, importantCompleted } = await stage()
    const body = await important(viewer, tz)
    expect(
      idsOf(body.rows),
      'Q4 admits status IN (pending, abandoned); a star does not survive completion into this page, it survives into Done as a row adornment (spec 6 Q6)',
    ).not.toContain(importantCompleted)
  })

  test('AC-054: every row on the page really is starred', async () => {
    const { viewer } = await stage()
    const body = await important(viewer, tz)
    expect(
      body.rows.map((row) => row.important),
      '6 Q4 leans on this when it says the star tooltip points outward here, since every row is important by definition',
    ).toEqual(body.rows.map(() => true))
  })

  test('AC-054: truncated is false well under the 1000-row cap', async () => {
    const { viewer } = await stage()
    const body = await important(viewer, tz)
    expect(
      body.truncated,
      'section 6 caps this list at 1000 rows and sets the flag beyond it',
    ).toBe(false)
  })

  test('AC-054: the fixture satisfies section 3', async () => {
    const { viewer, inboxId, expected } = await stage()
    await expectTaskInvariants(app.db, expected, [inboxId], [viewer.id])
  })
})

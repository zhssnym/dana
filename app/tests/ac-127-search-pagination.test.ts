/*
AC-127 (proposed): given more than 20 accessible tasks matching a query, then
GET /search answers 20 rows with a next_cursor, and the cursor's page carries
the rest in Q8's order with no overlap and no gap.

The number is proposed, not assigned; numbering section 12 is the human
owner's, and the criterion text above is the transcription an amendment would
take. The RFC 0001 P4 row names this surface as one of three the package
delivers with no criterion in any range: search's keyset cursor and page size
of 20. Section 6 sets both in Q8's last line, and nothing asserts either.

Why it is not covered by AC-056. That criterion pins Done's keyset, and Done
pages on (completed_at, id) over completed rows alone. Search pages on a
different key entirely, status_rank then updated_at then id, over rows of all
three statuses, with a different page size. An implementation can page one
correctly and the other by OFFSET, and nothing in the suite would notice.

The moving-dataset case is the one that separates a keyset from an offset,
and it is sharper here than in Done. Q8's leading sort key is status_rank, so
the row inserted between the two fetches is a pending one, which sorts ahead
of every abandoned and completed row on page two regardless of its clock. An
OFFSET of 20 would skip a real row; a keyset resumes from the last row's
sort position and does not move.

Spec: 6 Q8 (sort, keyset, page size 20), 7.10, 10.4 (search is the one view
with a rate limit, at P9).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  idsOf,
  middayZone,
  search,
  searchRows,
  seedManyTasks,
  seedViewTask,
} from './views-harness.js'

let app: AuthTestApp
const cast = new Cast(['viewer'], 'p4')

const tz = middayZone()
const PAGE = 20
const PENDING = 25
const COMPLETED = 10
const TOTAL = PENDING + COMPLETED
const NEEDLE = 'pagineedle'

interface Stage {
  viewer: Actor
  folderId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [viewer] = await cast.of(app)
    if (viewer === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(viewer, 'p4 ac127 haystack')

    await seedManyTasks(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      count: PENDING,
      titlePrefix: `p4 ac127 ${NEEDLE} open`,
    })
    await seedManyTasks(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      count: COMPLETED,
      titlePrefix: `p4 ac127 ${NEEDLE} done`,
      status: 'completed',
    })

    staged = { viewer, folderId }
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

describe('AC-127: search pages by 20 on a keyset', () => {
  test('AC-127: the first page is 20 rows and offers a cursor', async () => {
    const { viewer } = await stage()
    const first = await search(viewer, tz, NEEDLE)
    expect(
      first.rows.length,
      `6 Q8 sets the page size at 20, and the fixture matches ${String(TOTAL)} rows`,
    ).toBe(PAGE)
    expect(
      first.next_cursor,
      'with more rows behind it, the page must say how to continue',
    ).not.toBeNull()
  })

  test('AC-127: the pages cover every match exactly once', async () => {
    const { viewer } = await stage()
    const { pages, rows } = await searchRows(viewer, tz, NEEDLE)
    expect(
      pages.map((page) => page.rows.length),
      `${String(TOTAL)} matches at 20 a page is two pages`,
    ).toEqual([PAGE, TOTAL - PAGE])
    const ids = idsOf(rows)
    expect(ids.length, 'no gap').toBe(TOTAL)
    expect(new Set(ids).size, 'and no overlap').toBe(TOTAL)
    expect(
      pages[pages.length - 1]?.cursor,
      'the last page says there is nothing after it',
    ).toBeNull()
  })

  test('AC-127: the order holds across the page boundary', async () => {
    const { viewer } = await stage()
    const { rows } = await searchRows(viewer, tz, NEEDLE)
    const ranks = rows.map((row) =>
      ['pending', 'abandoned', 'completed'].indexOf(row.status),
    )
    expect(
      [...ranks].sort((a, b) => a - b),
      '6 Q8 leads with status_rank and completed = 2, so all 25 pending rows precede all 10 completed ones. The boundary falls inside the pending block, so a page that sorted only within itself would still pass this; what it could not pass is the completed rows staying together after it',
    ).toEqual(ranks)
    expect(
      ranks.slice(0, PAGE),
      'and the whole first page is pending, since 25 of them come first',
    ).toEqual(new Array<number>(PAGE).fill(0))
  })

  test('AC-127: the cursor is a keyset, not an offset', async () => {
    const { viewer, folderId } = await stage()
    const first = await search(viewer, tz, NEEDLE)
    const firstIds = idsOf(first.rows)

    // Pending, so status_rank puts it ahead of every completed row and
    // an OFFSET of 20 would shift the second page past a real row.
    const intruder = await seedViewTask(app.db, {
      folderId,
      createdBy: viewer.id,
      assigneeId: viewer.id,
      title: `p4 ac127 ${NEEDLE} inserted between the fetches`,
      updatedAt: new Date().toISOString(),
    })

    const second = await search(viewer, tz, NEEDLE, first.next_cursor as string)
    const secondIds = idsOf(second.rows)
    expect(
      secondIds,
      '6 Q8 keys on the sort position, not on a count of rows already seen: a row that sorts ahead of the cursor is behind the reader and does not appear',
    ).not.toContain(intruder)
    expect(
      secondIds.filter((id) => firstIds.includes(id)),
      'and the resumed page does not repeat the first',
    ).toEqual([])
    expect(
      [...firstIds, ...secondIds].length,
      'together the two pages still hold every row that existed when page one was taken, which is what an OFFSET would have lost one of',
    ).toBe(TOTAL)
  })

  test('AC-127 adversarial: a fresh pass sees the inserted row', async () => {
    const { viewer } = await stage()
    const { rows } = await searchRows(viewer, tz, NEEDLE)
    expect(
      idsOf(rows).length,
      'the row inserted by the case above was reachable all along; only the resumed page declined to move for it, which is the difference between a stale page and a lost row',
    ).toBe(TOTAL + 1)
  })

  test('AC-127: a query matching fewer than a page carries no cursor', async () => {
    const { viewer } = await stage()
    const body = await search(viewer, tz, `${NEEDLE} done 00003`)
    expect(
      body.rows.length,
      'the title of exactly one seeded row',
    ).toBe(1)
    expect(
      body.next_cursor,
      'a page that exhausts the matches offers nothing to continue with, which is what lets a client stop',
    ).toBeNull()
  })
})

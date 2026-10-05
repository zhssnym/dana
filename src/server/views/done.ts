/*
Q6, GET /views/done, and the folder page's completed section (same function).
Keyset on (completed_at, id) descending, written as one row-wise comparison so
it matches the partial index. The cursor uses the instant at full precision
(utcInstant), not the millisecond card value. Days are grouped in the viewer's
zone by walking the already-ordered rows.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { CompletedCursor, GetDoneResponse } from '../../shared/views.js'
import { encodeCompletedCursor } from '../../shared/views.js'
import type { Executor } from '../database.js'
import { localDateOf } from '../time/index.js'

import { DONE_PAGE_SIZE, readCards, utcInstant } from './cards.js'

const Q6_ORDER = sql`t.completed_at DESC, t.id DESC`

/** One page of Q6, optionally for one folder. Read one row over to know whether to offer a cursor. */
export async function completedPage(
  executor: Executor,
  viewerId: string,
  tz: string,
  cursor: CompletedCursor | undefined,
  folderId?: string,
): Promise<GetDoneResponse> {
  const resume: SQL =
    cursor === undefined
      ? sql``
      : sql` AND (t.completed_at, t.id) < (${cursor.completed_at}::timestamptz,
                                           ${cursor.id}::uuid)`
  const scope: SQL =
    folderId === undefined ? sql`` : sql` AND t.folder_id = ${folderId}`

  const rows = await readCards(executor, {
    // Only completed rows have a completed_at (INV-8).
    where: sql`t.status = 'completed'${scope}${resume}`,
    order: Q6_ORDER,
    limit: DONE_PAGE_SIZE + 1,
    viewerId,
    extra: sql`${utcInstant(sql`t.completed_at`)} AS completed_cursor`,
  })

  const page = rows.slice(0, DONE_PAGE_SIZE)
  const last = page[page.length - 1]
  const next =
    rows.length > DONE_PAGE_SIZE && last !== undefined
      ? encodeCompletedCursor({
          completed_at: String(last.raw.completed_cursor),
          id: last.card.id,
        })
      : null

  const days: GetDoneResponse['days'] = []
  for (const row of page) {
    // Read from the query's rendering: the driver gives a Date on one backend and a string on the other.
    const date = localDateOf(new Date(String(row.raw.completed_cursor)), tz)
    const open = days[days.length - 1]
    if (open !== undefined && open.date === date) open.rows.push(row.card)
    else days.push({ date, rows: [row.card] })
  }

  return { days, next_cursor: next }
}

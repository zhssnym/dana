/*
Q6: GET /views/done, and by reference the completed section of the folder
page, which section 6 defines as "Q6 predicate, order, and pagination,
folder_id = F". One function serves both, because a second copy of a keyset
is a second place for a page boundary to lose a row.

The keyset is the point of this file. "Keyset on (completed_at descending, id
descending), page size 50; cursor is the last row's (completed_at, id)." What
makes that different from an offset is only visible on a dataset that moves:
insert a row that sorts ahead of page one between two fetches and an OFFSET
shifts every later page by one, silently skipping a real row, while a keyset
resumes exactly where it stopped. The resumption is written as a row-wise
comparison, (completed_at, id) < (cursor), which is one expression matching
one index (4.12's partial index on (completed_at DESC, id DESC) WHERE status =
'completed') rather than the three-way OR the same condition expands to.

The cursor carries the instant at full stored precision rather than at the
millisecond the wire format uses, because a cursor built through a JS Date
would resume at a rounded position and re-emit or skip whatever shares that
millisecond. That is why the value is rendered by the query, through
utcInstant, and not read off the card.

The day grouping is the viewer's zone applied to each row, which only
localDateOf can answer: "grouped for display by the completed_at date in V's
timezone, most recent day first". The rows arrive in completed_at descending
order, so the days come out most recent first and each day's rows are
contiguous; the grouping is a walk rather than a sort.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { CompletedCursor, GetDoneResponse } from '../../shared/views.js'
import { encodeCompletedCursor } from '../../shared/views.js'
import type { Executor } from '../database.js'
import { localDateOf } from '../time/index.js'

import { DONE_PAGE_SIZE, readCards, utcInstant } from './cards.js'

/** Q6's order, and the keyset's own keys. */
const Q6_ORDER = sql`t.completed_at DESC, t.id DESC`

/**
 * One page of Q6, optionally narrowed to one folder.
 *
 * The page is read one row over its size so it knows whether to offer a
 * cursor without counting the rest of the list, and the extra row is dropped
 * before anything is grouped.
 */
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
    // "Abandoned rows never appear here", which the status filter says and
    // INV-8 backs: only a completed row has a completed_at to key on.
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
    // The instant is read from the query's own rendering rather than from
    // the driver, whose timestamptz value is a Date on one backend and a
    // string on the other; one format reaches the zone math on both.
    const date = localDateOf(new Date(String(row.raw.completed_cursor)), tz)
    const open = days[days.length - 1]
    if (open !== undefined && open.date === date) open.rows.push(row.card)
    else days.push({ date, rows: [row.card] })
  }

  return { days, next_cursor: next }
}
